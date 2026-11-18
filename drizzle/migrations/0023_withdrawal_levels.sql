CREATE TABLE public.withdrawal_tiers (
  level smallint PRIMARY KEY CHECK (level BETWEEN 1 AND 6),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 40),
  per_withdrawal_usd numeric NOT NULL CHECK (per_withdrawal_usd > 0 AND per_withdrawal_usd <= 100000),
  daily_usd numeric NOT NULL CHECK (daily_usd <= 250000),
  hold_hours integer NOT NULL CHECK (hold_hours BETWEEN 1 AND 168),
  min_account_days integer NOT NULL DEFAULT 0 CHECK (min_account_days BETWEEN 0 AND 3650),
  min_withdrawals integer NOT NULL DEFAULT 0 CHECK (min_withdrawals BETWEEN 0 AND 10000),
  min_withdrawn_usd numeric NOT NULL DEFAULT 0 CHECK (min_withdrawn_usd >= 0 AND min_withdrawn_usd <= 100000000),
  min_trades integer NOT NULL DEFAULT 0 CHECK (min_trades BETWEEN 0 AND 100000),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT withdrawal_tiers_daily_covers_one CHECK (daily_usd >= per_withdrawal_usd)
);
GRANT ALL ON public.withdrawal_tiers TO service_role;
ALTER TABLE public.withdrawal_tiers ENABLE ROW LEVEL SECURITY;

INSERT INTO public.withdrawal_tiers (level, name, per_withdrawal_usd, daily_usd, hold_hours, min_account_days, min_withdrawals, min_withdrawn_usd, min_trades) VALUES
  (1, 'New', 100, 250, 48, 0, 0, 0, 0),
  (2, 'Regular', 250, 1000, 24, 30, 3, 0, 0),
  (3, 'Trusted', 1000, 5000, 24, 90, 10, 1000, 0),
  (4, 'Established', 5000, 20000, 24, 180, 25, 10000, 5);

CREATE TABLE public.withdrawal_limit_overrides (
  user_id uuid PRIMARY KEY,
  tier_level smallint CHECK (tier_level BETWEEN 1 AND 6),
  frozen boolean NOT NULL DEFAULT false,
  note text NOT NULL CHECK (char_length(btrim(note)) BETWEEN 3 AND 300),
  set_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.withdrawal_limit_overrides TO service_role;
ALTER TABLE public.withdrawal_limit_overrides ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.withdrawal_limit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  target_id uuid,
  action text NOT NULL CHECK (action IN ('tiers', 'set', 'clear')),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.withdrawal_limit_events TO service_role;
ALTER TABLE public.withdrawal_limit_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX withdrawal_limit_events_created_idx ON public.withdrawal_limit_events (created_at DESC);

-- Replace every level in one locked step. Returns a result code.
CREATE OR REPLACE FUNCTION public.save_withdrawal_tiers(_actor uuid, _tiers jsonb)
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
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
  INSERT INTO public.withdrawal_tiers (level, name, per_withdrawal_usd, daily_usd, hold_hours, min_account_days, min_withdrawals, min_withdrawn_usd, min_trades, updated_at, updated_by)
  SELECT x.level, btrim(x.name), x.per_withdrawal_usd, x.daily_usd, x.hold_hours, x.min_account_days, x.min_withdrawals, x.min_withdrawn_usd, x.min_trades, now(), _actor
  FROM jsonb_to_recordset(_tiers) AS x(level smallint, name text, per_withdrawal_usd numeric, daily_usd numeric, hold_hours integer,
    min_account_days integer, min_withdrawals integer, min_withdrawn_usd numeric, min_trades integer);
  SELECT count(*), max(level) INTO n, top FROM public.withdrawal_tiers;
  IF n <> top THEN RAISE EXCEPTION 'Levels must be numbered 1, 2, 3… with no gaps.'; END IF;
  IF EXISTS (SELECT 1 FROM public.withdrawal_tiers WHERE level = 1
             AND (min_account_days > 0 OR min_withdrawals > 0 OR min_withdrawn_usd > 0 OR min_trades > 0)) THEN
    RAISE EXCEPTION 'Level 1 is where every new member starts, so it can''t have requirements.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.withdrawal_tiers a JOIN public.withdrawal_tiers b ON b.level = a.level + 1
             WHERE b.per_withdrawal_usd < a.per_withdrawal_usd OR b.daily_usd < a.daily_usd
                OR b.min_account_days < a.min_account_days OR b.min_withdrawals < a.min_withdrawals
                OR b.min_withdrawn_usd < a.min_withdrawn_usd OR b.min_trades < a.min_trades) THEN
    RAISE EXCEPTION 'Each level must allow at least as much as the one below it and ask for at least as much history.';
  END IF;
  INSERT INTO public.withdrawal_limit_events (actor_id, action, detail) VALUES (_actor, 'tiers', jsonb_build_object('tiers', _tiers));
  RETURN 'ok';
END $$;

-- Put one member on a set level / pause them, or hand them back to automatic. Returns a result code.
CREATE OR REPLACE FUNCTION public.set_withdrawal_override(_actor uuid, _target uuid, _tier smallint, _frozen boolean, _note text, _clear boolean)
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('seeds:withdrawal_limits'));
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _actor AND role = 'admin') THEN
    RETURN 'not_admin';
  END IF;
  IF _target = _actor THEN RETURN 'self'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _target) THEN RETURN 'no_account'; END IF;
  IF _clear THEN
    IF NOT EXISTS (SELECT 1 FROM public.withdrawal_limit_overrides WHERE user_id = _target) THEN RETURN 'unchanged'; END IF;
    DELETE FROM public.withdrawal_limit_overrides WHERE user_id = _target;
    INSERT INTO public.withdrawal_limit_events (actor_id, target_id, action, detail)
    VALUES (_actor, _target, 'clear', jsonb_build_object('note', coalesce(btrim(_note), '')));
    RETURN 'ok';
  END IF;
  IF _note IS NULL OR char_length(btrim(_note)) NOT BETWEEN 3 AND 300 THEN RETURN 'need_note'; END IF;
  IF _tier IS NULL AND NOT _frozen THEN RETURN 'unchanged'; END IF;
  IF _tier IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.withdrawal_tiers WHERE level = _tier) THEN RETURN 'no_tier'; END IF;
  INSERT INTO public.withdrawal_limit_overrides (user_id, tier_level, frozen, note, set_by, updated_at)
  VALUES (_target, _tier, _frozen, btrim(_note), _actor, now())
  ON CONFLICT (user_id) DO UPDATE SET tier_level = EXCLUDED.tier_level, frozen = EXCLUDED.frozen, note = EXCLUDED.note,
    set_by = EXCLUDED.set_by, updated_at = now();
  INSERT INTO public.withdrawal_limit_events (actor_id, target_id, action, detail)
  VALUES (_actor, _target, 'set', jsonb_build_object('tier', _tier, 'frozen', _frozen, 'note', btrim(_note)));
  RETURN 'ok';
END $$;

REVOKE ALL ON FUNCTION public.save_withdrawal_tiers(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_withdrawal_override(uuid, uuid, smallint, boolean, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_withdrawal_tiers(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_withdrawal_override(uuid, uuid, smallint, boolean, text, boolean) TO service_role;