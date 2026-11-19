CREATE TABLE public.shared_cache (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  refreshed_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz
);
GRANT ALL ON public.shared_cache TO service_role;
ALTER TABLE public.shared_cache ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.shared_cache IS 'Server-only copy of display data (market summaries, pocket balances) shared by every visitor; never used for sends, settlement or limits.';

-- One refresher per key: returns true for the caller that may refresh, false for everyone else.
CREATE OR REPLACE FUNCTION public.shared_cache_claim(_key text, _fresh_ms integer, _lease_ms integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _n int;
BEGIN
  UPDATE public.shared_cache
     SET lease_until = now() + make_interval(secs => _lease_ms / 1000.0)
   WHERE key = _key
     AND refreshed_at < now() - make_interval(secs => _fresh_ms / 1000.0)
     AND (lease_until IS NULL OR lease_until < now());
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n = 1;
END $$;
REVOKE ALL ON FUNCTION public.shared_cache_claim(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.shared_cache_claim(text, integer, integer) TO service_role;

-- Old balance copies are cleared after a week.
CREATE OR REPLACE FUNCTION public.shared_cache_prune()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _n int;
BEGIN
  DELETE FROM public.shared_cache WHERE refreshed_at < now() - interval '7 days';
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END $$;
REVOKE ALL ON FUNCTION public.shared_cache_prune() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.shared_cache_prune() TO service_role;