CREATE TABLE public.market_snapshots (
  day DATE NOT NULL,
  slug TEXT NOT NULL CHECK (slug ~ '^[a-z0-9]+-tsd$'),
  pool TEXT NOT NULL,
  base TEXT NOT NULL,
  name TEXT NOT NULL,
  price NUMERIC NOT NULL CHECK (price > 0),
  liquidity NUMERIC CHECK (liquidity IS NULL OR liquidity >= 0),
  volume_24h NUMERIC NOT NULL DEFAULT 0 CHECK (volume_24h >= 0),
  change_pct NUMERIC,
  live BOOLEAN NOT NULL DEFAULT false,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (day, slug)
);

CREATE INDEX market_snapshots_slug_day_idx ON public.market_snapshots (slug, day DESC);

GRANT ALL ON public.market_snapshots TO service_role;

ALTER TABLE public.market_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role manages market snapshots"
  ON public.market_snapshots FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE public.market_snapshots IS 'Nightly record of every THORChain market: price, pool liquidity and 24h volume in TSD. Written only by the scheduled market-snapshot job; never read or written from the browser.';