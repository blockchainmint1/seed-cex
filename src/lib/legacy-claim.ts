// Pure rules for linking a pre-HME Seeds account to an Honest.Money membership.
// An email match alone never merges: the old account's inbox must click a
// one-time link first.
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

export const CLAIM_MINUTES = 30;
export const CLAIMS_PER_HOUR = 3;
export const CLAIM_TOKEN_RE = /^[0-9a-f]{64}$/;
const MIN_MS = 60_000;

const enc = new TextEncoder();
/** Only this fingerprint is stored, so a database copy can't be used to click links. */
export const claimTokenHash = (token: string) => bytesToHex(sha256(enc.encode(`seeds-legacy-claim:${token}`)));

export const claimExpiry = (from: Date) => new Date(from.getTime() + CLAIM_MINUTES * MIN_MS);

/** May we email another link? At most CLAIMS_PER_HOUR per old account per rolling hour. */
export function canSendClaim(sentAt: string[], now = Date.now()) {
  return sentAt.filter((t) => now - new Date(t).getTime() < 60 * MIN_MS).length < CLAIMS_PER_HOUR;
}

/** "chuck_giddens@yahoo.com" -> "ch•••@yahoo.com" */
export function maskEmail(email: string) {
  const [user, domain] = email.split("@");
  if (!user || !domain) return "your email";
  return `${user.slice(0, Math.min(2, user.length))}•••@${domain}`;
}

/** Plain-English reasons for the database's refusal codes. */
export function claimErrorMessage(raw: string) {
  if (raw.includes("member_already_linked")) return "Your Honest.Money membership is already linked to a Seeds account. Sign in with Honest.Money to use it.";
  if (raw.includes("account_already_linked")) return "That older Seeds account is already linked to a membership. Sign in with Honest.Money to continue.";
  if (raw.includes("claim_invalid")) return "This link has expired or was already used. Sign in with Honest.Money again and we'll email you a fresh one.";
  return "Could not link your account. Try again, or contact support@honest.money.";
}
