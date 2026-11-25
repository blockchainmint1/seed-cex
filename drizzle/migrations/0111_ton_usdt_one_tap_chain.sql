ALTER TABLE public.hype_chains DROP CONSTRAINT hype_chains_direction_check;
ALTER TABLE public.hype_chains ADD CONSTRAINT hype_chains_direction_check CHECK (direction IN ('to_hype', 'from_hype', 'to_ton', 'to_ton_usdt'));
ALTER TABLE public.hype_chains DROP CONSTRAINT hype_chains_status_check;
ALTER TABLE public.hype_chains ADD CONSTRAINT hype_chains_status_check CHECK (status IN ('awaiting_approval','approved','leg1','mid','leg2','mid2','leg3','done','failed','kept_mid','declined','expired','cancelled'));
ALTER TABLE public.hype_chains ADD COLUMN IF NOT EXISTS final_min numeric CHECK (final_min IS NULL OR final_min > 0);
ALTER TABLE public.hype_chains ADD COLUMN IF NOT EXISTS ton_baseline_nano text CHECK (ton_baseline_nano IS NULL OR ton_baseline_nano ~ '^[0-9]+$');
ALTER TABLE public.hype_chains ADD COLUMN IF NOT EXISTS ton_amount numeric;
ALTER TABLE public.hype_chains ADD COLUMN IF NOT EXISTS leg3_id uuid;
ALTER TABLE public.hype_chains ADD CONSTRAINT hype_chains_final_check CHECK ((direction = 'to_ton_usdt') = (final_min IS NOT NULL));

CREATE OR REPLACE FUNCTION public.hype_chains_write_once() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.eth_baseline_wei IS NOT NULL AND NEW.eth_baseline_wei IS DISTINCT FROM OLD.eth_baseline_wei THEN RAISE EXCEPTION 'eth_baseline_wei is write-once'; END IF;
  IF NEW.eth_baseline_wei IS NOT NULL AND OLD.eth_baseline_wei IS NULL AND OLD.status <> 'approved' THEN RAISE EXCEPTION 'baseline only while approved'; END IF;
  IF OLD.ton_baseline_nano IS NOT NULL AND NEW.ton_baseline_nano IS DISTINCT FROM OLD.ton_baseline_nano THEN RAISE EXCEPTION 'ton_baseline_nano is write-once'; END IF;
  IF NEW.ton_baseline_nano IS NOT NULL AND OLD.ton_baseline_nano IS NULL AND (OLD.status <> 'mid' OR OLD.leg2_id IS NOT NULL) THEN RAISE EXCEPTION 'TON baseline only before step 2'; END IF;
  IF OLD.final_min IS DISTINCT FROM NEW.final_min THEN RAISE EXCEPTION 'final_min is fixed'; END IF;
  IF OLD.leg1_id IS NOT NULL AND NEW.leg1_id IS DISTINCT FROM OLD.leg1_id THEN RAISE EXCEPTION 'leg1_id is write-once'; END IF;
  IF OLD.leg2_id IS NOT NULL AND NEW.leg2_id IS DISTINCT FROM OLD.leg2_id THEN RAISE EXCEPTION 'leg2_id is write-once'; END IF;
  IF OLD.leg3_id IS NOT NULL AND NEW.leg3_id IS DISTINCT FROM OLD.leg3_id THEN RAISE EXCEPTION 'leg3_id is write-once'; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.reserve_hype_chain(_row jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _user uuid := (_row->>'user_id')::uuid; _id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('hype_chain:' || _user::text));
  UPDATE public.hype_chains SET status = 'cancelled', error = COALESCE(error, 'Replaced by a newer swap request'), updated_at = now()
   WHERE user_id = _user AND status = 'awaiting_approval';
  IF EXISTS (SELECT 1 FROM public.hype_chains WHERE user_id = _user AND status NOT IN ('done','failed','kept_mid','declined','expired','cancelled')) THEN
    RAISE EXCEPTION 'Another chained swap is still running. Wait for it to finish.';
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

-- The Relay step of a TON-ending chain (to_ton or to_ton_usdt) is a to_ton Relay swap.
CREATE OR REPLACE FUNCTION public.hype_chain_relay_dir_ok(_chain text, _relay text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT (_chain IN ('to_ton','to_ton_usdt')) = (_relay = 'to_ton')
$$;

ALTER TABLE public.ton_swaps ADD COLUMN IF NOT EXISTS parent_id uuid;
CREATE INDEX IF NOT EXISTS ton_swaps_parent_idx ON public.ton_swaps (parent_id) WHERE parent_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.reserve_ton_swap(_row jsonb, _per_swap_max_usd numeric, _daily_max_usd numeric)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _user uuid := (_row->>'user_id')::uuid;
  _usd numeric := (_row->>'amount_usd')::numeric;
  _parent uuid := NULLIF(_row->>'parent_id','')::uuid;
  _used numeric;
  _id uuid;
BEGIN
  IF _usd IS NULL OR _usd <= 0 THEN RAISE EXCEPTION 'Seeds could not price this swap right now. Nothing was sent.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('ton_swap:' || _user::text));
  IF _parent IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.hype_chains WHERE id = _parent AND user_id = _user AND direction = 'to_ton_usdt' AND status = 'mid2' AND leg3_id IS NULL) THEN
    RAISE EXCEPTION 'This chained swap is not ready for its TON step.';
  END IF;
  IF _usd > _per_swap_max_usd THEN
    RAISE EXCEPTION 'This swap is over the $% per-swap limit.', _per_swap_max_usd;
  END IF;
  SELECT COALESCE(SUM(amount_usd), 0) INTO _used FROM public.ton_swaps
   WHERE user_id = _user AND status <> 'failed' AND created_at > now() - interval '24 hours';
  IF _used + _usd > _daily_max_usd THEN
    RAISE EXCEPTION 'This swap would pass the $% daily limit ($% used in the last 24 hours).', _daily_max_usd, round(_used, 2);
  END IF;
  INSERT INTO public.ton_swaps (user_id, link_id, pocket, offer_units, shown_units, quote_units, min_out_units, usdt_baseline, amount_usd, parent_id)
  VALUES (_user, (_row->>'link_id')::uuid, _row->>'pocket', (_row->>'offer_units')::numeric, (_row->>'shown_units')::numeric,
    (_row->>'quote_units')::numeric, (_row->>'min_out_units')::numeric, (_row->>'usdt_baseline')::numeric, _usd, _parent)
  RETURNING id INTO _id;
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.reserve_ton_swap(jsonb, numeric, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ton_swap(jsonb, numeric, numeric) TO service_role;