CREATE TABLE public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'bot key',
  key_id text NOT NULL UNIQUE,
  secret text NOT NULL,
  scopes text[] NOT NULL DEFAULT ARRAY['read']::text[],
  ip_allowlist text[] NOT NULL DEFAULT ARRAY[]::text[],
  enabled boolean NOT NULL DEFAULT true,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX api_keys_user_idx ON public.api_keys(user_id);

GRANT SELECT (id, user_id, label, key_id, scopes, ip_allowlist, enabled, last_used_at, created_at) ON public.api_keys TO authenticated;
GRANT UPDATE (label, enabled, ip_allowlist) ON public.api_keys TO authenticated;
GRANT DELETE ON public.api_keys TO authenticated;
GRANT ALL ON public.api_keys TO service_role;

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys FORCE ROW LEVEL SECURITY;

CREATE POLICY "api_keys_owner_select" ON public.api_keys
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "api_keys_owner_update" ON public.api_keys
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "api_keys_owner_delete" ON public.api_keys
  FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "api_keys_service_all" ON public.api_keys
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.api_rate_buckets (
  key_id text NOT NULL,
  window_start timestamptz NOT NULL,
  weight integer NOT NULL DEFAULT 0,
  PRIMARY KEY (key_id, window_start)
);

GRANT ALL ON public.api_rate_buckets TO service_role;
ALTER TABLE public.api_rate_buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_rate_buckets FORCE ROW LEVEL SECURITY;
CREATE POLICY "api_rate_buckets_service_all" ON public.api_rate_buckets
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.api_bump_rate(_key text, _weight integer, _window timestamptz)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total integer;
BEGIN
  INSERT INTO public.api_rate_buckets (key_id, window_start, weight)
  VALUES (_key, _window, _weight)
  ON CONFLICT (key_id, window_start)
  DO UPDATE SET weight = public.api_rate_buckets.weight + EXCLUDED.weight
  RETURNING weight INTO total;

  DELETE FROM public.api_rate_buckets WHERE window_start < _window - interval '10 minutes';
  RETURN total;
END;
$$;

REVOKE ALL ON FUNCTION public.api_bump_rate(text, integer, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_bump_rate(text, integer, timestamptz) TO service_role;