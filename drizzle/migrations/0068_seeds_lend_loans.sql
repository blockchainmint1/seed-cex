CREATE TABLE public.loan_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  side text NOT NULL CHECK (side IN ('lend', 'borrow')),
  coin text NOT NULL CHECK (coin IN ('TSD', 'USDC', 'USDT')),
  collateral_coin text NOT NULL DEFAULT 'TXC' CHECK (collateral_coin IN ('TXC')),
  min_amount numeric NOT NULL CHECK (min_amount > 0),
  max_amount numeric NOT NULL CHECK (max_amount >= min_amount),
  rate_pct numeric NOT NULL CHECK (rate_pct >= 0 AND rate_pct <= 60),
  days integer NOT NULL CHECK (days BETWEEN 7 AND 365),
  max_ltv_pct numeric NOT NULL CHECK (max_ltv_pct BETWEEN 10 AND 70),
  note text CHECK (char_length(note) <= 500),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'paused', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.loan_offers TO service_role;
ALTER TABLE public.loan_offers ENABLE ROW LEVEL SECURITY;
CREATE INDEX loan_offers_open_idx ON public.loan_offers (status, side, coin, created_at DESC);
CREATE INDEX loan_offers_user_idx ON public.loan_offers (user_id, created_at DESC);

CREATE TABLE public.loan_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES public.loan_offers(id),
  parent_id uuid REFERENCES public.loan_proposals(id),
  borrower_id uuid NOT NULL,
  lender_id uuid NOT NULL,
  proposer_id uuid NOT NULL,
  coin text NOT NULL,
  collateral_coin text NOT NULL DEFAULT 'TXC',
  amount numeric NOT NULL CHECK (amount > 0),
  rate_pct numeric NOT NULL CHECK (rate_pct >= 0 AND rate_pct <= 60),
  days integer NOT NULL CHECK (days BETWEEN 7 AND 365),
  start_ltv_pct numeric NOT NULL CHECK (start_ltv_pct BETWEEN 10 AND 70),
  note text CHECK (char_length(note) <= 500),
  round integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'countered', 'accepted', 'declined', 'expired', 'withdrawn')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  decided_at timestamptz,
  CHECK (borrower_id <> lender_id),
  CHECK (proposer_id IN (borrower_id, lender_id))
);
GRANT ALL ON public.loan_proposals TO service_role;
ALTER TABLE public.loan_proposals ENABLE ROW LEVEL SECURITY;
CREATE INDEX loan_proposals_borrower_idx ON public.loan_proposals (borrower_id, created_at DESC);
CREATE INDEX loan_proposals_lender_idx ON public.loan_proposals (lender_id, created_at DESC);
CREATE INDEX loan_proposals_pending_idx ON public.loan_proposals (status, expires_at);

CREATE TABLE public.loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref text NOT NULL UNIQUE,
  offer_id uuid NOT NULL REFERENCES public.loan_offers(id),
  proposal_id uuid NOT NULL UNIQUE REFERENCES public.loan_proposals(id),
  borrower_id uuid NOT NULL,
  lender_id uuid NOT NULL,
  coin text NOT NULL,
  collateral_coin text NOT NULL,
  amount numeric NOT NULL,
  rate_pct numeric NOT NULL,
  days integer NOT NULL,
  start_ltv_pct numeric NOT NULL,
  owed numeric NOT NULL,
  fee_pct numeric NOT NULL,
  collateral_amount numeric NOT NULL,
  price_at_start numeric NOT NULL,
  borrower_pub text NOT NULL,
  lender_pub text NOT NULL,
  seeds_pub text NOT NULL,
  redeem_script text NOT NULL,
  escrow_address text NOT NULL UNIQUE,
  borrower_collateral_address text NOT NULL,
  lender_collateral_address text NOT NULL,
  seeds_fee_address text NOT NULL,
  status text NOT NULL DEFAULT 'awaiting_collateral' CHECK (status IN ('awaiting_collateral', 'awaiting_funding', 'active', 'closing', 'closed')),
  outcome text CHECK (outcome IN ('repaid', 'liquidated', 'defaulted', 'cancelled')),
  collateral_seen numeric NOT NULL DEFAULT 0,
  collateral_deadline timestamptz NOT NULL,
  collateral_confirmed_at timestamptz,
  funding_deadline timestamptz,
  funding_started_at timestamptz,
  funding_txid text,
  funding_network text,
  funding_to text,
  funded_at timestamptz,
  funding_confirmed_at timestamptz,
  due_at timestamptz,
  repay_started_at timestamptz,
  repay_txid text,
  repay_network text,
  repay_to text,
  repay_sent_at timestamptz,
  repaid_confirmed_at timestamptz,
  escrow_purpose text CHECK (escrow_purpose IN ('return', 'release', 'liquidate', 'default')),
  escrow_claimed_at timestamptz,
  escrow_hex text,
  escrow_txid text,
  escrow_split jsonb,
  escrow_price numeric,
  last_price numeric,
  last_ltv_pct numeric,
  last_checked_at timestamptz,
  margin_called_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (borrower_id <> lender_id)
);
GRANT ALL ON public.loans TO service_role;
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
CREATE INDEX loans_borrower_idx ON public.loans (borrower_id, created_at DESC);
CREATE INDEX loans_lender_idx ON public.loans (lender_id, created_at DESC);
CREATE INDEX loans_open_idx ON public.loans (status) WHERE status <> 'closed';

