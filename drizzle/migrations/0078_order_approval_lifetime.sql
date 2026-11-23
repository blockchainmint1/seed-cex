CREATE OR REPLACE FUNCTION public.send_approvals_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Send approvals are permanent records';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.link_id IS DISTINCT FROM OLD.link_id
     OR NEW.purpose IS DISTINCT FROM OLD.purpose OR NEW.ref_id IS DISTINCT FROM OLD.ref_id OR NEW.leg IS DISTINCT FROM OLD.leg
     OR NEW.asset IS DISTINCT FROM OLD.asset OR NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.from_address IS DISTINCT FROM OLD.from_address OR NEW.to_address IS DISTINCT FROM OLD.to_address
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'What was approved can never change';
  END IF;
  -- An order approval gets its working life once, in the same update that approves it
  -- (the tap window is short; an approved limit order lasts until it fills or is cancelled).
  IF NEW.expires_at IS DISTINCT FROM OLD.expires_at
     AND NOT (OLD.purpose = 'order' AND OLD.status = 'pending' AND NEW.status = 'approved') THEN
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
$function$;