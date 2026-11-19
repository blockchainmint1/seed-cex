/** Telegram alert delivery through the Lovable connector gateway. Server-only. */

import { friendlyTelegramError } from "./telegram-bot";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";

export function telegramConfigured(): boolean {
  return Boolean(process.env["LOVABLE_API_KEY"] && process.env["TELEGRAM_API_KEY"]);
}

/** Calls one Telegram Bot API method through the gateway. Throws member-readable errors. */
export async function telegramCall(method: string, body: Record<string, unknown>): Promise<unknown> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const telegramKey = process.env["TELEGRAM_API_KEY"];
  if (!lovableKey || !telegramKey) {
    throw new Error("Telegram alerts are not configured yet on this deployment.");
  }

  const res = await fetch(`${GATEWAY_URL}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": telegramKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`Telegram gateway ${method} failed [${res.status}]: ${text}`);
    throw new Error(friendlyTelegramError(res.status, text));
  }

  const json = (await res.json()) as { ok?: boolean; description?: string; result?: unknown };
  if (json.ok === false) {
    console.error(`Telegram API ${method} error: ${json.description}`);
    throw new Error(friendlyTelegramError(200, json.description ?? ""));
  }
  return json.result;
}

export type InlineKeyboard = { inline_keyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>> };

export async function sendTelegram(chatId: string, text: string, replyMarkup?: InlineKeyboard): Promise<void> {
  await telegramCall("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", ...(replyMarkup ? { reply_markup: replyMarkup } : {}) });
}

/** Fire-and-forget alert for a user, respecting their notification preferences. */
export async function notifyUser(
  userId: string,
  pref:
    | "notify_order_filled"
    | "notify_settlement"
    | "notify_settlement_failed"
    | "notify_auth_expiring"
    | "notify_deposit"
    | "notify_login"
    | "notify_p2p",
  text: string,
  replyMarkup?: InlineKeyboard,
): Promise<void> {
  try {
    if (!telegramConfigured()) return;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("profiles")
      .select(`telegram_chat_id, telegram_verified, ${pref}`)
      .eq("id", userId)
      .maybeSingle();

    const row = data as Record<string, unknown> | null;
    if (!row?.telegram_chat_id || row.telegram_verified !== true) return;
    if (row[pref] !== true) return;
    await sendTelegram(String(row.telegram_chat_id), text, replyMarkup);
  } catch (err) {
    console.error("notifyUser failed", err);
  }
}

const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export async function sha256hex(v: string) {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v)));
  return [...d].map((x) => x.toString(16).padStart(2, "0")).join("");
}
export const newStartCode = () => b64url(crypto.getRandomValues(new Uint8Array(18)));

/** Secret Telegram echoes back in X-Telegram-Bot-Api-Secret-Token; derived so nothing extra is stored. */
export async function telegramWebhookSecret() {
  const key = process.env["TELEGRAM_API_KEY"] ?? "";
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`telegram-webhook:${key}`)));
  return b64url(d);
}

/** Key for the signed one-tap buttons; derived (separately labelled) so nothing extra is stored. Empty when unset. */
export async function telegramActionKey(): Promise<string> {
  const key = process.env["TELEGRAM_API_KEY"];
  if (!key) return "";
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`telegram-action:${key}`)));
  return b64url(d);
}

const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

type CallbackQuery = {
  id?: string;
  data?: string;
  message?: { message_id?: number; chat?: { id?: number; type?: string } };
};

/** A tap on a button in a Seeds alert: Approve/Decline a pocket send, or the one-tap "Revoke Seeds' access" flow (ask → confirm). */
async function handleCallback(cq: CallbackQuery): Promise<string> {
  const answer = (text: string, alert = false) =>
    cq.id ? telegramCall("answerCallbackQuery", { callback_query_id: cq.id, text, show_alert: alert }).catch(() => {}) : Promise.resolve();
  // "Approve this send?" buttons (pocket sends) have their own signed format.
  const { handleApprovalTap } = await import("./pocket-send/approvals.server");
  const approval = await handleApprovalTap(cq);
  if (approval) return `send_${approval}`;
  // "Do today's AI plan trades?" buttons (Seeds AI real buying).
  const { handleAiTap } = await import("./ai/execute.server");
  const ai = await handleAiTap(cq);
  if (ai) return `ai_${ai}`;

  const chatId = cq.message?.chat?.id;
  const messageId = cq.message?.message_id;
  const { parseRevokeData, revokeSignatureOk, revokeDecision } = await import("./telegram-actions");
  const parsed = parseRevokeData(cq.data);
  if (!parsed || !chatId) {
    await answer("This button doesn't work anymore.");
    return "ignored";
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: link } = await supabaseAdmin.from("hme_links")
    .select("id, user_id, status, account, paths, xpubs").eq("id", parsed.linkId).maybeSingle();
  const { data: owner } = link
    ? await supabaseAdmin.from("profiles").select("telegram_chat_id, telegram_verified").eq("id", link.user_id).maybeSingle()
    : { data: null };
  const decision = revokeDecision({
    step: parsed.step,
    signatureOk: link ? await revokeSignatureOk(await telegramActionKey(), parsed, link.user_id) : false,
    privateChat: cq.message?.chat?.type === "private",
    tapChatId: String(chatId),
    ownerChatId: owner?.telegram_chat_id ? String(owner.telegram_chat_id) : null,
    ownerChatVerified: owner?.telegram_verified === true,
    linkActive: link?.status === "active",
  });
  const edit = (text: string) =>
    messageId
      ? telegramCall("editMessageText", { chat_id: chatId, message_id: messageId, text, parse_mode: "HTML" }).catch(() => {})
      : Promise.resolve();

  if (decision === "refuse" || !link) {
    await answer("This button isn't valid for this chat.", true);
    return "refused";
  }
  if (decision === "cancel") {
    await edit("<b>Seeds</b>\nKept. Nothing changed, and your HME Wallet link is still on.");
    await answer("Nothing changed.");
    return "cancelled";
  }
  if (decision === "already_revoked") {
    if (messageId) await telegramCall("editMessageReplyMarkup", { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } }).catch(() => {});
    await answer("That link is already revoked. Seeds has no access to it.", true);
    return "already_revoked";
  }

  const { revokeButtonData } = await import("./telegram-actions");
  const key = await telegramActionKey();
  if (decision === "confirm") {
    const { extraPocketAddresses } = await import("@/lib/pockets/extra-addresses.server");
    const { recoveryLines } = await import("@/lib/pockets/hme-support");
    const extra = recoveryLines(link.account, extraPocketAddresses(link));
    const warn = extra.length
      ? `\n\n⚠️ <b>HME Wallet can't hold some coins in this pocket.</b> If you left any in them, you'll need your recovery phrase in a wallet that supports that coin:\n${extra.map((l) => `• ${escHtml(l)}`).join("\n")}\nSwapping them back to TSD first is easiest, but if this sign-in wasn't you, revoke now.`
      : "";
    await sendTelegram(String(chatId),
      `🚫 <b>Revoke Seeds' access to pocket #${link.account}?</b>\nSeeds deletes its trading key right away and cancels any trade requests waiting on it. Your coins stay in your HME Wallet; nothing moves.${warn}`,
      { inline_keyboard: [[
        { text: "Yes, revoke now", callback_data: await revokeButtonData(key, "yes", link.id, link.user_id) },
        { text: "Keep it", callback_data: await revokeButtonData(key, "no", link.id, link.user_id) },
      ]] });
    await answer("Tap “Yes, revoke now” to confirm.");
    return "confirm_sent";
  }

  const { revokeActiveHmeLinks } = await import("./hme-link-revoke.server");
  const { revoked } = await revokeActiveHmeLinks(link.user_id, "telegram", link.id);
  await edit(revoked
    ? `✅ <b>Seeds</b>\nDone. Seeds deleted its key to pocket #${link.account}. Nobody can trade from it through Seeds now, and your coins are still in your HME Wallet.\n\nIf the sign-in wasn't you, also sign out of Honest.Money everywhere and contact support@honest.money. To trade again later, link your HME Wallet from Account → Security.`
    : "<b>Seeds</b>\nThat link was already revoked. Seeds has no access to it.");
  await answer(revoked ? "Revoked." : "Already revoked.");
  return revoked ? "revoked" : "already_revoked";
}

