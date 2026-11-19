/**
 * Pure, browser-safe safety rules for THORChain / Maya swaps. Ported from the
 * auditor-reviewed TSD Bridge rules (thorMemoSafe, thorLimitOk, vaultMembership)
 * and generalised to every coin in assets.ts. A wrong memo or vault is an
 * unrecoverable loss, so every rule fails closed.
 */
import type { Protocol, SwapCoin } from "./assets";

/** Bitcoin-family OP_RETURN limit. */
export const OP_RETURN_BYTES = 80;
/** Generous ceiling for account chains (EVM router, XRP/SOL/TRON memos). */
export const ACCOUNT_MEMO_BYTES = 250;
/** Default price protection: payout may land at most 1% under the quote. */
export const BASE_TOLERANCE_BPS = 100;
/** Hard ceiling on price protection, even for trades that move the pool. */
export const MAX_TOLERANCE_BPS = 300;
/** Quotes must have at least this long left before a send could start. */
export const MIN_QUOTE_LIFE_SECONDS = 60;

/** 1% normally; 2x the expected price impact for large trades, capped at 3%. */
export function toleranceBps(slippageBps: number | null | undefined): number {
  const s = Number.isFinite(slippageBps) ? Number(slippageBps) : 0;
  return Math.min(MAX_TOLERANCE_BPS, Math.max(BASE_TOLERANCE_BPS, Math.ceil(2 * s)));
}

/** Decimal string -> 1e8 base units, without floating-point rounding. Null if invalid. */
export function toBaseUnits(amount: string): bigint | null {
  const m = /^(\d{1,15})(?:\.(\d{1,8}))?$/.exec(amount.trim());
  if (!m) return null;
  const units = BigInt(m[1]!) * 100_000_000n + BigInt((m[2] ?? "").padEnd(8, "0") || "0");
  return units > 0n ? units : null;
}

/** 1e8 base units (string/number from a node) -> number of coins. */
export function fromBaseUnits(raw: string | number | bigint | null | undefined): number {
  if (raw == null) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n / 1e8 : 0;
}

export function destinationValid(coin: SwapCoin, destination: string): boolean {
  return coin.address.test(destination.trim());
}

function sameAddress(coin: SwapCoin, a: string, b: string): boolean {
  if (coin.caseInsensitive(a) || coin.caseInsensitive(b)) return a.toLowerCase() === b.toLowerCase();
  return a === b;
}

/**
 * True when a memo's asset token names exactly `coin` on protocol `p`: its verified
 * shortcode for that protocol, or its ticker / full / contract-suffix notation.
 */
export function memoAssetMatches(token: string, coin: SwapCoin, p: Protocol): boolean {
  if (coin.shortcodes[p] === token) return true;
  if (coin.memoNames.includes(token)) return true;
  const up = token.toUpperCase();
  if (up === coin.asset) return true;
  // Partial contract suffix form, e.g. ETH.USDC-6EB48 — must be the tail of our contract.
  const dash = coin.asset.indexOf("-");
  if (dash > 0 && up.startsWith(coin.asset.slice(0, dash + 1))) {
    const tail = up.slice(dash + 1);
    return /^[0-9A-FX]{3,}$/.test(tail) && coin.asset.slice(dash + 1).endsWith(tail);
  }
  return false;
}

export type MemoCheck = {
  /** Protocol that produced the memo (shortcodes are protocol-specific). */
  protocol: Protocol;
  /** Coin that will receive the payout. */
  to: SwapCoin;
  /** Coin being sent (decides the memo byte limit). */
  from: SwapCoin;
  destination: string;
  /** max_streaming_quantity from the same quote. */
  maxStreaming: number;
  /** Affiliate we configured, or null for "no affiliate allowed". */
  affiliate: { name: string; bps: number } | null;
};

/**
 * A swap memo is safe only if it is a plain swap to exactly the coin and address
 * we expect, carries a positive price limit, stays within the streaming cap, has
 * only our own affiliate (or none), and fits the source chain's memo limit.
 */
