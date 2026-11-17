CREATE TABLE public.legacy_account_backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_user_id uuid NOT NULL,
  email text,
  reason text NOT NULL,
  snapshot jsonb NOT NULL,
  backed_up_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX legacy_account_backups_user ON public.legacy_account_backups(legacy_user_id);

CREATE TABLE public.legacy_account_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_user_id uuid NOT NULL,
  hm_member_id text NOT NULL,
  email text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX legacy_account_claims_user_sent ON public.legacy_account_claims(legacy_user_id, created_at);

GRANT ALL ON public.legacy_account_backups TO service_role;
GRANT ALL ON public.legacy_account_claims TO service_role;
REVOKE ALL ON public.legacy_account_backups FROM anon, authenticated;
REVOKE ALL ON public.legacy_account_claims FROM anon, authenticated;
ALTER TABLE public.legacy_account_backups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legacy_account_claims ENABLE ROW LEVEL SECURITY;
-- No policies: server-only (service role).

-- Finds a pre-HME account (no member id yet) by its email. Server-only.
CREATE OR REPLACE FUNCTION public.legacy_user_for_email(_email text)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT u.id FROM auth.users u JOIN public.profiles p ON p.id = u.id
  WHERE lower(u.email) = lower(_email) AND p.hm_member_id IS NULL
  LIMIT 1
$$;

-- Atomically consumes one live claim and attaches the HME member id to the
-- old account. Refuses if the claim is used/expired, the old account is
-- already linked, or the member id already belongs to another account.
CREATE OR REPLACE FUNCTION public.redeem_legacy_claim(_token_hash text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE c public.legacy_account_claims%ROWTYPE; n integer;
BEGIN
  UPDATE public.legacy_account_claims SET consumed_at = now()
   WHERE token_hash = _token_hash AND consumed_at IS NULL AND expires_at > now()
  RETURNING * INTO c;
  IF c.id IS NULL THEN RAISE EXCEPTION 'claim_invalid'; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE hm_member_id = c.hm_member_id) THEN
    RAISE EXCEPTION 'member_already_linked';
  END IF;
  UPDATE public.profiles SET hm_member_id = c.hm_member_id
   WHERE id = c.legacy_user_id AND hm_member_id IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'account_already_linked'; END IF;
  -- Any other outstanding links for this old account stop working.
  UPDATE public.legacy_account_claims SET consumed_at = now()
   WHERE legacy_user_id = c.legacy_user_id AND consumed_at IS NULL;
  RETURN c.legacy_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.legacy_user_for_email(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.redeem_legacy_claim(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.legacy_user_for_email(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.redeem_legacy_claim(text) TO service_role;