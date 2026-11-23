CREATE TABLE public.pocket_addresses (
  link_id uuid NOT NULL REFERENCES public.hme_links(id),
  user_id uuid NOT NULL,
  coin text NOT NULL CHECK (coin ~ '^[A-Z]{2,6}$'),
  address text NOT NULL CHECK (length(address) BETWEEN 10 AND 200),
  address_lc text GENERATED ALWAYS AS (lower(address)) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (link_id, coin)
);
GRANT ALL ON public.pocket_addresses TO service_role;
ALTER TABLE public.pocket_addresses ENABLE ROW LEVEL SECURITY;
CREATE INDEX pocket_addresses_user_idx ON public.pocket_addresses (user_id);
CREATE INDEX pocket_addresses_lc_idx ON public.pocket_addresses (address_lc text_pattern_ops);
COMMENT ON TABLE public.pocket_addresses IS 'Receive addresses (child 0/0) of each hme_links row, derived from its public keys once at link time. Server-only, append-only.';

CREATE OR REPLACE FUNCTION public.pocket_addresses_append_only()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'pocket addresses are permanent history';
END $$;
CREATE TRIGGER pocket_addresses_append_only BEFORE UPDATE OR DELETE ON public.pocket_addresses
  FOR EACH ROW EXECUTE FUNCTION public.pocket_addresses_append_only();

CREATE INDEX IF NOT EXISTS orders_user_created_idx ON public.orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS trades_maker_idx ON public.trades (maker_id);
CREATE INDEX IF NOT EXISTS trades_taker_idx ON public.trades (taker_id);
CREATE INDEX IF NOT EXISTS wallet_delegations_user_idx ON public.wallet_delegations (user_id);
CREATE INDEX IF NOT EXISTS profiles_created_idx ON public.profiles (created_at DESC);

-- Links whose addresses have not been saved yet (backfill, newest first).
CREATE OR REPLACE FUNCTION public.links_missing_addresses(_limit int)
RETURNS SETOF uuid LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT l.id FROM public.hme_links l
  WHERE NOT EXISTS (SELECT 1 FROM public.pocket_addresses a WHERE a.link_id = l.id)
  ORDER BY (l.status = 'active') DESC, l.created_at DESC
  LIMIT greatest(1, least(_limit, 200))
$$;

