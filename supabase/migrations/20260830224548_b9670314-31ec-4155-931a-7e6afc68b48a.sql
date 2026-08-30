ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS telegram_chat_id text,
  ADD COLUMN IF NOT EXISTS telegram_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS telegram_code text,
  ADD COLUMN IF NOT EXISTS telegram_code_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS notify_order_filled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_settlement boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_settlement_failed boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_auth_expiring boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_deposit boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_login boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_weekly_digest boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_auth_cap numeric,
  ADD COLUMN IF NOT EXISTS default_auth_hours integer NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS confirm_before_order boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS default_pair text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_own_select" ON public.profiles;
CREATE POLICY "profiles_own_select" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
DROP POLICY IF EXISTS "profiles_own_insert" ON public.profiles;
CREATE POLICY "profiles_own_insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "profiles_own_update" ON public.profiles;
CREATE POLICY "profiles_own_update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "profiles_own_delete" ON public.profiles;
CREATE POLICY "profiles_own_delete" ON public.profiles FOR DELETE TO authenticated USING (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS profiles_touch_updated_at ON public.profiles;
CREATE TRIGGER profiles_touch_updated_at BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();