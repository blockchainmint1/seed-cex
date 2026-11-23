ALTER TABLE public.hme_links ADD COLUMN IF NOT EXISTS vault_fingerprint text;
ALTER TABLE public.hme_links DROP CONSTRAINT IF EXISTS hme_links_vault_fingerprint_format;
ALTER TABLE public.hme_links ADD CONSTRAINT hme_links_vault_fingerprint_format CHECK (vault_fingerprint IS NULL OR vault_fingerprint ~ '^[0-9a-f]{8}$');
COMMENT ON COLUMN public.hme_links.vault_fingerprint IS 'HME Vault seed ID shown beside the seed name (BIP32 master fingerprint, signed by the coin identity over the handoff). Display label only: never used for sign-in, matching, ownership or pockets. May be set once, never changed.';

ALTER TABLE public.key_signin_requests ADD COLUMN IF NOT EXISTS vault_fingerprint text;
ALTER TABLE public.key_signin_requests DROP CONSTRAINT IF EXISTS key_signin_requests_vault_fingerprint_format;
ALTER TABLE public.key_signin_requests ADD CONSTRAINT key_signin_requests_vault_fingerprint_format CHECK (vault_fingerprint IS NULL OR vault_fingerprint ~ '^[0-9a-f]{8}$');
COMMENT ON COLUMN public.key_signin_requests.vault_fingerprint IS 'Verified HME Vault seed ID from this sign-in (display label for the "is this yours?" screen only)';

CREATE OR REPLACE FUNCTION public.hme_links_keep_history()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Wallet link history is permanent; links are revoked, never deleted';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.mode IS DISTINCT FROM OLD.mode
     OR NEW.account IS DISTINCT FROM OLD.account OR NEW.paths IS DISTINCT FROM OLD.paths
     OR NEW.identity_address IS DISTINCT FROM OLD.identity_address OR NEW.xpubs IS DISTINCT FROM OLD.xpubs
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.source IS DISTINCT FROM OLD.source
     OR (OLD.key_kind IS NOT NULL AND NEW.key_kind IS DISTINCT FROM OLD.key_kind)
     OR (OLD.vault_fingerprint IS NOT NULL AND NEW.vault_fingerprint IS DISTINCT FROM OLD.vault_fingerprint) THEN
    RAISE EXCEPTION 'Wallet link details are permanent';
  END IF;
  IF NEW.key_ciphertext IS DISTINCT FROM OLD.key_ciphertext AND NEW.key_ciphertext IS NOT NULL THEN
    IF NOT COALESCE(
         current_setting('seeds.pocket_rewrap', true) = 'on'
         AND OLD.key_ciphertext IS NOT NULL
         AND left(OLD.key_ciphertext, 5) <> 'kms1.'
         AND left(NEW.key_ciphertext, 5) = 'kms1.', false) THEN
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
END $function$;