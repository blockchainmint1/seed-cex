ALTER TABLE public.ignite_registrations DROP CONSTRAINT IF EXISTS ignite_registrations_hidden_unpaid_only;

CREATE OR REPLACE FUNCTION public.ignite_registrations_unhide()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.hidden_at IS NOT NULL AND NEW.status NOT IN ('pending', 'canceled') THEN
    NEW.hidden_at := NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS ignite_registrations_unhide ON public.ignite_registrations;
CREATE TRIGGER ignite_registrations_unhide
  BEFORE INSERT OR UPDATE ON public.ignite_registrations
  FOR EACH ROW EXECUTE FUNCTION public.ignite_registrations_unhide();