/** Signed one-click unsubscribe tokens (HMAC-SHA256 over the user id and list). Pure. */
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { base64urlnopad } from "@scure/base";

const enc = new TextEncoder();
/** weekly = profile id; ignite = Ignite interest-list row id. */
export const LISTS = ["weekly", "ignite"] as const;
export type EmailList = (typeof LISTS)[number];

function mac(secret: string, list: EmailList, userId: string): string {
  return base64urlnopad.encode(hmac(sha256, enc.encode(secret), enc.encode(`seeds-unsub:${list}:${userId}`)));
}

export function makeUnsubToken(secret: string, list: EmailList, userId: string): string {
  return `${list}.${userId}.${mac(secret, list, userId)}`;
}

export function readUnsubToken(secret: string, token: string): { list: EmailList; userId: string } | null {
  const [list, userId, sig, extra] = token.split(".");
  if (extra !== undefined || !sig || !(LISTS as readonly string[]).includes(list)) return null;
  if (!/^[0-9a-f-]{36}$/.test(userId)) return null;
  const want = mac(secret, list as EmailList, userId);
  if (want.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0 ? { list: list as EmailList, userId } : null;
}
