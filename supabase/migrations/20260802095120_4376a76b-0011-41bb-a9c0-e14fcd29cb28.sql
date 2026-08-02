ALTER TYPE public.escrow_leg ADD VALUE IF NOT EXISTS 'tsd';

ALTER TABLE public.wallet_delegations
  DROP CONSTRAINT IF EXISTS wallet_delegations_user_id_chain_key;

DROP INDEX IF EXISTS public.wallet_delegations_user_id_chain_key;

CREATE UNIQUE INDEX IF NOT EXISTS wallet_delegations_user_chain_asset_key
  ON public.wallet_delegations (user_id, chain, asset);