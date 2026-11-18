CREATE TABLE public.site_page_views (
  id BIGSERIAL PRIMARY KEY,
  path TEXT NOT NULL,
  referrer_host TEXT,
  country TEXT,
  device TEXT,
  session_id TEXT NOT NULL,
  is_new_session BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX site_page_views_created_at_idx ON public.site_page_views (created_at DESC);

GRANT ALL ON public.site_page_views TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.site_page_views_id_seq TO service_role;

ALTER TABLE public.site_page_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role manages page views"
  ON public.site_page_views FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.site_stats_daily(_days INT DEFAULT 30)
RETURNS TABLE(day DATE, visitors BIGINT, pageviews BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (created_at AT TIME ZONE 'America/Chicago')::date AS day,
         COUNT(DISTINCT session_id) AS visitors,
         COUNT(*) AS pageviews
  FROM public.site_page_views
  WHERE created_at >= now() - make_interval(days => LEAST(GREATEST(_days,1),365))
  GROUP BY 1 ORDER BY 1;
$$;

CREATE OR REPLACE FUNCTION public.site_stats_totals(_days INT DEFAULT 30)
RETURNS TABLE(visitors BIGINT, pageviews BIGINT, pages BIGINT, countries BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COUNT(DISTINCT session_id), COUNT(*), COUNT(DISTINCT path), COUNT(DISTINCT country)
  FROM public.site_page_views
  WHERE created_at >= now() - make_interval(days => LEAST(GREATEST(_days,1),365));
$$;

CREATE OR REPLACE FUNCTION public.site_stats_breakdown(_dimension TEXT, _days INT DEFAULT 30, _limit INT DEFAULT 10)
RETURNS TABLE(label TEXT, value BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _dimension NOT IN ('path','referrer_host','country','device') THEN
    RAISE EXCEPTION 'invalid dimension';
  END IF;
  RETURN QUERY EXECUTE format(
    'SELECT COALESCE(%I, '''')::text AS label, COUNT(DISTINCT session_id)::bigint AS value
     FROM public.site_page_views
     WHERE created_at >= now() - make_interval(days => $1)
     GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT $2', _dimension)
  USING LEAST(GREATEST(_days,1),365), LEAST(GREATEST(_limit,1),50);
END;
$$;

CREATE OR REPLACE FUNCTION public.site_page_views_prune()
RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.site_page_views WHERE created_at < now() - interval '366 days';
$$;

REVOKE ALL ON FUNCTION public.site_stats_daily(INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.site_stats_totals(INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.site_stats_breakdown(TEXT, INT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.site_page_views_prune() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.site_stats_daily(INT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.site_stats_totals(INT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.site_stats_breakdown(TEXT, INT, INT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.site_page_views_prune() TO service_role;