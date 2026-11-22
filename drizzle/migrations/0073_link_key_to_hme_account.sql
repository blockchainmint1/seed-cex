ALTER TABLE public.key_signin_requests ADD COLUMN IF NOT EXISTS link_user_id uuid;
COMMENT ON COLUMN public.key_signin_requests.link_user_id IS 'Link mode: the signed-in member who started this request; the key joins this account as its trading pocket (never creates or signs into another account).';

ALTER TABLE public.hme_links ADD COLUMN IF NOT EXISTS key_kind text;
ALTER TABLE public.hme_links DROP CONSTRAINT IF EXISTS hme_links_key_kind_check;
ALTER TABLE public.hme_links ADD CONSTRAINT hme_links_key_kind_check CHECK (key_kind IS NULL OR key_kind IN ('coin','evm','sol'));
COMMENT ON COLUMN public.hme_links.key_kind IS 'Seeds Key links only: which key made the pocket (coin = recovery phrase / HME Vault, evm / sol = outside wallet signature).';

UPDATE public.hme_links l SET key_kind = p.identity_kind
  FROM public.profiles p
 WHERE l.source = 'seeds_key' AND l.key_kind IS NULL AND p.id = l.user_id AND p.identity_kind IN ('coin','evm','sol');

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
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.source IS DISTINCT FROM OLD.source
     OR (OLD.key_kind IS NOT NULL AND NEW.key_kind IS DISTINCT FROM OLD.key_kind) THEN
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