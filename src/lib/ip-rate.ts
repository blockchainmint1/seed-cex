/**
 * Per-visitor rate limits for public, unauthenticated endpoints (pure, tested).
 * Audit 2026-11-19 M3/L3: the visit counter and the public quote lookups fan out to
 * the database, blockchain providers and THORNode/Maya/TSD Bridge on every call.
 */
export const IP_LIMITS = {
  /** Visit counter: page views per minute from one connection. */
  track: 60,
  /** Visit counter: page views per day under one browser session id. */
  trackPerSessionDay: 300,
  /** Public price lookups (swap quotes, TSD quotes, any-coin search/quote) per minute. */
  quote: 40,
  /** Market prices and charts read from THORChain, counted only when the cache misses. */
  chart: 60,
  /** Ad views and clicks per minute from one connection (a page shows at most five ads). */
  adEvent: 40,
  /** AWS alarm page: posts per minute from one connection that name Seeds' alarm topic (real alarms are a handful a day). */
  awsAlarm: 20,
  /** Signed-in pocket balance reads (EVM portfolio, ERC-20 tokens) per minute from one connection (audit T1). */
  pocketRead: 30,
  /** Ignite "tell me about new classes" sign-ups per minute from one connection. */
  igniteInterest: 6,
} as const;

/** Start of the current one-minute window. */
export function minuteWindow(nowMs: number): string {
  return new Date(Math.floor(nowMs / 60_000) * 60_000).toISOString();
}

/** True while this window's count (including this request) is within the limit. */
export function withinLimit(count: number, limit: number): boolean {
  return Number.isFinite(count) && count <= limit;
}
