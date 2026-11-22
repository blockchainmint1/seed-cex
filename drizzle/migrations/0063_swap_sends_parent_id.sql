ALTER TABLE public.swap_sends ADD COLUMN IF NOT EXISTS parent_id uuid;
COMMENT ON COLUMN public.swap_sends.parent_id IS 'The TSD route or two-step swap this send is a step of (NULL = standalone swap). Set only by reserve_swap_send from _route_id.';
CREATE INDEX IF NOT EXISTS swap_sends_parent_idx ON public.swap_sends (parent_id, created_at DESC) WHERE parent_id IS NOT NULL;

-- Backfill from the rows that already point at their sends.
UPDATE public.swap_sends s SET parent_id = r.id FROM public.tsd_routes r WHERE r.swap_send_id = s.id AND s.parent_id IS NULL;
UPDATE public.swap_sends s SET parent_id = t.id FROM public.two_step_swaps t WHERE (t.swap_send_id = s.id OR t.leg2_swap_send_id = s.id) AND s.parent_id IS NULL;

CREATE OR REPLACE FUNCTION public.reserve_swap_send(_user_id uuid, _link_id uuid, _protocol text, _pocket text, _from_asset text, _to_asset text, _amount_in numeric, _amount_usd numeric, _expected_out numeric, _min_out numeric, _from_address text, _destination text, _vault text, _router text, _memo text, _per_swap_max_usd numeric, _daily_max_usd numeric, _route_id uuid DEFAULT NULL)
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
    expected_out, min_out, from_address, destination, vault, router, memo, parent_id)
  VALUES (_user_id, _link_id, _protocol, _pocket, _from_asset, _to_asset, _amount_in, _amount_usd,
    _expected_out, _min_out, _from_address, _destination, _vault, _router, _memo, _route_id)
  RETURNING id INTO _id;
  RETURN _id;
END;
$function$;
REVOKE ALL ON FUNCTION public.reserve_swap_send(uuid, uuid, text, text, text, text, numeric, numeric, numeric, numeric, text, text, text, text, text, numeric, numeric, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_swap_send(uuid, uuid, text, text, text, text, numeric, numeric, numeric, numeric, text, text, text, text, text, numeric, numeric, uuid) TO service_role;
