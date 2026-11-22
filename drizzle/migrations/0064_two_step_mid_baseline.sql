ALTER TABLE public.two_step_swaps ADD COLUMN IF NOT EXISTS mid_baseline_units numeric;
COMMENT ON COLUMN public.two_step_swaps.mid_baseline_units IS 'Middle-coin balance (base units) in the member''s pocket just before step 1 was sent; step 2 hands on at most what arrived above it. Write-once.';

CREATE OR REPLACE FUNCTION public.two_step_swaps_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Two-step swaps are permanent records';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.link_id IS DISTINCT FROM OLD.link_id
     OR NEW.direction IS DISTINCT FROM OLD.direction OR NEW.network IS DISTINCT FROM OLD.network
     OR NEW.token_address IS DISTINCT FROM OLD.token_address OR NEW.token_decimals IS DISTINCT FROM OLD.token_decimals
     OR NEW.coin_id IS DISTINCT FROM OLD.coin_id OR NEW.mid_id IS DISTINCT FROM OLD.mid_id
     OR NEW.protocol IS DISTINCT FROM OLD.protocol
     OR NEW.amount_in IS DISTINCT FROM OLD.amount_in OR NEW.shown_mid IS DISTINCT FROM OLD.shown_mid
     OR NEW.shown_out IS DISTINCT FROM OLD.shown_out OR NEW.min_out IS DISTINCT FROM OLD.min_out
     OR NEW.slippage_bps IS DISTINCT FROM OLD.slippage_bps OR NEW.amount_usd IS DISTINCT FROM OLD.amount_usd
     OR NEW.from_address IS DISTINCT FROM OLD.from_address OR NEW.to_address IS DISTINCT FROM OLD.to_address
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'What was agreed for this swap can never change';
  END IF;
  IF (OLD.approval_id IS NOT NULL AND NEW.approval_id IS DISTINCT FROM OLD.approval_id)
     OR (OLD.dex_swap_id IS NOT NULL AND NEW.dex_swap_id IS DISTINCT FROM OLD.dex_swap_id)
     OR (OLD.swap_send_id IS NOT NULL AND NEW.swap_send_id IS DISTINCT FROM OLD.swap_send_id)
     OR (OLD.leg2_dex_swap_id IS NOT NULL AND NEW.leg2_dex_swap_id IS DISTINCT FROM OLD.leg2_dex_swap_id)
     OR (OLD.leg2_swap_send_id IS NOT NULL AND NEW.leg2_swap_send_id IS DISTINCT FROM OLD.leg2_swap_send_id)
     OR (OLD.mid_amount IS NOT NULL AND NEW.mid_amount IS DISTINCT FROM OLD.mid_amount)
     OR (OLD.mid_baseline_units IS NOT NULL AND NEW.mid_baseline_units IS DISTINCT FROM OLD.mid_baseline_units) THEN
    RAISE EXCEPTION 'A recorded swap step can never change';
  END IF;
  -- The starting balance is noted before step 1 goes out, never after.
  IF OLD.mid_baseline_units IS NULL AND NEW.mid_baseline_units IS NOT NULL AND OLD.status <> 'approved' THEN
    RAISE EXCEPTION 'The starting balance can only be noted before step 1';
  END IF;
  IF OLD.status IN ('done', 'failed', 'refunded', 'kept_mid', 'declined', 'expired', 'cancelled') AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'A finished swap stays finished';
  END IF;
  IF OLD.status = 'awaiting_approval' AND NEW.status IN ('approved', 'leg1', 'mid', 'leg2', 'done') AND NEW.approval_id IS NULL THEN
    RAISE EXCEPTION 'A two-step swap needs an approval before it starts';
  END IF;
  RETURN NEW;
END;
$$;
