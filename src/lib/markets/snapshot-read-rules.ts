/**
 * Pure rules for reading Seeds' own market history back out (used by
 * market_snapshot_latest → snapshot-read.server.ts). Tested with `bun test`.
 *
 * The stored slice is the newest 5-minute bucket. If it is older than the
 * freshness window, the app must ask THORChain instead of showing a stale
 * number as if it were live — that decision is isFresh() here, so it is tested
 * rather than trusted.
 */

/** One row straight from market_snapshot_latest(). Amounts are already whole coins. */
export type StoredMarket = {
  bucket: string | Date;
  slug: string;
  pool: string;
  base: string;
  name: string;
  price: number | string | null;
  liquidity: number | string | null;
  volume_24h: number | string | null;
  change_pct: number | string | null;
  live: boolean | null;
  status: string | null;
  trading_halted: boolean | null;
  synth_mint_paused: boolean | null;
  balance_asset: number | string | null;
  balance_rune: number | string | null;
  pending_inbound_asset: number | string | null;
  pending_inbound_rune: number | string | null;
  synth_supply: number | string | null;
  synth_units: number | string | null;
  synth_supply_remaining: number | string | null;
  pool_units: number | string | null;
  lp_units: number | string | null;
  savers_depth: number | string | null;
  savers_units: number | string | null;
  savers_fill_bps: number | string | null;
  savers_capacity_remaining: number | string | null;
  derived_depth_bps: number | string | null;
  volume_asset: number | string | null;
  volume_rune: number | string | null;
  asset_tor_price: number | string | null;
  high_24h: number | string | null;
  low_24h: number | string | null;
  spark: (number | string)[] | null;
};

/** What the market pages need: the same shape fetchThorMarkets() returns live. */
export type StoredMarketView = {
  slug: string;
  pool: string;
  base: string;
  name: string;
  price: number | null;
  liquidity: number | null;
  live: boolean;
  day: { changePct: number | null; high: number | null; low: number | null; volume: number };
  spark: number[];
};

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

/**
 * True when a stored slice is recent enough to be shown as live.
 *
 * A slice in the future (a clock skew, or a job that ran early) counts as fresh
 * rather than throwing the whole page back to THORChain, but only within a
 * 5-minute grace: anything further ahead is a broken timestamp, not a reading.
 */
export function isFresh(bucket: string | Date | null | undefined, maxAgeMinutes: number, nowMs = Date.now()): boolean {
  if (bucket == null) return false;
  const t = typeof bucket === "string" ? new Date(bucket).getTime() : bucket.getTime();
  if (!Number.isFinite(t)) return false;
  const ageMs = nowMs - t;
  const maxMs = Math.max(1, maxAgeMinutes) * 60_000;
  return ageMs <= maxMs && ageMs >= -300_000;
}

/**
 * Stored row → the figures the pages show.
 *
 * - A row with no usable price is dropped: the pages cannot draw a blank price.
 * - 24-hour high/low fall back to the live price when a market has only one
 *   reading in the window (a brand-new pool), so the table never shows a gap
 *   where a number belongs.
 * - The sparkline keeps only real numbers, oldest first.
 */
export function storedMarketView(r: StoredMarket): StoredMarketView | null {
  if (!r || !r.slug) return null;
  const price = num(r.price);
  if (price == null || price <= 0) return null;
  const liq = num(r.liquidity);
  const high = num(r.high_24h);
  const low = num(r.low_24h);
  const vol = num(r.volume_24h);
  const spark = Array.isArray(r.spark) ? r.spark.map(num).filter((n): n is number => n != null && n > 0) : [];
  return {
    slug: r.slug,
    pool: r.pool,
    base: r.base,
    name: r.name,
    price,
    liquidity: liq != null && liq >= 0 ? liq : null,
    live: r.live === true,
    day: {
      changePct: num(r.change_pct),
      high: high != null && high > 0 ? high : price,
      low: low != null && low > 0 ? low : price,
      volume: vol != null && vol >= 0 ? vol : 0,
    },
    spark,
  };
}

/** Every usable row from one stored slice, in the order the pages expect. */
export function storedMarketViews(rows: StoredMarket[] | null | undefined): StoredMarketView[] {
  const out: StoredMarketView[] = [];
  for (const r of rows ?? []) {
    const v = storedMarketView(r);
    if (v) out.push(v);
  }
  return out;
}

/**
 * True when a stored slice carries every market the pages list.
 *
 * A slice that is missing a coin would silently drop it from the Markets table,
 * so an incomplete slice is treated as no slice at all and the app asks
 * THORChain instead.
 */
export function coversAll(views: StoredMarketView[] | null | undefined, expectedSlugs: readonly string[]): boolean {
  if (!views || !views.length) return false;
  const have = new Set(views.map((v) => v.slug));
  return expectedSlugs.every((s) => have.has(s));
}

/** How old a stored slice may be and still be shown as live, in minutes. */
export const STORED_MAX_AGE_MINUTES = 15;