type TelegramUpdate = { message?: { text?: string; chat?: { id?: number; type?: string } }; callback_query?: CallbackQuery };

/** Handles "/start <code>" (links that private chat to the member who made the code) and button taps. */
export async function handleTelegramUpdate(update: TelegramUpdate) {
  if (update.callback_query) return handleCallback(update.callback_query);
  const { parseStartCode } = await import("./telegram-bot");
  const msg = update.message;
  const chatId = msg?.chat?.id;
  if (!chatId || msg?.chat?.type !== "private" || !msg.text?.startsWith("/start")) return "ignored";
  const code = parseStartCode(msg.text);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const now = new Date().toISOString();
  const { data: owner } = code
    ? await supabaseAdmin.from("profiles").select("telegram_chat_id, telegram_verified")
        .eq("telegram_code", await sha256hex(code)).gt("telegram_code_expires_at", now).maybeSingle()
    : { data: null };
  const { data: rows } = code
    ? await supabaseAdmin.from("profiles")
        .update({ telegram_chat_id: String(chatId), telegram_verified: true, telegram_code: null, telegram_code_expires_at: null })
        .eq("telegram_code", await sha256hex(code)).gt("telegram_code_expires_at", now).select("id")
    : { data: null };
  const userId = rows?.[0]?.id;
  if (!userId) {
    await sendTelegram(String(chatId), "<b>Seeds</b>\nTo turn on alerts, open your Seeds Profile and tap <b>Connect Telegram</b>. Links expire after 15 minutes.").catch(() => {});
    return "no_match";
  }
  await sendTelegram(String(chatId), "<b>Seeds</b>\nAlerts are on. You'll hear from us when your orders fill and settle.").catch(() => {});
  await telegramChatChanged(userId, owner?.telegram_verified ? owner.telegram_chat_id : null, String(chatId));
  const { emailAccountChange } = await import("@/lib/email/send.server");
  await emailAccountChange(userId, "Telegram alerts", [`Linked Telegram chat ending ${String(chatId).slice(-4)}`],
    "unlink Telegram on your profile, then sign out of Honest.Money everywhere and contact support@honest.money.");
  return "linked";
}

