CREATE TABLE public.admin_role_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('grant', 'revoke')),
  role public.app_role NOT NULL DEFAULT 'admin',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.admin_role_events TO service_role;
REVOKE ALL ON public.admin_role_events FROM anon, authenticated, PUBLIC;
ALTER TABLE public.admin_role_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX admin_role_events_created_idx ON public.admin_role_events (created_at DESC);

-- Grant or remove the admin role. Server-only (service_role); runs as the caller so RLS stays as-is.
-- All admin changes are serialized so two removals can't race past the last-admin check.
CREATE OR REPLACE FUNCTION public.set_admin_role(_actor uuid, _target uuid, _grant boolean)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('seeds:admin_roles'));
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _actor AND role = 'admin') THEN
    RETURN 'not_admin';
  END IF;
  IF _grant THEN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _target AND hm_member_id IS NOT NULL) THEN
      RETURN 'no_hme';
    END IF;
    IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _target AND role = 'admin') THEN
      RETURN 'unchanged';
    END IF;
    INSERT INTO public.user_roles (user_id, role) VALUES (_target, 'admin');
  ELSE
    IF _target = _actor THEN
      RETURN 'self';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _target AND role = 'admin') THEN
      RETURN 'unchanged';
    END IF;
    SELECT count(*) INTO n FROM public.user_roles WHERE role = 'admin';
    IF n <= 1 THEN
      RETURN 'last_admin';
    END IF;
    DELETE FROM public.user_roles WHERE user_id = _target AND role = 'admin';
  END IF;
  INSERT INTO public.admin_role_events (target_id, actor_id, action)
  VALUES (_target, _actor, CASE WHEN _grant THEN 'grant' ELSE 'revoke' END);
  RETURN 'ok';
END;
$$;
REVOKE ALL ON FUNCTION public.set_admin_role(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_admin_role(uuid, uuid, boolean) TO service_role;