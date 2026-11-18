// Seeds' public launch (Bobby): November 30, 2026 — the first day of the Ignite class.
export const LAUNCH_DATE_LABEL = "November 30, 2026";

/** Days/hours/minutes left until `targetUtc`, never negative. */
export function timeLeft(now: number, targetUtc: string) {
  const ms = Math.max(0, new Date(targetUtc).getTime() - now);
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  return { days, hours, minutes, done: ms === 0 };
}
