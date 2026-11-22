/**
 * "Send from my pocket?" approvals over Telegram.
 *
 * Every send from an HME pocket is preceded by one row in send_approvals and one
 * Telegram message with signed Approve / Decline buttons. A send may happen only
 * by spending (status approved → used) the live approval for exactly that coin,
 * amount and destination, from the same wallet link, before it expires.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getLeg, type LegId } from "@/lib/chains";
import { APPROVAL_TTL_MS, approvalMatches, approvalMetaMatches, approvalTapDecision, parseApprovalData, type ApprovalChoice } from "./rules";

/**
 * trade_leg / p2p_release: settlement sends. swap_out: a swap paying out to an outside address (audit 2026-11-19 H2).
 * dex_swap: a Uniswap / PancakeSwap / PulseX swap from the member's pocket back into the same pocket.
 * withdrawal: a Seeds-signed withdrawal to an outside address (src/lib/withdraw/); the tap starts its hold.
 * two_step: one tap for both hops of a two-step swap (src/lib/two-step/), own pocket to own pocket.
 */
export type ApprovalPurpose = "trade_leg" | "p2p_release" | "swap_out" | "dex_swap" | "withdrawal" | "two_step";

export type ApprovalRow = {
  id: string;
  user_id: string;
  link_id: string;
  purpose: ApprovalPurpose;
  ref_id: string;
  leg: string;
  asset: string;
  amount: number;
  from_address: string;
  to_address: string;
  status: string;
  meta: Record<string, unknown>;
  expires_at: string;
  telegram_chat_id: string | null;
  telegram_message_id: number | null;
};

const COLS =
  "id, user_id, link_id, purpose, ref_id, leg, asset, amount, from_address, to_address, status, meta, expires_at, telegram_chat_id, telegram_message_id";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fmt = (n: number) => Number(n).toLocaleString("en-US", { maximumFractionDigits: 8 });

function norm(r: Record<string, unknown>): ApprovalRow {
  return { ...(r as unknown as ApprovalRow), amount: Number(r.amount), meta: (r.meta ?? {}) as Record<string, unknown> };
}

/** The newest approval per leg for one send purpose (live or finished). */
export async function latestApprovals(purpose: ApprovalPurpose, refId: string): Promise<Record<string, ApprovalRow>> {
  const { data } = await supabaseAdmin
    .from("send_approvals")
    .select(COLS)
    .eq("purpose", purpose)
    .eq("ref_id", refId)
    .order("created_at", { ascending: false });
  const out: Record<string, ApprovalRow> = {};
  for (const r of data ?? []) if (!out[r.leg]) out[r.leg] = norm(r);
  // A pending tap past its time counts as expired even before the sweeper runs.
  for (const r of Object.values(out)) {
    if ((r.status === "pending" || r.status === "approved") && Date.parse(r.expires_at) <= Date.now()) {
      await supabaseAdmin.from("send_approvals").update({ status: "expired", decided_at: new Date().toISOString() })
        .eq("id", r.id).in("status", ["pending", "approved"]);
      r.status = "expired";
    }
  }
  return out;
}

/**
 * Ask the member to approve one send. Idempotent: an existing live request for the
 * same send is returned (or replaced if the amount/destination changed).
 */
