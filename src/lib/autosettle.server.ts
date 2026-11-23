/**
 * Instant settlement — all-or-nothing (security audit C2).
 *
 * 1. Preflight: both legs are dry-run as their paying party (live
 *    authorization, remaining limit, balance, receiving address, node). If
 *    either is not ready, nothing is sent: the trade is cancelled and both
 *    orders get their size back.
 * 2. Every pocket-paid side's Telegram approval is spent ("reserved") at once, then only
 *    the taker's side is sent.
 * 3. The maker's side goes out from the every-minute job (settle/confirm.server.ts), and
 *    only once the taker's payment is confirmed deep enough on its network (audit #3 A1:
 *    members hold their own pocket keys and could replace an unconfirmed send).
 * 4. If a side fails after the other has already gone out, the trade is put in
 *    dispute and nothing further is sent automatically.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getLeg, isOmniLeg, type LegId } from "@/lib/chains";
import { delivererOf, legRole, receiverOf, type TradeShape } from "@/lib/leg-roles";
import { ordersAfterFailedPreflight, type PreflightFault } from "@/lib/order-readiness";

export type AutoLegResult = {
  leg: LegId;
  ok: boolean;
  /** Waiting for a Telegram approval; nothing has failed. */
  pending?: boolean;
  txid?: string;
  amount?: number;
  to?: string;
  error?: string;
};

async function previewOne(actorId: string, tradeId: string, leg: LegId) {
  if (isOmniLeg(leg)) {
    const { previewTsdSettlement } = await import("./tsd-settlement.server");
    return previewTsdSettlement(actorId, tradeId, leg);
  }
  if (leg === "txc" || leg === "ltc" || leg === "isk") {
    const { previewUtxoSettlement } = await import("./settlement.server");
    return previewUtxoSettlement(actorId, tradeId, leg);
  }
  const { previewEvmSettlement } = await import("./evm-settlement.server");
  return previewEvmSettlement(actorId, tradeId, leg);
}

export async function settleOne(actorId: string, tradeId: string, leg: LegId): Promise<AutoLegResult> {
  if (isOmniLeg(leg)) {
    const { settleTsdLeg } = await import("./tsd-settlement.server");
    const r = await settleTsdLeg(actorId, tradeId, leg);
    return { leg, ok: true, txid: r.txid, amount: r.amount, to: r.to };
  }
  if (leg === "txc" || leg === "ltc" || leg === "isk") {
    const { settleUtxoLeg } = await import("./settlement.server");
    const r = await settleUtxoLeg(actorId, tradeId, leg);
    return { leg, ok: true, txid: r.txid, amount: r.amount, to: r.to };
  }
  const { settleEvmLeg } = await import("./evm-settlement.server");
  const r = await settleEvmLeg(actorId, tradeId, leg);
  return { leg, ok: true, txid: r.hash, amount: r.amount, to: r.to };
}

/** Give a cancelled fill's size back to both orders. */
export async function restoreFills(orderIds: Array<string | null>, amount: number) {
  for (const id of orderIds) {
    if (!id) continue;
    const { data: o } = await supabaseAdmin
      .from("orders")
      .select("filled, status, order_type")
      .eq("id", id)
      .maybeSingle();
    if (!o) continue;
    const filled = Math.max(0, Number(o.filled) - amount);
    // A market order never goes back on the book: its returned size is cancelled.
    const status =
      o.status === "cancelled" || o.order_type === "market"
        ? "cancelled"
        : filled > 1e-8
          ? "partial"
          : "open";
    await supabaseAdmin.from("orders").update({ filled, status }).eq("id", id);
  }
}

type FailedTradeRow = {
  pair: string | null;
  side: string;
  maker_id: string | null;
  taker_id: string | null;
  maker_order_id: string | null;
  taker_order_id: string | null;
  amount: number | string;
};

/** A match was cancelled before anything moved: take the culprit's order off the book, give the other side its size back. */
async function settleFailedPreflight(trade: FailedTradeRow, leg: LegId, payer: string | null, fault: PreflightFault): Promise<{ fault: PreflightFault; culprit: string | null }> {
  const shape = trade as unknown as TradeShape;
  const receiver = receiverOf(shape, legRole(trade.pair, leg));
  const { failureCulprit } = await import("@/lib/order-readiness");
  const culprit = failureCulprit({ fault, payer, receiver });
  const { cancel, restore } = ordersAfterFailedPreflight(
    { makerId: trade.maker_id, takerId: trade.taker_id, makerOrderId: trade.maker_order_id, takerOrderId: trade.taker_order_id },
    { fault, payer, receiver },
  );
  for (const id of cancel) {
    await supabaseAdmin.from("orders").update({ status: "cancelled" }).eq("id", id).in("status", ["open", "partial"]);
  }
  await restoreFills(restore, Number(trade.amount));
  return { fault, culprit };
}

