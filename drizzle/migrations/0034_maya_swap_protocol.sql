ALTER TABLE public.tsd_routes ADD COLUMN IF NOT EXISTS protocol text NOT NULL DEFAULT 'thorchain';
ALTER TABLE public.tsd_routes ADD CONSTRAINT tsd_routes_protocol_check CHECK (protocol IN ('thorchain', 'maya'));
ALTER TABLE public.swap_sends ADD CONSTRAINT swap_sends_protocol_check CHECK (protocol IN ('thorchain', 'maya'));

DROP FUNCTION IF EXISTS public.reserve_tsd_route(uuid, uuid, text, text, text, numeric, numeric, numeric, numeric, integer, text, text, text, numeric, numeric);

CREATE FUNCTION public.reserve_tsd_route(_user_id uuid, _link_id uuid, _direction text, _coin text, _coin_asset text, _amount_in numeric, _amount_usd numeric, _shown_usdc numeric, _shown_out numeric, _bridge_fee_bps integer, _txc_address text, _evm_address text, _coin_address text, _per_swap_max_usd numeric, _daily_max_usd numeric, _protocol text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _used numeric;
  _id uuid;
BEGIN
  IF _protocol NOT IN ('thorchain', 'maya') THEN
    RAISE EXCEPTION 'Unknown swap network.';
  END IF;

  -- Same lock as reserve_swap_send, so a direct swap and a TSD swap can't race past the caps.
  PERFORM pg_advisory_xact_lock(hashtext('swap_send:' || _user_id::text));

  -- A route that never moved anything (crashed worker before the first send) is retired after 15 minutes.
  UPDATE public.tsd_routes
     SET stage = 'failed', error = COALESCE(error, 'Did not start; nothing was sent'), updated_at = now()
   WHERE user_id = _user_id AND stage = 'reserved' AND tsd_txid IS NULL AND usdc_txid IS NULL AND swap_send_id IS NULL
     AND created_at < now() - interval '15 minutes';

  IF EXISTS (SELECT 1 FROM public.tsd_routes WHERE user_id = _user_id AND stage NOT IN ('done','refunded','kept_usdc','failed')) THEN
    RAISE EXCEPTION 'You already have a TSD swap in progress. It must finish first.';
  END IF;

  IF _amount_usd > _per_swap_max_usd THEN
    RAISE EXCEPTION 'This swap is over the $% per-swap limit.', _per_swap_max_usd;
  END IF;

  SELECT COALESCE(SUM(amount_usd), 0) INTO _used FROM (
    SELECT amount_usd FROM public.swap_sends
     WHERE user_id = _user_id AND status <> 'failed' AND created_at > now() - interval '24 hours'
    UNION ALL
    SELECT amount_usd FROM public.tsd_routes
     WHERE user_id = _user_id AND stage <> 'failed' AND swap_send_id IS NULL AND created_at > now() - interval '24 hours'
  ) u;
  IF _used + _amount_usd > _daily_max_usd THEN
    RAISE EXCEPTION 'This swap would pass the $% daily limit ($% used in the last 24 hours).', _daily_max_usd, round(_used, 2);
  END IF;

  INSERT INTO public.tsd_routes (user_id, link_id, direction, coin, coin_asset, amount_in, amount_usd, shown_usdc, shown_out,
    bridge_fee_bps, txc_address, evm_address, coin_address, protocol)
  VALUES (_user_id, _link_id, _direction, _coin, _coin_asset, _amount_in, _amount_usd, _shown_usdc, _shown_out,
    _bridge_fee_bps, _txc_address, _evm_address, _coin_address, _protocol)
  RETURNING id INTO _id;
  RETURN _id;
END;
$function$;

REVOKE ALL ON FUNCTION public.reserve_tsd_route(uuid, uuid, text, text, text, numeric, numeric, numeric, numeric, integer, text, text, text, numeric, numeric, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_tsd_route(uuid, uuid, text, text, text, numeric, numeric, numeric, numeric, integer, text, text, text, numeric, numeric, text) TO service_role;