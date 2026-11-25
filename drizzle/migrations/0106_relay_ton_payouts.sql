ALTER TABLE public.relay_swaps DROP CONSTRAINT relay_swaps_direction_check;
ALTER TABLE public.relay_swaps ADD CONSTRAINT relay_swaps_direction_check CHECK (direction IN ('to_hype', 'from_hype', 'to_ton'));
ALTER TABLE public.relay_swaps ADD COLUMN IF NOT EXISTS recipient text;
ALTER TABLE public.relay_swaps ADD COLUMN IF NOT EXISTS dest_baseline numeric;
ALTER TABLE public.relay_swaps ADD CONSTRAINT relay_swaps_recipient_check CHECK (
  (direction = 'to_ton' AND recipient ~ '^[UE]Q[A-Za-z0-9_-]{46}$') OR (direction <> 'to_ton' AND recipient IS NULL)
);
COMMENT ON COLUMN public.relay_swaps.recipient IS 'TON payouts only: the member''s own TON pocket address (fixed once the deposit is signed).';
COMMENT ON COLUMN public.relay_swaps.dest_baseline IS 'TON payouts only: pocket TON balance noted once just before the deposit is signed.';

CREATE OR REPLACE FUNCTION public.relay_swaps_txid_once() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.deposit_txid IS NOT NULL AND NEW.deposit_txid IS DISTINCT FROM OLD.deposit_txid THEN
    RAISE EXCEPTION 'deposit_txid is write-once';
  END IF;
  IF OLD.request_id IS NOT NULL AND NEW.request_id IS DISTINCT FROM OLD.request_id AND OLD.deposit_txid IS NOT NULL THEN
    RAISE EXCEPTION 'request_id is fixed once the deposit is signed';
  END IF;
  IF NEW.recipient IS DISTINCT FROM OLD.recipient THEN
    RAISE EXCEPTION 'recipient is fixed';
  END IF;
  IF OLD.dest_baseline IS NOT NULL AND NEW.dest_baseline IS DISTINCT FROM OLD.dest_baseline THEN
    RAISE EXCEPTION 'dest_baseline is write-once';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.reserve_relay_swap(_row jsonb, _per_swap_max_usd numeric, _daily_max_usd numeric)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _user uuid := (_row->>'user_id')::uuid;
  _usd numeric := COALESCE((_row->>'amount_usd')::numeric, 0);
  _used numeric;
  _id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('relay_swap:' || _user::text));
  UPDATE public.relay_swaps SET status = 'cancelled', error = COALESCE(error, 'Replaced by a newer swap request'), updated_at = now()
   WHERE user_id = _user AND status = 'awaiting_approval';
  IF EXISTS (SELECT 1 FROM public.relay_swaps WHERE user_id = _user
              AND status NOT IN ('done', 'refunded', 'failed', 'declined', 'expired', 'cancelled')) THEN
    RAISE EXCEPTION 'Another Relay swap is still running. Wait for it to finish.';
  END IF;
  IF _usd > _per_swap_max_usd THEN
    RAISE EXCEPTION 'This swap is over the $% per-swap limit.', _per_swap_max_usd;
  END IF;
  SELECT COALESCE(SUM(amount_usd), 0) INTO _used FROM public.relay_swaps
   WHERE user_id = _user AND status NOT IN ('failed', 'declined', 'expired', 'cancelled') AND created_at > now() - interval '24 hours';
  IF _used + _usd > _daily_max_usd THEN
    RAISE EXCEPTION 'This swap would pass the $% daily limit ($% used in the last 24 hours).', _daily_max_usd, round(_used, 2);
  END IF;
  INSERT INTO public.relay_swaps (user_id, link_id, direction, pocket, amount_in, amount_in_wei, shown_out, min_out_wei, slippage_bps, amount_usd, recipient)
  VALUES (_user, (_row->>'link_id')::uuid, _row->>'direction', _row->>'pocket', (_row->>'amount_in')::numeric, _row->>'amount_in_wei',
    (_row->>'shown_out')::numeric, _row->>'min_out_wei', (_row->>'slippage_bps')::integer, _usd, NULLIF(_row->>'recipient', ''))
  RETURNING id INTO _id;
  RETURN _id;
END $$;

ALTER TABLE public.hype_chains DROP CONSTRAINT hype_chains_direction_check;
ALTER TABLE public.hype_chains ADD CONSTRAINT hype_chains_direction_check CHECK (direction IN ('to_hype', 'from_hype', 'to_ton'));

CREATE OR REPLACE FUNCTION public.reserve_relay_leg(_chain_id uuid, _row jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _c public.hype_chains; _id uuid; _dir text := _row->>'direction';
BEGIN
  SELECT * INTO _c FROM public.hype_chains WHERE id = _chain_id FOR UPDATE;
  IF _c.id IS NULL OR _c.approval_id IS NULL OR _c.status NOT IN ('approved','mid') THEN RAISE EXCEPTION 'This swap is not approved for a Relay step.'; END IF;
  IF _c.pocket <> lower(_row->>'pocket') THEN RAISE EXCEPTION 'Pocket mismatch.'; END IF;
  IF (_c.direction = 'to_ton') <> (_dir = 'to_ton') THEN RAISE EXCEPTION 'Relay step does not match this swap.'; END IF;
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
REVOKE ALL ON FUNCTION public.reserve_relay_swap(jsonb, numeric, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_relay_swap(jsonb, numeric, numeric) TO service_role;