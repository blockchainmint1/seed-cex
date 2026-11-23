ALTER TABLE public.listing_applications ADD COLUMN IF NOT EXISTS ref_code text
  CHECK (ref_code IS NULL OR ref_code ~ '^[A-Za-z0-9_.-]{1,64}$');

DROP FUNCTION IF EXISTS public.admin_affiliates(timestamptz);

CREATE FUNCTION public.admin_affiliates(_since timestamp with time zone)
 RETURNS TABLE(code_lc text, code text, owner_id uuid, link_seen_at timestamp with time zone,
   clicks_all bigint, clicks_since bigint, signups_all bigint, signups_since bigint, active_members bigint,
   trades bigint, traded_value numeric, swaps bigint, swap_usd numeric,
   ignite_paid bigint, ignite_started bigint, ignite_usd numeric,
   setup_linked bigint, setup_done bigint,
   listings_paid bigint, listings_started bigint, listing_usd numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH
  -- Class seats: the code used at checkout, else the code the buyer joined Seeds with. Never the buyer's own code.
  ign_src AS (
    SELECT g.status, g.amount_usd,
      CASE WHEN g.ref_code IS NOT NULL AND NOT EXISTS (
             SELECT 1 FROM public.referral_codes oc WHERE oc.user_id = g.user_id AND oc.code_lc = lower(g.ref_code))
           THEN lower(g.ref_code) ELSE r.code_lc END AS code_lc,
      CASE WHEN g.ref_code IS NOT NULL AND NOT EXISTS (
             SELECT 1 FROM public.referral_codes oc WHERE oc.user_id = g.user_id AND oc.code_lc = lower(g.ref_code))
           THEN g.ref_code ELSE r.code END AS code
    FROM public.ignite_registrations g LEFT JOIN public.referrals r ON r.user_id = g.user_id
  ),
  -- Listings: same rule.
  lst_src AS (
    SELECT a.payment_status, a.amount_usd,
      CASE WHEN a.ref_code IS NOT NULL AND NOT EXISTS (
             SELECT 1 FROM public.referral_codes oc WHERE oc.user_id = a.user_id AND oc.code_lc = lower(a.ref_code))
           THEN lower(a.ref_code) ELSE r.code_lc END AS code_lc,
      CASE WHEN a.ref_code IS NOT NULL AND NOT EXISTS (
             SELECT 1 FROM public.referral_codes oc WHERE oc.user_id = a.user_id AND oc.code_lc = lower(a.ref_code))
           THEN a.ref_code ELSE r.code END AS code
    FROM public.listing_applications a LEFT JOIN public.referrals r ON r.user_id = a.user_id
  ),
  codes AS (
    SELECT code_lc FROM public.referral_codes WHERE viewed_at IS NOT NULL
    UNION SELECT code_lc FROM public.referrals
    UNION SELECT code_lc FROM public.referral_clicks
    UNION SELECT code_lc FROM ign_src WHERE code_lc IS NOT NULL
    UNION SELECT code_lc FROM lst_src WHERE code_lc IS NOT NULL
  ),
  clk AS (
    SELECT code_lc, sum(clicks) AS all_c, sum(clicks) FILTER (WHERE day >= (_since AT TIME ZONE 'utc')::date) AS since_c
    FROM public.referral_clicks GROUP BY code_lc
  ),
  act AS (SELECT * FROM public.admin_member_activity(ARRAY(SELECT user_id FROM public.referrals))),
  linked AS (SELECT DISTINCT user_id FROM public.hme_links WHERE status = 'active'),
  sig AS (
    SELECT r.code_lc, max(r.code) AS code, count(*) AS all_s, count(*) FILTER (WHERE r.recorded_at >= _since) AS since_s,
      count(*) FILTER (WHERE a.trades > 0 OR a.swaps > 0) AS active,
      coalesce(sum(a.trades), 0) AS trades, coalesce(sum(a.traded_value), 0) AS tv,
      coalesce(sum(a.swaps), 0) AS swaps, coalesce(sum(a.swap_usd), 0) AS su,
      count(l.user_id) AS linked_n,
      count(*) FILTER (WHERE p.onboarding_status = 'done') AS done_n
    FROM public.referrals r
    LEFT JOIN act a ON a.user_id = r.user_id
    LEFT JOIN linked l ON l.user_id = r.user_id
    LEFT JOIN public.profiles p ON p.id = r.user_id
    GROUP BY r.code_lc
  ),
  ign AS (
    SELECT code_lc, max(code) AS code, count(*) FILTER (WHERE status = 'confirmed') AS paid, count(*) AS started,
      coalesce(sum(amount_usd) FILTER (WHERE status = 'confirmed'), 0) AS usd
    FROM ign_src WHERE code_lc IS NOT NULL GROUP BY code_lc
  ),
  lst AS (
    SELECT code_lc, max(code) AS code, count(*) FILTER (WHERE payment_status = 'paid') AS paid, count(*) AS started,
      coalesce(sum(amount_usd) FILTER (WHERE payment_status = 'paid'), 0) AS usd
    FROM lst_src WHERE code_lc IS NOT NULL GROUP BY code_lc
  )
  SELECT c.code_lc, coalesce(rc.code, sig.code, ign.code, lst.code, c.code_lc), rc.user_id, rc.viewed_at,
    coalesce(clk.all_c, 0), coalesce(clk.since_c, 0), coalesce(sig.all_s, 0), coalesce(sig.since_s, 0), coalesce(sig.active, 0),
    coalesce(sig.trades, 0), coalesce(sig.tv, 0), coalesce(sig.swaps, 0), coalesce(sig.su, 0),
    coalesce(ign.paid, 0), coalesce(ign.started, 0), coalesce(ign.usd, 0),
    coalesce(sig.linked_n, 0), coalesce(sig.done_n, 0),
    coalesce(lst.paid, 0), coalesce(lst.started, 0), coalesce(lst.usd, 0)
  FROM codes c
  LEFT JOIN public.referral_codes rc ON rc.code_lc = c.code_lc
  LEFT JOIN clk ON clk.code_lc = c.code_lc
  LEFT JOIN sig ON sig.code_lc = c.code_lc
  LEFT JOIN ign ON ign.code_lc = c.code_lc
  LEFT JOIN lst ON lst.code_lc = c.code_lc
$function$;

REVOKE ALL ON FUNCTION public.admin_affiliates(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_affiliates(timestamptz) TO service_role;