export function memoSafe(memo: string, c: MemoCheck): { ok: boolean; reason: string | null } {
  const fail = (reason: string) => ({ ok: false, reason });
  const limitBytes = c.from.utxo ? OP_RETURN_BYTES : ACCOUNT_MEMO_BYTES;
  if (new TextEncoder().encode(memo).length > limitBytes) return fail(`memo longer than ${limitBytes} bytes`);
  const parts = memo.split(":");
  if (parts.length < 4) return fail("memo has no price limit");
  const [action, asset, dest, limit] = parts as [string, string, string, string];
  if (action !== "=" && action !== "SWAP" && action !== "swap" && action !== "s") return fail("memo is not a swap");
  if (!memoAssetMatches(asset, c.to, c.protocol)) return fail(`memo pays ${asset}, not ${c.to.symbol}`);
  if (!sameAddress(c.to, dest, c.destination.trim())) return fail("memo pays a different address");
  const m = /^([1-9][0-9]*(?:e[0-9]+)?)(?:\/([0-9]+)\/([0-9]+))?$/.exec(limit);
  if (!m) return fail("memo has no positive price limit");
  if (m[2] !== undefined) {
    if (m[2] !== "1") return fail("unexpected streaming interval");
    const cap = Math.max(1, Math.floor(Number.isFinite(c.maxStreaming) ? c.maxStreaming : 1));
    if (Number(m[3]) > cap) return fail("streaming quantity above the quote's cap");
  }
  if (c.affiliate) {
    if (parts.length !== 6) return fail("memo is missing the Seeds affiliate");
    if (parts[4] !== c.affiliate.name || parts[5] !== String(c.affiliate.bps)) return fail("memo names a different affiliate");
    return { ok: true, reason: null };
  }
  if (parts.length !== 4) return fail("memo has extra fields (affiliate or more)");
  return { ok: true, reason: null };
}

/** Price limit (4th memo field) in 1e8 units, or null. */
export function memoLimit(memo: string): number | null {
  const limit = memo.split(":")[3];
  const m = limit ? /^([1-9][0-9]*(?:e[0-9]+)?)(?:\/|$)/.exec(limit) : null;
  return m ? Number(m[1]) : null;
}

/** The memo's price limit must not sit below the quote minus our tolerance (+0.1% rounding slack). */
export function limitOk(memo: string, expectedRaw: number, tolBps: number): boolean {
  const limit = memoLimit(memo);
  if (limit == null || !(expectedRaw > 0) || !Number.isFinite(tolBps)) return false;
  return limit >= expectedRaw * (1 - (tolBps + 10) / 10_000) && limit <= expectedRaw;
}

/**
 * At least `minConfirm` independent servers must list `address` among their ACTIVE
 * vaults. Servers listing other active vaults too is normal, not a conflict.
 */
export function vaultMembership(
  address: string,
  answers: Array<string[] | null | undefined>,
  minConfirm = 2,
): { confirms: number; error: string | null } {
  if (!address) return { confirms: 0, error: "quote named no vault" };
  const want = address.toLowerCase();
  const confirms = answers.filter((l) => Array.isArray(l) && l.some((a) => a.toLowerCase() === want)).length;
  if (confirms >= minConfirm) return { confirms, error: null };
  return {
    confirms,
    error: `vault confirmed active by ${confirms} independent server${confirms === 1 ? "" : "s"}; need ${minConfirm}`,
  };
}

export type ServerAnswer<T> = { nodeId: string | null; value: T } | null;

/**
 * Keep one answer per distinct node: two addresses that reach the same machine are
 * one server, not two. Answers whose node can't be identified are dropped (fail closed).
 */
export function independentAnswers<T>(answers: Array<ServerAnswer<T>>): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const a of answers) {
    if (!a || !a.nodeId) continue;
    const id = a.nodeId.toLowerCase();
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(a.value);
  }
  return out;
}

export type RouteLike = { protocol: string; ok: boolean; expectedOut: number };

/** Highest payout among routes that passed every check. */
export function pickBest<T extends RouteLike>(routes: T[]): T | null {
  let best: T | null = null;
  for (const r of routes) if (r.ok && r.expectedOut > 0 && (!best || r.expectedOut > best.expectedOut)) best = r;
  return best;
}