/** The price a tap compares against for one market: outside price first, Seeds' own book second (trade-terms.ts). */
export async function pairReference(pairId: string, excludeTradeId?: string) {
  const { getPair } = await import("@/lib/chains");
  const { outsidePrice, pickReference, referencePrice } = await import("./pocket-send/trade-terms");
  const pair = getPair(pairId);
  const baseSymbol = getLeg(pair.baseLeg).symbol;
  const quoteSymbol = getLeg(pair.quoteLeg).symbol;
  let lastQ = supabaseAdmin.from("trades").select("price").eq("pair", pairId);
  if (excludeTradeId) lastQ = lastQ.neq("id", excludeTradeId);
  const [{ data: last }, { data: bid }, { data: ask }, quotes] = await Promise.all([
    lastQ
      .not("first_sent_at", "is", null).not("status", "in", "(timed_out,refunded)")
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabaseAdmin.from("orders").select("price").eq("pair", pairId).eq("side", "buy").in("status", ["open", "partial"])
      .order("price", { ascending: false }).limit(1).maybeSingle(),
    supabaseAdmin.from("orders").select("price").eq("pair", pairId).eq("side", "sell").in("status", ["open", "partial"])
      .order("price", { ascending: true }).limit(1).maybeSingle(),
    // Outside USD prices (CoinMarketCap, plus CoinGecko for PLS/HEX/pHEX); a failed read only drops the outside price.
    import("./cmc.server").then(({ fetchQuotes, TRACKED }) => fetchQuotes(TRACKED)).catch(() => null),
  ]);
  const seeds = referencePrice({
    lastPrinted: last ? Number(last.price) : null,
    bestBid: bid ? Number(bid.price) : null,
    bestAsk: ask ? Number(ask.price) : null,
  });
  const usd = (sym: string) => quotes?.quotes.find((q) => q.symbol === sym)?.price ?? null;
  return { baseSymbol, quoteSymbol, reference: pickReference(outsidePrice(baseSymbol, quoteSymbol, usd), seeds) };
}

/**
 * The terms shown in a trade leg's Telegram tap (audit 2026-11-22 R1): buy/sell, amount,
 * price, what comes back, and a warning when far from the market (outside price first, Seeds book second). The side and
 * price are also stored on the approval and must match when it is spent.
 */
async function tradeTapTerms(trade: { id: string; pair: string | null; side: string; amount: number | string; price: number | string; taker_id: string | null; created_at?: string | null }, payer: string) {
  const { memberSideOf, priceKey, tradeTerms } = await import("./pocket-send/trade-terms");
  const memberSide = memberSideOf(trade.side === "sell" ? "sell" : "buy", payer === trade.taker_id);
  const { baseSymbol, quoteSymbol, reference } = await pairReference(trade.pair ?? "", trade.id);
  const t = tradeTerms({
    memberSide, baseSymbol, quoteSymbol,
    amount: Number(trade.amount), price: Number(trade.price), reference,
  });
  return { line: t.line, warning: t.warning, meta: { side: memberSide, price: priceKey(trade.price) } };
}

