CREATE TABLE public.ignite_admin_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid NOT NULL REFERENCES public.ignite_registrations(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('reminder', 'message')),
  subject text NOT NULL,
  to_email text NOT NULL,
  sent_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed')),
  sent_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.ignite_admin_emails TO service_role;
REVOKE ALL ON public.ignite_admin_emails FROM anon, authenticated, PUBLIC;
ALTER TABLE public.ignite_admin_emails ENABLE ROW LEVEL SECURITY;
CREATE INDEX ignite_admin_emails_reg_idx ON public.ignite_admin_emails (registration_id, sent_at DESC);