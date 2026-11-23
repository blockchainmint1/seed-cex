/**
 * Authenticated bot-API operations.
 *
 * Every function here is reached only after `authenticate()` has verified an
 * HMAC signature and resolved a user id from the API key, so the caller id is
 * always passed in explicitly and never read from request data.
 */

import { getPair, PAIRS, type PairDef } from "@/lib/chains";
import { MAX_MARKET_SLIPPAGE_PCT } from "@/lib/market-order";
import { symbolOf, filtersFor } from "./v1.server";

const n8 = (v: number) => v.toFixed(8);

function pairBySymbolId(pairId: string): PairDef {
  return getPair(pairId);
}

/**
 * Account snapshot. Seeds is non-custodial: there is no exchange balance, so
 * "balances" here are the capped, expiring trading authorizations the account
 * has granted — that is the real spendable power a bot has.
 */
export async function apiAccount(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.rpc("purge_expired_delegations");

  const [{ data: wallet }, { data: auths }, { data: link }] = await Promise.all([
    supabaseAdmin
      .from("wallets")
      .select("txc_address, evm_address, ltc_address, isk_address, btc_address")
      .eq("user_id", userId)
      .maybeSingle(),
    supabaseAdmin
      .from("wallet_delegations")
      .select("chain, asset, trading_address, max_amount, expires_at, created_at, label")
      .eq("user_id", userId)
      .is("revoked_at", null),
    supabaseAdmin
      .from("hme_links")
      .select("mode, account, paths, xpubs, created_at")
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle(),
  ]);

  // Linked HME Wallet trading pocket: public receive addresses derived from the
  // wallet-submitted xpubs (never a static path), same as the Profile page.
  let tradingPocket: {
    mode: "instant" | "approve";
    account: number;
    linkedAt: number;
    addresses: Record<string, string>;
  } | null = null;
  if (link) {
    const { pocketReceiveAddress } = await import("@/lib/pockets/derive");
    const { chainForPath } = await import("@/lib/hme-link.server");
    const xpubs = (link.xpubs ?? {}) as Record<string, string>;
    const addresses: Record<string, string> = {};
    for (const path of (link.paths ?? []) as string[]) {
      const info = chainForPath(path);
      if (!info || info.account !== link.account || !xpubs[info.chain]) continue;
      try {
        addresses[info.chain] = pocketReceiveAddress(info.chain, xpubs[info.chain]);
      } catch {
        /* skip malformed legacy row */
      }
    }
    tradingPocket = {
      mode: link.mode === "access" ? "instant" : "approve",
      account: link.account,
      linkedAt: new Date(link.created_at).getTime(),
      addresses,
    };
  }

  const live = (auths ?? []).filter((a) => new Date(a.expires_at).getTime() > Date.now());

  return {
    accountType: "SPOT",
    custody: "non-custodial",
    canTrade: live.length > 0,
    canWithdraw: false,
    canDeposit: true,
    makerCommission: 0,
    takerCommission: 0,
    updateTime: Date.now(),
    tradingPocket,
    addresses: {
      txc: wallet?.txc_address ?? null,
      evm: wallet?.evm_address ?? null,
      ltc: wallet?.ltc_address ?? null,
      isk: wallet?.isk_address ?? null,
      btc: wallet?.btc_address ?? null,
    },
    authorizations: live.map((a) => ({
      chain: a.chain,
      asset: a.asset,
      address: a.trading_address,
      cap: n8(Number(a.max_amount)),
      expiresAt: new Date(a.expires_at).getTime(),
      grantedAt: new Date(a.created_at).getTime(),
      label: a.label,
    })),
  };
}

export async function apiOpenOrders(userId: string, pair: PairDef | null) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let q = supabaseAdmin
    .from("orders")
    .select("id, pair, side, price, amount, filled, status, order_type, created_at, updated_at")
    .eq("user_id", userId)
    .in("status", ["open", "partial"])
    .order("created_at", { ascending: false })
    .limit(500);
  if (pair) q = q.eq("pair", pair.id);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((o) => serializeOrder(o));
}