export async function requestSendApproval(p: {
  userId: string;
  linkId: string;
  purpose: ApprovalPurpose;
  refId: string;
  /** Settlement leg id, or the swap coin id for swap_out. */
  leg: string;
  /** Coin symbol shown and stored; defaults to the settlement leg's symbol. */
  asset?: string;
  amount: number;
  from: string;
  to: string;
  /** One line describing what this is for, e.g. "Exchange trade · TXC/TSD". */
  what: string;
  meta?: Record<string, unknown>;
}): Promise<ApprovalRow> {
  const { data: live } = await supabaseAdmin
    .from("send_approvals")
    .select(COLS)
    .eq("purpose", p.purpose)
    .eq("ref_id", p.refId)
    .eq("leg", p.leg)
    .in("status", ["pending", "approved"])
    .maybeSingle();
  if (live) {
    const row = norm(live);
    const same = row.user_id === p.userId && row.link_id === p.linkId && Math.abs(row.amount - p.amount) <= 1e-8 && row.from_address === p.from && row.to_address === p.to;
    if (same && Date.parse(row.expires_at) > Date.now()) return row;
    await supabaseAdmin.from("send_approvals").update({ status: Date.parse(row.expires_at) > Date.now() ? "cancelled" : "expired", decided_at: new Date().toISOString(), error: "Replaced by a new request" })
      .eq("id", row.id).in("status", ["pending", "approved"]);
  }

  const { data: prof } = await supabaseAdmin.from("profiles").select("telegram_chat_id, telegram_verified").eq("id", p.userId).maybeSingle();
  const chatId = prof?.telegram_verified ? String(prof.telegram_chat_id ?? "") : "";
  if (!chatId) throw new Error("Connect Telegram (Account → Alerts). Every send from your pocket waits for your tap in Telegram.");

  const symbol = p.asset ?? getLeg(p.leg as LegId).symbol;
  const { data: ins, error } = await supabaseAdmin
    .from("send_approvals")
    .insert({
      user_id: p.userId, link_id: p.linkId, purpose: p.purpose, ref_id: p.refId, leg: p.leg, asset: symbol,
      amount: p.amount, from_address: p.from, to_address: p.to, meta: (p.meta ?? {}) as never,
      expires_at: new Date(Date.now() + APPROVAL_TTL_MS).toISOString(), telegram_chat_id: chatId,
    })
    .select(COLS)
    .single();
  if (error) {
    // Lost a race with an identical request: use that one.
    if (/send_approvals_one_live|duplicate/i.test(error.message)) {
      const { data: again } = await supabaseAdmin.from("send_approvals").select(COLS)
        .eq("purpose", p.purpose).eq("ref_id", p.refId).eq("leg", p.leg).in("status", ["pending", "approved"]).maybeSingle();
      if (again) return norm(again);
    }
    throw new Error(error.message);
  }
  const row = norm(ins);

  const { approvalButtonData } = await import("./rules");
  const { telegramActionKey, telegramCall } = await import("@/lib/telegram.server");
  const key = await telegramActionKey();
  const mins = Math.round(APPROVAL_TTL_MS / 60_000);
  const text =
    `🔐 <b>Approve this send?</b>\n` +
    `<b>${fmt(p.amount)} ${esc(symbol)}</b> from your trading pocket\n` +
    `to <code>${esc(p.to)}</code>\n` +
    `${esc(p.what)}\n\n` +
    `Nothing moves until you tap Approve. This request ends in ${mins} minutes.\n` +
    `If you didn't start this, tap Decline and check your account.`;
  try {
    const sent = (await telegramCall("sendMessage", {
      chat_id: chatId, text, parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[
        { text: "✅ Approve", callback_data: await approvalButtonData(key, "yes", row.id, p.userId) },
        { text: "Decline", callback_data: await approvalButtonData(key, "no", row.id, p.userId) },
      ]] },
    })) as { message_id?: number } | undefined;
    if (sent?.message_id) {
      await supabaseAdmin.from("send_approvals").update({ telegram_message_id: sent.message_id }).eq("id", row.id);
      row.telegram_message_id = sent.message_id;
    }
  } catch (e) {
    // No message, no way to approve: close the request now rather than leave it hanging.
    await supabaseAdmin.from("send_approvals").update({ status: "cancelled", decided_at: new Date().toISOString(), error: "Telegram message failed" })
      .eq("id", row.id).eq("status", "pending");
    throw new Error(`We couldn't reach your Telegram to ask for approval: ${e instanceof Error ? e.message : "unknown error"}`);
  }
  return row;
}

/**
 * Spend the live approval for exactly this send. Atomic: only one caller can move it
 * from approved to used. Throws (nothing sent) if there is no matching approval.
 */
