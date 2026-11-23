-- Editable listing prices (public read)
CREATE TABLE public.listing_prices (
  package text PRIMARY KEY CHECK (package IN ('seed','sapling','grove')),
  price_usd numeric(12,2) NOT NULL CHECK (price_usd >= 1 AND price_usd <= 1000000),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT ON public.listing_prices TO anon, authenticated;
GRANT ALL ON public.listing_prices TO service_role;
ALTER TABLE public.listing_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read listing prices" ON public.listing_prices FOR SELECT TO anon, authenticated USING (true);
INSERT INTO public.listing_prices (package, price_usd) VALUES ('seed', 1000), ('sapling', 2500), ('grove', 5000);

-- Promo codes (server only)
CREATE TABLE public.listing_promo_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9_-]{3,24}$'),
  kind text NOT NULL CHECK (kind IN ('percent','amount')),
  value numeric(12,2) NOT NULL CHECK (value > 0 AND (kind <> 'percent' OR value <= 100)),
  packages text[] CHECK (packages IS NULL OR packages <@ ARRAY['seed','sapling','grove']::text[]),
  max_uses integer CHECK (max_uses IS NULL OR max_uses > 0),
  uses integer NOT NULL DEFAULT 0 CHECK (uses >= 0),
  expires_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  note text CHECK (note IS NULL OR char_length(note) <= 300),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (max_uses IS NULL OR uses <= max_uses)
);
GRANT ALL ON public.listing_promo_codes TO service_role;
ALTER TABLE public.listing_promo_codes ENABLE ROW LEVEL SECURITY;

-- Every NectarPay checkout opened for an application (server only)
CREATE TABLE public.listing_invoices (
  invoice_id text PRIMARY KEY,
  application_id uuid NOT NULL REFERENCES public.listing_applications(id),
  amount_usd numeric(12,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX listing_invoices_app_idx ON public.listing_invoices (application_id, created_at DESC);
GRANT ALL ON public.listing_invoices TO service_role;
ALTER TABLE public.listing_invoices ENABLE ROW LEVEL SECURITY;

-- Admin log for prices, promo codes and hand-marked payments (server only)
CREATE TABLE public.listing_admin_events (
  id bigserial PRIMARY KEY,
  actor uuid NOT NULL,
  kind text NOT NULL,
  application_id uuid,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.listing_admin_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.listing_admin_events_id_seq TO service_role;
ALTER TABLE public.listing_admin_events ENABLE ROW LEVEL SECURITY;

-- Payment columns on applications (table is empty today)
ALTER TABLE public.listing_applications
  ADD COLUMN list_price_usd numeric(12,2) NOT NULL DEFAULT 0 CHECK (list_price_usd >= 0),
  ADD COLUMN promo_code_id uuid REFERENCES public.listing_promo_codes(id),
  ADD COLUMN promo_code text,
  ADD COLUMN discount_usd numeric(12,2) NOT NULL DEFAULT 0 CHECK (discount_usd >= 0),
  ADD COLUMN amount_usd numeric(12,2) NOT NULL DEFAULT 0 CHECK (amount_usd >= 0),
  ADD COLUMN payment_status text NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','pending','underpaid','paid','free','refunded')),
  ADD COLUMN invoice_id text,
  ADD COLUMN checkout_url text,
  ADD COLUMN invoice_expires_at timestamptz,
  ADD COLUMN paid_invoice_id text,
  ADD COLUMN paid_at timestamptz,
  ADD COLUMN paid_chain text,
  ADD COLUMN paid_asset text,
  ADD COLUMN paid_amount_usd numeric(14,2),
  ADD COLUMN payment_note text CHECK (payment_note IS NULL OR char_length(payment_note) <= 500),
  ADD CONSTRAINT listing_amount_math CHECK (amount_usd = greatest(list_price_usd - discount_usd, 0) OR amount_usd = 0);

-- Price, promo and amount are fixed when the application is saved.
CREATE OR REPLACE FUNCTION public.listing_applications_terms_fixed()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.list_price_usd IS DISTINCT FROM OLD.list_price_usd
     OR NEW.discount_usd IS DISTINCT FROM OLD.discount_usd
     OR NEW.amount_usd IS DISTINCT FROM OLD.amount_usd
     OR NEW.promo_code_id IS DISTINCT FROM OLD.promo_code_id
     OR NEW.promo_code IS DISTINCT FROM OLD.promo_code
     OR NEW.package IS DISTINCT FROM OLD.package
     OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'listing application price terms cannot change';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER listing_applications_terms_fixed BEFORE UPDATE ON public.listing_applications
  FOR EACH ROW EXECUTE FUNCTION public.listing_applications_terms_fixed();

-- Atomically use up one promo code use, only if it still applies.
CREATE OR REPLACE FUNCTION public.claim_listing_promo(_code text, _package text)
RETURNS TABLE(id uuid, kind text, value numeric)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.listing_promo_codes p
     SET uses = p.uses + 1, updated_at = now()
   WHERE p.code = upper(_code) AND p.active
     AND (p.expires_at IS NULL OR p.expires_at > now())
     AND (p.packages IS NULL OR _package = ANY(p.packages))
     AND (p.max_uses IS NULL OR p.uses < p.max_uses)
  RETURNING p.id, p.kind, p.value;
$$;
CREATE OR REPLACE FUNCTION public.release_listing_promo(_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.listing_promo_codes SET uses = greatest(uses - 1, 0), updated_at = now() WHERE id = _id;
$$;
REVOKE ALL ON FUNCTION public.claim_listing_promo(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_listing_promo(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_listing_promo(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_listing_promo(uuid) TO service_role;