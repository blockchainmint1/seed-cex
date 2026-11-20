/**
 * When each Seeds AI plan is checked (pure, tested). Every plan runs on its own
 * clock: once every 24 hours at the time of day it was started. A plan started at
 * 2:04 pm gets its check (and Telegram message) at 2:04 pm every day.
 *
 * Prices are daily closes, fetched within minutes of each day's end (00:00 UTC; see
 * price-catchup.ts). If a plan comes due in those first minutes, before the new price
 * day exists, it retries every few minutes for up to RETRY_WINDOW_MS, then waits for
 * its next time. One check per plan per price day stays guaranteed by
 * the database.
 */
export const DAY_MS = 24 * 60 * 60 * 1000;
export const RETRY_EVERY_MS = 5 * 60 * 1000;
export const RETRY_WINDOW_MS = 3 * 60 * 60 * 1000;

/** The most recent scheduled time at or before `now` (start + whole days). */
export function lastSlot(startedAt: string, now: number): number {
  const s = Date.parse(startedAt);
  if (now < s) return s;
  return s + Math.floor((now - s) / DAY_MS) * DAY_MS;
}

/** The first scheduled time strictly after `now`. */
export function nextSlot(startedAt: string, now: number): number {
  const s = Date.parse(startedAt);
  if (now < s) return s + DAY_MS;
  return lastSlot(startedAt, now) + DAY_MS;
}

/**
 * After a due plan was looked at: when to look again. A new check (or nothing to
 * check) moves to the next daily slot; "no new prices yet" retries soon while the
 * slot is fresh.
 */
export function afterRun(i: { startedAt: string; now: number; newCheck: boolean }): number {
  if (i.newCheck) return nextSlot(i.startedAt, i.now);
  const slot = lastSlot(i.startedAt, i.now);
  return i.now - slot < RETRY_WINDOW_MS ? i.now + RETRY_EVERY_MS : nextSlot(i.startedAt, i.now);
}
