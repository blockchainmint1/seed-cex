// Browser-safe facts about the Seeds alerts bot, plus plain-English error wording.
export const SEEDS_BOT_USERNAME = "seeds_notify_bot";
export const SEEDS_BOT_URL = `https://t.me/${SEEDS_BOT_USERNAME}`;

/** Telegram only lets a bot message people who pressed Start on it (and haven't blocked it). */
export function friendlyTelegramError(status: number, body: string): string {
  if (/chat not found|bot was blocked|user is deactivated|bot can't initiate/i.test(body)) {
    return `Telegram won't let @${SEEDS_BOT_USERNAME} message you yet. Open ${SEEDS_BOT_URL}, tap Start, then try again.`;
  }
  if (/chat_id is empty|invalid.*chat/i.test(body)) return "That doesn't look like a Telegram chat ID. It's a number like 123456789.";
  return `Telegram couldn't deliver the message (error ${status}). Please try again in a minute.`;
}

/** One-tap linking: Profile opens t.me/<bot>?start=<code>; Telegram then sends "/start <code>" to our webhook. */
export const START_CODE_RE = /^[A-Za-z0-9_-]{22,64}$/;
export function parseStartCode(text: unknown): string | null {
  const m = typeof text === "string" ? /^\/start(?:@\w+)?\s+(\S+)\s*$/.exec(text) : null;
  return m && START_CODE_RE.test(m[1]) ? m[1] : null;
}
export const connectUrl = (code: string) => `${SEEDS_BOT_URL}?start=${code}`;
