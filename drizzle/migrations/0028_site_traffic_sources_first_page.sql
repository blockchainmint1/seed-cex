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
     WHERE created_at >= now() - make_interval(days => $1) %s
     GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT $2',
    _dimension,
    CASE WHEN _dimension = 'referrer_host' THEN 'AND is_new_session' ELSE '' END)
  USING LEAST(GREATEST(_days,1),365), LEAST(GREATEST(_limit,1),50);
END;
$$;
REVOKE ALL ON FUNCTION public.site_stats_breakdown(TEXT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.site_stats_breakdown(TEXT, INT, INT) TO anon, authenticated, service_role;