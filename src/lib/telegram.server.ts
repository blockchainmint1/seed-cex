/** Telegram alert delivery through the Lovable connector gateway. Server-only. */

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
    throw new Error(`Telegram request failed [${res.status}]: ${body}`);
  }

  const json = (await res.json()) as { ok?: boolean; description?: string };
  if (json.ok === false) {
    console.error(`Telegram API error: ${json.description}`);
    throw new Error(json.description ?? "Telegram rejected the message.");
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
    | "notify_login",
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