export async function apiAllOrders(userId: string, pair: PairDef | null, limit: number) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let q = supabaseAdmin
    .from("orders")
    .select("id, pair, side, price, amount, filled, status, order_type, created_at, updated_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (pair) q = q.eq("pair", pair.id);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  // Market orders store their price protection, not a fill price, so their
  // quote total comes from the trades they actually made.
  const marketIds = rows.filter((o) => o.order_type === "market").map((o) => o.id);
  const quoteByOrder = new Map<string, number>();
  if (marketIds.length > 0) {
    const { data: fills } = await supabaseAdmin
      .from("trades")
      .select("taker_order_id, price, amount, status")
      .in("taker_order_id", marketIds);
    for (const t of fills ?? []) {
      if (!t.taker_order_id || t.status === "timed_out") continue;
      quoteByOrder.set(
        t.taker_order_id,
        (quoteByOrder.get(t.taker_order_id) ?? 0) + Number(t.amount) * Number(t.price),
      );
    }
  }
  return rows.map((o) => serializeOrder(o, quoteByOrder.get(o.id)));
}

const STATUS_MAP: Record<string, string> = {
  open: "NEW",
  partial: "PARTIALLY_FILLED",
  filled: "FILLED",
  cancelled: "CANCELED",
};

function serializeOrder(o: {
  id: string;
  pair: string;
  side: string;
  price: number;
  amount: number;
  filled: number;
  status: string;
  order_type?: string | null;
  created_at: string;
  updated_at: string;
}, marketQuoteQty?: number) {
  const pair = pairBySymbolId(o.pair);
  const market = o.order_type === "market";
  return {
    symbol: symbolOf(pair),
    orderId: o.id,
    // Market orders have no limit price (Binance convention: "0").
    price: market ? n8(0) : n8(Number(o.price)),
    origQty: n8(Number(o.amount)),
    executedQty: n8(Number(o.filled)),
    cummulativeQuoteQty: n8(market ? (marketQuoteQty ?? 0) : Number(o.filled) * Number(o.price)),
    status: STATUS_MAP[o.status] ?? o.status.toUpperCase(),
    timeInForce: market ? "IOC" : "GTC",
    type: market ? "MARKET" : "LIMIT",
    ...(market ? { seedsPriceProtection: n8(Number(o.price)) } : {}),
    side: o.side.toUpperCase(),
    time: new Date(o.created_at).getTime(),
    updateTime: new Date(o.updated_at).getTime(),
    isWorking: o.status === "open" || o.status === "partial",
  };
}

export async function apiMyTrades(userId: string, pair: PairDef | null, limit: number) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let q = supabaseAdmin
    .from("trades")
    .select(
      "id, pair, side, price, amount, status, maker_id, taker_id, created_at, escrows(leg, status, release_txid, confirmations)",
    )
    .or(`maker_id.eq.${userId},taker_id.eq.${userId}`)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (pair) q = q.eq("pair", pair.id);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  return (data ?? []).map((t) => {
    const p = pairBySymbolId(t.pair);
    const isMaker = t.maker_id === userId;
    return {
      symbol: symbolOf(p),
      id: t.id,
      price: n8(Number(t.price)),
      qty: n8(Number(t.amount)),
      quoteQty: n8(Number(t.amount) * Number(t.price)),
      commission: "0",
      commissionAsset: p.quote,
      time: new Date(t.created_at).getTime(),
      isBuyer: isMaker ? t.side !== "buy" : t.side === "buy",
      isMaker,
      settlementStatus: t.status,
      // Seeds-specific: on-chain proof of the two settlement legs.
      legs: (t.escrows ?? []).map((e) => ({
        asset: e.leg,
        status: e.status,
        txid: e.release_txid,
        confirmations: Number(e.confirmations ?? 0),
      })),
    };
  });
}

