/**
 * "Prove it's you" rules (auditor H1 + H1b, Bobby's picks Nov 23 2026). Pure, tested, no I/O.
 *
 * A stolen Seeds session must not be able to change where a member's coins go, or add its own
 * second factor and use it later. So the sensitive steps (linking a new coin / wallet as the
 * trading pocket, confirming a new 2FA app or Telegram chat, unlinking Telegram) need one of:
 *   1. a fresh sign-in on this session (Honest.Money, or the member's own coin / wallet) — offered first;
 *   2. a Telegram tap from a trusted chat connected at least 24 hours earlier;
 *   3. a code from 2FA apps that are all trusted and at least 24 hours old;
 *   4. a one-time code to the Honest.Money email (HME members only; the session can't change it).
 * A new 2FA app or Telegram chat is trusted only when it was added right after a fresh sign-in
 * (or another proof); otherwise it shows "Not confirmed yet" until the member confirms it.
 */

/** A sign-in younger than this counts as fresh. Agent-chosen (covers the first-time setup guide). */
export const FRESH_SIGNIN_SEC = 15 * 60;
/** A 2FA app or Telegram chat must be at least this old (and trusted) to prove it's you. */
export const AGED_MS = 24 * 3600_000;
export const STEP_UP_TTL_MS = 10 * 60_000;
export const STEP_UP_TRIES = 5;
/** New Telegram / email checks per member per hour. */
export const STEP_UP_PER_HOUR = 6;

export type StepUpPurpose = "key_link" | "confirm_factor" | "telegram_unlink";
export const STEP_UP_PURPOSES: readonly StepUpPurpose[] = ["key_link", "confirm_factor", "telegram_unlink"];

export const PURPOSE_TEXT: Record<StepUpPurpose, string> = {
  key_link: "link a new coin or wallet as your trading pocket",
  confirm_factor: "confirm a new 2FA app or Telegram chat",
  telegram_unlink: "unlink Telegram from your Seeds account",
};

export const STEP_UP_NEEDED = "Confirm it's you first: sign in again, or use one of the other options shown.";

type AmrEntry = { method?: unknown; timestamp?: unknown };
export type Claims = { amr?: unknown; client_id?: unknown };

/** Seconds since this session's sign-in (any method except an authenticator code), or null. */
export function signInAgeSec(claims: Claims | null | undefined, nowSec: number): number | null {
  if (!claims || !Array.isArray(claims.amr)) return null;
  // A connected app's token (AI assistant via OAuth) never counts as a fresh sign-in.
  if (claims.client_id != null && claims.client_id !== "") return null;
  const stamps = (claims.amr as AmrEntry[])
    .filter((e) => e && typeof e.method === "string" && e.method !== "totp" && !e.method.startsWith("mfa/")
      && typeof e.timestamp === "number" && Number.isFinite(e.timestamp))
    .map((e) => e.timestamp as number);
  if (!stamps.length) return null;
  const age = nowSec - Math.max(...stamps);
  return age < -60 ? null : Math.max(0, age);
}

export function freshSignIn(claims: Claims | null | undefined, nowSec: number): boolean {
  const age = signInAgeSec(claims, nowSec);
  return age != null && age <= FRESH_SIGNIN_SEC;
}

export type TrustRow = { trustedMs: number | null; addedMs: number };

/** Trusted and at least a day old. */
export function factorCounts(row: TrustRow | null | undefined, nowMs: number): boolean {
  return Boolean(row && row.trustedMs != null && Number.isFinite(row.addedMs) && nowMs - row.addedMs >= AGED_MS);
}

/**
 * Codes from the authenticator can prove it's you only when EVERY confirmed 2FA app counts:
 * the sign-in service doesn't say which app a code came from, so one unconfirmed app spoils them all.
 */
export function totpCounts(factors: Array<TrustRow | null>, nowMs: number): boolean {
  return factors.length > 0 && factors.every((f) => factorCounts(f, nowMs));
}

/** Trusted at all (no age needed): may this 2FA app / chat approve ordinary sends? */
export function trusted(row: TrustRow | null | undefined): boolean {
  return Boolean(row && row.trustedMs != null);
}

