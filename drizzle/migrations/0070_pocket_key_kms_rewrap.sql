-- Stored pocket keys may be re-locked once, from the old single-password format to AWS KMS ("kms1."),
-- only through rewrap_pocket_key (server-only, compare-and-set). Erasing stays allowed; any other
-- replacement of a stored key is still refused.
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
    IF NOT (current_setting('seeds.pocket_rewrap', true) = 'on'
            AND OLD.key_ciphertext IS NOT NULL
            AND left(OLD.key_ciphertext, 5) <> 'kms1.'
            AND left(NEW.key_ciphertext, 5) = 'kms1.') THEN
      RAISE EXCEPTION 'A stored trading key can only be erased, never replaced';
    END IF;
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

CREATE OR REPLACE FUNCTION public.rewrap_pocket_key(p_link uuid, p_old text, p_new text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n int;
BEGIN
  IF p_old IS NULL OR left(p_old, 5) = 'kms1.' OR p_new IS NULL OR left(p_new, 5) <> 'kms1.' THEN
    RAISE EXCEPTION 'Only an old-format key can be re-locked with AWS KMS';
  END IF;
  PERFORM set_config('seeds.pocket_rewrap', 'on', true);
  UPDATE public.hme_links SET key_ciphertext = p_new
   WHERE id = p_link AND status = 'active' AND key_ciphertext = p_old;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM set_config('seeds.pocket_rewrap', 'off', true);
  RETURN n = 1;
END $$;

REVOKE ALL ON FUNCTION public.rewrap_pocket_key(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rewrap_pocket_key(uuid, text, text) TO service_role;