export async function autoSettleTrade(tradeId: string): Promise<AutoLegResult[]> {
  const { data: trade } = await supabaseAdmin
    .from("trades")
    .select("id, maker_id, taker_id, maker_order_id, taker_order_id, pair, side, amount, price, status")
    .eq("id", tradeId)
    .maybeSingle();
  if (!trade) return [];
  if (trade.status !== "matched") return [];
  const t = trade as unknown as TradeShape;

  const { data: rows } = await supabaseAdmin
    .from("escrows")
    .select("leg, release_txid")
    .eq("trade_id", tradeId);

  const legs = (rows ?? []).map((r) => {
    const leg = r.leg as LegId;
    return { leg, payer: delivererOf(t, legRole(trade.pair, leg)), sent: !!r.release_txid };
  });
  // Taker pays first.
  legs.sort((a, b) => Number(b.payer === trade.taker_id) - Number(a.payer === trade.taker_id));

  const fail = async (event: string, leg: LegId, message: string, blame?: { fault: PreflightFault; culprit: string | null }) => {
    await supabaseAdmin.from("trade_events").insert({
      trade_id: tradeId,
      actor_id: null,
      event,
      // culprit: whose side failed (audit R2 counts these per member over 24 hours).
      detail: { leg, error: message, ...(blame ? { fault: blame.fault, culprit: blame.culprit } : {}) },
    });
    const { alertSettlementFailed } = await import("./alerts.server");
    await alertSettlementFailed({
      userIds: [trade.maker_id, trade.taker_id],
      pair: trade.pair ?? tradeId,
      legSymbol: getLeg(leg).symbol,
      error: message,
    });
  };

  // 1. Preflight both legs. Nothing moves unless both are ready.
  const pocketPaid = new Map<LegId, boolean>();
  for (const l of legs) {
    if (l.sent) continue;
    const p = l.payer ? await previewOne(l.payer, tradeId, l.leg) : null;
    if (!p || !p.ready) {
      const reason = p?.reason ?? "No paying party";
      await supabaseAdmin.from("trades").update({ status: "timed_out" }).eq("id", tradeId);
      // Only the side whose problem it was comes off the book (order-readiness.ts); a network
      // hiccup puts both back. Otherwise a dead order keeps matching and failing forever.
      const blame = await settleFailedPreflight(trade, l.leg, l.payer, p ? (p as { fault?: PreflightFault }).fault ?? "network" : "payer");
      const { cancelApprovals } = await import("./pocket-send/approvals.server");
      await cancelApprovals({ purpose: "trade_leg", refId: tradeId }, `The trade was cancelled: ${reason}`);
      await fail("cancelled_preflight", l.leg, reason, blame);
      return [{ leg: l.leg, ok: false, error: `Trade cancelled, nothing was sent: ${reason}` }];
    }
    pocketPaid.set(l.leg, (p as { source?: string }).source === "pocket");
  }

  // 1b. Legs paid from an HME pocket wait for the payer's Telegram tap. All-or-nothing:
  //     nothing is sent until every such leg is approved; any decline/expiry cancels.
  if ([...pocketPaid.values()].some(Boolean)) {
    const { latestApprovals, requestSendApproval, cancelApprovals } = await import("./pocket-send/approvals.server");
    const { tradeApprovalOutcome } = await import("./pocket-send/rules");
    const latest = await latestApprovals("trade_leg", tradeId);
    // Orders approved when they were placed (Bobby, Nov 23 2026): that one tap pays this fill,
    // so nobody is asked to tap after a trade has already happened. An order with no placement
    // tap (placed before then) never trades: the match is called off, that order comes off the
    // book for its owner to re-place with one tap, and nobody is blamed (no old-style taps).
    {
      const { fillApprovalFromOrder } = await import("@/lib/order-approval/order-approval.server");
      for (const l of legs) {
        if (l.sent || pocketPaid.get(l.leg) !== true || !l.payer || latest[l.leg]) continue;
        const p = (await previewOne(l.payer, tradeId, l.leg)) as { amount?: number; toAddress?: string | null };
        const got = await fillApprovalFromOrder(trade, l.leg, l.payer, { amount: p.amount ?? 0, to: p.toAddress ?? null });
        if (got.kind === "approved") {
          latest[l.leg] = got.row;
          continue;
        }
        if (got.kind === "none") {
          const reason = "An order in this match was placed before one-tap orders, so it was cancelled for its owner to re-place";
          await supabaseAdmin.from("trades").update({ status: "timed_out" }).eq("id", tradeId).eq("status", "matched");
          const { ordersAfterFailedPreflight } = await import("@/lib/order-readiness");
          const { cancel, restore } = ordersAfterFailedPreflight(
            { makerId: trade.maker_id, takerId: trade.taker_id, makerOrderId: trade.maker_order_id, takerOrderId: trade.taker_order_id },
            { fault: "payer", payer: l.payer, receiver: null },
          );
          for (const id of cancel) {
            await supabaseAdmin.from("orders").update({ status: "cancelled", cancel_reason: "reapprove_needed" }).eq("id", id).in("status", ["open", "partial"]);
          }
          await restoreFills(restore, Number(trade.amount));
          await cancelApprovals({ purpose: "trade_leg", refId: tradeId }, `The trade was cancelled: ${reason}`);
          await fail("cancelled_preflight", l.leg, `${reason}. Nothing was sent.`, { fault: "payer", culprit: null });
          return [{ leg: l.leg, ok: false, error: `Trade cancelled, nothing was sent: ${reason}` }];
        }
        if (got.kind === "problem") {
          await supabaseAdmin.from("trades").update({ status: "timed_out" }).eq("id", tradeId).eq("status", "matched");
          const blame = await settleFailedPreflight(trade, l.leg, l.payer, got.fault);
          await cancelApprovals({ purpose: "trade_leg", refId: tradeId }, `The trade was cancelled: ${got.reason}`);
          await fail("cancelled_preflight", l.leg, got.reason, blame);
          return [{ leg: l.leg, ok: false, error: `Trade cancelled, nothing was sent: ${got.reason}` }];
        }
      }
    }
    const view = legs.map((l) => ({ sent: l.sent, needsApproval: pocketPaid.get(l.leg) === true, status: latest[l.leg]?.status ?? null }));
    const outcome = tradeApprovalOutcome(view);

    if (outcome === "cancel") {
      const stopped = legs.find((l) => ["declined", "expired", "cancelled"].includes(latest[l.leg]?.status ?? ""));
      const stopper = stopped?.payer ?? null;
      const why = latest[stopped?.leg ?? ""]?.status === "declined" ? "declined" : "not approved in time";
      const { data: moved } = await supabaseAdmin.from("trades").update({ status: "timed_out" }).eq("id", tradeId).eq("status", "matched").select("id");
      if (moved?.length) {
        // The side that didn't approve loses its order (no phantom liquidity); the other side gets its size back.
        const stopperOrder = stopper === trade.maker_id ? trade.maker_order_id : stopper === trade.taker_id ? trade.taker_order_id : null;
        const otherOrder = stopperOrder === trade.maker_order_id ? trade.taker_order_id : trade.maker_order_id;
        if (stopperOrder) await supabaseAdmin.from("orders").update({ status: "cancelled" }).eq("id", stopperOrder).in("status", ["open", "partial"]);
        await restoreFills(stopperOrder ? [otherOrder] : [trade.maker_order_id, trade.taker_order_id], Number(trade.amount));
        await cancelApprovals({ purpose: "trade_leg", refId: tradeId }, "The trade was cancelled because one side didn't approve.");
        await supabaseAdmin.from("trade_events").insert({ trade_id: tradeId, actor_id: null, event: "cancelled_approval", detail: { by: stopper, why } });
        const { alertSettlementFailed } = await import("./alerts.server");
        await alertSettlementFailed({
          userIds: [trade.maker_id, trade.taker_id],
          pair: trade.pair ?? tradeId,
          legSymbol: getLeg(stopped?.leg ?? legs[0].leg).symbol,
          error: `The send was ${why} in Telegram, so the trade was cancelled. Nothing was sent.`,
        });
      }
      return [{ leg: stopped?.leg ?? legs[0].leg, ok: false, error: `Trade cancelled, nothing was sent: the send was ${why}.` }];
    }

    if (outcome === "wait") {
      const out: AutoLegResult[] = [];
      const { pocketSender } = await import("./pocket-send/pocket.server");
      for (const l of legs) {
        if (l.sent || pocketPaid.get(l.leg) !== true || !l.payer) continue;
        const st = latest[l.leg]?.status;
        if (st === "pending" || st === "approved") {
          out.push({ leg: l.leg, ok: false, pending: true, error: st === "approved" ? "Approved — waiting for the other side" : "Waiting for approval in Telegram" });
          continue;
        }
        let fault: PreflightFault = "network";
        try {
          const s = await pocketSender(l.payer, l.leg, "trade");
          if (!s.ok) {
            fault = "payer";
            throw new Error(s.reason);
          }
          const p = (await previewOne(l.payer, tradeId, l.leg)) as { amount?: number; toAddress?: string | null };
          if (!p.toAddress || !(p.amount && p.amount > 0)) {
            fault = "receiver";
            throw new Error("No receiving address");
          }
          const terms = await tradeTapTerms(trade, l.payer);
          await requestSendApproval({
            userId: l.payer, linkId: s.link.id, purpose: "trade_leg", refId: tradeId, leg: l.leg,
            amount: p.amount, from: s.address, to: p.toAddress,
            what: `${terms.line}\nExchange trade · ${trade.pair ?? ""} · ${l.payer === trade.taker_id ? "your order" : "your resting order matched"}`,
            ...(terms.warning ? { warning: terms.warning } : {}),
            meta: terms.meta,
          });
          out.push({ leg: l.leg, ok: false, pending: true, error: "Waiting for approval in Telegram" });
        } catch (e) {
          const reason = e instanceof Error ? e.message : "Couldn't ask for approval";
          await supabaseAdmin.from("trades").update({ status: "timed_out" }).eq("id", tradeId).eq("status", "matched");
          const blame = await settleFailedPreflight(trade, l.leg, l.payer, fault);
          await cancelApprovals({ purpose: "trade_leg", refId: tradeId }, `The trade was cancelled: ${reason}`);
          await fail("cancelled_preflight", l.leg, reason, blame);
          return [{ leg: l.leg, ok: false, error: `Trade cancelled, nothing was sent: ${reason}` }];
        }
      }
      return out;
    }
    // outcome === "send": fall through; each pocket leg spends its approval as it sends.
  }

  // 2. One worker only: two approvals landing at once must not start two sends.
  const { data: lock } = await supabaseAdmin
    .from("trades")
    .update({ settle_started_at: new Date().toISOString() })
    .eq("id", tradeId)
    .eq("status", "matched")
    .is("settle_started_at", null)
    .select("id");
  if (!lock?.length) return [];

  const cancelBeforeAnySend = async (leg: LegId, message: string) => {
    await supabaseAdmin.from("trades").update({ status: "timed_out" }).eq("id", tradeId);
    await restoreFills([trade.maker_order_id, trade.taker_order_id], Number(trade.amount));
    const { cancelApprovals, voidReservedApprovals } = await import("./pocket-send/approvals.server");
    await cancelApprovals({ purpose: "trade_leg", refId: tradeId }, `The trade was cancelled: ${message}`);
    await voidReservedApprovals(tradeId, `The trade was cancelled before this side was sent: ${message}`);
    await fail(`${leg}_autosettle_failed`, leg, message);
  };

  // 3. Spend every pocket-paid side's approval now: a tap is good for 15 minutes, and the
  //    second side may wait longer than that for the first side to confirm.
  if (legs.some((l) => l.sent)) return []; // the every-minute job carries a trade already underway
  for (const l of legs) {
    if (pocketPaid.get(l.leg) !== true || !l.payer) continue;
    try {
      const { reservePocketLeg } = await import("./pocket-send/trade.server");
      await reservePocketLeg(l.payer, tradeId, l.leg);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Couldn't use the approval";
      await cancelBeforeAnySend(l.leg, message);
      return [{ leg: l.leg, ok: false, error: `Trade cancelled, nothing was sent: ${message}` }];
    }
  }

  // 4. Send the taker's side only. The maker's side goes out once this one is confirmed.
  const [first, ...rest] = legs;
  if (!first) return [];
  let firstResult: AutoLegResult;
  try {
    firstResult = await settleOne(first.payer as string, tradeId, first.leg);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Settlement failed";
    // The txid was stored before broadcast and the error says it may have gone out anyway:
    // never cancel (the coins may be on their way) and never re-send. An admin checks it.
    const { maybeBroadcast } = await import("./broadcast-rules");
    const { data: recorded } = await supabaseAdmin.from("send_approvals").select("txid")
      .eq("purpose", "trade_leg").eq("ref_id", tradeId).eq("leg", first.leg).not("txid", "is", null).limit(1).maybeSingle();
    if (recorded?.txid && maybeBroadcast(message)) {
      await supabaseAdmin.from("trades").update({ status: "disputed" }).eq("id", tradeId).eq("status", "matched");
      const { voidReservedApprovals } = await import("./pocket-send/approvals.server");
      await voidReservedApprovals(tradeId, `The first side may have been sent (${message}); the team checks before anything else moves.`);
      await supabaseAdmin.from("trade_events").insert({ trade_id: tradeId, actor_id: null, event: "first_send_unsure", detail: { leg: first.leg, txid: recorded.txid, error: message.slice(0, 300) } });
      const { alertTradeHeld } = await import("./alerts.server");
      await alertTradeHeld({ userIds: [trade.maker_id, trade.taker_id], pair: trade.pair ?? tradeId, text: `the network didn't confirm it received the ${getLeg(first.leg).symbol} payment. Don't retry; the team will check it.` });
      return [{ leg: first.leg, ok: false, error: `The network didn't confirm it received the payment (${message}). The trade is on hold; don't retry.` }];
    }
    await cancelBeforeAnySend(first.leg, message);
    return [{ leg: first.leg, ok: false, error: message }];
  }
  await supabaseAdmin.from("trade_events").insert({
    trade_id: tradeId, actor_id: null, event: "waiting_first_confirmation",
    detail: { first: first.leg, then: rest.map((l) => l.leg) },
  });
  return [
    firstResult,
    ...rest.map((l) => ({ leg: l.leg, ok: false, pending: true, error: `Sent once the ${getLeg(first.leg).symbol} payment is confirmed on its network` })),
  ];
}

/** Auto-settle a batch of fills; never throws into the order path. */
export async function autoSettleTrades(tradeIds: string[]) {
  const out: Array<{ tradeId: string; legs: AutoLegResult[] }> = [];
  for (const id of tradeIds) {
    try {
      out.push({ tradeId: id, legs: await autoSettleTrade(id) });
    } catch {
      out.push({ tradeId: id, legs: [] });
    }
  }
  return out;
}
