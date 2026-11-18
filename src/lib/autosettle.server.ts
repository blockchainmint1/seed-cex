/**
 * Instant settlement — all-or-nothing (security audit C2).
 *
 * 1. Preflight: both legs are dry-run as their paying party (live
 *    authorization, remaining limit, balance, receiving address, node). If
 *    either is not ready, nothing is sent: the trade is cancelled and both
 *    orders get their size back.
 * 2. The taker's leg is sent first, then the maker's.
 * 3. If a leg fails after the other has already gone out, the trade is put in
 *    dispute and nothing further is sent automatically.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getLeg, isOmniLeg, type LegId } from "@/lib/chains";
import { delivererOf, legRole, type TradeShape } from "@/lib/leg-roles";

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

async function settleOne(actorId: string, tradeId: string, leg: LegId): Promise<AutoLegResult> {
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
async function restoreFills(orderIds: Array<string | null>, amount: number) {
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

  const fail = async (event: string, leg: LegId, message: string) => {
    await supabaseAdmin.from("trade_events").insert({
      trade_id: tradeId,
      actor_id: null,
      event,
      detail: { leg, error: message },
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
      await restoreFills([trade.maker_order_id, trade.taker_order_id], Number(trade.amount));
      const { cancelApprovals } = await import("./pocket-send/approvals.server");
      await cancelApprovals({ purpose: "trade_leg", refId: tradeId }, `The trade was cancelled: ${reason}`);
      await fail("cancelled_preflight", l.leg, reason);
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
        try {
          const s = await pocketSender(l.payer, l.leg);
          if (!s.ok) throw new Error(s.reason);
          const p = (await previewOne(l.payer, tradeId, l.leg)) as { amount?: number; toAddress?: string | null };
          if (!p.toAddress || !(p.amount && p.amount > 0)) throw new Error("No receiving address");
          await requestSendApproval({
            userId: l.payer, linkId: s.link.id, purpose: "trade_leg", refId: tradeId, leg: l.leg,
            amount: p.amount, from: s.address, to: p.toAddress,
            what: `Exchange trade · ${trade.pair ?? ""} · ${l.payer === trade.taker_id ? "your order" : "your resting order matched"}`,
          });
          out.push({ leg: l.leg, ok: false, pending: true, error: "Waiting for approval in Telegram" });
        } catch (e) {
          const reason = e instanceof Error ? e.message : "Couldn't ask for approval";
          await supabaseAdmin.from("trades").update({ status: "timed_out" }).eq("id", tradeId).eq("status", "matched");
          await restoreFills([trade.maker_order_id, trade.taker_order_id], Number(trade.amount));
          await cancelApprovals({ purpose: "trade_leg", refId: tradeId }, `The trade was cancelled: ${reason}`);
          await fail("cancelled_preflight", l.leg, reason);
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

  // 3. Send, taker first. Any failure after money moved → dispute, stop.
  const results: AutoLegResult[] = [];
  let anySent = legs.some((l) => l.sent);
  for (const l of legs) {
    if (l.sent) continue;
    try {
      results.push(await settleOne(l.payer as string, tradeId, l.leg));
      anySent = true;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Settlement failed";
      results.push({ leg: l.leg, ok: false, error: message });
      if (anySent) {
        await supabaseAdmin.from("trades").update({ status: "disputed" }).eq("id", tradeId);
        await fail(`${l.leg}_autosettle_failed_disputed`, l.leg, message);
      } else {
        await supabaseAdmin.from("trades").update({ status: "timed_out" }).eq("id", tradeId);
        await restoreFills([trade.maker_order_id, trade.taker_order_id], Number(trade.amount));
        const { cancelApprovals } = await import("./pocket-send/approvals.server");
        await cancelApprovals({ purpose: "trade_leg", refId: tradeId }, `The trade was cancelled: ${message}`);
        await fail(`${l.leg}_autosettle_failed`, l.leg, message);
      }
      break;
    }
  }
  return results;
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
