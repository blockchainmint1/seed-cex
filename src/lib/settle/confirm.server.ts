/**
 * Every-minute settlement watcher (security audit #3, A1).
 *
 * After autosettle sends the taker's side, this job:
 *  - reads that payment on its network and records its depth;
 *  - sends the maker's side only once the taker's is confirmed deep enough;
 *  - marks the trade settled only when both sides are confirmed;
 *  - if a payment vanished or the network rejected it: dispute + freeze that payer's trading;
 *  - if a side can't be confirmed for hours (e.g. our servers can't read it): dispute, no blame.
 * Rules live in confirm-rules.ts (tested). Sends still go through the pocket-send guards
 * (single claim per leg, approvals reserved when the trade started).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getLeg, isOmniLeg, type ChainId, type LegId } from "@/lib/chains";
import { delivererOf, legRole, type TradeShape } from "@/lib/leg-roles";
import { confirmationsNeeded, nextSettleStep, resendOutcome, sentLegState, type SentLegCheck, type SentLegState } from "./confirm-rules";

/**
 * Lookup safety switch: "no such transaction" from a TXC/ISK node only means "gone" when the
 * node keeps a full transaction index. Checked live Nov 20 2026 (both synced); re-checked here
 * so a node rebuilt without it can never freeze an honest member. Finished values only.
 */
const txIndexSeen = new Map<string, { ok: boolean; at: number }>();
async function txIndexOn(chain: "txc" | "isk"): Promise<boolean> {
  const hit = txIndexSeen.get(chain);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.ok;
  const { rpc } = await import("@/lib/rpc.server");
  let ok = false;
  try {
    const info = await rpc<{ txindex?: { synced?: boolean } }>(chain, "getindexinfo", []);
    ok = info?.txindex?.synced === true;
  } catch {
    ok = false;
  }
  txIndexSeen.set(chain, { ok, at: Date.now() });
  return ok;
}

/** A trade locked for settlement with nothing sent after this long goes to an admin. */
const NOTHING_SENT_AFTER_MS = 30 * 60_000;

function networkOf(leg: LegId, recorded: string | null): string | null {
  const def = getLeg(leg);
  if (isOmniLeg(leg)) return "txc";
  if (def.kind === "utxo") return def.chain as string;
  return recorded ?? null;
}

/** Read one sent side on its network. Never throws. */
export async function checkSentLeg(leg: LegId, txid: string, network: string | null, ageMs: number): Promise<SentLegCheck> {
  const def = getLeg(leg);
  try {
    if (isOmniLeg(leg)) {
      const { fetchOmniTx } = await import("@/lib/omni.server");
      const t = await fetchOmniTx(txid);
      // Omni judges validity once the carrier transaction is in a block.
      return { kind: "omni", found: t.found, confirmations: t.confirmations, rejected: (t.confirmations ?? 0) >= 1 && t.valid === false, ageMs };
    }
    if (def.kind === "utxo") {
      if (def.chain === "ltc") {
        const { confirmationsFor } = await import("@/lib/utxo/io.server");
        const c = await confirmationsFor("ltc", txid);
        return { kind: "utxo", found: c === null ? null : true, confirmations: c, rejected: false, ageMs };
      }
      const { rpc } = await import("@/lib/rpc.server");
      try {
        const tx = await rpc<{ confirmations?: number }>(def.chain as "txc" | "isk", "getrawtransaction", [txid, true]);
        return { kind: "utxo", found: true, confirmations: tx.confirmations ?? 0, rejected: false, ageMs };
      } catch (e) {
        const notFound = (e as { code?: number }).code === -5 && (await txIndexOn(def.chain as "txc" | "isk"));
        return { kind: "utxo", found: notFound ? false : null, confirmations: null, rejected: false, ageMs };
      }
    }
    if (!network) return { kind: "evm", found: null, confirmations: null, rejected: false, ageMs };
    const { evmTxLookup } = await import("@/lib/evm.server");
    const r = await evmTxLookup(network as ChainId, txid);
    return { kind: "evm", found: r.found, confirmations: r.confirmations, rejected: r.success === false, ageMs };
  } catch (e) {
    console.error("[settle-watch] check failed", leg, e instanceof Error ? e.message : e);
    return { kind: def.kind === "evm" ? "evm" : def.kind === "omni" ? "omni" : "utxo", found: null, confirmations: null, rejected: false, ageMs };
  }
}