export async function spendApproval(p: {
  purpose: ApprovalPurpose;
  /** Look up by what it was for (settlement) … */
  refId?: string;
  /** … or by its own id (swap_out, where the Swap page holds the id). */
  id?: string;
  leg: string;
  userId: string;
  linkId: string;
  amount: number;
  from: string;
  to: string;
  /** Details that must also match what was approved (e.g. swap_out: receiving coin + protocol). */
  meta?: Record<string, string>;
}): Promise<ApprovalRow> {
  if (!p.refId && !p.id) throw new Error("No approval to spend. Nothing was sent.");
  let q = supabaseAdmin.from("send_approvals").select(COLS).eq("purpose", p.purpose).eq("leg", p.leg).eq("status", "approved");
  q = p.id ? q.eq("id", p.id) : q.eq("ref_id", p.refId!);
  const { data } = await q.maybeSingle();
  const row = data ? norm(data) : null;
  if (
    !row ||
    !approvalMatches(
      { status: row.status, expiresAtMs: Date.parse(row.expires_at), userId: row.user_id, linkId: row.link_id, leg: row.leg, amount: row.amount, fromAddress: row.from_address, toAddress: row.to_address },
      { userId: p.userId, linkId: p.linkId, leg: p.leg, amount: p.amount, fromAddress: p.from, toAddress: p.to, nowMs: Date.now() },
    ) ||
    !approvalMetaMatches(row.meta, p.meta)
  ) {
    throw new Error("This send hasn't been approved in Telegram (or the approval ended). Nothing was sent.");
  }
  const { data: claimed } = await supabaseAdmin
    .from("send_approvals")
    .update({ status: "used", used_at: new Date().toISOString() })
    .eq("id", row.id).eq("status", "approved").gt("expires_at", new Date().toISOString())
    .select("id");
  if (!claimed || claimed.length === 0) throw new Error("This approval was already used or just ended. Nothing was sent.");
  return { ...row, status: "used" };
}

/**
 * An exchange leg's approval that was spent when the trade started but hasn't been sent
 * yet (audit #3 A1: the second side is sent only after the first side confirms, which
 * can outlast the tap's 15 minutes). Matches the same user, link, amount and addresses;
 * once a txid or an error is recorded on it, it can never be used again.
 */
export async function reservedApproval(p: {
  purpose: ApprovalPurpose; refId: string; leg: string; userId: string; linkId: string; amount: number; from: string; to: string;
}): Promise<ApprovalRow | null> {
  const { data } = await supabaseAdmin
    .from("send_approvals")
    .select(COLS)
    .eq("purpose", p.purpose).eq("ref_id", p.refId).eq("leg", p.leg)
    .eq("status", "used").is("txid", null).is("error", null)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!data) return null;
  const row = norm(data);
  const same = row.user_id === p.userId && row.link_id === p.linkId && Math.abs(row.amount - p.amount) <= 1e-8
    && row.from_address === p.from && row.to_address === p.to;
  return same ? row : null;
}

/** A trade stopped before its reserved sides were sent: mark those spent approvals so they can never be used. */
export async function voidReservedApprovals(tradeId: string, why: string) {
  await supabaseAdmin.from("send_approvals").update({ error: why.slice(0, 500) })
    .eq("purpose", "trade_leg").eq("ref_id", tradeId).eq("status", "used").is("txid", null).is("error", null);
}

export async function recordApprovalTx(id: string, txid: string) {
  await supabaseAdmin.from("send_approvals").update({ txid }).eq("id", id).is("txid", null);
}

export async function recordApprovalError(id: string, message: string) {
  await supabaseAdmin.from("send_approvals").update({ error: message.slice(0, 500) }).eq("id", id);
}

/** Close live approvals (trade cancelled, link revoked…). Edits their Telegram message. */
export async function cancelApprovals(filter: { purpose?: ApprovalPurpose; refId?: string; linkId?: string }, why: string) {
  let q = supabaseAdmin.from("send_approvals").update({ status: "cancelled", decided_at: new Date().toISOString(), error: why.slice(0, 500) })
    .in("status", ["pending", "approved"]);
  if (filter.purpose) q = q.eq("purpose", filter.purpose);
  if (filter.refId) q = q.eq("ref_id", filter.refId);
  if (filter.linkId) q = q.eq("link_id", filter.linkId);
  const { data } = await q.select(COLS);
  for (const r of data ?? []) await editApprovalMessage(norm(r), `❌ <b>Send request closed</b>\n${esc(why)}\nNothing was sent.`);
  return (data ?? []).length;
}

