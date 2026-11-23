CREATE TABLE public.link_address_tries (
  link_id uuid PRIMARY KEY REFERENCES public.hme_links(id),
  tried_at timestamptz NOT NULL DEFAULT now(),
  tries int NOT NULL DEFAULT 1 CHECK (tries >= 1)
);
GRANT ALL ON public.link_address_tries TO service_role;
ALTER TABLE public.link_address_tries ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.link_address_tries IS 'Last time the address backfill found no addresses for a link (damaged public keys). The backfill skips such links for a day. Server-only.';

-- Links whose addresses have not been saved yet (backfill, newest first).
-- A link the backfill already tried in the last day is skipped (audit note: no endless 5-minute retry).
CREATE OR REPLACE FUNCTION public.links_missing_addresses(_limit int)
RETURNS SETOF uuid LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT l.id FROM public.hme_links l
  WHERE NOT EXISTS (SELECT 1 FROM public.pocket_addresses a WHERE a.link_id = l.id)
    AND NOT EXISTS (SELECT 1 FROM public.link_address_tries r WHERE r.link_id = l.id AND r.tried_at > now() - interval '1 day')
  ORDER BY (l.status = 'active') DESC, l.created_at DESC
  LIMIT greatest(1, least(_limit, 200))
$$;

-- Per-member activity figures. Trades and value leave out matches called off before
-- anything moved (timed_out, refunded), matching the public tape.
CREATE OR REPLACE FUNCTION public.admin_account_stats(_ids uuid[])
RETURNS TABLE(user_id uuid, open_orders int, trades int, traded_value numeric, last_activity timestamptz, active_authorizations int, authorized_cap numeric)
LANGUAGE sql STABLE SET search_path = public AS $$
  WITH ids AS (SELECT DISTINCT unnest(_ids) AS id),
  o AS (
    SELECT o.user_id, count(*) FILTER (WHERE o.status IN ('open', 'partial'))::int AS n_open, max(o.created_at) AS last_o
    FROM public.orders o JOIN ids ON ids.id = o.user_id GROUP BY o.user_id
  ),
  t AS (
    SELECT x.uid,
      count(*) FILTER (WHERE x.counts)::int AS n,
      coalesce(sum(x.v) FILTER (WHERE x.counts), 0) AS v,
      max(x.c) AS last_t
    FROM (
      SELECT t.maker_id AS uid, t.price * t.amount AS v, t.created_at AS c, t.status NOT IN ('timed_out', 'refunded') AS counts
      FROM public.trades t JOIN ids ON ids.id = t.maker_id
      UNION ALL
      SELECT t.taker_id, t.price * t.amount, t.created_at, t.status NOT IN ('timed_out', 'refunded')
      FROM public.trades t JOIN ids ON ids.id = t.taker_id
      WHERE t.maker_id IS DISTINCT FROM t.taker_id
    ) x GROUP BY x.uid
  ),
  d AS (
    SELECT d.user_id, count(*)::int AS n, coalesce(sum(d.max_amount), 0) AS cap
    FROM public.wallet_delegations d JOIN ids ON ids.id = d.user_id
    WHERE d.revoked_at IS NULL AND d.expires_at > now() GROUP BY d.user_id
  )
  SELECT ids.id, coalesce(o.n_open, 0), coalesce(t.n, 0), coalesce(t.v, 0), greatest(o.last_o, t.last_t), coalesce(d.n, 0), coalesce(d.cap, 0)
  FROM ids LEFT JOIN o ON o.user_id = ids.id LEFT JOIN t ON t.uid = ids.id LEFT JOIN d ON d.user_id = ids.id
$$;

REVOKE ALL ON FUNCTION public.links_missing_addresses(int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_account_stats(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.links_missing_addresses(int) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_account_stats(uuid[]) TO service_role;