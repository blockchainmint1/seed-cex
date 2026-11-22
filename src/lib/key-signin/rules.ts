/**
 * Pure, client-safe rules for "Start with a coin" / "Use another wallet"
 * (the Seeds Key page). No keys, no I/O — shared by the server endpoints,
 * the sign-in page and the build guide's test vectors.
 *
 * The recovery phrase (or an outside wallet's signature) never reaches Seeds:
 * the Seeds Key page reduces it, on the device, to a sign-in signature plus
 * the keys to one trading pocket, in the same sealed format HME Wallet uses.
 */
import { sha256 } from "@noble/hashes/sha2.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { SEEDS_POCKET } from "../pockets/coins";

export type KeyKind = "coin" | "evm" | "sol";
export const KEY_KINDS: readonly KeyKind[] = ["coin", "evm", "sol"];

/** Single-use sign-in requests live this long. */
export const KEY_REQUEST_TTL_MS = 10 * 60_000;
/** Starting a request: per connection per minute (an event shares one Wi-Fi address). */
export const KEY_START_PER_MINUTE = 30;
/** New accounts per connection per hour — anyone can make a phrase, so cap sign-ups, not sign-ins. */
export const NEW_ACCOUNTS_PER_IP_HOUR = 120;

export function isKeyKind(v: unknown): v is KeyKind {
  return typeof v === "string" && (KEY_KINDS as readonly string[]).includes(v);
}

/**
 * The identity a kind signs with, in the one form Seeds stores.
 * coin: TEXITcoin P2PKH address of m/44'/696969'/0'/0/0 (the same address HME Wallet signs links with).
 * evm:  0x address, lowercased.  sol: base58 public key.
 */
export function normalizeIdentity(kind: KeyKind, address: string): string | null {
  const a = String(address ?? "").trim();
  if (kind === "evm") return /^0x[0-9a-fA-F]{40}$/.test(a) ? a.toLowerCase() : null;
  if (kind === "sol") return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a) ? a : null;
  return /^T[1-9A-HJ-NP-Za-km-z]{25,34}$/.test(a) ? a : null;
}

/**
 * The exact text the Seeds Key page signs to sign in and hand over one trading pocket.
 *
 * Coin: Seeds' own text (the Key page signs it itself with the coin's key, no wallet in between).
 * Wallets (auditor follow-up): the standard Sign-In with Ethereum (EIP-4361) / Sign-In with Solana layout,
 * so MetaMask, Phantom and friends warn when any site other than the Seeds Key host asks for it. The
 * one-time challenge is the nonce; the pocket, its paths and the sealed keys' hash are listed as resources.
 */
export function keySigninMessage(p: {
  domain: string; challenge: string; kind: KeyKind; identity: string; account: number; paths: string[]; payloadSha: string;
  /** Seeds Key host (wallet kinds only): the domain wallets check against the page's address. */
  keyHost?: string; issuedAt?: string; expiresAt?: string;
}): string {
  if (p.kind !== "coin") {
    if (!p.keyHost || !p.issuedAt || !p.expiresAt) throw new Error("wallet sign-in needs the Seeds Key host and request times");
    const addr = p.kind === "evm" ? checksumEvmAddress(p.identity) : normalizeIdentity("sol", p.identity);
    if (!addr) throw new Error("bad wallet address");
    return [
      `${p.keyHost} wants you to sign in with your ${p.kind === "evm" ? "Ethereum" : "Solana"} account:`,
      addr,
      "",
      `Sign in to Seeds (${p.domain}) and give it the keys to trading pocket ${p.account} only, until I revoke. Signing in moves nothing. Only sign this on ${p.keyHost}.`,
      "",
      `URI: https://${p.keyHost}`,
      "Version: 1",
      `Chain ID: ${p.kind === "evm" ? "1" : "mainnet"}`,
      `Nonce: ${p.challenge}`,
      `Issued At: ${p.issuedAt}`,
      `Expiration Time: ${p.expiresAt}`,
      "Resources:",
      `- https://${p.domain}`,
      `- urn:seeds:pocket:${p.account}`,
      ...p.paths.map((x) => `- urn:seeds:path:${x}`),
      `- urn:seeds:payload-sha256:${p.payloadSha}`,
    ].join("\n");
  }
  return [
    "Seeds - Sign in with your key",
    "",
    `Domain: ${p.domain}`,
    `Kind: ${p.kind}`,
    `Identity: ${p.identity}`,
    `Challenge: ${p.challenge}`,
    `Pocket: ${p.account}`,
    `Paths: ${p.paths.join(",")}`,
    `Payload-SHA256: ${p.payloadSha}`,
    "",
    "Signing in moves nothing. It gives this site the keys to this trading pocket only, until I revoke.",
  ].join("\n");
}

