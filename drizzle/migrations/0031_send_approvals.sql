CREATE TABLE public.send_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  link_id uuid NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('trade_leg', 'p2p_release')),
  ref_id uuid NOT NULL,
  leg text NOT NULL,
  asset text NOT NULL,
  amount numeric(30,8) NOT NULL CHECK (amount > 0),
  from_address text NOT NULL,
  to_address text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined', 'expired', 'used', 'cancelled')),
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  telegram_chat_id text,
  telegram_message_id bigint,
  txid text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  decided_at timestamptz,
  used_at timestamptz
);

GRANT SELECT ON public.send_approvals TO authenticated;
GRANT ALL ON public.send_approvals TO service_role;

ALTER TABLE public.send_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "send_approvals_select_own" ON public.send_approvals
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- At most one live (pending or approved) request per send.
CREATE UNIQUE INDEX send_approvals_one_live ON public.send_approvals (purpose, ref_id, leg)
  WHERE status IN ('pending', 'approved');
CREATE INDEX send_approvals_user_idx ON public.send_approvals (user_id, created_at DESC);
CREATE INDEX send_approvals_due_idx ON public.send_approvals (expires_at) WHERE status IN ('pending', 'approved');

-- What was approved can never change, rows are never deleted, and status only moves forward.
CREATE OR REPLACE FUNCTION public.send_approvals_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Send approvals are permanent records';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.link_id IS DISTINCT FROM OLD.link_id
     OR NEW.purpose IS DISTINCT FROM OLD.purpose OR NEW.ref_id IS DISTINCT FROM OLD.ref_id OR NEW.leg IS DISTINCT FROM OLD.leg
     OR NEW.asset IS DISTINCT FROM OLD.asset OR NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.from_address IS DISTINCT FROM OLD.from_address OR NEW.to_address IS DISTINCT FROM OLD.to_address
     OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
    RAISE EXCEPTION 'What was approved can never change';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
       (OLD.status = 'pending' AND NEW.status IN ('approved', 'declined', 'expired', 'cancelled'))
    OR (OLD.status = 'approved' AND NEW.status IN ('used', 'expired', 'cancelled'))
  ) THEN
    RAISE EXCEPTION 'Send approval cannot go from % to %', OLD.status, NEW.status;
  END IF;
  IF OLD.txid IS NOT NULL AND NEW.txid IS DISTINCT FROM OLD.txid THEN
    RAISE EXCEPTION 'A recorded transaction id can never change';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER send_approvals_guard
  BEFORE UPDATE OR DELETE ON public.send_approvals
  FOR EACH ROW EXECUTE FUNCTION public.send_approvals_guard();