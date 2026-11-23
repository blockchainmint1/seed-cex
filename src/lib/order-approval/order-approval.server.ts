/**
 * Order approval, server side (Bobby, Nov 23 2026; rules in ./rules.ts).
 *
 *   Place order → order_requests row + one Telegram tap (purpose "order")
 *   Approve     → the order is created with the request's id and matched right away
 *   Each fill   → autosettle derives that fill's trade_leg approval from the order's tap
 *                 (fillApprovalFromOrder): same member, link and pocket, price at the order's
 *                 limit or better, total never above what the tap showed.
 *   Decline / no tap in time → nothing is placed.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getLeg, getPair, type LegId } from "@/lib/chains";
import type { PlaceOrderInput } from "@/lib/trading.server";
import type { ApprovalRow } from "@/lib/pocket-send/approvals.server";
import type { PreflightFault } from "@/lib/order-readiness";
import { ORDER_BOOK_DESTINATION, ORDER_TAP_TTL_MS, fillFromOrderProblem, orderApprovalCap, orderTapText } from "./rules";

const num = (n: number) => Number(n).toLocaleString("en-US", { maximumFractionDigits: 8 });
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export type OrderRequestResult = {
  requestId: string;
  awaitingApproval: true;
  type: "limit" | "market";
  side: "buy" | "sell";
  amount: number;
  price: number;
  expiresAt: string;
};

/** Place order: every check a fill would make now, then ask for the one Telegram tap. Nothing goes on the book yet. */
export async function requestOrder(userId: string, pair: string, input: PlaceOrderInput): Promise<OrderRequestResult> {
  const { orderGateProblem } = await import("@/lib/trading.server");
  const gate = await orderGateProblem(userId);
  if (gate) throw new Error(gate);
  const { baseLeg, quoteLeg } = getPair(pair);
  const isMarket = input.type === "market";

  let price: number;
  if (isMarket) {
    // The worst price the member approves: today's best price plus their protection. Fixed at the tap.
    const { clampSlippagePct, protectionPrice } = await import("@/lib/market-order");
    const opposite = input.side === "buy" ? "sell" : "buy";
    const { data: best } = await supabaseAdmin.from("orders").select("price").eq("pair", pair).eq("side", opposite)
      .in("status", ["open", "partial"]).neq("user_id", userId)
      .order("price", { ascending: input.side === "buy" }).limit(1).maybeSingle();
    if (!best) {
      throw new Error(input.side === "buy"
        ? "Nobody is selling right now, so a market buy can't fill. Try a limit order instead."
        : "Nobody is buying right now, so a market sell can't fill. Try a limit order instead.");
    }
    price = protectionPrice(input.side, Number(best.price), clampSlippagePct(input.slippagePct));
  } else {
    price = input.price;
  }

  const { payLegOf, payAmountOf } = await import("@/lib/order-readiness");
  const { orderPayProblem } = await import("@/lib/pocket-send/trade.server");
  const payLeg = payLegOf(pair, input.side);
  const problem = await orderPayProblem(userId, payLeg, payAmountOf(input.side, input.amount, price));
  if (problem) throw new Error(problem);
  const { pocketSender } = await import("@/lib/pocket-send/pocket.server");
  const s = await pocketSender(userId, payLeg, "trade");
  if (!s.ok) throw new Error(`Before you can place this order: ${s.reason}`);

  const { data: req, error } = await supabaseAdmin.from("order_requests").insert({
    user_id: userId, pair, side: input.side, order_type: isMarket ? "market" : "limit", price, amount: input.amount,
    slippage_pct: isMarket ? (input.slippagePct ?? null) : null,
  }).select("id").single();
  if (error || !req) throw new Error("Couldn't start your order. Try again.");

  try {
    const { pairReference } = await import("@/lib/autosettle.server");
    const { tradeTerms, priceKey } = await import("@/lib/pocket-send/trade-terms");
    const ref = await pairReference(pair).catch(() => null);
    const baseSymbol = getLeg(baseLeg).symbol;
    const quoteSymbol = getLeg(quoteLeg).symbol;
    const terms = tradeTerms({ memberSide: input.side, baseSymbol, quoteSymbol, amount: input.amount, price, reference: ref?.reference ?? null });
    const refLine = ref?.reference ? `${ref.reference.source === "outside" ? "market price" : "Seeds price"} ${num(ref.reference.price)}` : "no outside price to compare — check this price yourself";
    const tap = orderTapText({
      side: input.side, orderType: isMarket ? "market" : "limit", amount: input.amount, price, baseSymbol, quoteSymbol,
      pair: `${baseSymbol}/${quoteSymbol}`, reference: refLine, warning: terms.warning,
    });
    const line = `${input.side === "buy" ? "Buy" : "Sell"} ${num(input.amount)} ${baseSymbol} ${isMarket ? "at market (limit" : "at"} ${num(price)} ${quoteSymbol}${isMarket ? ")" : ""} · ${baseSymbol}/${quoteSymbol}`;
    const { requestSendApproval } = await import("@/lib/pocket-send/approvals.server");
    const ttlMs = isMarket ? ORDER_TAP_TTL_MS.market : ORDER_TAP_TTL_MS.limit;
    const row = await requestSendApproval({
      userId, linkId: s.link.id, purpose: "order", refId: req.id, leg: payLeg,
      amount: orderApprovalCap(input.side, input.amount, price), from: s.address, to: ORDER_BOOK_DESTINATION,
      what: line, text: tap.text, ttlMs,
      meta: { side: input.side, price: priceKey(price), order_type: isMarket ? "market" : "limit", pair, line },
    });
    return {
      requestId: req.id, awaitingApproval: true, type: isMarket ? "market" : "limit", side: input.side,
      amount: input.amount, price, expiresAt: row.expires_at,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Couldn't ask for approval";
    await supabaseAdmin.from("order_requests").update({ status: "failed", error: message.slice(0, 500), decided_at: new Date().toISOString() })
      .eq("id", req.id).eq("status", "pending");
    throw e;
  }
}

/** After an order tap is decided (or ends): place the order, or record why it wasn't. Never throws. */
export async function continueOrderRequest(r: ApprovalRow): Promise<void> {
  const { data: cur } = await supabaseAdmin.from("send_approvals").select("status").eq("id", r.id).maybeSingle();
  const status = cur?.status ?? r.status;
  if (status === "approved") {
    await placeApprovedOrder(r);
    return;
  }
  const { data: req } = await supabaseAdmin.from("order_requests").select("id, status").eq("id", r.ref_id).maybeSingle();
  if (!req) return;
  if (req.status === "pending") {
    const ended = status === "declined" ? "declined" : status === "cancelled" ? "cancelled" : "expired";
    await supabaseAdmin.from("order_requests").update({ status: ended, decided_at: new Date().toISOString() }).eq("id", req.id).eq("status", "pending");
    return;
  }
  // The approval of an order already on the book ended (backstop lifetime): it can't pay fills any more.
  if (req.status === "placed") {
    await supabaseAdmin.from("orders").update({ status: "cancelled" }).eq("id", req.id).in("status", ["open", "partial"]);
  }
}

async function placeApprovedOrder(r: ApprovalRow): Promise<void> {
  const { data: claimed } = await supabaseAdmin.from("order_requests").update({ status: "placing" })
    .eq("id", r.ref_id).eq("user_id", r.user_id).eq("status", "pending")
    .select("id, user_id, pair, side, order_type, price, amount, slippage_pct");
  const req = claimed?.[0];
  if (!req) return;
  const side = req.side as "buy" | "sell";
  const isMarket = req.order_type === "market";
  const input: PlaceOrderInput = isMarket
    ? { type: "market", side, amount: Number(req.amount), ...(req.slippage_pct != null ? { slippagePct: Number(req.slippage_pct) } : {}) }
    : { type: "limit", side, price: Number(req.price), amount: Number(req.amount) };
  const { telegramCall } = await import("@/lib/telegram.server");
  const tell = (text: string) => r.telegram_chat_id && r.telegram_message_id
    ? telegramCall("editMessageText", { chat_id: r.telegram_chat_id, message_id: r.telegram_message_id, text, parse_mode: "HTML" }).catch(() => {})
    : Promise.resolve();
  const line = typeof r.meta["line"] === "string" ? (r.meta["line"] as string) : "Your order";
  try {
    const { matchOrder } = await import("@/lib/trading.server");
    const result = await matchOrder(req.user_id, req.pair, input, { orderId: req.id, ...(isMarket ? { marketPrice: Number(req.price) } : {}) });
    let settlements: Awaited<ReturnType<typeof import("@/lib/autosettle.server").autoSettleTrades>> = [];
    if (result.tradeIds.length > 0) {
      const { autoSettleTrades } = await import("@/lib/autosettle.server");
      settlements = await autoSettleTrades(result.tradeIds);
    }
    // A market order is finished: its tap can't pay anything else.
    if (isMarket) {
      await supabaseAdmin.from("send_approvals").update({ status: "used", used_at: new Date().toISOString() }).eq("id", r.id).eq("status", "approved");
    }
    await supabaseAdmin.from("order_requests").update({
      status: "placed", decided_at: new Date().toISOString(), result: { ...result, settlements } as never,
    }).eq("id", req.id);
    const base = getLeg(getPair(req.pair).baseLeg).symbol;
    const quote = getLeg(getPair(req.pair).quoteLeg).symbol;
    const failed = settlements.filter((st) => st.legs.some((l) => !l.ok && !l.pending)).length;
    const filledLine = result.filled > 1e-8
      ? `${side === "buy" ? "Bought" : "Sold"} ${num(result.filled)} ${base}${result.avgPrice != null ? ` at an average of ${num(result.avgPrice)} ${quote}` : ""}.`
      : "Nothing filled yet.";
    const rest = isMarket
      ? (result.cancelled > 1e-8 ? ` The other ${num(result.cancelled)} ${base} couldn't fill within your price and was cancelled.` : "")
      : (result.resting > 1e-8 ? ` ${num(result.resting)} ${base} is on the book and trades automatically until you cancel it.` : "");
    const failNote = failed > 0 ? ` ${failed} trade(s) couldn't settle and were cancelled; nothing was sent for those.` : "";
    await tell(`✅ <b>Order ${isMarket ? "done" : "placed"}</b>\n${esc(line)}\n${esc(filledLine + rest + failNote)}`);
  } catch (e) {
    const message = e instanceof Error ? e.message : "The order couldn't be placed";
    await supabaseAdmin.from("order_requests").update({ status: "failed", error: message.slice(0, 500), decided_at: new Date().toISOString() }).eq("id", req.id);
    await supabaseAdmin.from("send_approvals").update({ status: "cancelled", decided_at: new Date().toISOString(), error: message.slice(0, 500) })
      .eq("id", r.id).eq("status", "approved");
    await tell(`❌ <b>Order not placed</b>\n${esc(line)}\n${esc(message)}\nNothing was sent.`);
  }
}

export type DerivedFillApproval =
  | { kind: "none" }
  | { kind: "approved"; row: ApprovalRow }
  | { kind: "problem"; reason: string; fault: PreflightFault };

/**
 * One fill of an approved order: record that fill's send approval, taken from the order's tap.
 * "none" = the order predates order taps (the per-trade tap applies).
 */
export async function fillApprovalFromOrder(
  trade: { id: string; side: string; price: number | string; taker_id: string | null; maker_id: string | null; taker_order_id: string | null; maker_order_id: string | null },
  leg: LegId,
  payer: string,
  fill: { amount: number; to: string | null },
): Promise<DerivedFillApproval> {
  const orderId = payer === trade.taker_id ? trade.taker_order_id : payer === trade.maker_id ? trade.maker_order_id : null;
  if (!orderId) return { kind: "none" };
  const { data: oa } = await supabaseAdmin.from("send_approvals")
    .select("id, status, expires_at, user_id, link_id, from_address, leg, amount, meta")
    .eq("purpose", "order").eq("ref_id", orderId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!oa) return { kind: "none" };
  if (!fill.to) return { kind: "problem", reason: `The receiving side has no valid ${getLeg(leg).symbol} address`, fault: "receiver" };

  const { pocketSender } = await import("@/lib/pocket-send/pocket.server");
  const s = await pocketSender(payer, leg, "trade");
  if (!s.ok) return { kind: "problem", reason: s.reason, fault: "payer" };

  // What earlier fills already took from this tap (cancelled or never-sent fills give it back).
  const { data: earlier, error: earlierErr } = await supabaseAdmin.from("send_approvals").select("amount, status, txid, error")
    .eq("purpose", "trade_leg").eq("meta->>order_approval_id", oa.id);
  if (earlierErr) return { kind: "problem", reason: "Couldn't check this order's approval right now", fault: "network" };
  const committed = (earlier ?? []).reduce((sum, e) => {
    const live = e.status === "pending" || e.status === "approved" || (e.status === "used" && !(e.txid == null && e.error != null));
    return live ? sum + Number(e.amount) : sum;
  }, 0);

  const { memberSideOf, priceKey } = await import("@/lib/pocket-send/trade-terms");
  const memberSide = memberSideOf(trade.side === "sell" ? "sell" : "buy", payer === trade.taker_id);
  const meta = (oa.meta ?? {}) as Record<string, unknown>;
  const problem = fillFromOrderProblem(
    {
      status: oa.status, expiresAtMs: Date.parse(oa.expires_at), userId: oa.user_id, linkId: oa.link_id, fromAddress: oa.from_address,
      leg: oa.leg, cap: Number(oa.amount), side: meta["side"] === "sell" ? "sell" : "buy", limitPrice: Number(meta["price"]),
    },
    {
      userId: payer, linkId: s.link.id, fromAddress: s.address, leg, amount: fill.amount, price: Number(trade.price),
      side: memberSide, nowMs: Date.now(), alreadyCommitted: committed,
    },
  );
  if (problem) return { kind: "problem", reason: problem, fault: "payer" };

  const { APPROVAL_TTL_MS } = await import("@/lib/pocket-send/rules");
  const now = new Date();
  const { data: ins, error } = await supabaseAdmin.from("send_approvals").insert({
    user_id: payer, link_id: s.link.id, purpose: "trade_leg", ref_id: trade.id, leg, asset: getLeg(leg).symbol,
    amount: fill.amount, from_address: s.address, to_address: fill.to, status: "approved", decided_at: now.toISOString(),
    expires_at: new Date(now.getTime() + APPROVAL_TTL_MS).toISOString(), telegram_chat_id: null,
    meta: { side: memberSide, price: priceKey(trade.price), order_approval_id: oa.id } as never,
  }).select("id, user_id, link_id, purpose, ref_id, leg, asset, amount, from_address, to_address, status, meta, expires_at, telegram_chat_id, telegram_message_id").single();
  if (error || !ins) return { kind: "problem", reason: "Couldn't record this fill's approval", fault: "network" };
  return { kind: "approved", row: { ...(ins as unknown as ApprovalRow), amount: Number(ins.amount), meta: (ins.meta ?? {}) as Record<string, unknown> } };
}

/** For the order screen: one of my order requests (polled while waiting for the tap). */
export async function loadMyOrderRequest(userId: string, id: string) {
  const { data } = await supabaseAdmin.from("order_requests").select("id, status, order_type, side, amount, price, result, error, created_at, decided_at")
    .eq("id", id).eq("user_id", userId).maybeSingle();
  return data;
}

/** When an order is cancelled, its tap stops paying fills (and the Telegram message says so). */
export async function endOrderApprovals(orderIds: string[], why: string) {
  if (!orderIds.length) return;
  const { cancelApprovals } = await import("@/lib/pocket-send/approvals.server");
  for (const id of orderIds) await cancelApprovals({ purpose: "order", refId: id }, why).catch(() => 0);
}
