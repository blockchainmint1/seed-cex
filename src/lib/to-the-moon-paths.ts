/**
 * To the Moon (formerly "Ignite") page addresses. The program moved from
 * /ignite to /to-the-moon on Nov 23 2026, and the first class was renamed
 * from "First Class" to "Spark", so old links are forwarded here.
 */
export const TO_THE_MOON_PATH = "/to-the-moon";

/** Old class addresses that now live under a different name. */
const RENAMED_SLUGS: Record<string, string> = { "first-class": "spark" };

/** Where an old /ignite/<slug> link should land now. */
export function moonClassPath(oldSlug: string): string {
  const slug = String(oldSlug ?? "").toLowerCase();
  const next = RENAMED_SLUGS[slug] ?? slug;
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(next) ? `${TO_THE_MOON_PATH}/${next}` : TO_THE_MOON_PATH;
}