/** Stop a member's exchange trading after a payment of theirs vanished. Their open orders are cancelled. */
export async function freezeTrader(userId: string, tradeId: string, reason: string) {
  await supabaseAdmin.from("profiles")
    .update({ trading_frozen_at: new Date().toISOString(), trading_frozen_reason: reason.slice(0, 500), trading_frozen_trade: tradeId })
    .eq("id", userId).is("trading_frozen_at", null);
  await supabaseAdmin.from("orders").update({ status: "cancelled" }).eq("user_id", userId).in("status", ["open", "partial"]);
}

/** Why this member can't place exchange orders (null = they can). */
export async function tradingFrozenReason(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from("profiles").select("trading_frozen_at").eq("id", userId).maybeSingle();
  return data?.trading_frozen_at
    ? "Trading is paused on your account while the team reviews a trade payment that didn't arrive. Contact support from the Help page."
    : null;
}

type TradeStatus = "matched" | "both_funded";
type TradeRow = TradeShape & { id: string; status: TradeStatus; settle_started_at: string; maker_order_id: string | null; taker_order_id: string | null };

async function hold(t: TradeRow, event: string, detail: Record<string, string | number | boolean | null>, text: string) {
  const { data: moved } = await supabaseAdmin.from("trades").update({ status: "disputed" }).eq("id", t.id).eq("status", t.status).select("id");
  if (!moved?.length) return false;
  await supabaseAdmin.from("trade_events").insert({ trade_id: t.id, actor_id: null, event, detail });
  const { voidReservedApprovals } = await import("@/lib/pocket-send/approvals.server");
  await voidReservedApprovals(t.id, `Trade on hold: ${text}`);
  const { alertTradeHeld } = await import("@/lib/alerts.server");
  await alertTradeHeld({ userIds: [t.maker_id, t.taker_id], pair: t.pair ?? t.id, text });
  return true;
}

async function advanceOne(t: TradeRow): Promise<string> {
  const { data: rows } = await supabaseAdmin
    .from("escrows")
    .select("id, leg, release_txid, sent_at, sent_network, confirmed_at, updated_at, sent_raw, sent_from, sent_nonce, rebroadcast_at")
    .eq("trade_id", t.id);
  const legs = (rows ?? []).map((r) => ({
    ...r,
    leg: r.leg as LegId,
    payer: delivererOf(t, legRole(t.pair, r.leg as LegId)),
    sent: !!r.release_txid,
  }));
  // Same order as autosettle: the taker pays first.
  legs.sort((a, b) => Number(b.payer === t.taker_id) - Number(a.payer === t.taker_id));

  if (!legs.some((l) => l.sent)) {
    if (Date.now() - Date.parse(t.settle_started_at) > NOTHING_SENT_AFTER_MS) {
      await hold(t, "settlement_stuck", { why: "nothing_sent" }, "settlement started but no payment went out. The team will check it.");
      return "stuck";
    }
    return "starting";
  }

  const view: Array<{ leg: string; sent: boolean; state: SentLegState | null; ageMs?: number }> = [];
  for (const l of legs) {
    if (!l.sent) { view.push({ leg: l.leg, sent: false, state: null }); continue; }
    if (l.confirmed_at) { view.push({ leg: l.leg, sent: true, state: "confirmed" }); continue; }
    let network = networkOf(l.leg, l.sent_network);
    if (!network) {
      const { pocketLegChain } = await import("@/lib/pocket-send/trade.server");
      network = (await pocketLegChain(t.id, l.leg)) ?? getLeg(l.leg).evmChains?.[0] ?? null;
    }
    const ageMs = Date.now() - Date.parse(l.rebroadcast_at ?? l.sent_at ?? l.updated_at);
    const check = await checkSentLeg(l.leg, l.release_txid as string, network, ageMs);
    check.canResend = Boolean(l.sent_raw) && !l.rebroadcast_at;
    if (check.found === false && check.kind === "evm" && network && l.sent_from && l.sent_nonce != null) {
      const { fetchConfirmedNonce } = await import("@/lib/evm.server");
      const done = await fetchConfirmedNonce(network as ChainId, l.sent_from);
      if (done != null && done > Number(l.sent_nonce)) check.replaced = true;
    }
    let state = sentLegState(check, confirmationsNeeded(network));
    if (state === "resend") state = await resendLeg(t, l, network);
    const patch: { confirmations?: number; confirmed_at?: string } = {};
    if (check.confirmations != null) patch.confirmations = check.confirmations;
    if (state === "confirmed") patch.confirmed_at = new Date().toISOString();
    if (Object.keys(patch).length) await supabaseAdmin.from("escrows").update(patch).eq("id", l.id);
    view.push({ leg: l.leg, sent: true, state, ageMs });
  }

  const step = nextSettleStep(view);
  if (step.action === "dispute") {
    const l = legs.find((x) => x.leg === step.leg)!;
    const sym = getLeg(l.leg).symbol;
    const held = await hold(t, "payment_vanished", { leg: l.leg, txid: l.release_txid, payer: l.payer },
      `the ${sym} payment didn't arrive on its network (it was replaced, dropped or rejected). The team will review it.`);
    if (held && l.payer) await freezeTrader(l.payer, t.id, `The ${sym} payment for trade ${t.id} vanished or was rejected.`);
    return "vanished";
  }
  if (step.action === "stuck") {
    await hold(t, "settlement_stuck", { leg: step.leg }, `the ${getLeg(step.leg as LegId).symbol} payment hasn't confirmed for hours. The team will check it.`);
    return "stuck";
  }
  if (step.action === "send_second") {
    const second = legs.find((l) => !l.sent)!;
    try {
      const { settleOne } = await import("@/lib/autosettle.server");
      await settleOne(second.payer as string, t.id, second.leg);
      return "sent_second";
    } catch (e) {
      const message = e instanceof Error ? e.message : "Settlement failed";
      await hold(t, `${second.leg}_autosettle_failed_disputed`, { leg: second.leg, error: message },
        `the ${getLeg(second.leg).symbol} side couldn't be sent after the other side was paid (${message}). The team will sort it out.`);
      return "second_failed";
    }
  }
  if (step.action === "settled") {
    const { refreshTradeStatus } = await import("@/lib/settlement.server");
    await refreshTradeStatus(t.id);
    return "settled";
  }
  return "waiting";
}

