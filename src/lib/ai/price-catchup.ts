/**
 * Getting yesterday's daily close in as soon as the day ends (pure, tested).
 *
 * A day's close exists at 00:00 UTC. Seeds asks Binance/CoinGecko for it a minute
 * later and keeps asking every 10 minutes until it arrives. If it is still missing
 * SNAPSHOT_FILL_AFTER_MIN minutes after midnight, the coin's price from Seeds' own
 * 5-minute record nearest to midnight stands in (source "seeds"); the official
 * close replaces it when it arrives (ai_sync_request ignores "seeds" rows).
 */

/** UTC hours after midnight during which Seeds keeps chasing yesterday's close. */
export const CATCHUP_HOURS = 4;
/** Minutes after midnight UTC before Seeds' own record stands in for a late close. */
export const SNAPSHOT_FILL_AFTER_MIN = 20;
/** How far from midnight a 5-minute record may be to count as the close. */
export const SNAPSHOT_MATCH_WINDOW_MIN = 10;

const DAY = 86_400_000;
export const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const dayBefore = (day: string) => utcDay(Date.parse(`${day}T00:00:00Z`) - DAY);

/** What the every-minute AI job should do about prices at this minute. */
export function catchupSteps(nowMs: number): { request: boolean; ingest: boolean; fill: boolean } {
  const d = new Date(nowMs);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const chasing = h < CATCHUP_HOURS;
  return {
    request: chasing && m % 10 === 1,
    ingest: m % 30 === 0 || (chasing && m % 5 === 3),
    fill: chasing && h * 60 + m >= SNAPSHOT_FILL_AFTER_MIN && m % 5 === 4,
  };
}

/**
 * Which day (if any) needs a stand-in close: only yesterday, and only when the day
 * before it is already stored — never paper over a longer gap.
 */
export function dayToFill(lastStoredDay: string | null, nowMs: number): string | null {
  const yesterday = dayBefore(utcDay(nowMs));
  return lastStoredDay === dayBefore(yesterday) ? yesterday : null;
}

export type SnapshotRow = { bucket: string; price: number | null; asset_tor_price: number | null; live: boolean | null };

/** The close for `day` from Seeds' own record: the live row nearest midnight after it, within the window. */
export function closeFromSnapshots(rows: SnapshotRow[], day: string): number | null {
  const midnight = Date.parse(`${day}T00:00:00Z`) + DAY;
  let best: { gap: number; px: number } | null = null;
  for (const r of rows) {
    if (r.live === false) continue;
    const px = Number(r.asset_tor_price ?? r.price);
    if (!Number.isFinite(px) || px <= 0) continue;
    const gap = Math.abs(Date.parse(r.bucket) - midnight);
    if (gap > SNAPSHOT_MATCH_WINDOW_MIN * 60_000) continue;
    if (!best || gap < best.gap) best = { gap, px };
  }
  return best?.px ?? null;
}
