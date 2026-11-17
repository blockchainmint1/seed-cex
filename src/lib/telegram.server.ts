/** Telegram alert delivery through the Lovable connector gateway. Server-only. */

import { friendlyTelegramError } from "./telegram-bot";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";

export function telegramConfigured(): boolean {
  return Boolean(process.env["LOVABLE_API_KEY"] && process.env["TELEGRAM_API_KEY"]);
}

export async function sendTelegram(chatId: string, text: string): Promise<void> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const telegramKey = process.env["TELEGRAM_API_KEY"];
  if (!lovableKey || !telegramKey) {
    throw new Error("Telegram alerts are not configured yet on this deployment.");
  }

  const res = await fetch(`${GATEWAY_URL}/sendMessage`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": telegramKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`Telegram gateway failed [${res.status}]: ${body}`);
    throw new Error(friendlyTelegramError(res.status, body));
  }

  const json = (await res.json()) as { ok?: boolean; description?: string };
  if (json.ok === false) {
    console.error(`Telegram API error: ${json.description}`);
    throw new Error(friendlyTelegramError(200, json.description ?? ""));
  }
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
    await sendTelegram(String(row.telegram_chat_id), text);
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

/** Handles "/start <code>" from the Seeds bot: links that private chat to the member who made the code. */
export async function handleTelegramUpdate(update: { message?: { text?: string; chat?: { id?: number; type?: string } } }) {
  const { parseStartCode } = await import("./telegram-bot");
  const msg = update.message;
  const chatId = msg?.chat?.id;
  if (!chatId || msg?.chat?.type !== "private" || !msg.text?.startsWith("/start")) return "ignored";
  const code = parseStartCode(msg.text);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const now = new Date().toISOString();
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
  const { emailAccountChange } = await import("@/lib/email/send.server");
  await emailAccountChange(userId, "Telegram alerts", [`Linked Telegram chat ending ${String(chatId).slice(-4)}`],
    "unlink Telegram on your profile, then sign out of Honest.Money everywhere and contact support@honest.money.");
  return "linked";
}
