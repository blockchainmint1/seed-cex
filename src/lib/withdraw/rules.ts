/**
 * Withdrawal rules for every coin (pure, tested; no I/O).
 *
 * Bobby (Nov 20 2026): one rule set for every coin Seeds holds.
 *  - A member can withdraw only from a wallet link made AFTER both two-factor sign-in
 *    and Telegram were set up. Someone who takes over a Seeds sign-in and adds their own
 *    phone or Telegram still can't withdraw: they'd have to re-link the HME Wallet itself.
 *  - Every withdrawal needs three things: a 6-digit code emailed to the member for exactly
 *    this withdrawal, a fresh authenticator code, and an Approve tap in their Telegram.
 *  - Then the member's withdrawal level applies: dollar caps and a hold they can cancel.
 */

import { isKeyKind, keyThing, relinkStep, type KeyKind, type SignInKind } from "@/lib/account/sign-in-kind";
import { edSendBlocker } from "@/lib/pockets/ed-send-rules";

/** An emailed code lasts 10 minutes, allows 5 wrong tries, and at most 5 are sent per hour. */
export const EMAIL_CODE_TTL_MS = 10 * 60_000;
export const EMAIL_CODE_MAX_TRIES = 5;
export const EMAIL_CODES_PER_HOUR = 5;
/** How many withdrawals may wait (for a tap, on hold or sending) at once. */
export const MAX_WAITING = 3;
/** Bobby (Nov 20 2026): open to every member who follows the rules. Set true to limit to beta testers again. */
export const WITHDRAW_PILOT_TESTERS_ONLY = false;

export type WithdrawReadiness = "ready" | "needs_2fa" | "needs_telegram" | "needs_relink";

/**
 * `twoFactorSinceMs` = when the newest confirmed authenticator was added; `telegramSinceMs` = when
 * the current Telegram chat was connected (null while connected = connected before Seeds recorded
 * the time, so the order can't be proven). The link must be newer than both.
 */
export function withdrawReadiness(i: {
  twoFactorSinceMs: number | null;
  telegramVerified: boolean;
  telegramSinceMs: number | null;
  linkCreatedMs: number | null;
}): WithdrawReadiness {
  const ok = (n: number | null): n is number => n != null && Number.isFinite(n);
  if (!ok(i.twoFactorSinceMs)) return "needs_2fa";
  if (!i.telegramVerified) return "needs_telegram";
  if (!ok(i.linkCreatedMs) || !ok(i.telegramSinceMs)) return "needs_relink";
  if (i.linkCreatedMs <= i.twoFactorSinceMs || i.linkCreatedMs <= i.telegramSinceMs) return "needs_relink";
  return "ready";
}

const READINESS_TEXT_HME: Record<Exclude<WithdrawReadiness, "ready">, string> = {
  needs_2fa:
    "Withdrawals need two-factor sign-in. Turn it on in Account → Security, connect Telegram in Account → Alerts, then re-link your HME Wallet. Same pocket, same coins, nothing moves.",
  needs_telegram:
    "Withdrawals need Telegram: every one waits for your tap there. Connect it in Account → Alerts, then re-link your HME Wallet in Account → Security. Same pocket, same coins, nothing moves.",
  needs_relink:
    "Your HME Wallet was linked before two-factor and Telegram were both set up, so Seeds won't send withdrawals from it. Re-link it in Account → Security. Same pocket, same coins, nothing moves.",
};
export const READINESS_TEXT = READINESS_TEXT_HME;

/** Coin / outside-wallet members refresh their pocket link by signing in again with that key. */
function keyReadinessText(r: Exclude<WithdrawReadiness, "ready">, kind: KeyKind, viaLink = false): string {
  const again = relinkStep(kind, viaLink);
  if (r === "needs_2fa") return `Withdrawals need two-factor sign-in. Turn it on in Account → Security, connect Telegram in Account → Alerts, then ${again}. Same pocket, same coins, nothing moves.`;
  if (r === "needs_telegram") return `Withdrawals need Telegram: every one waits for your tap there. Connect it in Account → Alerts, then ${again}. Same pocket, same coins, nothing moves.`;
  return `Your trading pocket was set up before two-factor and Telegram were both on, so Seeds won't send withdrawals from it yet. To fix it, ${again}. Same pocket, same coins, nothing moves.`;
}