export type StepUpOptions = {
  /** Already fresh: nothing else needed. */
  fresh: boolean;
  signIn: "hme" | "key";
  telegram: boolean;
  totp: boolean;
  email: boolean;
};

export function stepUpOptions(i: {
  hmeMember: boolean;
  fresh: boolean;
  factors: Array<TrustRow | null>;
  telegram: { connected: boolean; row: TrustRow | null };
  nowMs: number;
}): StepUpOptions {
  return {
    fresh: i.fresh,
    signIn: i.hmeMember ? "hme" : "key",
    telegram: i.telegram.connected && factorCounts(i.telegram.row, i.nowMs),
    totp: totpCounts(i.factors, i.nowMs),
    email: i.hmeMember,
  };
}

/** Does this request pass? `proof` = an approved Telegram / email check for this purpose. */
export function stepUpPasses(i: { freshSignIn: boolean; freshTotp: boolean; totpCounts: boolean; proof: boolean }): boolean {
  return i.freshSignIn || (i.freshTotp && i.totpCounts) || i.proof;
}

/** How a just-added 2FA app or chat starts out: trusted straight away only after a proof on this session. */
export function newFactorTrust(provenNow: boolean): "fresh_sign_in" | null {
  return provenNow ? "fresh_sign_in" : null;
}

/** May a check with this row be spent now? */
export function proofUsable(r: { status: string; purpose: string; expiresMs: number } | null, purpose: StepUpPurpose, nowMs: number): boolean {
  return Boolean(r && r.status === "approved" && r.purpose === purpose && r.expiresMs > nowMs);
}

/* ------------------------------ Telegram buttons ------------------------------ */

export type StepUpChoice = "yes" | "no";
const PREFIX: Record<StepUpChoice, string> = { yes: "su1", no: "su0" };
const CHOICE: Record<string, StepUpChoice> = { su1: "yes", su0: "no" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SIG_LEN = 16;
const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function sign(key: string, choice: StepUpChoice, id: string, userId: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`seeds-stepup|${choice}|${id}|${userId}`)));
  return b64url(mac).slice(0, SIG_LEN);
}

export async function stepUpButtonData(key: string, choice: StepUpChoice, id: string, userId: string): Promise<string> {
  if (!key || !UUID.test(id)) throw new Error("bad step-up button");
  return `${PREFIX[choice]}:${id}:${await sign(key, choice, id, userId)}`;
}

export function parseStepUpData(data: unknown): { choice: StepUpChoice; id: string; sig: string } | null {
  if (typeof data !== "string" || data.length > 64) return null;
  const [p, id, sig, ...rest] = data.split(":");
  const choice = CHOICE[p ?? ""];
  if (!choice || rest.length || !UUID.test(id ?? "") || !sig || sig.length !== SIG_LEN) return null;
  return { choice, id: id!, sig };
}

export async function stepUpSignatureOk(key: string, d: { choice: StepUpChoice; id: string; sig: string }, userId: string): Promise<boolean> {
  if (!key) return false;
  const want = await sign(key, d.choice, d.id, userId);
  let diff = want.length ^ d.sig.length;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ (d.sig.charCodeAt(i) || 0);
  return diff === 0;
}

export type StepUpTap = "refuse" | "already_decided" | "expired" | "approve" | "decline";

/** Only the chat the check was sent to, still the owner's trusted, day-old chat, may answer it. */
export function stepUpTapDecision(i: {
  choice: StepUpChoice; signatureOk: boolean; privateChat: boolean; tapChatId: string;
  sentToChatId: string | null; ownerChatId: string | null; ownerChatCounts: boolean;
  status: string; expiresAtMs: number; nowMs: number;
}): StepUpTap {
  if (!i.signatureOk || !i.privateChat || !i.ownerChatCounts || !i.ownerChatId || i.ownerChatId !== i.tapChatId || i.sentToChatId !== i.tapChatId) return "refuse";
  if (i.status !== "pending") return "already_decided";
  if (!(i.expiresAtMs > i.nowMs)) return "expired";
  return i.choice === "yes" ? "approve" : "decline";
}