/** Resend the exact signed send once. Returns what the leg now counts as. */
async function resendLeg(
  t: TradeRow, l: { id: string; leg: LegId; release_txid: string | null; sent_raw: string | null }, network: string | null,
): Promise<"waiting" | "vanished"> {
  const raw = l.sent_raw as string;
  let error: string | null = null;
  try {
    const def = getLeg(l.leg);
    if (isOmniLeg(l.leg)) {
      const { rpc } = await import("@/lib/rpc.server");
      await rpc<string>("txc", "sendrawtransaction", [raw]);
    } else if (def.kind === "utxo") {
      const { broadcastFor } = await import("@/lib/utxo/io.server");
      await broadcastFor(def.chain as never, raw);
    } else {
      const { sendRawTransaction } = await import("@/lib/evm.server");
      await sendRawTransaction(network as ChainId, raw);
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const outcome = resendOutcome(error);
  await supabaseAdmin.from("trade_events").insert({
    trade_id: t.id, actor_id: null, event: "payment_resent",
    detail: { leg: l.leg, txid: l.release_txid, outcome, error: error?.slice(0, 300) ?? null },
  });
  if (outcome === "accepted") {
    await supabaseAdmin.from("escrows").update({ rebroadcast_at: new Date().toISOString() }).eq("id", l.id).is("rebroadcast_at", null);
    return "waiting";
  }
  return outcome === "spent_elsewhere" ? "vanished" : "waiting";
}

/** One pass over every trade whose settlement has started and isn't finished. */
export async function advanceSettlingTrades(limit = 50) {
  const { data } = await supabaseAdmin
    .from("trades")
    .select("id, pair, side, amount, price, maker_id, taker_id, maker_order_id, taker_order_id, status, settle_started_at")
    .not("settle_started_at", "is", null)
    .in("status", ["matched", "both_funded"])
    .order("settle_started_at", { ascending: true })
    .limit(limit);
  const out: Record<string, number> = {};
  for (const t of (data ?? []) as unknown as TradeRow[]) {
    try {
      const r = await advanceOne(t);
      out[r] = (out[r] ?? 0) + 1;
    } catch (e) {
      console.error("[settle-watch]", t.id, e instanceof Error ? e.message : e);
      out.error = (out.error ?? 0) + 1;
    }
  }
  return { trades: data?.length ?? 0, ...out };
}