async function editApprovalMessage(r: ApprovalRow, text: string) {
  if (!r.telegram_chat_id || !r.telegram_message_id) return;
  const { telegramCall } = await import("@/lib/telegram.server");
  await telegramCall("editMessageText", { chat_id: r.telegram_chat_id, message_id: r.telegram_message_id, text, parse_mode: "HTML" }).catch(() => {});
}

/** After a decision, move the thing it was for along (send, or cancel). Never throws. */
async function continueAfter(r: ApprovalRow) {
  // A swap_out send is finished by the member's open Swap page, which re-quotes and spends the approval.
  if (r.purpose === "swap_out") return;
  try {
    if (r.purpose === "withdrawal") {
      const { continueWithdrawal } = await import("@/lib/withdraw/withdraw.server");
      await continueWithdrawal(r);
      return;
    }
    if (r.purpose === "dex_swap") {
      const { advanceDexSwap } = await import("@/lib/dex/swap.server");
      await advanceDexSwap(r.ref_id);
      return;
    }
    if (r.purpose === "two_step") {
      const { advanceTwoStep } = await import("@/lib/two-step/two-step.server");
      await advanceTwoStep(r.ref_id);
      return;
    }
    if (r.purpose === "trade_leg") {
      const { autoSettleTrade } = await import("@/lib/autosettle.server");
      await autoSettleTrade(r.ref_id);
    } else {
      const { continueP2pRelease } = await import("@/lib/p2p.server");
      await continueP2pRelease(r.ref_id);
    }
  } catch (e) {
    console.error("[send-approval] continue failed", r.id, e);
  }
}

type CallbackQuery = { id?: string; data?: string; message?: { message_id?: number; chat?: { id?: number; type?: string } } };

/** Handle an Approve / Decline tap. Returns a short outcome label, or null if the button isn't ours. */
export async function handleApprovalTap(cq: CallbackQuery): Promise<string | null> {
  const parsed = parseApprovalData(cq.data);
  if (!parsed) return null;
  const { telegramActionKey, telegramCall } = await import("@/lib/telegram.server");
  const answer = (text: string, alert = false) =>
    cq.id ? telegramCall("answerCallbackQuery", { callback_query_id: cq.id, text, show_alert: alert }).catch(() => {}) : Promise.resolve();
  const chatId = cq.message?.chat?.id;

  const { data } = await supabaseAdmin.from("send_approvals").select(COLS).eq("id", parsed.approvalId).maybeSingle();
  const row = data ? norm(data) : null;
  const { data: owner } = row
    ? await supabaseAdmin.from("profiles").select("telegram_chat_id, telegram_verified").eq("id", row.user_id).maybeSingle()
    : { data: null };
  const { approvalSignatureOk } = await import("./rules");
  const decision = approvalTapDecision({
    choice: parsed.choice as ApprovalChoice,
    signatureOk: row ? await approvalSignatureOk(await telegramActionKey(), parsed, row.user_id) : false,
    privateChat: cq.message?.chat?.type === "private",
    tapChatId: String(chatId ?? ""),
    ownerChatId: owner?.telegram_chat_id ? String(owner.telegram_chat_id) : null,
    ownerChatVerified: owner?.telegram_verified === true,
    status: row?.status ?? "missing",
    expiresAtMs: row ? Date.parse(row.expires_at) : 0,
    nowMs: Date.now(),
  });

  if (decision === "refuse" || !row) {
    await answer("This button isn't valid for this chat.", true);
    return "refused";
  }
  const what = `${fmt(row.amount)} ${esc(row.asset)} to <code>${esc(row.to_address)}</code>`;
  if (decision === "already_decided") {
    await answer(row.status === "used" ? "Already approved and sent." : `This request is already ${row.status}.`);
    return "already_decided";
  }
  if (decision === "expired") {
    await supabaseAdmin.from("send_approvals").update({ status: "expired", decided_at: new Date().toISOString() }).eq("id", row.id).eq("status", "pending");
    await editApprovalMessage(row, `⌛ <b>Send request ended</b>\n${what}\nIt wasn't approved in time, so nothing was sent.`);
    await answer("This request already ended. Nothing was sent.", true);
    await continueAfter(row);
    return "expired";
  }

  if (decision === "decline") {
    const { data: done } = await supabaseAdmin.from("send_approvals").update({ status: "declined", decided_at: new Date().toISOString() })
      .eq("id", row.id).eq("status", "pending").select("id");
    if (!done?.length) { await answer("This request was already decided."); return "already_decided"; }
    await editApprovalMessage(row, `🛑 <b>Declined</b>\n${what}\nNothing was sent.`);
    await answer("Declined. Nothing was sent.");
    await continueAfter(row);
    return "declined";
  }

  // Approve: re-check the sender is still allowed (same link, two-factor first, Telegram on).
  const why = await approveBlocker(row);
  if (why) {
    await supabaseAdmin.from("send_approvals").update({ status: "cancelled", decided_at: new Date().toISOString(), error: why.slice(0, 500) })
      .eq("id", row.id).eq("status", "pending");
    await editApprovalMessage(row, `❌ <b>Can't send</b>\n${what}\n${esc(why)}\nNothing was sent.`);
    await answer("Can't send right now. Nothing was sent.", true);
    await continueAfter(row);
    return "blocked";
  }
  const { data: ok } = await supabaseAdmin.from("send_approvals").update({ status: "approved", decided_at: new Date().toISOString() })
    .eq("id", row.id).eq("status", "pending").gt("expires_at", new Date().toISOString()).select("id");
  if (!ok?.length) { await answer("This request was already decided or ended."); return "already_decided"; }
  await editApprovalMessage(row, row.purpose === "swap_out"
    ? `✅ <b>Approved</b>\n${what}\nYour open Seeds Swap page sends it now, after one last price check. If you closed that page, nothing is sent.`
    : row.purpose === "dex_swap" || row.purpose === "two_step"
      ? `✅ <b>Approved</b>\n${what}\nSwapping now, after one last price check and a test run. You'll get a message when it's done.`
      : row.purpose === "withdrawal"
      ? `✅ <b>Approved</b>\n${what}\nSeeds sends it after your withdrawal wait (none for beta testers). You can still cancel on Seeds until then.`
      : `✅ <b>Approved</b>\n${what}\nSending now. You'll get a message when it's on the way.`);
  await answer("Approved. Sending now.");
  await continueAfter({ ...row, status: "approved" });
  return "approved";
}