-- Agreed terms and the lockbox never change once a loan exists; one payout per lockbox.
CREATE OR REPLACE FUNCTION public.loans_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Loans are permanent records';
  END IF;
  IF (NEW.borrower_id, NEW.lender_id, NEW.coin, NEW.collateral_coin, NEW.amount, NEW.rate_pct, NEW.days, NEW.start_ltv_pct,
      NEW.owed, NEW.fee_pct, NEW.collateral_amount, NEW.price_at_start, NEW.borrower_pub, NEW.lender_pub, NEW.seeds_pub,
      NEW.redeem_script, NEW.escrow_address, NEW.borrower_collateral_address, NEW.lender_collateral_address, NEW.seeds_fee_address,
      NEW.offer_id, NEW.proposal_id, NEW.ref)
     IS DISTINCT FROM
     (OLD.borrower_id, OLD.lender_id, OLD.coin, OLD.collateral_coin, OLD.amount, OLD.rate_pct, OLD.days, OLD.start_ltv_pct,
      OLD.owed, OLD.fee_pct, OLD.collateral_amount, OLD.price_at_start, OLD.borrower_pub, OLD.lender_pub, OLD.seeds_pub,
      OLD.redeem_script, OLD.escrow_address, OLD.borrower_collateral_address, OLD.lender_collateral_address, OLD.seeds_fee_address,
      OLD.offer_id, OLD.proposal_id, OLD.ref) THEN
    RAISE EXCEPTION 'Agreed loan terms and the lockbox cannot change';
  END IF;
  IF OLD.escrow_purpose IS NOT NULL AND NEW.escrow_purpose IS DISTINCT FROM OLD.escrow_purpose AND OLD.escrow_hex IS NOT NULL THEN
    RAISE EXCEPTION 'This lockbox payout is already signed';
  END IF;
  IF OLD.escrow_hex IS NOT NULL AND NEW.escrow_hex IS DISTINCT FROM OLD.escrow_hex THEN
    RAISE EXCEPTION 'A signed lockbox payout cannot be replaced';
  END IF;
  IF OLD.funding_txid IS NOT NULL AND NEW.funding_txid IS DISTINCT FROM OLD.funding_txid THEN
    RAISE EXCEPTION 'The funding send cannot be replaced';
  END IF;
  IF OLD.status = 'closed' AND NEW.status <> 'closed' THEN
    RAISE EXCEPTION 'A closed loan stays closed';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER loans_guard_trg BEFORE UPDATE OR DELETE ON public.loans FOR EACH ROW EXECUTE FUNCTION public.loans_guard();

CREATE TABLE public.loan_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  loan_id uuid NOT NULL REFERENCES public.loans(id),
  kind text NOT NULL,
  body text NOT NULL,
  actor_id uuid,
  txid text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.loan_events TO service_role;
ALTER TABLE public.loan_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX loan_events_loan_idx ON public.loan_events (loan_id, created_at);

CREATE OR REPLACE FUNCTION public.loan_events_insert_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Loan history is permanent';
END;
$$;
CREATE TRIGGER loan_events_insert_only_trg BEFORE UPDATE OR DELETE ON public.loan_events FOR EACH ROW EXECUTE FUNCTION public.loan_events_insert_only();

CREATE TABLE public.loan_price_marks (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  coin text NOT NULL,
  price numeric NOT NULL CHECK (price > 0),
  source text NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.loan_price_marks TO service_role;
ALTER TABLE public.loan_price_marks ENABLE ROW LEVEL SECURITY;
CREATE INDEX loan_price_marks_coin_idx ON public.loan_price_marks (coin, at DESC);

ALTER TABLE public.send_approvals DROP CONSTRAINT send_approvals_purpose_check;
ALTER TABLE public.send_approvals ADD CONSTRAINT send_approvals_purpose_check CHECK (purpose IN ('trade_leg', 'p2p_release', 'swap_out', 'dex_swap', 'withdrawal', 'two_step', 'loan_collateral', 'loan_funding', 'loan_repay'));