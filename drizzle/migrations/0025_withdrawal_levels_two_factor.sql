ALTER TABLE public.withdrawal_tiers ADD COLUMN IF NOT EXISTS requires_2fa boolean NOT NULL DEFAULT false;
ALTER TABLE public.withdrawal_tiers ADD CONSTRAINT withdrawal_tiers_level1_no_2fa CHECK (level > 1 OR NOT requires_2fa);
UPDATE public.withdrawal_tiers SET requires_2fa = (level >= 2);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS two_factor_on boolean NOT NULL DEFAULT false;

ALTER TABLE public.withdrawal_limit_events DROP CONSTRAINT withdrawal_limit_events_action_check;
ALTER TABLE public.withdrawal_limit_events ADD CONSTRAINT withdrawal_limit_events_action_check
  CHECK (action = ANY (ARRAY['tiers'::text, 'set'::text, 'clear'::text, 'reset_2fa'::text]));

CREATE OR REPLACE FUNCTION public.save_withdrawal_tiers(_actor uuid, _tiers jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE n integer; top integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('seeds:withdrawal_limits'));
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _actor AND role = 'admin') THEN
    RETURN 'not_admin';
  END IF;
  IF jsonb_typeof(_tiers) <> 'array' OR jsonb_array_length(_tiers) NOT BETWEEN 1 AND 6 THEN
    RETURN 'bad_tiers';
  END IF;
  DELETE FROM public.withdrawal_tiers WHERE true;
  INSERT INTO public.withdrawal_tiers (level, name, per_withdrawal_usd, daily_usd, hold_hours, min_account_days, min_withdrawals, min_withdrawn_usd, min_trades, requires_2fa, updated_at, updated_by)
  SELECT x.level, btrim(x.name), x.per_withdrawal_usd, x.daily_usd, x.hold_hours, x.min_account_days, x.min_withdrawals, x.min_withdrawn_usd, x.min_trades,
    coalesce(x.requires_2fa, false), now(), _actor
  FROM jsonb_to_recordset(_tiers) AS x(level smallint, name text, per_withdrawal_usd numeric, daily_usd numeric, hold_hours integer,
    min_account_days integer, min_withdrawals integer, min_withdrawn_usd numeric, min_trades integer, requires_2fa boolean);
  SELECT count(*), max(level) INTO n, top FROM public.withdrawal_tiers;
  IF n <> top THEN RAISE EXCEPTION 'Levels must be numbered 1, 2, 3… with no gaps.'; END IF;
  IF EXISTS (SELECT 1 FROM public.withdrawal_tiers WHERE level = 1
             AND (min_account_days > 0 OR min_withdrawals > 0 OR min_withdrawn_usd > 0 OR min_trades > 0 OR requires_2fa)) THEN
    RAISE EXCEPTION 'Level 1 is where every new member starts, so it can''t have requirements.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.withdrawal_tiers a JOIN public.withdrawal_tiers b ON b.level = a.level + 1
             WHERE b.per_withdrawal_usd < a.per_withdrawal_usd OR b.daily_usd < a.daily_usd
                OR b.min_account_days < a.min_account_days OR b.min_withdrawals < a.min_withdrawals
                OR b.min_withdrawn_usd < a.min_withdrawn_usd OR b.min_trades < a.min_trades
                OR (a.requires_2fa AND NOT b.requires_2fa)) THEN
    RAISE EXCEPTION 'Each level must allow at least as much as the one below it and ask for at least as much history.';
  END IF;
  INSERT INTO public.withdrawal_limit_events (actor_id, action, detail) VALUES (_actor, 'tiers', jsonb_build_object('tiers', _tiers));
  RETURN 'ok';
END $function$;

REVOKE EXECUTE ON FUNCTION public.save_withdrawal_tiers(uuid, jsonb) FROM PUBLIC, anon, authenticated;