/** Why an Approve tap can't be honoured any more (link changed, two-factor, Telegram…), or null. */
async function approveBlocker(row: ApprovalRow): Promise<string | null> {
  if (row.purpose === "withdrawal") {
    const { withdrawalApproveBlocker } = await import("@/lib/withdraw/withdraw.server");
    return withdrawalApproveBlocker(row);
  }
  if (row.purpose === "swap_out" || row.purpose === "dex_swap" || row.purpose === "two_step") {
    const { loadLink } = await import("@/lib/xchain/send.server");
    const link = await loadLink(row.user_id);
    if (!link || link.id !== row.link_id || !link.hasKey) return "Your wallet link changed since this request.";
    if (!Object.values(link.addresses).includes(row.from_address)) return "Your wallet link changed since this request.";
    return null;
  }
  const { pocketSender } = await import("./pocket.server");
  const s = await pocketSender(row.user_id, row.leg as LegId);
  if (!s.ok) return s.reason;
  if (s.link.id !== row.link_id || s.address !== row.from_address) return "Your wallet link changed since this request.";
  return null;
}

/** Scheduled sweep: end requests past their time and move their trades along. */
export async function expireDueApprovals() {
  const { data } = await supabaseAdmin
    .from("send_approvals")
    .update({ status: "expired", decided_at: new Date().toISOString() })
    .in("status", ["pending", "approved"])
    .lte("expires_at", new Date().toISOString())
    .select(COLS);
  const rows = (data ?? []).map(norm);
  for (const r of rows) {
    await editApprovalMessage(r, `⌛ <b>Send request ended</b>\n${fmt(r.amount)} ${esc(r.asset)} to <code>${esc(r.to_address)}</code>\nIt wasn't approved in time, so nothing was sent.`);
    await continueAfter(r);
  }
  return { expired: rows.length };
}
