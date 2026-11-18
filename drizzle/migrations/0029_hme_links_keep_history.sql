CREATE OR REPLACE FUNCTION public.hme_links_keep_history()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Wallet link history is permanent; links are revoked, never deleted';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.mode IS DISTINCT FROM OLD.mode
     OR NEW.account IS DISTINCT FROM OLD.account OR NEW.paths IS DISTINCT FROM OLD.paths
     OR NEW.identity_address IS DISTINCT FROM OLD.identity_address OR NEW.xpubs IS DISTINCT FROM OLD.xpubs
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Wallet link details are permanent';
  END IF;
  IF NEW.key_ciphertext IS DISTINCT FROM OLD.key_ciphertext AND NEW.key_ciphertext IS NOT NULL THEN
    RAISE EXCEPTION 'A stored trading key can only be erased, never replaced';
  END IF;
  IF OLD.status = 'revoked' AND (NEW.status IS DISTINCT FROM OLD.status
       OR NEW.revoked_at IS DISTINCT FROM OLD.revoked_at OR NEW.revoked_by IS DISTINCT FROM OLD.revoked_by) THEN
    RAISE EXCEPTION 'A revoked link stays revoked';
  END IF;
  IF NEW.status = 'revoked' AND NEW.revoked_at IS NULL THEN
    RAISE EXCEPTION 'A revoked link needs its revoke time';
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.hme_links_keep_history() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS hme_links_keep_history ON public.hme_links;
CREATE TRIGGER hme_links_keep_history
  BEFORE UPDATE OR DELETE ON public.hme_links
  FOR EACH ROW EXECUTE FUNCTION public.hme_links_keep_history();