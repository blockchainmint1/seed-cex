COMMENT ON TABLE public.market_snapshots IS 'DEPRECATED: replaced by market_snapshots_5min (5-minute detail, far more fields). Never written to; safe to drop once nothing references it.';

CREATE TABLE public.market_snapshots_5min (
  bucket TIMESTAMPTZ NOT NULL,
  slug TEXT NOT NULL CHECK (slug ~ '^[a-z0-9]+-tsd$'),
  pool TEXT NOT NULL,
  base TEXT NOT NULL,
  name TEXT NOT NULL,
  short_code TEXT,
  price NUMERIC NOT NULL CHECK (price > 0),
  liquidity NUMERIC CHECK (liquidity IS NULL OR liquidity >= 0),
  volume_24h NUMERIC NOT NULL DEFAULT 0 CHECK (volume_24h >= 0),
  change_pct NUMERIC,
  live BOOLEAN NOT NULL DEFAULT false,
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
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (bucket, slug)
);

CREATE INDEX market_snapshots_5min_slug_bucket_idx ON public.market_snapshots_5min (slug, bucket DESC);

GRANT ALL ON public.market_snapshots_5min TO service_role;
ALTER TABLE public.market_snapshots_5min ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role manages 5 minute market snapshots"
  ON public.market_snapshots_5min FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE TABLE public.chain_snapshots (
  bucket TIMESTAMPTZ NOT NULL,
  chain TEXT NOT NULL,
  halted BOOLEAN,
  global_trading_paused BOOLEAN,
  chain_trading_paused BOOLEAN,
  chain_lp_actions_paused BOOLEAN,
  gas_rate NUMERIC,
  gas_rate_units TEXT,
  observed_fee_rate NUMERIC,
  outbound_fee NUMERIC,
  outbound_tx_size NUMERIC,
  dust_threshold NUMERIC,
  router TEXT,
  address TEXT,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (bucket, chain)
);

CREATE INDEX chain_snapshots_chain_bucket_idx ON public.chain_snapshots (chain, bucket DESC);

GRANT ALL ON public.chain_snapshots TO service_role;
ALTER TABLE public.chain_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role manages chain snapshots"
  ON public.chain_snapshots FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE TABLE public.network_snapshots (
  bucket TIMESTAMPTZ PRIMARY KEY,
  scheduled_queue INT,
  native_tx_fee NUMERIC,
  outbound_tx_fee NUMERIC,
  asgard_size INT,
  desired_validator_set INT,
  nodes_total INT,
  nodes_active INT,
  nodes_jailed INT,
  nodes_maintenance INT,
  nodes_missing_blocks BIGINT,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.network_snapshots TO service_role;
ALTER TABLE public.network_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role manages network snapshots"
  ON public.network_snapshots FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE TABLE public.market_snapshots_hourly (
  hour TIMESTAMPTZ NOT NULL,
  slug TEXT NOT NULL,
  price_open NUMERIC,
  price_high NUMERIC,
  price_low NUMERIC,
  price_close NUMERIC,
  liquidity_avg NUMERIC,
  liquidity_min NUMERIC,
  volume_24h_avg NUMERIC,
  samples INT NOT NULL DEFAULT 0,
  PRIMARY KEY (hour, slug)
);

CREATE INDEX market_snapshots_hourly_slug_hour_idx ON public.market_snapshots_hourly (slug, hour DESC);

GRANT ALL ON public.market_snapshots_hourly TO service_role;
ALTER TABLE public.market_snapshots_hourly ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role manages hourly market rollups"
  ON public.market_snapshots_hourly FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.market_snapshots_rollup()
RETURNS INT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public AS $$
DECLARE n INT;
BEGIN
  INSERT INTO public.market_snapshots_hourly
    (hour, slug, price_open, price_high, price_low, price_close, liquidity_avg, liquidity_min, volume_24h_avg, samples)
  SELECT date_trunc('hour', bucket), slug,
         (array_agg(price ORDER BY bucket))[1],
         max(price), min(price),
         (array_agg(price ORDER BY bucket DESC))[1],
         avg(liquidity), min(liquidity), avg(volume_24h), count(*)
  FROM public.market_snapshots_5min
  WHERE bucket < date_trunc('hour', now())
  GROUP BY date_trunc('hour', bucket), slug
  ON CONFLICT (hour, slug) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION public.market_snapshots_prune()
RETURNS TABLE(raw_removed INT, hourly_removed INT)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public AS $$
DECLARE raw INT; hourly INT;
BEGIN
  DELETE FROM public.market_snapshots_5min WHERE bucket < now() - interval '90 days';
  GET DIAGNOSTICS raw = ROW_COUNT;
  DELETE FROM public.market_snapshots_hourly WHERE hour < now() - interval '730 days';
  GET DIAGNOSTICS hourly = ROW_COUNT;
  DELETE FROM public.chain_snapshots WHERE bucket < now() - interval '90 days';
  DELETE FROM public.network_snapshots WHERE bucket < now() - interval '730 days';
  RETURN QUERY SELECT raw, hourly;
END;
$$;

REVOKE ALL ON FUNCTION public.market_snapshots_rollup() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.market_snapshots_prune() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.market_snapshots_rollup() TO service_role;
GRANT EXECUTE ON FUNCTION public.market_snapshots_prune() TO service_role;

COMMENT ON TABLE public.market_snapshots_5min IS 'Every THORChain market, recorded every 5 minutes: price, pool liquidity, 24h volume, inbound balance, synth supply, savers depth and halt flags in human units. Written only by the scheduled market-snapshot job; never read or written from the browser.';
COMMENT ON TABLE public.chain_snapshots IS 'Per-chain THORChain state every 5 minutes: halt flags, gas rate, outbound fee and vault router/address. Written only by the scheduled job.';
COMMENT ON TABLE public.network_snapshots IS 'THORChain network state every 5 minutes: planned-out queue length, fee constants and (hourly) node counts. Written only by the scheduled job.';
COMMENT ON TABLE public.market_snapshots_hourly IS 'Hourly rollup of the 5-minute market snapshots, kept two years for long-span charts.';
COMMENT ON COLUMN public.market_snapshots_5min.balance_asset IS 'Pool side of the coin, in whole coins (THORChain reports 1e8 base units).';
COMMENT ON COLUMN public.market_snapshots_5min.savers_fill_bps IS 'Savers fill basis points, as reported by THORChain.';