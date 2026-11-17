CREATE TABLE public.ignite_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  hm_member_id text,
  full_name text NOT NULL,
  email text NOT NULL,
  country_code text NOT NULL,
  phone text NOT NULL,
  marketing_opt_in boolean NOT NULL DEFAULT false,
  amount_usd numeric NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','underpaid','confirmed','expired','canceled')),
  payment_method text NOT NULL DEFAULT 'nectarpay',
  invoice_id text UNIQUE,
  checkout_url text,
  invoice_expires_at timestamptz,
  paid_amount_usd numeric,
  paid_chain text,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ignite_registrations TO authenticated;
GRANT ALL ON public.ignite_registrations TO service_role;
ALTER TABLE public.ignite_registrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read own registration" ON public.ignite_registrations FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.nectarpay_events (
  event_id text PRIMARY KEY,
  type text NOT NULL,
  invoice_id text,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.nectarpay_events TO service_role;
ALTER TABLE public.nectarpay_events ENABLE ROW LEVEL SECURITY;