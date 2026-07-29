-- user_roles: explicit deny of client writes, only service_role may write
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.user_roles FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.user_roles FROM anon;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_roles_no_client_insert ON public.user_roles;
CREATE POLICY user_roles_no_client_insert ON public.user_roles
  AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (false);

DROP POLICY IF EXISTS user_roles_no_client_update ON public.user_roles;
CREATE POLICY user_roles_no_client_update ON public.user_roles
  AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS user_roles_no_client_delete ON public.user_roles;
CREATE POLICY user_roles_no_client_delete ON public.user_roles
  AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (false);

-- wallet_auth_challenges: no client access at all
REVOKE ALL ON public.wallet_auth_challenges FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.wallet_auth_challenges TO service_role;
ALTER TABLE public.wallet_auth_challenges FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wallet_auth_challenges_no_client_access ON public.wallet_auth_challenges;
CREATE POLICY wallet_auth_challenges_no_client_access ON public.wallet_auth_challenges
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- purge consumed/expired challenges
CREATE OR REPLACE FUNCTION public.purge_expired_wallet_challenges()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE removed integer;
BEGIN
  WITH gone AS (
    DELETE FROM public.wallet_auth_challenges
    WHERE expires_at <= now() OR consumed_at IS NOT NULL
    RETURNING 1
  )
  SELECT count(*) INTO removed FROM gone;
  RETURN removed;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_wallet_challenges() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_wallet_challenges() TO service_role;

SELECT public.purge_expired_wallet_challenges();