/**
 * After the member's Telegram chat changed (new chat, or unlinked): tell the previous chat,
 * and close any send approvals still waiting there so they can't be tapped from either chat.
 * Never throws.
 */
export async function telegramChatChanged(userId: string, oldChatId: string | null | undefined, newChatId: string | null) {
  if ((oldChatId ?? null) === newChatId) return;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: live } = await supabaseAdmin.from("send_approvals").select("id").eq("user_id", userId).in("status", ["pending", "approved"]).limit(1);
    if (live?.length) {
      const { data: links } = await supabaseAdmin.from("hme_links").select("id").eq("user_id", userId);
      const { cancelApprovals } = await import("@/lib/pocket-send/approvals.server");
      for (const l of links ?? []) await cancelApprovals({ linkId: l.id }, "Your Telegram chat for Seeds changed.");
    }
    if (oldChatId) {
      await sendTelegram(String(oldChatId), newChatId
        ? "<b>Seeds</b>\nYour Seeds alerts and send approvals moved to a different Telegram chat. If that wasn't you, sign out of Honest.Money everywhere, then contact support@honest.money."
        : "<b>Seeds</b>\nTelegram was unlinked from your Seeds account, so alerts and send approvals stop here. If that wasn't you, sign out of Honest.Money everywhere, then contact support@honest.money.");
    }
  } catch (e) {
    console.error("[telegram] chat-change follow-up failed", e);
  }
}
