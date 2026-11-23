CREATE TABLE public.second_factor_trust (
  user_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('totp', 'telegram')),
  ref text NOT NULL CHECK (char_length(ref) BETWEEN 1 AND 80),
  added_at timestamptz NOT NULL DEFAULT now(),
  trusted_at timestamptz,
  trusted_how text CHECK (trusted_how IS NULL OR trusted_how IN ('existing', 'fresh_sign_in', 'step_up')),
  PRIMARY KEY (user_id, kind, ref)
);
GRANT ALL ON public.second_factor_trust TO service_role;
ALTER TABLE public.second_factor_trust ENABLE ROW LEVEL SECURITY;

-- Everything members already have stays trusted (the attack needs a new one).
INSERT INTO public.second_factor_trust (user_id, kind, ref, added_at, trusted_at, trusted_how)
SELECT f.user_id, 'totp', f.id::text, f.created_at, f.created_at, 'existing'
FROM auth.mfa_factors f WHERE f.status = 'verified'
ON CONFLICT DO NOTHING;
INSERT INTO public.second_factor_trust (user_id, kind, ref, added_at, trusted_at, trusted_how)
SELECT p.id, 'telegram', p.telegram_chat_id, coalesce(p.telegram_verified_at, timestamptz '2026-11-01'), coalesce(p.telegram_verified_at, timestamptz '2026-11-01'), 'existing'
FROM public.profiles p WHERE p.telegram_verified IS TRUE AND p.telegram_chat_id IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE TABLE public.step_up_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('key_link', 'confirm_factor', 'telegram_unlink')),
  method text NOT NULL CHECK (method IN ('telegram', 'email')),
  browser_secret_hash text NOT NULL CHECK (browser_secret_hash ~ '^[0-9a-f]{64}$'),
  code_hash text,
  tries integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined', 'used')),
  telegram_chat_id text,
  telegram_message_id bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  decided_at timestamptz,
  used_at timestamptz
);
CREATE INDEX step_up_checks_user_recent ON public.step_up_checks (user_id, created_at DESC);
GRANT ALL ON public.step_up_checks TO service_role;
ALTER TABLE public.step_up_checks ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS telegram_code_trusted boolean NOT NULL DEFAULT false;
ALTER TABLE public.key_signin_requests ADD COLUMN IF NOT EXISTS vault_request jsonb;

CREATE OR REPLACE FUNCTION public.record_client_error(_signature text, _kind text, _message text, _source text, _page text, _browser text, _os text, _viewport text, _version text, _host text, _account uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  g public.client_error_groups;
  fresh boolean := false;
  back boolean := false;
BEGIN
  -- Flood cap: at most 60 new error types per hour; beyond that new kinds are dropped.
  IF NOT EXISTS (SELECT 1 FROM public.client_error_groups WHERE signature = _signature)
     AND (SELECT count(*) FROM public.client_error_groups WHERE first_seen > now() - interval '1 hour') >= 60 THEN
    RETURN 'capped';
  END IF;
  INSERT INTO public.client_error_groups (signature, kind, message, source)
  VALUES (_signature, _kind, _message, _source)
  ON CONFLICT (signature) DO NOTHING;
  fresh := FOUND;
  SELECT * INTO g FROM public.client_error_groups WHERE signature = _signature FOR UPDATE;
  IF NOT fresh THEN
    back := g.handled_at IS NOT NULL;
    UPDATE public.client_error_groups
      SET last_seen = now(), occurrences = occurrences + 1, handled_at = NULL, handled_by = NULL
      WHERE signature = _signature;
  END IF;
  IF (SELECT count(*) FROM public.client_errors WHERE signature = _signature AND created_at > now() - interval '1 day') < 200 THEN
    INSERT INTO public.client_errors (signature, message, source, page_path, browser, os, viewport, app_version, host, account_id)
    VALUES (_signature, _message, _source, _page, _browser, _os, _viewport, _version, _host, _account);
  END IF;
  IF (fresh OR back)
     AND (SELECT count(*) FROM public.client_error_groups WHERE last_alert_at > now() - interval '1 hour') < 10 THEN
    UPDATE public.client_error_groups SET last_alert_at = now() WHERE signature = _signature;
    RETURN CASE WHEN fresh THEN 'alert_new' ELSE 'alert_back' END;
  END IF;
  RETURN 'ok';
END $function$;

CREATE OR REPLACE FUNCTION public.client_errors_prune()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  DELETE FROM public.client_errors WHERE created_at < now() - interval '90 days';
  DELETE FROM public.client_error_groups g
   WHERE g.last_seen < now() - interval '90 days'
     AND NOT EXISTS (SELECT 1 FROM public.client_errors e WHERE e.signature = g.signature);
$function$;