CREATE OR REPLACE FUNCTION public.reserve_relay_leg(_chain_id uuid, _row jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _c public.hype_chains; _id uuid; _dir text := _row->>'direction';
BEGIN
  SELECT * INTO _c FROM public.hype_chains WHERE id = _chain_id FOR UPDATE;
  IF _c.id IS NULL OR _c.approval_id IS NULL OR _c.status NOT IN ('approved','mid') THEN RAISE EXCEPTION 'This swap is not approved for a Relay step.'; END IF;
  IF _c.pocket <> lower(_row->>'pocket') THEN RAISE EXCEPTION 'Pocket mismatch.'; END IF;
  IF NOT public.hype_chain_relay_dir_ok(_c.direction, _dir) THEN RAISE EXCEPTION 'Relay step does not match this swap.'; END IF;
  IF _c.direction = 'to_ton_usdt' AND _c.ton_baseline_nano IS NULL THEN RAISE EXCEPTION 'TON balance not noted before the Relay step.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('relay_swap:' || _c.user_id::text));
  IF EXISTS (SELECT 1 FROM public.relay_swaps WHERE user_id = _c.user_id AND status NOT IN ('done','refunded','failed','declined','expired','cancelled')) THEN
    RAISE EXCEPTION 'Another Relay swap is still running. Wait for it to finish.';
  END IF;
  INSERT INTO public.relay_swaps (user_id, link_id, direction, pocket, amount_in, amount_in_wei, shown_out, min_out_wei, slippage_bps, amount_usd, status, approval_id, parent_id, recipient)
  VALUES (_c.user_id, _c.link_id, _dir, _c.pocket, (_row->>'amount_in')::numeric, _row->>'amount_in_wei',
    (_row->>'shown_out')::numeric, _row->>'min_out_wei', _c.slippage_bps, COALESCE((_row->>'amount_usd')::numeric,0), 'approved', _c.approval_id, _c.id, NULLIF(_row->>'recipient', ''))
  RETURNING id INTO _id;
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.reserve_relay_leg(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_relay_leg(uuid, jsonb) TO service_role;