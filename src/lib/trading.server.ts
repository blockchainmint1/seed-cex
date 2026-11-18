/**
 * Escrow matching engine.
 *
 * Matching necessarily touches the *counterparty's* order row and writes trade,
 * escrow, and audit rows on behalf of both sides, so it runs with the service
 * role. Every entry point here is only ever reached from a server function that
 * has already authenticated the caller through `requireSupabaseAuth`, and the
 * caller's id is passed in explicitly — never read from request data.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getLeg, getPair, type LegId } from "@/lib/chains";
import { clampSlippagePct, marketFinalStatus, protectionPrice } from "@/lib/market-order";

type Side = "buy" | "sell";
type Leg = LegId;

export type PlaceOrderInput =
  | { type?: "limit"; side: Side; price: number; amount: number }
  | { type: "market"; side: Side; amount: number; slippagePct?: number };

/** Deterministic stand-in for a real 2-of-3 multisig address (Phase 2). */
function simulatedEscrowAddress(leg: Leg, tradeId: string): string {
  const compact = tradeId.replace(/-/g, "");
  // EVM legs get a 0x-shaped placeholder; UTXO/Omni legs a base58-shaped one.
  return getLeg(leg).kind === "evm" ? `0x${compact.slice(0, 40)}` : `T${compact.slice(0, 32)}`;
}

export async function matchOrder(userId: string, pair: string, input: PlaceOrderInput) {
  const opposite: Side = input.side === "buy" ? "sell" : "buy";
  // Which asset the quote leg delivers: TSD (Omni #39) or USDC (EVM).
  const { baseLeg, quoteLeg } = getPair(pair);

  const isMarket = input.type === "market";

  // Best-priced resting orders on the other side, best first.
  let query = supabaseAdmin
    .from("orders")
    .select("id, user_id, side, price, amount, filled, status")
    .eq("pair", pair)
    .eq("side", opposite)
    .in("status", ["open", "partial"]);

  // A limit order only looks at orders that cross its price. A market order
  // looks at the whole side, then caps itself at its price protection.
  if (!isMarket) {
    query = input.side === "buy" ? query.lte("price", input.price) : query.gte("price", input.price);
  }
  query = query.order("price", { ascending: input.side === "buy" });

  const { data: resting, error: restingError } = await query
    .order("created_at", { ascending: true })
    .limit(25);
  if (restingError) throw new Error(restingError.message);

  // Own orders never self-trade.
  let candidates = (resting ?? []).filter((o) => o.user_id !== userId);

  let price: number;
  if (isMarket) {
    const best = candidates[0] ? Number(candidates[0].price) : null;
    if (best == null) {
      // Nothing is written: a market order with nothing to take is refused.
      throw new Error(
        input.side === "buy"
          ? "Nobody is selling right now, so a market buy can't fill. Try a limit order instead."
          : "Nobody is buying right now, so a market sell can't fill. Try a limit order instead.",
      );
    }
    price = protectionPrice(input.side, best, clampSlippagePct(input.slippagePct));
    candidates = candidates.filter((o) =>
      input.side === "buy" ? Number(o.price) <= price + 1e-12 : Number(o.price) >= price - 1e-12,
    );
  } else {
    price = input.price;
  }

  const { data: taker, error: takerError } = await supabaseAdmin
    .from("orders")
    .insert({
      user_id: userId,
      pair,
      side: input.side,
      // For a market order this is the price protection: the worst price it
      // may fill at. It is never on the book (status starts cancelled).
      price,
      amount: input.amount,
      order_type: isMarket ? "market" : "limit",
      status: isMarket ? "cancelled" : "open",
    })
    .select("id")
    .single();
  if (takerError) throw new Error(takerError.message);

  let remaining = input.amount;
  let quoteTotal = 0;
  const tradeIds: string[] = [];
  const fills: Array<{ makerId: string; amount: number; price: number }> = [];

  for (const maker of candidates) {
    if (remaining <= 1e-8) break;
    const makerRemaining = Number(maker.amount) - Number(maker.filled);
    if (makerRemaining <= 1e-8) continue;

    const fillAmount = Math.min(remaining, makerRemaining);
    const fillPrice = Number(maker.price); // price improvement goes to the taker

    // Compare-and-set on the maker's fill (security audit H5): if another taker
    // got there first, the row no longer matches and we skip this maker.
    const makerFilled = Number(maker.filled) + fillAmount;
    const { data: claimed } = await supabaseAdmin
      .from("orders")
      .update({
        filled: makerFilled,
        status: makerFilled >= Number(maker.amount) - 1e-8 ? "filled" : "partial",
      })
      .eq("id", maker.id)
      .eq("filled", maker.filled)
      .in("status", ["open", "partial"])
      .select("id");
    if (!claimed || claimed.length === 0) continue;

    const { data: trade, error: tradeError } = await supabaseAdmin
      .from("trades")
      .insert({
        pair,
        maker_order_id: maker.id,
        taker_order_id: taker.id,
        maker_id: maker.user_id,
        taker_id: userId,
        side: input.side,
        price: fillPrice,
        amount: fillAmount,
        status: "matched",
      })
      .select("id")
      .single();
    if (tradeError) throw new Error(tradeError.message);

    await supabaseAdmin.from("escrows").insert([
      {
        trade_id: trade.id,
        leg: baseLeg,
        multisig_address: simulatedEscrowAddress(baseLeg, trade.id),
        expected_amount: fillAmount,
      },
      {
        trade_id: trade.id,
        leg: quoteLeg,
        multisig_address: simulatedEscrowAddress(quoteLeg, trade.id),
        expected_amount: fillAmount * fillPrice,
      },
    ]);

    await supabaseAdmin.from("trade_events").insert({
      trade_id: trade.id,
      actor_id: userId,
      event: "matched",
      detail: { price: fillPrice, amount: fillAmount, pair },
    });

    remaining -= fillAmount;
    quoteTotal += fillAmount * fillPrice;
    tradeIds.push(trade.id);
    if (maker.user_id) fills.push({ makerId: maker.user_id, amount: fillAmount, price: fillPrice });
  }

  const takerFilled = input.amount - remaining;
  await supabaseAdmin
    .from("orders")
    .update({
      filled: takerFilled,
      // Market orders never rest: whatever didn't fill is cancelled.
      status: isMarket
        ? marketFinalStatus(input.amount, takerFilled)
        : remaining <= 1e-8
          ? "filled"
          : takerFilled > 0
            ? "partial"
            : "open",
    })
    .eq("id", taker.id);

  // Both sides hear about the fill; alerts never break the order path.
  const { alertOrderFilled } = await import("./alerts.server");
  const baseSymbol = getLeg(baseLeg).symbol;
  const quoteSymbol = getLeg(quoteLeg).symbol;
  for (const f of fills) {
    await alertOrderFilled({
      makerId: f.makerId,
      takerId: userId,
      baseSymbol,
      quoteSymbol,
      amount: f.amount,
      price: f.price,
    });
  }

  return {
    orderId: taker.id,
    type: isMarket ? ("market" as const) : ("limit" as const),
    filled: takerFilled,
    // Limit leftovers rest on the book; market leftovers are cancelled.
    resting: isMarket ? 0 : remaining,
    cancelled: isMarket ? remaining : 0,
    avgPrice: takerFilled > 1e-8 ? quoteTotal / takerFilled : null,
    limitPrice: price,
    tradeIds,
  };
}

