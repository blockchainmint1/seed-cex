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
} as const;

/** Start of the current one-minute window. */
export function minuteWindow(nowMs: number): string {
  return new Date(Math.floor(nowMs / 60_000) * 60_000).toISOString();
}

/** True while this window's count (including this request) is within the limit. */
export function withinLimit(count: number, limit: number): boolean {
  return Number.isFinite(count) && count <= limit;
}
