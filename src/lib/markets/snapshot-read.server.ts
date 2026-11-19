/**
 * Reading Seeds' own market history back out.
 *
 * The pages ask here first: if the newest 5-minute slice is recent enough and
 * covers every market, the page is served from Seeds' own copy and THORChain is
 * not contacted at all. Anything older, incomplete or unreadable returns null
 * and the caller falls back to a live read, so a stalled job can never make a
 * page show a stale price as if it were current.
 *
 * Server-only: the read runs through the service role, so no browser can reach
 * the history tables directly.
 */
import {
  coversAll,
  isFresh,
  storedMarketViews,
  STORED_MAX_AGE_MINUTES,
  type StoredMarket,
  type StoredMarketView,
} from "./snapshot-read-rules";

/**
 * The newest complete slice, or null when it can't be trusted.
 * `expectedSlugs` is the market list the page must be able to show in full.
 */
export async function readStoredMarkets(expectedSlugs: readonly string[]): Promise<StoredMarketView[] | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("market_snapshot_latest", { _max_age_minutes: STORED_MAX_AGE_MINUTES });
  if (error || !Array.isArray(data) || !data.length) return null;

  const rows = data as StoredMarket[];
  // Re-check freshness in code: the SQL window and this server must agree before
  // a number is presented as live.
  if (!isFresh(rows[0]?.bucket, STORED_MAX_AGE_MINUTES)) return null;

  const views = storedMarketViews(rows);
  return coversAll(views, expectedSlugs) ? views : null;
}