/** Host part of the configured Seeds Key address (https only), or null when it isn't set up. */
export function keyHostOf(url: string | null | undefined): string | null {
  const m = /^https:\/\/([a-z0-9.-]+(?::\d+)?)(?:\/.*)?$/i.exec(String(url ?? "").trim());
  return m ? m[1]!.toLowerCase() : null;
}

/** EIP-55 mixed-case address (Sign-In with Ethereum requires it). */
export function checksumEvmAddress(address: string): string | null {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return null;
  const lower = address.slice(2).toLowerCase();
  const h = keccak_256(new TextEncoder().encode(lower));
  let out = "0x";
  for (let i = 0; i < 40; i++) {
    const nib = (h[i >> 1]! >> (i % 2 === 0 ? 4 : 0)) & 0xf;
    out += nib >= 8 ? lower[i]!.toUpperCase() : lower[i]!;
  }
  return out;
}

/**
 * Fixed fields of the wallet-pocket message. NEVER change any of these once a
 * member has signed in with an outside wallet: the pocket is rebuilt from this
 * exact signature, so any change hands them a different, empty pocket.
 */
export const WALLET_POCKET_NONCE = "SeedsPocket2";
export const WALLET_POCKET_ISSUED_AT = "2026-11-21T00:00:00.000Z";

/**
 * The fixed text an outside wallet signs to rebuild its Seeds pocket (outside-wallet path only),
 * in the standard Sign-In with Ethereum (EIP-4361) / Sign-In with Solana layout. Wallets that
 * understand that layout (MetaMask, Rabby, Phantom, …) warn when the site asking for it isn't
 * `keyHost` — free-form text gets no such check (auditor finding K1). Every field is fixed (no fresh
 * nonce or time), so the same wallet always produces the same signature and the same pocket.
 */
export function walletPocketMessage(keyHost: string, kind: "evm" | "sol", address: string): string {
  const addr = kind === "evm" ? checksumEvmAddress(address) : normalizeIdentity("sol", address);
  if (!addr) throw new Error("bad wallet address");
  return [
    `${keyHost} wants you to sign in with your ${kind === "evm" ? "Ethereum" : "Solana"} account:`,
    addr,
    "",
    `Open my Seeds trading pocket. Only sign this on ${keyHost}: anyone with this signature can open that pocket. It moves no coins from this wallet.`,
    "",
    `URI: https://${keyHost}`,
    "Version: 1",
    `Chain ID: ${kind === "evm" ? "1" : "mainnet"}`,
    `Nonce: ${WALLET_POCKET_NONCE}`,
    `Issued At: ${WALLET_POCKET_ISSUED_AT}`,
  ].join("\n");
}

/**
 * Three-digit match code for one sign-in request (auditor finding K2). The Seeds tab and the
 * Seeds Key page both show it; the member continues only when they match, so a QR seen over
 * someone's shoulder (or handed out by a stranger) can't join the wrong coin to the wrong screen.
 */
