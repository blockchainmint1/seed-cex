ALTER TABLE public.ai_settings ADD COLUMN IF NOT EXISTS one_tap_member_max_usd numeric NOT NULL DEFAULT 1000;
COMMENT ON COLUMN public.ai_settings.one_tap_limit_usd IS 'Default one-tap Telegram limit (USD) for Seeds AI trade days, for members who have not set their own.';
COMMENT ON COLUMN public.ai_settings.one_tap_member_max_usd IS 'Highest one-tap Telegram limit (USD) a member may set for themselves.';

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS one_tap_limit_usd numeric;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS one_tap_limit_set_at timestamptz;
COMMENT ON COLUMN public.profiles.one_tap_limit_usd IS 'Member''s own one-tap Telegram limit (USD); null = Seeds default. Server-written only; raising it needs a fresh two-factor code.';

CREATE TABLE public.one_tap_limit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  old_limit_usd numeric,
  new_limit_usd numeric,
  with_code boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.one_tap_limit_events TO service_role;
ALTER TABLE public.one_tap_limit_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX one_tap_limit_events_user_idx ON public.one_tap_limit_events (user_id, created_at DESC);