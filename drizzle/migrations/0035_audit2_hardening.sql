ALTER TABLE public.send_approvals DROP CONSTRAINT send_approvals_purpose_check;
ALTER TABLE public.send_approvals ADD CONSTRAINT send_approvals_purpose_check CHECK (purpose IN ('trade_leg', 'p2p_release', 'swap_out'));

CREATE OR REPLACE FUNCTION public.wallet_delegations_retired()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  RAISE EXCEPTION 'Old trading authorizations are retired. Link your HME Wallet instead.';
END;
$$;
DROP TRIGGER IF EXISTS wallet_delegations_no_new ON public.wallet_delegations;
CREATE TRIGGER wallet_delegations_no_new BEFORE INSERT ON public.wallet_delegations
  FOR EACH ROW EXECUTE FUNCTION public.wallet_delegations_retired();
COMMENT ON TABLE public.wallet_delegations IS 'DEPRECATED: replaced by hme_links; inserts blocked (audit 2026-11-19 H3)';

DROP FUNCTION IF EXISTS public.reserve_swap_send(uuid, uuid, text, text, text, text, numeric, numeric, numeric, numeric, text, text, text, text, text, numeric, numeric);
CREATE FUNCTION public.reserve_swap_send(_user_id uuid, _link_id uuid, _protocol text, _pocket text, _from_asset text, _to_asset text, _amount_in numeric, _amount_usd numeric, _expected_out numeric, _min_out numeric, _from_address text, _destination text, _vault text, _router text, _memo text, _per_swap_max_usd numeric, _daily_max_usd numeric, _route_id uuid DEFAULT NULL)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _used numeric;
  _id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('swap_send:' || _user_id::text));

  UPDATE public.swap_sends
     SET status = CASE WHEN txid IS NULL THEN 'failed' ELSE 'unknown' END,
         error = COALESCE(error, 'Send did not finish; checked by hand'),
         updated_at = now()
   WHERE user_id = _user_id AND status = 'signing' AND created_at < now() - interval '10 minutes';

  IF EXISTS (SELECT 1 FROM public.swap_sends WHERE user_id = _user_id AND pocket = _pocket AND status = 'signing') THEN
    RAISE EXCEPTION 'Another swap from this pocket is still being sent. Wait a minute and try again.';
  END IF;

  IF _amount_usd > _per_swap_max_usd THEN
    RAISE EXCEPTION 'This swap is over the $% per-swap limit.', _per_swap_max_usd;
  END IF;

  -- Direct swaps and TSD swaps share one daily limit. A TSD swap counts once: by its own
  -- amount until its swap leg exists, then through that leg. The route asking for its own
  -- leg is not counted twice.
  SELECT COALESCE(SUM(amount_usd), 0) INTO _used FROM (
    SELECT amount_usd FROM public.swap_sends
     WHERE user_id = _user_id AND status <> 'failed' AND created_at > now() - interval '24 hours'
    UNION ALL
    SELECT amount_usd FROM public.tsd_routes
     WHERE user_id = _user_id AND stage <> 'failed' AND swap_send_id IS NULL
       AND (_route_id IS NULL OR id <> _route_id)
       AND created_at > now() - interval '24 hours'
  ) u;
  IF _used + _amount_usd > _daily_max_usd THEN
    RAISE EXCEPTION 'This swap would pass the $% daily limit ($% used in the last 24 hours).', _daily_max_usd, round(_used, 2);
  END IF;

  INSERT INTO public.swap_sends (user_id, link_id, protocol, pocket, from_asset, to_asset, amount_in, amount_usd,
    expected_out, min_out, from_address, destination, vault, router, memo)
  VALUES (_user_id, _link_id, _protocol, _pocket, _from_asset, _to_asset, _amount_in, _amount_usd,
    _expected_out, _min_out, _from_address, _destination, _vault, _router, _memo)
  RETURNING id INTO _id;
  RETURN _id;
END;
$function$;
REVOKE ALL ON FUNCTION public.reserve_swap_send(uuid, uuid, text, text, text, text, numeric, numeric, numeric, numeric, text, text, text, text, text, numeric, numeric, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_swap_send(uuid, uuid, text, text, text, text, numeric, numeric, numeric, numeric, text, text, text, text, text, numeric, numeric, uuid) TO service_role;

DROP FUNCTION IF EXISTS public.reserve_gas_topup(uuid, uuid, text, numeric, numeric, numeric, numeric);
CREATE FUNCTION public.reserve_gas_topup(_route_id uuid, _user_id uuid, _to_address text, _wei numeric, _usd numeric, _per_route_max_usd numeric, _daily_max_usd numeric, _member_daily_max_usd numeric DEFAULT 10)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _route numeric;
  _day numeric;
  _member numeric;
  _id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('gas_topup'));

  IF EXISTS (SELECT 1 FROM public.gas_topups WHERE route_id = _route_id AND status IN ('signing','sent')) THEN
    RAISE EXCEPTION 'A network-fee top-up for this swap is already on its way.';
  END IF;

  SELECT COALESCE(SUM(usd), 0) INTO _route FROM public.gas_topups WHERE route_id = _route_id AND status <> 'failed';
  IF _route + _usd > _per_route_max_usd THEN
    RAISE EXCEPTION 'The Ethereum network fee is above the $% Seeds covers per swap right now.', _per_route_max_usd;
  END IF;

  SELECT COALESCE(SUM(usd), 0) INTO _member FROM public.gas_topups
   WHERE user_id = _user_id AND status <> 'failed' AND created_at > now() - interval '24 hours';
  IF _member + _usd > _member_daily_max_usd THEN
    RAISE EXCEPTION 'Seeds has covered $% of your network fees today, its limit per member. Add a little ETH to your pocket to keep going.', round(_member, 2);
  END IF;

  SELECT COALESCE(SUM(usd), 0) INTO _day FROM public.gas_topups WHERE status <> 'failed' AND created_at > now() - interval '24 hours';
  IF _day + _usd > _daily_max_usd THEN
    RAISE EXCEPTION 'Seeds has reached its $% daily network-fee budget. Try again later.', _daily_max_usd;
  END IF;

  INSERT INTO public.gas_topups (route_id, user_id, to_address, wei, usd)
  VALUES (_route_id, _user_id, _to_address, _wei, _usd)
  RETURNING id INTO _id;
  RETURN _id;
END;
$function$;
REVOKE ALL ON FUNCTION public.reserve_gas_topup(uuid, uuid, text, numeric, numeric, numeric, numeric, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_gas_topup(uuid, uuid, text, numeric, numeric, numeric, numeric, numeric) TO service_role;

CREATE INDEX IF NOT EXISTS site_page_views_session_idx ON public.site_page_views (session_id, created_at DESC);

SELECT cron.schedule('site-page-views-prune', '17 3 * * *', 'select public.site_page_views_prune()');