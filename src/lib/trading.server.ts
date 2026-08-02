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
import { getPair } from "@/lib/chains";

type Side = "buy" | "sell";
type Leg = "txc" | "usdc" | "tsd";

export type PlaceOrderInput = { side: Side; price: number; amount: number };

/** Deterministic stand-in for a real 2-of-3 multisig address (Phase 2). */
function simulatedEscrowAddress(leg: Leg, tradeId: string): string {
  const compact = tradeId.replace(/-/g, "");
  // TSD rides on the TEXITcoin chain, so its placeholder is a TXC-shaped address.
  return leg === "usdc" ? `0x${compact.slice(0, 40)}` : `T${compact.slice(0, 32)}`;
}

export async function matchOrder(userId: string, pair: string, input: PlaceOrderInput) {
  const opposite: Side = input.side === "buy" ? "sell" : "buy";
  // Which asset the quote leg delivers: TSD (Omni #39) or USDC (EVM).
  const quoteLeg: Leg = getPair(pair).quoteLeg;

  // Best-priced resting orders that cross our limit.
  let query = supabaseAdmin
    .from("orders")
    .select("id, user_id, side, price, amount, filled, status")
    .eq("pair", pair)
    .eq("side", opposite)
    .in("status", ["open", "partial"]);

  query =
    input.side === "buy"
      ? query.lte("price", input.price).order("price", { ascending: true })
      : query.gte("price", input.price).order("price", { ascending: false });

  const { data: resting, error: restingError } = await query
    .order("created_at", { ascending: true })
    .limit(25);
  if (restingError) throw new Error(restingError.message);

  // Own orders never self-trade.
  const candidates = (resting ?? []).filter((o) => o.user_id !== userId);

  const { data: taker, error: takerError } = await supabaseAdmin
    .from("orders")
    .insert({
      user_id: userId,
      pair,
      side: input.side,
      price: input.price,
      amount: input.amount,
    })
    .select("id")
    .single();
  if (takerError) throw new Error(takerError.message);

  let remaining = input.amount;
  const tradeIds: string[] = [];

  for (const maker of candidates) {
    if (remaining <= 1e-8) break;
    const makerRemaining = Number(maker.amount) - Number(maker.filled);
    if (makerRemaining <= 1e-8) continue;

    const fillAmount = Math.min(remaining, makerRemaining);
    const fillPrice = Number(maker.price); // price improvement goes to the taker

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
        leg: "txc",
        multisig_address: simulatedEscrowAddress("txc", trade.id),
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

    const makerFilled = Number(maker.filled) + fillAmount;
    await supabaseAdmin
      .from("orders")
      .update({
        filled: makerFilled,
        status: makerFilled >= Number(maker.amount) - 1e-8 ? "filled" : "partial",
      })
      .eq("id", maker.id);

    remaining -= fillAmount;
    tradeIds.push(trade.id);
  }

  const takerFilled = input.amount - remaining;
  await supabaseAdmin
    .from("orders")
    .update({
      filled: takerFilled,
      status: remaining <= 1e-8 ? "filled" : takerFilled > 0 ? "partial" : "open",
    })
    .eq("id", taker.id);

  return {
    orderId: taker.id,
    filled: takerFilled,
    resting: remaining,
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

export type AdvanceInput = {
  tradeId: string;
  action: "fund" | "release" | "dispute";
  leg: Leg;
};

export async function advance(userId: string, input: AdvanceInput) {
  const { data: trade, error } = await supabaseAdmin
    .from("trades")
    .select("id, maker_id, taker_id, status")
    .eq("id", input.tradeId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!trade) throw new Error("Trade not found");
  if (trade.maker_id !== userId && trade.taker_id !== userId) {
    throw new Error("Forbidden: you are not a party to this trade");
  }

  if (input.action === "dispute") {
    await supabaseAdmin.from("trades").update({ status: "disputed" }).eq("id", trade.id);
    await supabaseAdmin
      .from("trade_events")
      .insert({ trade_id: trade.id, actor_id: userId, event: "disputed", detail: {} });
    return { ok: true, status: "disputed" };
  }

  const { data: legs } = await supabaseAdmin
    .from("escrows")
    .select("id, leg, expected_amount, status")
    .eq("trade_id", trade.id);

  const target = (legs ?? []).find((l) => l.leg === input.leg);
  if (!target) throw new Error("Escrow leg not found");

  if (input.action === "fund") {
    await supabaseAdmin
      .from("escrows")
      .update({
        status: "confirmed",
        funded_amount: target.expected_amount,
        confirmations: 6,
        funding_txid: `sim-${crypto.randomUUID().slice(0, 16)}`,
      })
      .eq("id", target.id);
  } else {
    await supabaseAdmin
      .from("escrows")
      .update({ status: "released", release_txid: `sim-${crypto.randomUUID().slice(0, 16)}` })
      .eq("id", target.id);
  }

  await supabaseAdmin.from("trade_events").insert({
    trade_id: trade.id,
    actor_id: userId,
    event: `${input.leg}_${input.action}`,
    detail: { simulated: true },
  });

  const { data: after } = await supabaseAdmin
    .from("escrows")
    .select("status")
    .eq("trade_id", trade.id);
  const statuses = (after ?? []).map((l) => l.status);

  let next: typeof trade.status = trade.status;
  if (statuses.length === 2 && statuses.every((s) => s === "released")) next = "settled";
  else if (statuses.filter((s) => s === "confirmed" || s === "released").length === 2)
    next = "both_funded";
  else if (statuses.some((s) => s === "confirmed")) next = "maker_funded";

  if (next !== trade.status) {
    await supabaseAdmin.from("trades").update({ status: next }).eq("id", trade.id);
  }

  return { ok: true, status: next };
}
