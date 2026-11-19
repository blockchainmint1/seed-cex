ALTER TABLE public.ai_settings ADD COLUMN IF NOT EXISTS admin_execution_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE public.ai_plans ADD COLUMN IF NOT EXISTS execute boolean NOT NULL DEFAULT false;
ALTER TABLE public.ai_plans ADD COLUMN IF NOT EXISTS execute_since timestamptz;

ALTER TABLE public.ai_plan_checks ADD COLUMN IF NOT EXISTS exec_status text NOT NULL DEFAULT 'none';
ALTER TABLE public.ai_plan_checks ADD COLUMN IF NOT EXISTS exec_total_usd numeric;
ALTER TABLE public.ai_plan_checks ADD COLUMN IF NOT EXISTS exec_expires_at timestamptz;
ALTER TABLE public.ai_plan_checks ADD COLUMN IF NOT EXISTS exec_decided_at timestamptz;
ALTER TABLE public.ai_plan_checks ADD COLUMN IF NOT EXISTS exec_decided_via text;
ALTER TABLE public.ai_plan_checks ADD COLUMN IF NOT EXISTS exec_telegram_chat_id text;
ALTER TABLE public.ai_plan_checks ADD COLUMN IF NOT EXISTS exec_telegram_message_id bigint;
ALTER TABLE public.ai_plan_checks DROP CONSTRAINT IF EXISTS ai_plan_checks_exec_status_check;
ALTER TABLE public.ai_plan_checks ADD CONSTRAINT ai_plan_checks_exec_status_check
  CHECK (exec_status IN ('none','waiting','approved','declined','expired','cancelled','running','done','partial'));

CREATE TABLE public.ai_plan_moves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id uuid NOT NULL REFERENCES public.ai_plan_checks(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.ai_plans(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  seq integer NOT NULL,
  side text NOT NULL CHECK (side IN ('buy','sell')),
  coin_id text NOT NULL,
  swap_coin text NOT NULL,
  usd numeric NOT NULL CHECK (usd > 0),
  amount numeric NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','starting','running','done','failed','skipped','cancelled')),
  route_id uuid,
  amount_in numeric,
  amount_out numeric,
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (check_id, seq)
);
GRANT SELECT ON public.ai_plan_moves TO authenticated;
GRANT ALL ON public.ai_plan_moves TO service_role;
ALTER TABLE public.ai_plan_moves ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read their own AI plan trades" ON public.ai_plan_moves FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX ai_plan_moves_open ON public.ai_plan_moves (status) WHERE status IN ('queued','starting','running');
CREATE INDEX ai_plan_moves_plan ON public.ai_plan_moves (plan_id, created_at DESC);
-- One swap per plan trade, and one unfinished trade per member at a time.
CREATE UNIQUE INDEX ai_plan_moves_route ON public.ai_plan_moves (route_id) WHERE route_id IS NOT NULL;
CREATE UNIQUE INDEX ai_plan_moves_one_active ON public.ai_plan_moves (user_id) WHERE status IN ('starting','running');