
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE TABLE public.custody_attestations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taken_at timestamptz NOT NULL DEFAULT now(),
  keys_held integer NOT NULL DEFAULT 0,
  keys_wiped integer NOT NULL DEFAULT 0
);

GRANT SELECT ON public.custody_attestations TO anon, authenticated;
GRANT ALL ON public.custody_attestations TO service_role;
ALTER TABLE public.custody_attestations ENABLE ROW LEVEL SECURITY;
CREATE POLICY custody_attestations_public_read ON public.custody_attestations
  FOR SELECT TO anon, authenticated USING (true);

CREATE INDEX custody_attestations_taken_at_idx ON public.custody_attestations (taken_at DESC);

-- Hard wipe of expired/revoked delegated keys + attestation row.
CREATE OR REPLACE FUNCTION public.purge_expired_delegations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE wiped integer; held integer;
BEGIN
  WITH gone AS (
    DELETE FROM public.wallet_delegations
    WHERE expires_at <= now() OR revoked_at IS NOT NULL
    RETURNING 1
  )
  SELECT count(*) INTO wiped FROM gone;

  SELECT count(*) INTO held FROM public.wallet_delegations;

  INSERT INTO public.custody_attestations (keys_held, keys_wiped)
  VALUES (held, wiped);

  RETURN wiped;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_delegations() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_delegations() TO service_role;

-- Public, privacy-safe custody snapshot: counts only, never identities.
CREATE OR REPLACE FUNCTION public.custody_snapshot()
RETURNS TABLE (keys_held integer, next_expiry timestamptz, last_sweep timestamptz, last_wiped integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (SELECT count(*)::integer FROM public.wallet_delegations
       WHERE revoked_at IS NULL AND expires_at > now()),
    (SELECT min(expires_at) FROM public.wallet_delegations
       WHERE revoked_at IS NULL AND expires_at > now()),
    (SELECT max(taken_at) FROM public.custody_attestations),
    (SELECT keys_wiped FROM public.custody_attestations ORDER BY taken_at DESC LIMIT 1)
$$;

REVOKE ALL ON FUNCTION public.custody_snapshot() FROM public;
GRANT EXECUTE ON FUNCTION public.custody_snapshot() TO anon, authenticated, service_role;
