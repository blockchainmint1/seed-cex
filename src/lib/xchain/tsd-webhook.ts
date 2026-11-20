/**
 * TSD Bridge status notifications (pure, tested). TSD Bridge POSTs each step of an
 * order Seeds created (deposit seen, payout sent, …) to Seeds' webhook, signed with
 * the secret shown next to Seeds' API key:
 *   x-tsd-timestamp: unix seconds
 *   x-tsd-signature: "sha256=" + hex HMAC-SHA256(secret, timestamp + "." + rawBody)
 *
 * A notification is only a nudge: Seeds re-reads the order from TSD Bridge's API and
 * runs the normal route step. Nothing in the body is ever trusted to move coins.
 */

/** Notifications older (or further in the future) than this are refused. */
export const TSD_WEBHOOK_MAX_AGE_SEC = 300;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time string compare (same length required). */
function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function tsdSignature(secret: string, timestamp: string, rawBody: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return "sha256=" + hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${rawBody}`)));
}

export type VerifyResult = { ok: true } | { ok: false; reason: "no_secret" | "missing" | "stale" | "bad_signature" };

/** Checks the secret is set, the timestamp is recent and the signature matches the raw body. */
export async function verifyTsdWebhook(p: { secret: string | undefined; timestamp: string | null; signature: string | null; rawBody: string; nowSec: number }): Promise<VerifyResult> {
  if (!p.secret) return { ok: false, reason: "no_secret" };
  if (!p.timestamp || !p.signature) return { ok: false, reason: "missing" };
  if (!/^\d{9,11}$/.test(p.timestamp)) return { ok: false, reason: "stale" };
  if (Math.abs(p.nowSec - Number(p.timestamp)) > TSD_WEBHOOK_MAX_AGE_SEC) return { ok: false, reason: "stale" };
  const expected = await tsdSignature(p.secret, p.timestamp, p.rawBody);
  return sameText(expected, p.signature.trim().toLowerCase()) ? { ok: true } : { ok: false, reason: "bad_signature" };
}

/** The TSD Bridge order id the notification is about (`order.id`), or null. */
export function webhookOrderId(body: unknown): string | null {
  const id = (body as { order?: { id?: unknown } } | null)?.order?.id;
  return typeof id === "string" && UUID.test(id) ? id.toLowerCase() : null;
}
