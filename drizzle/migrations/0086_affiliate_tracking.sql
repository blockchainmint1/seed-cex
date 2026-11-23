CREATE TABLE public.referrals (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  code text NOT NULL CHECK (code ~ '^[A-Za-z0-9_.-]{1,64}$'),
  code_lc text GENERATED ALWAYS AS (lower(code)) STORED,
  source text NOT NULL CHECK (source IN ('sso','attach','after_signup','ignite')),
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX referrals_code_idx ON public.referrals (code_lc, recorded_at DESC);
CREATE INDEX referrals_recorded_idx ON public.referrals (recorded_at DESC);
GRANT ALL ON public.referrals TO service_role;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.referral_codes (
  code_lc text PRIMARY KEY CHECK (code_lc ~ '^[a-z0-9_.-]{1,64}$'),
  code text NOT NULL,
  user_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.referral_codes TO service_role;
ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.referral_clicks (
  code_lc text NOT NULL CHECK (code_lc ~ '^[a-z0-9_.-]{1,64}$'),
  day date NOT NULL,
  clicks integer NOT NULL DEFAULT 0 CHECK (clicks >= 0),
  PRIMARY KEY (code_lc, day)
);
CREATE INDEX referral_clicks_day_idx ON public.referral_clicks (day DESC);
GRANT ALL ON public.referral_clicks TO service_role;
ALTER TABLE public.referral_clicks ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.bump_referral_click(_code text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.referral_clicks (code_lc, day, clicks) VALUES (lower(_code), (now() AT TIME ZONE 'utc')::date, 1)
  ON CONFLICT (code_lc, day) DO UPDATE SET clicks = public.referral_clicks.clicks + 1;
$$;
REVOKE ALL ON FUNCTION public.bump_referral_click(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bump_referral_click(text) TO service_role;

-- Exchange trades (called-off matches excluded) and finished swaps, one row per member.
-- Two-step and TSD-route legs are counted once, as their parent swap.
CREATE OR REPLACE FUNCTION public.admin_member_activity(_ids uuid[])
RETURNS TABLE(user_id uuid, trades integer, traded_value numeric, swaps integer, swap_usd numeric, last_activity timestamptz)
LANGUAGE sql STABLE SET search_path = public AS $$
  WITH ids AS (SELECT DISTINCT unnest(_ids) AS id),
  t AS (
    SELECT x.uid, count(*)::int AS n, coalesce(sum(x.v), 0) AS v, max(x.c) AS last_t FROM (
      SELECT t.maker_id AS uid, t.price * t.amount AS v, t.created_at AS c FROM public.trades t JOIN ids ON ids.id = t.maker_id
        WHERE t.status NOT IN ('timed_out','refunded')
      UNION ALL
      SELECT t.taker_id, t.price * t.amount, t.created_at FROM public.trades t JOIN ids ON ids.id = t.taker_id
        WHERE t.status NOT IN ('timed_out','refunded') AND t.maker_id IS DISTINCT FROM t.taker_id
    ) x GROUP BY x.uid
  ),
  s AS (
    SELECT y.uid, count(*)::int AS n, coalesce(sum(y.usd), 0) AS usd, max(y.c) AS last_s FROM (
      SELECT ss.user_id AS uid, ss.amount_usd AS usd, ss.created_at AS c FROM public.swap_sends ss JOIN ids ON ids.id = ss.user_id
        WHERE ss.status = 'done' AND ss.parent_id IS NULL
      UNION ALL
      SELECT d.user_id, d.amount_usd, d.created_at FROM public.dex_swaps d JOIN ids ON ids.id = d.user_id
        WHERE d.status = 'done' AND d.two_step_id IS NULL AND d.tsd_route_id IS NULL
      UNION ALL
      SELECT r.user_id, r.amount_usd, r.created_at FROM public.tsd_routes r JOIN ids ON ids.id = r.user_id WHERE r.stage = 'done'
      UNION ALL
      SELECT w.user_id, w.amount_usd, w.created_at FROM public.two_step_swaps w JOIN ids ON ids.id = w.user_id WHERE w.status = 'done'
    ) y GROUP BY y.uid
  )
  SELECT ids.id, coalesce(t.n, 0), coalesce(t.v, 0), coalesce(s.n, 0), coalesce(s.usd, 0), greatest(t.last_t, s.last_s)
  FROM ids LEFT JOIN t ON t.uid = ids.id LEFT JOIN s ON s.uid = ids.id
$$;
REVOKE ALL ON FUNCTION public.admin_member_activity(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_member_activity(uuid[]) TO service_role;

-- One row per invite code seen anywhere (owned, clicked, used at sign-up, or on an Ignite seat).
CREATE OR REPLACE FUNCTION public.admin_affiliates(_since timestamptz)
RETURNS TABLE(code_lc text, code text, owner_id uuid, link_seen_at timestamptz, clicks_all bigint, clicks_since bigint,
  signups_all bigint, signups_since bigint, active_members bigint, trades bigint, traded_value numeric, swaps bigint, swap_usd numeric,
  ignite_paid bigint, ignite_started bigint)
LANGUAGE sql STABLE SET search_path = public AS $$
  WITH codes AS (
    SELECT code_lc FROM public.referral_codes
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
  SELECT c.code_lc, coalesce(rc.code, sig.code, ign.code, c.code_lc), rc.user_id, rc.last_seen_at,
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

-- Members who registered for Ignite with someone's code within a week of joining Seeds.
INSERT INTO public.referrals (user_id, code, source, recorded_at)
SELECT DISTINCT ON (r.user_id) r.user_id, r.ref_code, 'ignite', r.created_at
FROM public.ignite_registrations r JOIN public.profiles p ON p.id = r.user_id
WHERE r.ref_code ~ '^[A-Za-z0-9_.-]{1,64}$' AND p.created_at > r.created_at - interval '7 days'
ORDER BY r.user_id, r.created_at
ON CONFLICT (user_id) DO NOTHING;