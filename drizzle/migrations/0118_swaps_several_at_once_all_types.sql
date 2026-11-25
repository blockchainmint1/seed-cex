CREATE OR REPLACE FUNCTION public.reserve_hype_chain(_row jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _user uuid := (_row->>'user_id')::uuid; _id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('hype_chain:' || _user::text));
  UPDATE public.hype_chains SET status = 'expired', error = COALESCE(error, 'Not approved in time. Nothing was sent.'), updated_at = now()
   WHERE user_id = _user AND status = 'awaiting_approval' AND created_at < now() - interval '15 minutes';
  -- QA-0009: overlap between swaps is checked by the server's lane rule (src/lib/swap/lanes.ts) under the pocket spend lock.
  IF (SELECT count(*) FROM public.hype_chains WHERE user_id = _user AND status NOT IN ('done','failed','kept_mid','declined','expired','cancelled')) >= 5 THEN
    RAISE EXCEPTION 'You already have 5 chained swaps on their way. Wait for one to finish.';
  END IF;
  INSERT INTO public.hype_chains (user_id, link_id, direction, via, coin_id, protocol, pocket, amount_in, amount_usd, shown_mid, shown_out, min_out, slippage_bps, final_min)
  VALUES (_user, (_row->>'link_id')::uuid, _row->>'direction', _row->>'via', _row->>'coin_id', NULLIF(_row->>'protocol',''), lower(_row->>'pocket'),
    (_row->>'amount_in')::numeric, COALESCE((_row->>'amount_usd')::numeric,0), (_row->>'shown_mid')::numeric, (_row->>'shown_out')::numeric,
    (_row->>'min_out')::numeric, (_row->>'slippage_bps')::integer, NULLIF(_row->>'final_min','')::numeric)
  RETURNING id INTO _id;
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.reserve_hype_chain(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_hype_chain(jsonb) TO service_role;

DROP INDEX IF EXISTS public.two_step_swaps_one_open;

CREATE OR REPLACE FUNCTION public.reserve_two_step_swap(_row jsonb, _per_swap_max_usd numeric, _daily_max_usd numeric)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _user uuid := (_row->>'user_id')::uuid;
  _usd numeric := COALESCE((_row->>'amount_usd')::numeric, 0);
  _used numeric;
  _id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('two_step:' || _user::text));
  UPDATE public.two_step_swaps SET status = 'expired', error = COALESCE(error, 'Not approved in time. Nothing was sent.'), updated_at = now()
   WHERE user_id = _user AND status = 'awaiting_approval' AND created_at < now() - interval '15 minutes';
  IF (SELECT count(*) FROM public.two_step_swaps WHERE user_id = _user
              AND status NOT IN ('done', 'failed', 'refunded', 'kept_mid', 'declined', 'expired', 'cancelled')) >= 5 THEN
    RAISE EXCEPTION 'You already have 5 two-step swaps on their way. Wait for one to finish.';
  END IF;
  IF _usd > _per_swap_max_usd THEN
    RAISE EXCEPTION 'This swap is over the $% per-swap limit.', _per_swap_max_usd;
  END IF;
  SELECT COALESCE(SUM(amount_usd), 0) INTO _used FROM public.two_step_swaps
   WHERE user_id = _user AND status NOT IN ('failed', 'declined', 'expired', 'cancelled') AND created_at > now() - interval '24 hours';
  IF _used + _usd > _daily_max_usd THEN
    RAISE EXCEPTION 'This swap would pass the $% daily limit ($% used in the last 24 hours).', _daily_max_usd, round(_used, 2);
  END IF;
  INSERT INTO public.two_step_swaps (user_id, link_id, direction, network, token_address, token_symbol, token_decimals,
    coin_id, mid_id, symbol_in, symbol_out, protocol, amount_in, shown_mid, shown_out, min_out, slippage_bps, amount_usd,
    from_address, to_address)
  VALUES (_user, (_row->>'link_id')::uuid, _row->>'direction', _row->>'network', _row->>'token_address', _row->>'token_symbol',
    (_row->>'token_decimals')::integer, _row->>'coin_id', _row->>'mid_id', _row->>'symbol_in', _row->>'symbol_out', _row->>'protocol',
    (_row->>'amount_in')::numeric, (_row->>'shown_mid')::numeric, (_row->>'shown_out')::numeric, (_row->>'min_out')::numeric,
    (_row->>'slippage_bps')::integer, _usd, _row->>'from_address', _row->>'to_address')
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_two_step_swap(jsonb, numeric, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_two_step_swap(jsonb, numeric, numeric) TO service_role;