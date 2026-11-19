ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'beta';

CREATE OR REPLACE FUNCTION public.set_beta_role(_actor uuid, _target uuid, _grant boolean)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('seeds:beta_roles'));
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _actor AND role = 'admin') THEN
    RETURN 'not_admin';
  END IF;
  IF _grant THEN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _target AND hm_member_id IS NOT NULL) THEN
      RETURN 'no_hme';
    END IF;
    IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _target AND role::text = 'beta') THEN
      RETURN 'unchanged';
    END IF;
    INSERT INTO public.user_roles (user_id, role) VALUES (_target, 'beta'::public.app_role);
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _target AND role::text = 'beta') THEN
      RETURN 'unchanged';
    END IF;
    DELETE FROM public.user_roles WHERE user_id = _target AND role::text = 'beta';
  END IF;
  INSERT INTO public.admin_role_events (target_id, actor_id, action, role)
  VALUES (_target, _actor, CASE WHEN _grant THEN 'grant' ELSE 'revoke' END, 'beta'::public.app_role);
  RETURN 'ok';
END;
$function$;

REVOKE ALL ON FUNCTION public.set_beta_role(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_beta_role(uuid, uuid, boolean) TO service_role;