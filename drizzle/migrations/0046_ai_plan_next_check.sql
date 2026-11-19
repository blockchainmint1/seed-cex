ALTER TABLE public.ai_plans ADD COLUMN IF NOT EXISTS next_check_at timestamptz;
-- Existing live plans: their next check is the next time of day they were started (every 24 h from locked_at).
UPDATE public.ai_plans
SET next_check_at = locked_at + (floor(extract(epoch FROM (now() - locked_at)) / 86400) + 1) * interval '1 day'
WHERE next_check_at IS NULL AND locked_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS ai_plans_next_check_idx ON public.ai_plans (next_check_at) WHERE status = 'locked';
COMMENT ON COLUMN public.ai_plans.next_check_at IS 'When this plan''s next daily check (and Telegram message) is due: every 24 hours from locked_at, the time of day it was started. Server-written only.';