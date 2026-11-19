ALTER TABLE public.market_snapshots_5min ADD COLUMN IF NOT EXISTS asset_tor_price NUMERIC;

COMMENT ON COLUMN public.market_snapshots_5min.asset_tor_price IS 'THORChain price of the coin in RUNE (whole RUNE per coin), as reported at the snapshot moment. Cross-checks the dollar price shown to visitors.';