export type PlaceParams =
  | { type: "limit"; symbol: PairDef; side: "buy" | "sell"; price: number; quantity: number }
  | { type: "market"; symbol: PairDef; side: "buy" | "sell"; quantity: number; maxSlippagePct?: number };

/**
 * API orders follow the same rule as the website (Bobby, Nov 23 2026): nothing is placed until the
 * owner taps Approve in Telegram. The answer is PENDING_APPROVAL with the orderId it will get;
 * poll GET /order with that id. After the tap, every fill settles with no further taps.
 */
export async function apiPlaceOrder(userId: string, p: PlaceParams) {
  const { requestOrder } = await import("@/lib/order-approval/order-approval.server");
  const r = await requestOrder(
    userId,
    p.symbol.id,
    p.type === "market"
      ? { type: "market", side: p.side, amount: p.quantity, ...(p.maxSlippagePct != null ? { slippagePct: p.maxSlippagePct } : {}) }
      : { type: "limit", side: p.side, price: p.price, amount: p.quantity },
  );
  const market = p.type === "market";
  return {
    symbol: symbolOf(p.symbol),
    orderId: r.requestId,
    transactTime: Date.now(),
    price: n8(market ? 0 : p.price),
    origQty: n8(p.quantity),
    executedQty: n8(0),
    cummulativeQuoteQty: n8(0),
    status: "PENDING_APPROVAL",
    seedsApprovalExpiresAt: new Date(r.expiresAt).getTime(),
    timeInForce: market ? "IOC" : "GTC",
    type: market ? "MARKET" : "LIMIT",
    ...(market ? { seedsPriceProtection: n8(r.price) } : {}),
    side: p.side.toUpperCase(),
    fills: [],
  };
}

export async function apiCancelOrder(userId: string, orderId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("orders")
    .update({ status: "cancelled" })
    .eq("id", orderId)
    .eq("user_id", userId)
    .in("status", ["open", "partial"])
    .select("id, pair, side, price, amount, filled, status, order_type, created_at, updated_at")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const { endOrderApprovals } = await import("@/lib/order-approval/order-approval.server");
  await endOrderApprovals([data.id], "You cancelled this order (API).");
  return serializeOrder(data);
}

/** Validate a MARKET order: quantity filters only (there is no price). */
export function validateMarketOrder(pair: PairDef, qty: number, maxSlippagePct: number | null): string | null {
  const f = filtersFor(pair);
  if (!Number.isFinite(qty) || qty <= 0) return "Invalid quantity";
  if (qty < Number(f.minQty)) return `Quantity below LOT_SIZE minQty ${f.minQty}`;
  if (qty > Number(f.maxQty)) return `Quantity above LOT_SIZE maxQty ${f.maxQty}`;
  if (maxSlippagePct != null && (!Number.isFinite(maxSlippagePct) || maxSlippagePct <= 0 || maxSlippagePct > MAX_MARKET_SLIPPAGE_PCT)) {
    return `maxSlippagePct must be above 0 and at most ${MAX_MARKET_SLIPPAGE_PCT}`;
  }
  return null;
}

/** Validate an incoming order against the symbol's published filters. */
export function validateOrder(pair: PairDef, price: number, qty: number): string | null {
  const f = filtersFor(pair);
  if (!Number.isFinite(price) || price <= 0) return "Invalid price";
  if (!Number.isFinite(qty) || qty <= 0) return "Invalid quantity";
  if (qty < Number(f.minQty)) return `Quantity below LOT_SIZE minQty ${f.minQty}`;
  if (qty > Number(f.maxQty)) return `Quantity above LOT_SIZE maxQty ${f.maxQty}`;
  if (price > Number(f.maxPrice)) return `Price above PRICE_FILTER maxPrice ${f.maxPrice}`;
  if (price * qty < Number(f.minNotional)) return `Notional below MIN_NOTIONAL ${f.minNotional}`;
  return null;
}

export const ALL_PAIRS = PAIRS;
