/**
 * Two-factor sign-in rules (pure, tested; no I/O).
 *
 * Members sign in through Honest.Money; two-factor on Seeds is an extra
 * authenticator-app code (TOTP) held by the Seeds sign-in service. Entering a
 * code upgrades the current session, and the server reads that proof from the
 * signed session token: `aal` must be "aal2" and the most recent TOTP entry in
 * `amr` must be younger than CODE_MAX_AGE_SEC. The browser can't fake either.
 */

/** A code entered more than 10 minutes ago no longer approves a withdrawal or an admin reset. */
export const CODE_MAX_AGE_SEC = 10 * 60;

type AmrEntry = { method?: unknown; timestamp?: unknown };
export type SessionClaims = { aal?: unknown; amr?: unknown };

/** Seconds since the newest authenticator code on this session, or null if there is none. */
export function codeAgeSec(claims: SessionClaims | null | undefined, nowSec: number): number | null {
  if (!claims || claims.aal !== "aal2" || !Array.isArray(claims.amr)) return null;
  const stamps = (claims.amr as AmrEntry[])
    .filter((e) => e && e.method === "totp" && typeof e.timestamp === "number" && Number.isFinite(e.timestamp))
    .map((e) => e.timestamp as number);
  if (!stamps.length) return null;
  const age = nowSec - Math.max(...stamps);
  return age < -60 ? null : Math.max(0, age); // a stamp far in the future is not trusted
}

/** True when this session entered an authenticator code within the last `maxAgeSec`. */
export function freshTwoFactor(claims: SessionClaims | null | undefined, nowSec: number, maxAgeSec = CODE_MAX_AGE_SEC): boolean {
  const age = codeAgeSec(claims, nowSec);
  return age != null && age <= maxAgeSec;
}

/** Six digits from whatever was typed or pasted ("123 456", "123-456"), or null. */
export function cleanCode(raw: string): string | null {
  const d = raw.replace(/[\s-]/g, "");
  return /^\d{6}$/.test(d) ? d : null;
}

export const TWO_FACTOR_NEEDED =
  "Enter the 6-digit code from your authenticator app to approve this withdrawal.";

/** Why a withdrawal can't go ahead on two-factor grounds, or null. Members with two-factor on always confirm with a fresh code. */
export function withdrawalTwoFactorProblem(input: { on: boolean; fresh: boolean; levelNeeds2fa: boolean }): string | null {
  if (input.levelNeeds2fa && !input.on) return "Your withdrawal level needs two-factor sign-in. Turn it on in Account → Security.";
  if (input.on && !input.fresh) return TWO_FACTOR_NEEDED;
  return null;
}

/** Admin reset of a member's authenticator: why it can't happen, or null. */
export function resetProblem(input: { actorId: string; targetId: string; note: string; actorFresh: boolean; targetOn: boolean }): string | null {
  if (input.actorId === input.targetId) return "You can't reset your own two-factor. Ask another admin.";
  if (!input.actorFresh) return "Enter your own authenticator code first. Only admins using two-factor can reset someone else's.";
  const n = input.note.trim().length;
  if (n < 3 || n > 300) return "Add a short note (3–300 characters) saying how you checked it's really them.";
  if (!input.targetOn) return "They don't have two-factor turned on.";
  return null;
}

/**
 * Withdrawals only go out from a wallet link made while two-factor was already on.
 * Someone who gets into a member's Honest.Money account and turns on two-factor
 * with their own phone still can't withdraw: they would have to re-link the
 * member's HME Wallet, which needs the wallet itself.
 */
export type WithdrawLinkState = "ready" | "needs_2fa" | "needs_relink";

export const NEEDS_2FA_TO_WITHDRAW =
  "Withdrawals need two-factor sign-in. Turn it on in Account → Security, then re-link your HME Wallet there. Same pocket, same coins, nothing moves.";
export const NEEDS_RELINK_TO_WITHDRAW =
  "Your HME Wallet was linked before two-factor was turned on, so Seeds won't send withdrawals from it. Re-link it in Account → Security. Same pocket, same coins, nothing moves.";

/** `twoFactorSinceMs` = when the newest confirmed authenticator was added (null = none). */
export function withdrawLinkState(i: { twoFactorSinceMs: number | null; linkCreatedMs: number | null }): WithdrawLinkState {
  if (i.twoFactorSinceMs == null || !Number.isFinite(i.twoFactorSinceMs)) return "needs_2fa";
  if (i.linkCreatedMs == null || !Number.isFinite(i.linkCreatedMs) || i.linkCreatedMs <= i.twoFactorSinceMs) return "needs_relink";
  return "ready";
}

export function withdrawLinkProblem(state: WithdrawLinkState): string | null {
  return state === "needs_2fa" ? NEEDS_2FA_TO_WITHDRAW : state === "needs_relink" ? NEEDS_RELINK_TO_WITHDRAW : null;
}
