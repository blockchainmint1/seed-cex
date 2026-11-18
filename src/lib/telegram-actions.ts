// One-tap "Revoke Seeds' access" buttons in Telegram alerts. Pure + Web Crypto only (browser/Worker/bun safe).
// A button carries the link id and a signature bound to that link and its owner, so it can only ever revoke
// that one link, and only from the member's own linked chat (checked by revokeDecision).

export type RevokeStep = "ask" | "yes" | "no";
const PREFIX: Record<RevokeStep, string> = { ask: "rv1", yes: "rv2", no: "rv0" };
const STEP: Record<string, RevokeStep> = { rv1: "ask", rv2: "yes", rv0: "no" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SIG_LEN = 16; // 96 bits of base64url

const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function sign(key: string, step: RevokeStep, linkId: string, userId: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`seeds-revoke|${step}|${linkId}|${userId}`)));
  return b64url(mac).slice(0, SIG_LEN);
}

/** Telegram callback_data for one step (always ≤ 64 bytes, Telegram's limit). */
export async function revokeButtonData(key: string, step: RevokeStep, linkId: string, userId: string): Promise<string> {
  if (!key || !UUID.test(linkId)) throw new Error("bad revoke button");
  return `${PREFIX[step]}:${linkId}:${await sign(key, step, linkId, userId)}`;
}

export function parseRevokeData(data: unknown): { step: RevokeStep; linkId: string; sig: string } | null {
  if (typeof data !== "string" || data.length > 64) return null;
  const [p, linkId, sig, ...rest] = data.split(":");
  const step = STEP[p];
  if (!step || rest.length || !UUID.test(linkId ?? "") || !sig || sig.length !== SIG_LEN) return null;
  return { step, linkId, sig };
}

export async function revokeSignatureOk(key: string, d: { step: RevokeStep; linkId: string; sig: string }, userId: string): Promise<boolean> {
  if (!key) return false;
  const want = await sign(key, d.step, d.linkId, userId);
  let diff = want.length ^ d.sig.length;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ (d.sig.charCodeAt(i) || 0);
  return diff === 0;
}

export type RevokeDecision = "refuse" | "cancel" | "already_revoked" | "confirm" | "revoke";

/** What a tap may do. Anything not from the owner's own verified private chat is refused. */
export function revokeDecision(i: {
  step: RevokeStep;
  signatureOk: boolean;
  privateChat: boolean;
  tapChatId: string;
  ownerChatId: string | null;
  ownerChatVerified: boolean;
  linkActive: boolean;
}): RevokeDecision {
  if (!i.signatureOk || !i.privateChat || !i.ownerChatVerified || !i.ownerChatId || i.ownerChatId !== i.tapChatId) return "refuse";
  if (i.step === "no") return "cancel";
  if (!i.linkActive) return "already_revoked";
  return i.step === "ask" ? "confirm" : "revoke";
}
