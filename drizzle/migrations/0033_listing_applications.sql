CREATE TABLE public.listing_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  package text NOT NULL CHECK (package IN ('seed','sapling','grove')),
  coin_name text NOT NULL CHECK (char_length(coin_name) BETWEEN 1 AND 60),
  ticker text NOT NULL CHECK (ticker ~ '^[A-Z0-9]{1,12}$'),
  network text NOT NULL CHECK (network IN ('texitcoin','pulsechain','ethereum','base','bsc','other')),
  contract text CHECK (contract IS NULL OR char_length(contract) <= 120),
  website text NOT NULL CHECK (char_length(website) <= 200),
  community text CHECK (community IS NULL OR char_length(community) <= 200),
  contact_name text NOT NULL CHECK (char_length(contact_name) BETWEEN 1 AND 80),
  contact_email text NOT NULL CHECK (char_length(contact_email) <= 200),
  contact_telegram text CHECK (contact_telegram IS NULL OR char_length(contact_telegram) <= 40),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 2000),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','reviewing','approved','declined','live')),
  admin_note text CHECK (admin_note IS NULL OR char_length(admin_note) <= 2000),
  reviewed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX listing_applications_user_idx ON public.listing_applications (user_id, created_at DESC);
CREATE INDEX listing_applications_status_idx ON public.listing_applications (status, created_at DESC);

GRANT SELECT ON public.listing_applications TO authenticated;
GRANT ALL ON public.listing_applications TO service_role;

ALTER TABLE public.listing_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Applicants read their own listing applications"
  ON public.listing_applications FOR SELECT TO authenticated
  USING (user_id = auth.uid());

COMMENT ON TABLE public.listing_applications IS 'Coin teams applying to list on Seeds. Written only by the server (submit + admin review); members can read their own rows.';