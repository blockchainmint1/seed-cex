/**
 * Pure, client-safe rules for "Start with a coin" / "Use another wallet"
 * (the Seeds Key page). No keys, no I/O — shared by the server endpoints,
 * the sign-in page and the build guide's test vectors.
 *
 * The recovery phrase (or an outside wallet's signature) never reaches Seeds:
 * the Seeds Key page reduces it, on the device, to a sign-in signature plus
 * the keys to one trading pocket, in the same sealed format HME Wallet uses.
 */
import { FIRST_POCKET, LAST_POCKET } from "../pockets/coins";

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

/** The exact text the Seeds Key page signs to sign in and hand over one trading pocket. */
export function keySigninMessage(p: {
  domain: string; challenge: string; kind: KeyKind; identity: string; account: number; paths: string[]; payloadSha: string;
}): string {
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

/**
 * The fixed text an outside wallet signs to rebuild its Seeds pocket (outside-wallet path only).
 * It never changes for a given Seeds Key site, so the same wallet always gets the same pocket.
 * Bound to the Seeds Key host so a look-alike site's request reads differently.
 */
export function walletPocketMessage(keyHost: string): string {
  return [
    "Seeds Key - unlock my Seeds trading pocket",
    "",
    `Site: ${keyHost}`,
    "Version: 1",
    "",
    "Only sign this on the Seeds Key site above. Anyone with this signature can open your Seeds trading pocket.",
    "It does not move coins from this wallet.",
  ].join("\n");
}

/**
 * Pocket number a sign-in must use. Same pocket while a link is active;
 * after a revoke, the next unused one (Seeds deleted the old keys, so they're never reused).
 */
export function pocketFor(history: { account: number; active: boolean }[]): number | null {
  const active = history.find((h) => h.active);
  if (active) return active.account;
  if (!history.length) return FIRST_POCKET;
  const next = Math.max(...history.map((h) => h.account)) + 1;
  return next <= LAST_POCKET ? next : null;
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
  const short = `${identity.slice(0, 4)}…${identity.slice(-4)}`;
  return kind === "coin" ? `Coin ${short}` : `Wallet ${short}`;
}

/** The email to show a member, or null for a coin / wallet account that hasn't added one. */
export function shownEmail(email: string | null | undefined): string | null {
  return isPlaceholderEmail(email) ? null : (email as string);
}
