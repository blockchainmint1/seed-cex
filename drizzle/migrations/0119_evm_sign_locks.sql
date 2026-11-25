CREATE TABLE public.evm_sign_locks (
  lock_key text PRIMARY KEY,
  token uuid NOT NULL,
  expires_at timestamptz NOT NULL
);
GRANT ALL ON public.evm_sign_locks TO service_role;
ALTER TABLE public.evm_sign_locks ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.evm_sign_locks IS 'Audit LN2: one nonce-fetch-to-broadcast at a time per EVM pocket address and chain, across every engine (lease, expires on its own). Server only.';

CREATE OR REPLACE FUNCTION public.claim_evm_sign_lock(_key text, _token uuid, _ttl_seconds integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _ttl_seconds IS NULL OR _ttl_seconds < 1 OR _ttl_seconds > 300 THEN RAISE EXCEPTION 'bad lock time'; END IF;
  IF _key IS NULL OR length(_key) > 120 THEN RAISE EXCEPTION 'bad lock key'; END IF;
  INSERT INTO public.evm_sign_locks (lock_key, token, expires_at)
  VALUES (_key, _token, now() + make_interval(secs => _ttl_seconds))
  ON CONFLICT (lock_key) DO UPDATE SET token = EXCLUDED.token, expires_at = EXCLUDED.expires_at
    WHERE public.evm_sign_locks.expires_at < now();
  RETURN EXISTS (SELECT 1 FROM public.evm_sign_locks WHERE lock_key = _key AND token = _token);
END; $$;

CREATE OR REPLACE FUNCTION public.release_evm_sign_lock(_key text, _token uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.evm_sign_locks WHERE lock_key = _key AND token = _token;
$$;

REVOKE ALL ON FUNCTION public.claim_evm_sign_lock(text, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_evm_sign_lock(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_evm_sign_lock(text, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_evm_sign_lock(text, uuid) TO service_role;