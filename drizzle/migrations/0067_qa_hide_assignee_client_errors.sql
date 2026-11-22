REVOKE SELECT ON public.qa_reports FROM authenticated;
GRANT SELECT (id, ref_no, reporter_id, category, title, description, expected, actual, steps, status, severity, duplicate_of, page_path, app_version, browser, os, viewport, created_at, updated_at) ON public.qa_reports TO authenticated;

ALTER TABLE public.qa_settings ADD COLUMN IF NOT EXISTS error_log_enabled boolean NOT NULL DEFAULT true;

CREATE TABLE public.client_error_groups (
  signature text PRIMARY KEY CHECK (signature ~ '^[0-9a-f]{32}$'),
  kind text NOT NULL CHECK (kind IN ('error','rejection')),
  message text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 500),
  source text NOT NULL DEFAULT '' CHECK (char_length(source) <= 200),
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  occurrences bigint NOT NULL DEFAULT 1,
  handled_at timestamptz,
  handled_by uuid,
  last_alert_at timestamptz
);
CREATE INDEX client_error_groups_last_idx ON public.client_error_groups (last_seen DESC);
GRANT ALL ON public.client_error_groups TO service_role;
ALTER TABLE public.client_error_groups ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.client_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signature text NOT NULL REFERENCES public.client_error_groups(signature),
  message text NOT NULL CHECK (char_length(message) <= 500),
  source text NOT NULL DEFAULT '' CHECK (char_length(source) <= 200),
  page_path text NOT NULL DEFAULT '' CHECK (char_length(page_path) <= 300),
  browser text NOT NULL DEFAULT '' CHECK (char_length(browser) <= 80),
  os text NOT NULL DEFAULT '' CHECK (char_length(os) <= 80),
  viewport text NOT NULL DEFAULT '' CHECK (char_length(viewport) <= 40),
  app_version text NOT NULL DEFAULT '' CHECK (char_length(app_version) <= 80),
  host text NOT NULL DEFAULT 'other' CHECK (host IN ('live','preview','other')),
  account_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX client_errors_sig_idx ON public.client_errors (signature, created_at DESC);
CREATE INDEX client_errors_created_idx ON public.client_errors (created_at);
GRANT ALL ON public.client_errors TO service_role;
ALTER TABLE public.client_errors ENABLE ROW LEVEL SECURITY;

-- One call per reported error: group upsert, capped detail row, and whether to alert
-- ('alert' = new or came back after being handled, max 10 alerts an hour overall).
CREATE OR REPLACE FUNCTION public.record_client_error(
  _signature text, _kind text, _message text, _source text, _page text, _browser text, _os text,
  _viewport text, _version text, _host text, _account uuid
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  g public.client_error_groups;
  fresh boolean := false;
  back boolean := false;
BEGIN
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
END $$;
REVOKE ALL ON FUNCTION public.record_client_error(text, text, text, text, text, text, text, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_client_error(text, text, text, text, text, text, text, text, text, text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.client_errors_prune() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.client_errors WHERE created_at < now() - interval '90 days';
$$;
REVOKE ALL ON FUNCTION public.client_errors_prune() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.client_errors_prune() TO service_role;