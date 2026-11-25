ALTER TABLE public.ton_swaps ADD COLUMN IF NOT EXISTS quote_units numeric CHECK (quote_units IS NULL OR quote_units > 0);
ALTER TABLE public.ton_swaps ADD COLUMN IF NOT EXISTS amount_usd numeric NOT NULL DEFAULT 0 CHECK (amount_usd >= 0);
ALTER TABLE public.ton_swaps DROP CONSTRAINT IF EXISTS ton_swaps_check;
ALTER TABLE public.ton_swaps ADD CONSTRAINT ton_swaps_min_check CHECK (min_out_units > 0 AND min_out_units <= GREATEST(shown_units, COALESCE(quote_units, shown_units)));

CREATE OR REPLACE FUNCTION public.guard_ton_swap() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Swap records cannot be deleted'; END IF;
  IF OLD.txid IS NOT NULL AND NEW.txid IS DISTINCT FROM OLD.txid THEN RAISE EXCEPTION 'A recorded swap transaction id cannot change'; END IF;
  IF OLD.send_meta IS NOT NULL AND NEW.send_meta IS DISTINCT FROM OLD.send_meta THEN RAISE EXCEPTION 'Recorded swap evidence cannot change'; END IF;
  IF NEW.user_id <> OLD.user_id OR NEW.link_id <> OLD.link_id OR NEW.pocket <> OLD.pocket OR NEW.offer_units <> OLD.offer_units
     OR NEW.min_out_units <> OLD.min_out_units OR NEW.usdt_baseline <> OLD.usdt_baseline OR NEW.shown_units <> OLD.shown_units
     OR NEW.quote_units IS DISTINCT FROM OLD.quote_units OR NEW.amount_usd <> OLD.amount_usd THEN
    RAISE EXCEPTION 'Swap terms cannot change';
  END IF;
  IF OLD.status IN ('done', 'refunded', 'failed') AND NEW.status IS DISTINCT FROM OLD.status THEN RAISE EXCEPTION 'A finished swap cannot reopen'; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_ton_swap(_row jsonb, _per_swap_max_usd numeric, _daily_max_usd numeric)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _user uuid := (_row->>'user_id')::uuid;
  _usd numeric := (_row->>'amount_usd')::numeric;
  _used numeric;
  _id uuid;
BEGIN
  IF _usd IS NULL OR _usd <= 0 THEN RAISE EXCEPTION 'Seeds could not price this swap right now. Nothing was sent.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('ton_swap:' || _user::text));
  IF _usd > _per_swap_max_usd THEN
    RAISE EXCEPTION 'This swap is over the $% per-swap limit.', _per_swap_max_usd;
  END IF;
  SELECT COALESCE(SUM(amount_usd), 0) INTO _used FROM public.ton_swaps
   WHERE user_id = _user AND status <> 'failed' AND created_at > now() - interval '24 hours';
  IF _used + _usd > _daily_max_usd THEN
    RAISE EXCEPTION 'This swap would pass the $% daily limit ($% used in the last 24 hours).', _daily_max_usd, round(_used, 2);
  END IF;
  INSERT INTO public.ton_swaps (user_id, link_id, pocket, offer_units, shown_units, quote_units, min_out_units, usdt_baseline, amount_usd)
  VALUES (_user, (_row->>'link_id')::uuid, _row->>'pocket', (_row->>'offer_units')::numeric, (_row->>'shown_units')::numeric,
    (_row->>'quote_units')::numeric, (_row->>'min_out_units')::numeric, (_row->>'usdt_baseline')::numeric, _usd)
  RETURNING id INTO _id;
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.reserve_ton_swap(jsonb, numeric, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ton_swap(jsonb, numeric, numeric) TO service_role;