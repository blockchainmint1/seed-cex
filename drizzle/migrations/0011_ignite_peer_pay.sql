CREATE TABLE public.ignite_peer_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid NOT NULL REFERENCES public.ignite_registrations(id) ON DELETE CASCADE,
  registrant_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled','replaced','paid','paid_duplicate')),
  expires_at timestamptz NOT NULL,
  payer_id uuid,
  payer_name text,
  payer_email text,
  payer_hm_member_id text,
  invoice_id text UNIQUE,
  opened_at timestamptz,
  paid_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ignite_peer_links_one_active ON public.ignite_peer_links(registration_id) WHERE status = 'active';
CREATE INDEX ignite_peer_links_registrant ON public.ignite_peer_links(registrant_id);

CREATE TABLE public.ignite_peer_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id uuid NOT NULL REFERENCES public.ignite_peer_links(id) ON DELETE CASCADE,
  registrant_id uuid NOT NULL,
  to_email text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ignite_peer_emails_registrant_sent ON public.ignite_peer_emails(registrant_id, sent_at);

GRANT ALL ON public.ignite_peer_links TO service_role;
GRANT ALL ON public.ignite_peer_emails TO service_role;
REVOKE ALL ON public.ignite_peer_links FROM anon, authenticated;
REVOKE ALL ON public.ignite_peer_emails FROM anon, authenticated;

ALTER TABLE public.ignite_peer_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ignite_peer_emails ENABLE ROW LEVEL SECURITY;
-- No policies: server-only (service role). Browser clients have no grants and no policies.