export function readinessProblem(r: WithdrawReadiness, kind: SignInKind = "hme", viaLink = false): string | null {
  if (r === "ready") return null;
  return isKeyKind(kind) ? keyReadinessText(r, kind, viaLink) : READINESS_TEXT_HME[r];
}

/** Coin / wallet accounts start with no real email; Seeds emails a code for every withdrawal. */
export const NEEDS_EMAIL_TO_WITHDRAW =
  "Add and confirm an email address in Account → Profile before withdrawing. Seeds emails a code for every withdrawal. (Joining Honest.Money also brings your email.)";

export type LinkLike = { mode: string; hasKey: boolean; address: string | null } | null;

/** First reason Seeds can't send this coin for this member at all (before readiness), or null. */
export function sendBlocker(p: { link: LinkLike; tester: boolean; frozen: boolean; symbol: string; networkLabel: string; kind?: SignInKind; pocket?: string }): string | null {
  // Gate by the pocket too, so a token on a new chain (USD₮ on TON) follows that chain's stage.
  const newChain = edSendBlocker(p.pocket ?? p.symbol, p.tester) ?? edSendBlocker(p.symbol, p.tester);
  if (newChain) return newChain;
  if (WITHDRAW_PILOT_TESTERS_ONLY && !p.tester) return "Withdrawals from Seeds are open to beta testers first. They open to members after that.";
  if (p.frozen) return "Withdrawals are paused on your account while the Seeds team takes a look. Contact support@honest.money if you didn't expect this.";
  if (!p.link) {
    return p.kind && isKeyKind(p.kind)
      ? `You have no active trading pocket. Sign in again with ${keyThing(p.kind)} (Account → Security) to set up a new one.`
      : "Link a trading pocket first: HME Wallet, a Cold Storage Coin, HME Vault or another wallet (Account → Security).";
  }
  if (p.link.mode !== "access" || !p.link.hasKey) return "Your pocket is linked in approve-every-trade mode. Seeds needs instant access to send for you — re-link with instant access.";
  if (!p.link.address) return `Your linked pocket doesn't include ${p.symbol} on ${p.networkLabel}.`;
  return null;
}

/** Exact base units from a typed amount, or null when it isn't a clean positive number. */
export function parseUnits(amount: string, decimals: number): bigint | null {
  const m = /^(\d{1,30})(?:\.(\d+))?$/.exec(amount.trim());
  if (!m) return null;
  const frac = m[2] ?? "";
  if (frac.length > decimals) return null;
  const units = BigInt(m[1]!) * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, "0") || "0");
  return units > 0n ? units : null;
}

export function unitsToNumber(units: bigint, decimals: number): number {
  const base = 10n ** BigInt(decimals);
  return Number(units / base) + Number(units % base) / Number(base);
}

/** Exact decimal text for base units ("1.5", never "1.5000"). */
export function unitsToText(units: bigint, decimals: number): string {
  const base = 10n ** BigInt(decimals);
  const whole = (units / base).toString();
  const frac = (units % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}

/** The exact withdrawal an email code is for. Any change (coin, network, amount, address) needs a new code. */
export function detailsText(i: { userId: string; key: string; units: bigint; to: string; tag?: number | null; comment?: string }): string {
  const legacy = `seeds-withdrawal|${i.userId}|${i.key}|${i.units.toString()}|${i.to.trim()}|${i.tag ?? ""}`;
  // Keep existing no-comment codes usable; JSON escapes delimiters in new notes.
  return i.comment ? `${legacy}|comment:${JSON.stringify(i.comment)}` : legacy;
}

const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function hmac(secret: string, text: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(text))));
}