export function pairingCode(challenge: string): string {
  const h = sha256(new TextEncoder().encode(`seeds-key pairing v1\n${challenge}`));
  const n = ((h[0]! << 24) | (h[1]! << 16) | (h[2]! << 8) | h[3]!) >>> 0;
  return String(n % 1000).padStart(3, "0");
}

/** Short name for the key that signed in, shown on both screens ("Coin ZZCuca"). */
export function shortKeyName(kind: KeyKind, identity: string): string {
  return startingName(kind, kind === "evm" ? (checksumEvmAddress(identity) ?? identity) : identity);
}

/** Adding an email to a coin / wallet account (it becomes a withdrawal factor): needs a fresh code when two-factor is on. */
export const ACCOUNT_EMAIL_CODE_NEEDED = "Enter the 6-digit code from your authenticator app to add an email.";
export function accountEmailProblem(input: { twoFactorOn: boolean; fresh: boolean }): string | null {
  return input.twoFactorOn && !input.fresh ? ACCOUNT_EMAIL_CODE_NEEDED : null;
}

/** New coin / wallet accounts per hour, across all of Seeds, that pages the admins (auditor K6). An alarm, never a block. */
export const NEW_KEY_ACCOUNTS_ALARM_PER_HOUR = 500;
/** Quiet time between alarms, so a burst sends a few alerts, not thousands. */
export const NEW_KEY_ACCOUNTS_ALARM_GAP_MS = 10 * 60_000;
/** Alarm whenever the hourly count is at or above the threshold and no alarm went out in the last ten minutes
 *  (auditor follow-up: an exact-multiple check could be stepped over by two sign-ups finishing together). */
export function shouldAlarmNewAccounts(countLastHour: number, lastAlarmMs: number | null, nowMs: number): boolean {
  if (countLastHour < NEW_KEY_ACCOUNTS_ALARM_PER_HOUR) return false;
  return lastAlarmMs == null || nowMs - lastAlarmMs >= NEW_KEY_ACCOUNTS_ALARM_GAP_MS;
}

/** Old sign-in requests are deleted after this (the per-network new-account cap looks back one hour). */
export const KEY_REQUEST_KEEP_MS = 24 * 3600_000;

/**
 * Pocket number a sign-in must use: always 1106 (SEEDS_POCKET), the same pocket HME Wallet shares.
 * Signing in again after a revoke brings back the same pocket and addresses, so no coins are left
 * behind in an old pocket number. The history is accepted so callers don't change; it no longer matters.
 */
export function pocketFor(_history: { account: number; active: boolean }[] = []): number {
  return SEEDS_POCKET;
}

/** Non-deliverable account email for coin/wallet accounts (Seeds' sign-in service needs one). */
export const PLACEHOLDER_EMAIL_DOMAIN = "key.seeds.local";
export function placeholderEmail(kind: KeyKind, identityHashHex: string): string {
  return `${kind}-${identityHashHex.slice(0, 32).toLowerCase()}@${PLACEHOLDER_EMAIL_DOMAIN}`;
}
/** Seeds never emails these: they belong to nobody (also covers the older wallet-sign-in form). */
export function isPlaceholderEmail(email: string | null | undefined): boolean {
  const e = String(email ?? "").toLowerCase();
  return !e || e.endsWith(`@${PLACEHOLDER_EMAIL_DOMAIN}`) || e.endsWith("@wallet.seeds.local");
}

/** Plain names for Admin and Profile. */
export const IDENTITY_LABEL: Record<string, string> = {
  hme: "Honest.Money",
  coin: "Coin / recovery phrase",
  evm: "Ethereum wallet",
  sol: "Solana wallet",
};

export const EMAIL_CODE_TTL_MS = 10 * 60_000;
export const EMAIL_CODES_PER_HOUR = 5;
export const EMAIL_CODE_TRIES = 5;

