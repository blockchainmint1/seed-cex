-- C1: no client writes on orders / trades / escrows
DROP POLICY IF EXISTS orders_update_own ON public.orders;
DROP POLICY IF EXISTS orders_insert_own ON public.orders;
DROP POLICY IF EXISTS trades_update_participant ON public.trades;
DROP POLICY IF EXISTS escrows_participant_update ON public.escrows;
REVOKE INSERT, UPDATE, DELETE ON public.orders, public.trades, public.escrows FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.trades_immutable_terms()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.price IS DISTINCT FROM OLD.price OR NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.pair IS DISTINCT FROM OLD.pair OR NEW.side IS DISTINCT FROM OLD.side
     OR NEW.maker_id IS DISTINCT FROM OLD.maker_id OR NEW.taker_id IS DISTINCT FROM OLD.taker_id THEN
    RAISE EXCEPTION 'Trade terms are immutable';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trades_immutable_terms ON public.trades;
CREATE TRIGGER trades_immutable_terms BEFORE UPDATE ON public.trades
  FOR EACH ROW EXECUTE FUNCTION public.trades_immutable_terms();

-- C3 / H1: profiles are server-written and owner-read only
DO $$ DECLARE p record; BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='profiles'
           AND (cmd <> 'SELECT' OR policyname = 'profiles_public_read') LOOP
    EXECUTE format('DROP POLICY %I ON public.profiles', p.policyname);
  END LOOP;
END $$;
REVOKE ALL ON public.profiles FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM authenticated;

-- H6: claim-before-broadcast
ALTER TABLE public.escrows ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

-- H2: cumulative caps
ALTER TABLE public.wallet_delegations ADD COLUMN IF NOT EXISTS spent numeric NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.reserve_delegation_spend(_user_id uuid, _chain text, _asset text, _amount numeric)
RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.wallet_delegations
     SET spent = spent + _amount, updated_at = now()
   WHERE user_id = _user_id AND chain = _chain AND asset = _asset AND revoked_at IS NULL
     AND expires_at > now() AND spent + _amount <= max_amount + 0.00000001
  RETURNING id
$$;
CREATE OR REPLACE FUNCTION public.release_delegation_spend(_id uuid, _amount numeric)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.wallet_delegations SET spent = GREATEST(0, spent - _amount), updated_at = now() WHERE id = _id
$$;
REVOKE ALL ON FUNCTION public.reserve_delegation_spend(uuid, text, text, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_delegation_spend(uuid, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_delegation_spend(uuid, text, text, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_delegation_spend(uuid, numeric) TO service_role;