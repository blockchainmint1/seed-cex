/**
 * Exchange trade legs paid from an HME pocket. Used by the TSD, UTXO and EVM
 * settlement files whenever the payer has no old-style authorization.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getLeg, type LegId } from "@/lib/chains";
import { assertDeliverer, claimLeg } from "@/lib/settle-guard.server";
import { delivererOf, legAmount, legRole, receiverOf, type TradeShape } from "@/lib/leg-roles";
import { coverProblem, pocketLegBalance, pocketSender, receiveAddress, sendFromPocket, validDestination } from "./pocket.server";
import type { PreflightFault } from "@/lib/order-readiness";

export type PocketLegPreview = {
  ready: boolean;
  reason: string | null;
  source: "pocket";
  fromAddress: string | null;
  toAddress: string | null;
  balance: number | null;
  feeBalance: number | null;
  amount: number;
  chain: string | null;
  chainName: string | null;
  approval: string | null;
  /** Whose problem it is when not ready (order-readiness.ts decides whose order comes off the book). */
  fault?: PreflightFault;
};

async function loadTrade(userId: string, tradeId: string): Promise<TradeShape & { id: string; status: string; settle_started_at: string | null }> {
  const { data, error } = await supabaseAdmin
    .from("trades")
    .select("id, status, side, amount, price, pair, maker_id, taker_id, settle_started_at")
    .eq("id", tradeId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Trade not found");
  const t = data as unknown as TradeShape & { id: string; status: string; settle_started_at: string | null };
  if (t.maker_id !== userId && t.taker_id !== userId) throw new Error("Forbidden: you are not a party to this trade");
  return t;
}

/** Dry run for a pocket-paid leg: who pays, from where, to where, can they cover it, approval state. */
export async function previewPocketLeg(userId: string, tradeId: string, leg: LegId): Promise<PocketLegPreview> {
  const t = await loadTrade(userId, tradeId);
  const role = legRole(t.pair, leg);
  const sender = delivererOf(t, role);
  const receiver = receiverOf(t, role);
  const { data: escrow } = await supabaseAdmin.from("escrows").select("expected_amount").eq("trade_id", t.id).eq("leg", leg).maybeSingle();
  const amount = legAmount(t, role, escrow?.expected_amount);
  const base: PocketLegPreview = {
    ready: false, reason: null, source: "pocket", fromAddress: null, toAddress: null, balance: null, feeBalance: null,
    amount, chain: null, chainName: null, approval: null,
  };
  if (!sender) return { ...base, reason: "This trade has no paying side", fault: "payer" };
  if (!receiver) return { ...base, reason: "This trade has no receiving side", fault: "receiver" };

  const [s, to, { data: ap }] = await Promise.all([
    pocketSender(sender, leg, "trade"),
    receiveAddress(receiver, leg),
    supabaseAdmin.from("send_approvals").select("status").eq("purpose", "trade_leg").eq("ref_id", t.id).eq("leg", leg)
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const ctx = { ...base, toAddress: to, approval: ap?.status ?? null };
  // Only the payer sees their own setup problems in detail.
  if (!s.ok) return { ...ctx, fault: "payer", reason: sender === userId ? s.reason : "The other side's trading pocket isn't ready to send" };
  if (!to || !(await validDestination(leg, to))) return { ...ctx, fault: "receiver", fromAddress: s.address, reason: `The receiving side has no valid ${getLeg(leg).symbol} address` };
  const bal = await pocketLegBalance(s.address, leg, amount);
  const { getChain } = await import("@/lib/chains");
  const withBal = {
    ...ctx, fromAddress: s.address, balance: bal.balance, feeBalance: bal.feeBalance,
    chain: bal.chain, chainName: bal.chain ? getChain(bal.chain).name : null,
  };
  const problem = coverProblem(leg, bal, amount);
  // An unreadable balance is our servers' problem, not the payer's.
  if (problem) return { ...withBal, fault: bal.balance == null ? "network" : "payer", reason: sender === userId ? problem : "The other side's trading pocket can't cover this trade" };
  return { ...withBal, ready: true };
}

export type PocketLegResult = { txid: string; chain: string; amount: number; to: string; from: string };

/** Everything a pocket leg send checks before touching a key (shared by reserve and send). */
async function preparePocketLeg(userId: string, tradeId: string, leg: LegId) {
  const def = getLeg(leg);
  const t = await loadTrade(userId, tradeId);
  if (t.status === "settled" || t.status === "released") throw new Error("This trade is already settled");
  if (t.status === "disputed") throw new Error("This trade is in dispute");
  if (t.status === "timed_out" || t.status === "refunded") throw new Error("This trade was cancelled");
  // Pocket legs are sent only by the single settlement worker, after every approval is in.
  if (!t.settle_started_at) throw new Error("This leg sends automatically once both sides approve in Telegram.");

  const role = legRole(t.pair, leg);
  const sender = delivererOf(t, role);
  const receiver = receiverOf(t, role);
  if (!sender || !receiver) throw new Error("This trade has no counterparty yet");
  assertDeliverer(userId, sender, def.symbol);

  const { data: escrow } = await supabaseAdmin
    .from("escrows").select("id, status, release_txid, expected_amount").eq("trade_id", t.id).eq("leg", leg).maybeSingle();
  if (!escrow) throw new Error(`${def.symbol} escrow leg not found`);
  if (escrow.release_txid && !escrow.release_txid.startsWith("sim-")) throw new Error(`The ${def.symbol} leg has already been broadcast`);

  const amount = legAmount(t, role, escrow.expected_amount);
  const s = await pocketSender(sender, leg, "trade");
  if (!s.ok) throw new Error(s.reason);
  const to = await receiveAddress(receiver, leg);
  if (!to || !(await validDestination(leg, to))) throw new Error(`The receiving side has no valid ${def.symbol} address`);
  const bal = await pocketLegBalance(s.address, leg, amount);
  const problem = coverProblem(leg, bal, amount);
  if (problem) throw new Error(problem);
  return { t, escrow, amount, s, to, sender };
}

/**
 * Spend this leg's live Telegram approval now, without sending (audit #3 A1). The trade
 * starts with every side's tap spent at once; the second side is sent later, only after
 * the first side's payment has confirmed. Returns the approval id.
 */
export async function reservePocketLeg(userId: string, tradeId: string, leg: LegId): Promise<string> {
  const { t, amount, s, to, sender } = await preparePocketLeg(userId, tradeId, leg);
  const { spendApproval, reservedApproval } = await import("./approvals.server");
  const want = { purpose: "trade_leg" as const, refId: t.id, leg, userId: sender, linkId: s.link.id, amount, from: s.address, to };
  const already = await reservedApproval(want);
  if (already) return already.id;
  return (await spendApproval(want)).id;
}

/** Send one trade leg from the payer's pocket. Requires that payer's approval (live, or reserved when the trade started). */
export async function settlePocketLeg(userId: string, tradeId: string, leg: LegId): Promise<PocketLegResult> {
  const { t, escrow, amount, s, to, sender } = await preparePocketLeg(userId, tradeId, leg);

  const unclaim = await claimLeg(escrow.id);
  const { spendApproval, reservedApproval, recordApprovalTx, recordApprovalError } = await import("./approvals.server");
  let approvalId: string | null = null;
  let sent: Awaited<ReturnType<typeof sendFromPocket>>;
  try {
    const want = { purpose: "trade_leg" as const, refId: t.id, leg, userId: sender, linkId: s.link.id, amount, from: s.address, to };
    const approval = (await reservedApproval(want)) ?? (await spendApproval(want));
    approvalId = approval.id;
    sent = await sendFromPocket({
      link: s.link, leg, from: s.address, to, amount,
      record: async (txid) => {
        await recordApprovalTx(approval.id, txid);
      },
    });
    await recordApprovalTx(approval.id, sent.txid);
  } catch (e) {
    await unclaim();
    if (approvalId) await recordApprovalError(approvalId, e instanceof Error ? e.message : String(e));
    throw e;
  }

  await supabaseAdmin.from("escrows")
    .update({
      status: "released", release_txid: sent.txid, funded_amount: amount, confirmations: 0, sent_at: new Date().toISOString(), sent_network: sent.chain,
      sent_raw: sent.raw ?? null, sent_from: sent.from, sent_nonce: sent.nonce ?? null,
    })
    .eq("id", escrow.id);
  await supabaseAdmin.from("trade_events").insert({
    trade_id: t.id,
    actor_id: userId,
    event: `${leg}_broadcast`,
    detail: { txid: sent.txid, chain: sent.chain, amount, to, from: sent.from, source: "hme_pocket", approval_id: approvalId, simulated: false },
  });
  const { refreshTradeStatus } = await import("@/lib/settlement.server");
  await refreshTradeStatus(t.id);
  return { txid: sent.txid, chain: sent.chain, amount, to, from: sent.from };
}

/** The EVM network a pocket-paid leg was sent on (for confirmation tracking). */
export async function pocketLegChain(tradeId: string, leg: LegId): Promise<string | null> {
  const { data } = await supabaseAdmin.from("trade_events").select("detail").eq("trade_id", tradeId).eq("event", `${leg}_broadcast`)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  const c = (data?.detail as { chain?: string } | null)?.chain;
  return typeof c === "string" ? c : null;
}

/**
 * Place order check (Bobby, Nov 22 2026): can this member pay if the order fills right now?
 * Their pocket must be able to send this coin (instant-access link + Telegram) and hold
 * enough beyond what their other open orders already promise. Returns a plain reason, or null.
 */
export async function orderPayProblem(userId: string, leg: LegId, need: number): Promise<string | null> {
  const { orderCoverProblem } = await import("@/lib/order-readiness");
  const { setAsideFor } = await import("@/lib/set-asides.server");
  const symbol = getLeg(leg).symbol;
  const s = await pocketSender(userId, leg, "trade");
  if (!s.ok) return `Before you can place this order: ${s.reason}`;
  // Set aside = other open orders + trades still being paid + live P2P sales (set-asides.ts).
  const [bal, held] = await Promise.all([pocketLegBalance(s.address, leg, need), setAsideFor(userId, leg).catch(() => null)]);
  if (!held) return "Couldn't check your open orders right now, so the order wasn't placed. Try again in a minute.";
  const committed = held.total;
  const short = orderCoverProblem({ symbol, balance: bal.balance, committed, need });
  if (short) return short;
  // Fee coins (Omni carrier TXC, EVM gas) — same rule a fill would apply.
  const fee = coverProblem(leg, bal, need);
  return fee ? `Before you can place this order: ${fee}` : null;
}
