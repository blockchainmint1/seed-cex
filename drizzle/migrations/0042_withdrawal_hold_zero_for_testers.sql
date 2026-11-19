CREATE OR REPLACE FUNCTION public.reserve_pocket_withdrawal(_user_id uuid, _link_id uuid, _coin text, _amount numeric, _amount_units text, _amount_usd numeric, _from_address text, _to_address text, _hold_hours integer, _per_max_usd numeric, _daily_max_usd numeric, _max_held integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _used numeric; _held int; _id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('pocket_withdrawal:' || _user_id::text));
  -- 0 = beta testers (no hold); member levels always pass at least one hour.
  IF _hold_hours < 0 THEN RAISE EXCEPTION 'Hold can''t be negative.'; END IF;
  IF _amount_usd > _per_max_usd THEN
    RAISE EXCEPTION 'This withdrawal is over the $% per-withdrawal limit.', _per_max_usd;
  END IF;
  SELECT count(*) INTO _held FROM public.pocket_withdrawals WHERE user_id = _user_id AND status IN ('held', 'signing');
  IF _held >= _max_held THEN
    RAISE EXCEPTION 'You already have % withdrawals waiting. Let one finish or cancel one first.', _held;
  END IF;
  SELECT COALESCE(SUM(amount_usd), 0) INTO _used FROM public.pocket_withdrawals
   WHERE user_id = _user_id AND status NOT IN ('failed', 'cancelled') AND created_at > now() - interval '24 hours';
  IF _used + _amount_usd > _daily_max_usd THEN
    RAISE EXCEPTION 'This would pass the $% daily withdrawal limit ($% used in the last 24 hours).', _daily_max_usd, round(_used, 2);
  END IF;
  INSERT INTO public.pocket_withdrawals (user_id, link_id, coin, amount, amount_units, amount_usd, from_address, to_address, release_at)
  VALUES (_user_id, _link_id, _coin, _amount, _amount_units, _amount_usd, _from_address, _to_address, now() + make_interval(hours => _hold_hours))
  RETURNING id INTO _id;
  RETURN _id;
END $function$;