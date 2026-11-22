CREATE TABLE public.pocket_spend_locks (
  user_id uuid PRIMARY KEY,
  token uuid NOT NULL,
  expires_at timestamptz NOT NULL
);
GRANT ALL ON public.pocket_spend_locks TO service_role;
ALTER TABLE public.pocket_spend_locks ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.pocket_spend_locks IS 'Audit C2: one check-and-hold at a time per member (lease, expires on its own). Server only.';

CREATE OR REPLACE FUNCTION public.claim_pocket_spend_lock(_user uuid, _token uuid, _ttl_seconds integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _ttl_seconds IS NULL OR _ttl_seconds < 1 OR _ttl_seconds > 300 THEN
    RAISE EXCEPTION 'bad lock time';
  END IF;
  INSERT INTO public.pocket_spend_locks (user_id, token, expires_at)
  VALUES (_user, _token, now() + make_interval(secs => _ttl_seconds))
  ON CONFLICT (user_id) DO UPDATE
    SET token = EXCLUDED.token, expires_at = EXCLUDED.expires_at
    WHERE public.pocket_spend_locks.expires_at < now();
  RETURN EXISTS (SELECT 1 FROM public.pocket_spend_locks WHERE user_id = _user AND token = _token);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_pocket_spend_lock(_user uuid, _token uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.pocket_spend_locks WHERE user_id = _user AND token = _token;
$$;

REVOKE ALL ON FUNCTION public.claim_pocket_spend_lock(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_pocket_spend_lock(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_pocket_spend_lock(uuid, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_pocket_spend_lock(uuid, uuid) TO service_role;

CREATE TABLE public.order_cover_flags (
  user_id uuid NOT NULL,
  leg text NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, leg)
);
GRANT ALL ON public.order_cover_flags TO service_role;
ALTER TABLE public.order_cover_flags ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.order_cover_flags IS 'Audit C1: first time the order watch saw a coin short; orders are cancelled only if still short on a later run. Server only.';