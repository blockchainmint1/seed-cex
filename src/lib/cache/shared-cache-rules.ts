/**
 * Pure rules for Seeds' shared display cache (tested). The cache holds copies of
 * display data only — market summaries, order books, node status and pocket
 * balances shown on screen. Sends, settlement, reservations and limits never read it.
 */

/** What a reader should do with the stored copy it found. */
export type CachePlan =
  /** Young enough: serve it. */
  | "fresh"
  /** Old but still showable: one caller refreshes it, everyone else keeps seeing it. */
  | "refresh"
  /** Nothing showable (no copy, or too old): load it now. */
  | "load";

export type CacheTimes = {
  /** A copy younger than this is served as is. */
  freshMs: number;
  /** A copy older than this is never shown, even when the live lookup fails. */
  maxStaleMs: number;
};

export function planRead(nowMs: number, refreshedAtMs: number | null, t: CacheTimes): CachePlan {
  if (refreshedAtMs == null || !Number.isFinite(refreshedAtMs)) return "load";
  const age = nowMs - refreshedAtMs;
  if (age < 0) return "fresh"; // clock skew between servers: treat as just written
  if (age <= t.freshMs) return "fresh";
  if (age <= t.maxStaleMs) return "refresh";
  return "load";
}

/** Shortest wait between member-requested "refresh now" reads of the same copy. */
export const FORCE_MIN_AGE_MS = 10_000;

/** A member's Refresh button skips the copy only when it's at least 10 seconds old. */
export function forceAllowed(nowMs: number, refreshedAtMs: number | null): boolean {
  return refreshedAtMs == null || nowMs - refreshedAtMs >= FORCE_MIN_AGE_MS;
}

/** How long one isolate keeps its own in-memory copy before re-checking the shared one. */
export function memoryMs(freshMs: number): number {
  return Math.max(1_000, Math.min(freshMs, 5_000));
}

/** How long a refresher holds its claim; if it crashes, someone else may refresh after this. */
export function leaseMs(freshMs: number): number {
  return Math.max(5_000, Math.min(freshMs, 30_000));
}

/**
 * Cache times for each kind of display data. Order books and trade lists move
 * fastest; balances are kept a minute; ISK balances five minutes because each one
 * is a slow full scan on the single ISK node.
 */
export const CACHE_TIMES = {
  book: { freshMs: 3_000, maxStaleMs: 60_000 },
  tape: { freshMs: 3_000, maxStaleMs: 60_000 },
  stats: { freshMs: 5_000, maxStaleMs: 120_000 },
  summary: { freshMs: 5_000, maxStaleMs: 120_000 },
  series: { freshMs: 30_000, maxStaleMs: 600_000 },
  nodeStatus: { freshMs: 30_000, maxStaleMs: 600_000 },
  referencePrices: { freshMs: 60_000, maxStaleMs: 900_000 },
  balance: { freshMs: 60_000, maxStaleMs: 24 * 3_600_000 },
  /** Coin research pages: THORChain pool trades, cost-by-size quotes, CoinMarketCap facts, exchanges, news. */
  poolTrades: { freshMs: 30_000, maxStaleMs: 15 * 60_000 },
  costQuotes: { freshMs: 60_000, maxStaleMs: 15 * 60_000 },
  coinProfiles: { freshMs: 5 * 60_000, maxStaleMs: 24 * 3_600_000 },
  coinPairs: { freshMs: 15 * 60_000, maxStaleMs: 24 * 3_600_000 },
  coinNews: { freshMs: 15 * 60_000, maxStaleMs: 24 * 3_600_000 },
  /** 3M / 1Y / All market-price charts (CoinMarketCap daily history). */
  marketHistory: { freshMs: 3 * 3_600_000, maxStaleMs: 7 * 24 * 3_600_000 },
} as const satisfies Record<string, CacheTimes>;

/** One cache key per coin + address. EVM addresses ignore letter case. */
export function balanceKey(kind: string, address: string): string {
  const a = address.trim();
  return `bal:${kind}:${/^0x[0-9a-fA-F]{40}$/.test(a) ? a.toLowerCase() : a}`;
}