-- Per-member activity figures for a set of members.
CREATE OR REPLACE FUNCTION public.admin_account_stats(_ids uuid[])
RETURNS TABLE(user_id uuid, open_orders int, trades int, traded_value numeric, last_activity timestamptz, active_authorizations int, authorized_cap numeric)
LANGUAGE sql STABLE SET search_path = public AS $$
  WITH ids AS (SELECT DISTINCT unnest(_ids) AS id),
  o AS (
    SELECT o.user_id, count(*) FILTER (WHERE o.status IN ('open', 'partial'))::int AS n_open, max(o.created_at) AS last_o
    FROM public.orders o JOIN ids ON ids.id = o.user_id GROUP BY o.user_id
  ),
  t AS (
    SELECT x.uid, count(*)::int AS n, coalesce(sum(x.v), 0) AS v, max(x.c) AS last_t FROM (
      SELECT t.maker_id AS uid, t.price * t.amount AS v, t.created_at AS c FROM public.trades t JOIN ids ON ids.id = t.maker_id
      UNION ALL
      SELECT t.taker_id, t.price * t.amount, t.created_at FROM public.trades t JOIN ids ON ids.id = t.taker_id
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

-- One page of the admin Accounts table: search, sort and page in the database.
-- Name / joined / vault sorts pick the page first and only total up that page.
CREATE OR REPLACE FUNCTION public.admin_accounts_page(_q text, _hits uuid[], _sort text, _desc boolean, _limit int, _offset int)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  _s text := nullif(lower(btrim(coalesce(_q, ''))), '');
  _lim int := greatest(1, least(coalesce(_limit, 25), 100));
  _off int := greatest(0, coalesce(_offset, 0));
  _ids uuid[];
  _page uuid[];
  _total int;
  _rows jsonb;
BEGIN
  SELECT coalesce(array_agg(p.id), '{}') INTO _ids FROM public.profiles p
  WHERE _s IS NULL
     OR strpos(lower(coalesce(p.display_name, '')), _s) > 0
     OR left(p.id::text, length(_s)) = _s
     OR p.id = ANY (coalesce(_hits, '{}'))
     OR p.id IN (SELECT w.user_id FROM public.wallets w
                 WHERE left(lower(coalesce(w.txc_address, '')), length(_s)) = _s
                    OR left(lower(coalesce(w.evm_address, '')), length(_s)) = _s);
  _total := coalesce(array_length(_ids, 1), 0);
  -- Asked past the end (search shrank): show the last page.
  IF _off >= _total AND _total > 0 THEN _off := ((_total - 1) / _lim) * _lim; END IF;

  IF _sort IN ('activeAuthorizations', 'authorizedCap', 'openOrders', 'trades', 'tradedQuoteValue', 'lastActivity') THEN
    SELECT coalesce(array_agg(x.user_id ORDER BY x.ord), '{}') INTO _page FROM (
      SELECT s.user_id, row_number() OVER (ORDER BY
        CASE WHEN NOT _desc THEN CASE _sort
          WHEN 'activeAuthorizations' THEN s.active_authorizations::numeric WHEN 'authorizedCap' THEN s.authorized_cap
          WHEN 'openOrders' THEN s.open_orders::numeric WHEN 'trades' THEN s.trades::numeric
          WHEN 'tradedQuoteValue' THEN s.traded_value WHEN 'lastActivity' THEN extract(epoch FROM s.last_activity)::numeric END END ASC NULLS LAST,
        CASE WHEN _desc THEN CASE _sort
          WHEN 'activeAuthorizations' THEN s.active_authorizations::numeric WHEN 'authorizedCap' THEN s.authorized_cap
          WHEN 'openOrders' THEN s.open_orders::numeric WHEN 'trades' THEN s.trades::numeric
          WHEN 'tradedQuoteValue' THEN s.traded_value WHEN 'lastActivity' THEN extract(epoch FROM s.last_activity)::numeric END END DESC NULLS LAST,
        p.created_at DESC, p.id) AS ord
      FROM public.admin_account_stats(_ids) s JOIN public.profiles p ON p.id = s.user_id
    ) x WHERE x.ord > _off AND x.ord <= _off + _lim;
  ELSE
    SELECT coalesce(array_agg(x.id ORDER BY x.ord), '{}') INTO _page FROM (
      SELECT p.id, row_number() OVER (ORDER BY
        CASE WHEN _sort = 'displayName' AND NOT _desc THEN lower(coalesce(p.display_name, '')) END ASC,
        CASE WHEN _sort = 'displayName' AND _desc THEN lower(coalesce(p.display_name, '')) END DESC,
        CASE WHEN _sort = 'hasVault' AND NOT _desc THEN (w.user_id IS NOT NULL) END ASC,
        CASE WHEN _sort = 'hasVault' AND _desc THEN (w.user_id IS NOT NULL) END DESC,
        CASE WHEN _sort = 'createdAt' AND NOT _desc THEN p.created_at END ASC,
        p.created_at DESC, p.id) AS ord
      FROM public.profiles p LEFT JOIN public.wallets w ON w.user_id = p.id
      WHERE p.id = ANY (_ids)
    ) x WHERE x.ord > _off AND x.ord <= _off + _lim;
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'user_id', p.id, 'display_name', p.display_name, 'created_at', p.created_at,
      'has_vault', w.user_id IS NOT NULL, 'link_id', l.id,
      'txc_address', coalesce(ta.address, w.txc_address), 'evm_address', coalesce(ea.address, w.evm_address),
      'addresses_saved', ta.address IS NOT NULL OR ea.address IS NOT NULL,
      'active_authorizations', coalesce(s.active_authorizations, 0), 'authorized_cap', coalesce(s.authorized_cap, 0),
      'open_orders', coalesce(s.open_orders, 0), 'trades', coalesce(s.trades, 0), 'traded_value', coalesce(s.traded_value, 0),
      'last_activity', s.last_activity,
      'trading_frozen_at', p.trading_frozen_at, 'trading_frozen_reason', p.trading_frozen_reason,
      'order_pause_cleared_at', p.order_pause_cleared_at
    ) ORDER BY pg.ord), '[]'::jsonb) INTO _rows
  FROM unnest(_page) WITH ORDINALITY AS pg(id, ord)
  JOIN public.profiles p ON p.id = pg.id
  LEFT JOIN public.wallets w ON w.user_id = p.id
  LEFT JOIN LATERAL (SELECT hl.id FROM public.hme_links hl WHERE hl.user_id = p.id AND hl.status = 'active'
                     ORDER BY hl.created_at DESC LIMIT 1) l ON true
  LEFT JOIN public.pocket_addresses ta ON ta.link_id = l.id AND ta.coin = 'TXC'
  LEFT JOIN public.pocket_addresses ea ON ea.link_id = l.id AND ea.coin = 'EVM'
  LEFT JOIN public.admin_account_stats(_page) s ON s.user_id = p.id;

  RETURN jsonb_build_object('total', _total, 'offset', _off, 'rows', _rows);
END $$;

REVOKE ALL ON FUNCTION public.links_missing_addresses(int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_account_stats(uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_accounts_page(text, uuid[], text, boolean, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.links_missing_addresses(int) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_account_stats(uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_accounts_page(text, uuid[], text, boolean, int, int) TO service_role;