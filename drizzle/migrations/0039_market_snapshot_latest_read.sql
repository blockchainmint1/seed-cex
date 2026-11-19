CREATE OR REPLACE FUNCTION public.market_snapshot_latest(_max_age_minutes INT DEFAULT 15)
RETURNS TABLE (
  bucket TIMESTAMPTZ,
  slug TEXT,
  pool TEXT,
  base TEXT,
  name TEXT,
  price NUMERIC,
  liquidity NUMERIC,
  volume_24h NUMERIC,
  change_pct NUMERIC,
  live BOOLEAN,
  status TEXT,
  trading_halted BOOLEAN,
  synth_mint_paused BOOLEAN,
  balance_asset NUMERIC,
  balance_rune NUMERIC,
  pending_inbound_asset NUMERIC,
  pending_inbound_rune NUMERIC,
  synth_supply NUMERIC,
  synth_units NUMERIC,
  synth_supply_remaining NUMERIC,
  pool_units NUMERIC,
  lp_units NUMERIC,
  savers_depth NUMERIC,
  savers_units NUMERIC,
  savers_fill_bps NUMERIC,
  savers_capacity_remaining NUMERIC,
  derived_depth_bps NUMERIC,
  volume_asset NUMERIC,
  volume_rune NUMERIC,
  asset_tor_price NUMERIC,
  high_24h NUMERIC,
  low_24h NUMERIC,
  spark NUMERIC[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public AS $$
  WITH newest AS (
    SELECT max(bucket) AS b
    FROM public.market_snapshots_5min
    WHERE bucket >= now() - make_interval(mins => LEAST(GREATEST(_max_age_minutes, 1), 720))
  ),
  s AS (
    SELECT m.* FROM public.market_snapshots_5min m JOIN newest n ON m.bucket = n.b
  ),
  stats AS (
    SELECT m.slug, max(m.price) AS high_24h, min(m.price) AS low_24h
    FROM public.market_snapshots_5min m, newest n
    WHERE n.b IS NOT NULL AND m.bucket <= n.b AND m.bucket > n.b - interval '24 hours'
    GROUP BY m.slug
  ),
  hourly AS (
    SELECT DISTINCT ON (m.slug, date_trunc('hour', m.bucket)) m.slug, date_trunc('hour', m.bucket) AS h, m.price
    FROM public.market_snapshots_5min m, newest n
    WHERE n.b IS NOT NULL AND m.bucket <= n.b AND m.bucket > n.b - interval '25 hours'
    ORDER BY m.slug, date_trunc('hour', m.bucket), m.bucket DESC
  ),
  sparks AS (
    SELECT slug, array_agg(price ORDER BY h) AS spark FROM hourly GROUP BY slug
  )
  SELECT s.bucket, s.slug, s.pool, s.base, s.name, s.price, s.liquidity, s.volume_24h, s.change_pct, s.live,
         s.status, s.trading_halted, s.synth_mint_paused, s.balance_asset, s.balance_rune,
         s.pending_inbound_asset, s.pending_inbound_rune, s.synth_supply, s.synth_units,
         s.synth_supply_remaining, s.pool_units, s.lp_units, s.savers_depth, s.savers_units,
         s.savers_fill_bps, s.savers_capacity_remaining, s.derived_depth_bps, s.volume_asset,
         s.volume_rune, s.asset_tor_price, st.high_24h, st.low_24h, sp.spark
  FROM s
  LEFT JOIN stats st ON st.slug = s.slug
  LEFT JOIN sparks sp ON sp.slug = s.slug
  ORDER BY s.slug;
$$;

REVOKE ALL ON FUNCTION public.market_snapshot_latest(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.market_snapshot_latest(INT) TO service_role;

COMMENT ON FUNCTION public.market_snapshot_latest(INT) IS 'Newest complete 5-minute market slice, with 24h high/low and an hourly price trail. Returns nothing when the newest slice is older than the freshness window, so the app falls back to THORChain. Server role only.';