CREATE TABLE public.miner_check_health (
  id text PRIMARY KEY DEFAULT 'hme-mining' CHECK (id = 'hme-mining'),
  last_ok_at timestamptz,
  last_fail_at timestamptz,
  last_fail_reason text CHECK (last_fail_reason IS NULL OR length(last_fail_reason) <= 120),
  fails_in_a_row integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.miner_check_health TO service_role;
ALTER TABLE public.miner_check_health ENABLE ROW LEVEL SECURITY;
INSERT INTO public.miner_check_health (id) VALUES ('hme-mining') ON CONFLICT DO NOTHING;