/** Keyed fingerprint of the withdrawal details (stored; never the details themselves). */
export function detailsDigest(secret: string, details: string): Promise<string> {
  if (!secret) throw new Error("missing secret");
  return hmac(secret, `details|${details}`);
}

/** Keyed fingerprint of a code for those details, so a database read alone can't recover a 6-digit code. */
export function codeDigest(secret: string, details: string, code: string): Promise<string> {
  if (!secret) throw new Error("missing secret");
  return hmac(secret, `code|${details}|${code}`);
}

/** Six random digits (uniform: rejection sampling, never Math.random). */
export function newEmailCode(): string {
  const limit = Math.floor(0xffffffff / 1_000_000) * 1_000_000;
  for (;;) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    const v = buf[0];
    if (v! < limit) return String(v! % 1_000_000).padStart(6, "0");
  }
}

/** Six digits from whatever was typed or pasted, or null. */
export function cleanEmailCode(raw: string): string | null {
  const d = raw.replace(/[\s-]/g, "");
  return /^\d{6}$/.test(d) ? d : null;
}

/** Plain reason for what use_withdrawal_email_code answered, or null when the code was right. */
export function emailCodeProblem(result: string): string | null {
  switch (result) {
    case "ok": return null;
    case "wrong": return "That email code isn't right. Check the newest Seeds email and try again.";
    case "locked": return "Too many wrong email codes. Ask for a new code.";
    case "expired": return "That email code has ended (codes last 10 minutes). Ask for a new one.";
    default: return "Ask for an email code first. It only works for the exact coin, amount and address you asked about.";
  }
}

/** Plain-English status for the member. */
export const WITHDRAW_STATUS: Record<string, string> = {
  approving: "Waiting for your Telegram tap",
  held: "Waiting (you can cancel)",
  signing: "Sending",
  sent: "Sent",
  confirmed: "Done",
  cancelled: "Cancelled",
  failed: "Not sent",
  unknown: "Checking by hand",
};

/** A broadcast error that may still have reached the network (never re-send; check by hand). */
export { maybeBroadcast } from "@/lib/broadcast-rules";

/** "bo***@gm***.com": enough for the member to recognise their inbox, not enough to read it off a screen. */
export function maskEmail(email: string): string {
  const [user = "", domain = ""] = email.split("@");
  const dot = domain.lastIndexOf(".");
  const host = dot > 0 ? domain.slice(0, dot) : domain;
  const tld = dot > 0 ? domain.slice(dot) : "";
  return `${user.slice(0, 2)}***@${host.slice(0, 2)}***${tld}`;
}

/** First reason the typed amount can't be asked for, from a live balance read (network fees are re-checked at send). */
export function amountProblem(i: {
  symbol: string; decimals: number; units: bigint | null; balance: bigint | null; feeBalance: bigint | null; feeCoin?: string;
}): string | null {
  if (i.units == null) return `Enter an amount with at most ${i.decimals} decimal places.`;
  if (i.balance == null) return "Your pocket balance couldn't be read right now. Try again in a minute.";
  if (i.units > i.balance) return `Your pocket holds ${unitsToText(i.balance, i.decimals)} ${i.symbol}.`;
  if (!i.feeCoin && i.units >= i.balance) return `Leave a little ${i.symbol} behind for the network fee.`;
  if (i.feeCoin && (i.feeBalance == null || i.feeBalance <= 0n)) return `Your pocket has no ${i.feeCoin} for the network fee on this network.`;
  return null;
}

/** XRP destination tag: digits only, fits in 32 bits. Empty = none. */
export function parseDestinationTag(raw: string | undefined | null): { ok: true; tag: number | null } | { ok: false } {
  const t = (raw ?? "").trim();
  if (!t) return { ok: true, tag: null };
  if (!/^\d{1,10}$/.test(t)) return { ok: false };
  const n = Number(t);
  return n <= 4294967295 ? { ok: true, tag: n } : { ok: false };
}
