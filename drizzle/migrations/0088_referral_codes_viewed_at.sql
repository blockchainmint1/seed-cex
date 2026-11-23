ALTER TABLE public.referral_codes ADD COLUMN viewed_at timestamptz;
COMMENT ON COLUMN public.referral_codes.viewed_at IS 'When the owner last opened their own invite link in Account → Referrals; null when matched only via Honest.Money member-check.';

CREATE OR REPLACE FUNCTION public.admin_affiliates(_since timestamptz)
RETURNS TABLE(code_lc text, code text, owner_id uuid, link_seen_at timestamptz, clicks_all bigint, clicks_since bigint,
  signups_all bigint, signups_since bigint, active_members bigint, trades bigint, traded_value numeric, swaps bigint, swap_usd numeric,
  ignite_paid bigint, ignite_started bigint)
LANGUAGE sql STABLE SET search_path = public AS $$
  WITH codes AS (
    SELECT code_lc FROM public.referral_codes WHERE viewed_at IS NOT NULL
    UNION SELECT code_lc FROM public.referrals
    UNION SELECT code_lc FROM public.referral_clicks
    UNION SELECT lower(ref_code) FROM public.ignite_registrations WHERE ref_code IS NOT NULL
  ),
  clk AS (
    SELECT code_lc, sum(clicks) AS all_c, sum(clicks) FILTER (WHERE day >= (_since AT TIME ZONE 'utc')::date) AS since_c
    FROM public.referral_clicks GROUP BY code_lc
  ),
  act AS (SELECT * FROM public.admin_member_activity(ARRAY(SELECT user_id FROM public.referrals))),
  sig AS (
    SELECT r.code_lc, max(r.code) AS code, count(*) AS all_s, count(*) FILTER (WHERE r.recorded_at >= _since) AS since_s,
      count(*) FILTER (WHERE a.trades > 0 OR a.swaps > 0) AS active,
      coalesce(sum(a.trades), 0) AS trades, coalesce(sum(a.traded_value), 0) AS tv,
      coalesce(sum(a.swaps), 0) AS swaps, coalesce(sum(a.swap_usd), 0) AS su
    FROM public.referrals r LEFT JOIN act a ON a.user_id = r.user_id GROUP BY r.code_lc
  ),
  ign AS (
    SELECT lower(ref_code) AS code_lc, max(ref_code) AS code, count(*) FILTER (WHERE status = 'confirmed') AS paid, count(*) AS started
    FROM public.ignite_registrations WHERE ref_code IS NOT NULL GROUP BY lower(ref_code)
  )
  SELECT c.code_lc, coalesce(rc.code, sig.code, ign.code, c.code_lc), rc.user_id, rc.viewed_at,
    coalesce(clk.all_c, 0), coalesce(clk.since_c, 0), coalesce(sig.all_s, 0), coalesce(sig.since_s, 0), coalesce(sig.active, 0),
    coalesce(sig.trades, 0), coalesce(sig.tv, 0), coalesce(sig.swaps, 0), coalesce(sig.su, 0),
    coalesce(ign.paid, 0), coalesce(ign.started, 0)
  FROM codes c
  LEFT JOIN public.referral_codes rc ON rc.code_lc = c.code_lc
  LEFT JOIN clk ON clk.code_lc = c.code_lc
  LEFT JOIN sig ON sig.code_lc = c.code_lc
  LEFT JOIN ign ON ign.code_lc = c.code_lc
$$;
REVOKE ALL ON FUNCTION public.admin_affiliates(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_affiliates(timestamptz) TO service_role;