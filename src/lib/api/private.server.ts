/**
 * Authenticated bot-API operations.
 *
 * Every function here is reached only after `authenticate()` has verified an
 * HMAC signature and resolved a user id from the API key, so the caller id is
 * always passed in explicitly and never read from request data.
 */

import { getPair, PAIRS, type PairDef } from "@/lib/chains";
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

  const [{ data: wallet }, { data: auths }] = await Promise.all([
    supabaseAdmin
      .from("wallets")
      .select("txc_address, evm_address, ltc_address, isk_address")
      .eq("user_id", userId)
      .maybeSingle(),
    supabaseAdmin
      .from("wallet_delegations")
      .select("chain, asset, trading_address, max_amount, expires_at, created_at, label")
      .eq("user_id", userId)
      .is("revoked_at", null),
  ]);

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
    addresses: {
      txc: wallet?.txc_address ?? null,
      evm: wallet?.evm_address ?? null,
      ltc: wallet?.ltc_address ?? null,
      isk: wallet?.isk_address ?? null,
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
    .select("id, pair, side, price, amount, filled, status, created_at, updated_at")
    .eq("user_id", userId)
    .in("status", ["open", "partial"])
    .order("created_at", { ascending: false })
    .limit(500);
  if (pair) q = q.eq("pair", pair.id);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map(serializeOrder);
}

export async function apiAllOrders(userId: string, pair: PairDef | null, limit: number) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let q = supabaseAdmin
    .from("orders")
    .select("id, pair, side, price, amount, filled, status, created_at, updated_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (pair) q = q.eq("pair", pair.id);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map(serializeOrder);
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
  created_at: string;
  updated_at: string;
}) {
  const pair = pairBySymbolId(o.pair);
  return {
    symbol: symbolOf(pair),
    orderId: o.id,
    price: n8(Number(o.price)),
    origQty: n8(Number(o.amount)),
    executedQty: n8(Number(o.filled)),
    cummulativeQuoteQty: n8(Number(o.filled) * Number(o.price)),
    status: STATUS_MAP[o.status] ?? o.status.toUpperCase(),
    timeInForce: "GTC",
    type: "LIMIT",
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

export type PlaceParams = {
  symbol: PairDef;
  side: "buy" | "sell";
  price: number;
  quantity: number;
};

export async function apiPlaceOrder(userId: string, p: PlaceParams) {
  const { matchOrder } = await import("@/lib/trading.server");
  const result = await matchOrder(userId, p.symbol.id, {
    side: p.side,
    price: p.price,
    amount: p.quantity,
  });

  let settlements: Awaited<ReturnType<typeof import("@/lib/autosettle.server").autoSettleTrades>> = [];
  if (result.tradeIds.length > 0) {
    const { autoSettleTrades } = await import("@/lib/autosettle.server");
    settlements = await autoSettleTrades(result.tradeIds);
  }

  const executed = result.filled;
  return {
    symbol: symbolOf(p.symbol),
    orderId: result.orderId,
    transactTime: Date.now(),
    price: n8(p.price),
    origQty: n8(p.quantity),
    executedQty: n8(executed),
    cummulativeQuoteQty: n8(executed * p.price),
    status: executed >= p.quantity - 1e-8 ? "FILLED" : executed > 0 ? "PARTIALLY_FILLED" : "NEW",
    timeInForce: "GTC",
    type: "LIMIT",
    side: p.side.toUpperCase(),
    fills: result.tradeIds.map((id) => ({ tradeId: id })),
    settlements,
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
    .select("id, pair, side, price, amount, filled, status, created_at, updated_at")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return serializeOrder(data);
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