export type TradeRow = {
  id: string;
  pair: string;
  side: Side;
  price: number;
  amount: number;
  status: string;
  role: "maker" | "taker";
  createdAt: string;
  expiresAt: string;
  escrows: Array<{
    leg: Leg;
    address: string | null;
    expected: number;
    funded: number;
    status: string;
    releaseTxid: string | null;
    confirmations: number;
  }>;
};

export async function loadMyTrades(userId: string): Promise<TradeRow[]> {
  const { data, error } = await supabaseAdmin
    .from("trades")
    .select(
      "id, pair, side, price, amount, status, maker_id, taker_id, created_at, expires_at, escrows(leg, multisig_address, expected_amount, funded_amount, status, release_txid, confirmations)",
    )
    .or(`maker_id.eq.${userId},taker_id.eq.${userId}`)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);

  return (data ?? []).map((t) => ({
    id: t.id,
    pair: t.pair,
    side: t.side as Side,
    price: Number(t.price),
    amount: Number(t.amount),
    status: t.status,
    role: t.maker_id === userId ? ("maker" as const) : ("taker" as const),
    createdAt: t.created_at,
    expiresAt: t.expires_at,
    escrows: (t.escrows ?? []).map((e) => ({
      leg: e.leg as Leg,
      address: e.multisig_address,
      expected: Number(e.expected_amount),
      funded: Number(e.funded_amount),
      status: e.status,
      releaseTxid: e.release_txid,
      confirmations: Number(e.confirmations ?? 0),
    })),
  }));
}