export function cleanEmail(v: unknown): string | null {
  const e = String(v ?? "").trim().toLowerCase();
  if (e.length > 254 || !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(e)) return null;
  return isPlaceholderEmail(e) ? null : e;
}

/** Where an account stands on withdrawals' email requirement. */
export function withdrawEmailProblem(email: string | null | undefined): string | null {
  return isPlaceholderEmail(email)
    ? "Add and confirm an email address in Account → Profile (or join Honest.Money) before withdrawing. Seeds emails a code for every withdrawal."
    : null;
}

/**
 * Signing in again with the same coin or wallet re-sends the same pocket keys.
 * Keep the existing link (no new history row) unless the new one adds coins, or
 * the old one predates the newest 2FA / Telegram set-up (withdrawals need a link made after both).
 */
export function keepExistingLink(p: {
  active: { account: number; xpubs: Record<string, string>; createdMs: number };
  incoming: { account: number; xpubs: Record<string, string> };
  twoFactorSinceMs: number | null;
  telegramSinceMs: number | null;
}): boolean {
  if (p.active.account !== p.incoming.account) return false;
  const a = Object.keys(p.active.xpubs).sort();
  const b = Object.keys(p.incoming.xpubs).sort();
  if (a.length !== b.length || a.some((k, i) => k !== b[i] || p.active.xpubs[k] !== p.incoming.xpubs[k])) return false;
  const stale = (since: number | null) => since != null && p.active.createdMs <= since;
  return !stale(p.twoFactorSinceMs) && !stale(p.telegramSinceMs);
}

/** Friendly starting name for a coin / wallet account (they can change it in the setup guide). */
export function startingName(kind: KeyKind, identity: string): string {
  // Coins are named by their 6-digit CoinID: the 2nd through 7th characters of the coin address
  // (the leading "T" is the same on every TEXITcoin address, so it carries no information).
  if (kind === "coin") return `Coin ${identity.slice(1, 7)}`;
  const short = `${identity.slice(0, 4)}…${identity.slice(-4)}`;
  return `Wallet ${short}`;
}

/** The email to show a member, or null for a coin / wallet account that hasn't added one. */
export function shownEmail(email: string | null | undefined): string | null {
  return isPlaceholderEmail(email) ? null : (email as string);
}

/**
 * Does a sign-in bring different pocket keys than the active link? (auditor follow-up)
 * The same coin or wallet always rebuilds the same keys, so a difference on any coin both links share is a
 * security event: the swap waits for the member's screen (and a fresh authenticator code when they use one)
 * and the member is told first. Adding coins with the existing keys unchanged is not a difference.
 */
export function keysDiffer(active: { account: number; xpubs: Record<string, string> }, incoming: { account: number; xpubs: Record<string, string> }): boolean {
  if (active.account !== incoming.account) return true;
  return Object.keys(active.xpubs).some((k) => k in incoming.xpubs && incoming.xpubs[k] !== active.xpubs[k]);
}

/** How long the member has, after their screen collects the sign-in, to approve a held key change. */
export const REPLACE_CONFIRM_MS = 10 * 60_000;
/** Wrong authenticator codes allowed on a held key change before it is thrown away. */
export const REPLACE_CODE_TRIES = 5;
export const REPLACE_CODE_NEEDED = "Enter the 6-digit code from your authenticator app to replace your pocket keys.";

/** Can the held key change go ahead? null = yes; otherwise why not. */
export function replaceConfirmProblem(i: {
  claimedMs: number | null; nowMs: number; tries: number; twoFactorOn: boolean; code: string | null;
}): string | null {
  if (i.claimedMs == null || i.nowMs - i.claimedMs > REPLACE_CONFIRM_MS) return "That sign-in ran out. Start again.";
  if (i.tries >= REPLACE_CODE_TRIES) return "Too many wrong codes. Start again.";
  if (i.twoFactorOn && !(i.code && /^\d{6}$/.test(i.code))) return REPLACE_CODE_NEEDED;
  return null;
}
