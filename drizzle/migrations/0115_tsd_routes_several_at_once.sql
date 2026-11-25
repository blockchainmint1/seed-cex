CREATE OR REPLACE FUNCTION public.reserve_tsd_route(_user_id uuid, _link_id uuid, _direction text, _coin text, _coin_asset text, _amount_in numeric, _amount_usd numeric, _shown_usdc numeric, _shown_out numeric, _bridge_fee_bps integer, _txc_address text, _evm_address text, _coin_address text, _per_swap_max_usd numeric, _daily_max_usd numeric, _protocol text, _parent_id uuid DEFAULT NULL)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _used numeric; _id uuid; _open int;
BEGIN
  IF _protocol NOT IN ('thorchain', 'maya') THEN RAISE EXCEPTION 'Unknown swap network.'; END IF;
  IF _parent_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.hype_chains WHERE id = _parent_id AND user_id = _user_id AND approval_id IS NOT NULL AND status IN ('approved','mid')) THEN
    RAISE EXCEPTION 'This swap is not approved for a TSD step.';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('swap_send:' || _user_id::text));
  UPDATE public.tsd_routes SET stage = 'failed', error = COALESCE(error, 'Did not start; nothing was sent'), updated_at = now()
   WHERE user_id = _user_id AND stage = 'reserved' AND tsd_txid IS NULL AND usdc_txid IS NULL AND swap_send_id IS NULL AND created_at < now() - interval '15 minutes';
  -- QA-0009: several may run, but never while another has not yet sent its first coins.
  IF EXISTS (SELECT 1 FROM public.tsd_routes WHERE user_id = _user_id AND stage NOT IN ('done','refunded','kept_usdc','failed')
     AND ((direction = 'buy' AND tsd_txid IS NULL AND (CASE WHEN stage = 'gas_pending' THEN resume_stage ELSE stage END) IN ('reserved','sending_tsd'))
       OR (direction = 'sell' AND swap_send_id IS NULL AND usdc_txid IS NULL AND (CASE WHEN stage = 'gas_pending' THEN resume_stage ELSE stage END) IN ('reserved','swapping','minting')))) THEN
    RAISE EXCEPTION 'Your last TSD swap is still sending its first coins. Try again in a minute.';
  END IF;
  SELECT count(*) INTO _open FROM public.tsd_routes WHERE user_id = _user_id AND stage NOT IN ('done','refunded','kept_usdc','failed');
  IF _open >= 5 THEN RAISE EXCEPTION 'You already have 5 TSD swaps on their way. Wait for one to finish.'; END IF;
  IF _amount_usd > _per_swap_max_usd THEN RAISE EXCEPTION 'This swap is over the $% per-swap limit.', _per_swap_max_usd; END IF;
  SELECT COALESCE(SUM(amount_usd), 0) INTO _used FROM (
    SELECT amount_usd FROM public.swap_sends WHERE user_id = _user_id AND status <> 'failed' AND created_at > now() - interval '24 hours'
    UNION ALL
    SELECT amount_usd FROM public.tsd_routes WHERE user_id = _user_id AND stage <> 'failed' AND swap_send_id IS NULL AND created_at > now() - interval '24 hours'
  ) u;
  IF _used + _amount_usd > _daily_max_usd THEN
    RAISE EXCEPTION 'This swap would pass the $% daily limit ($% used in the last 24 hours).', _daily_max_usd, round(_used, 2);
  END IF;
  INSERT INTO public.tsd_routes (user_id, link_id, direction, coin, coin_asset, amount_in, amount_usd, shown_usdc, shown_out, bridge_fee_bps, txc_address, evm_address, coin_address, protocol, parent_id)
  VALUES (_user_id, _link_id, _direction, _coin, _coin_asset, _amount_in, _amount_usd, _shown_usdc, _shown_out, _bridge_fee_bps, _txc_address, _evm_address, _coin_address, _protocol, _parent_id)
  RETURNING id INTO _id;
  RETURN _id;
END;
$function$;
REVOKE ALL ON FUNCTION public.reserve_tsd_route(uuid, uuid, text, text, text, numeric, numeric, numeric, numeric, integer, text, text, text, numeric, numeric, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_tsd_route(uuid, uuid, text, text, text, numeric, numeric, numeric, numeric, integer, text, text, text, numeric, numeric, text, uuid) TO service_role;