-- Inline the helper logic into policies so RLS no longer depends on
-- publicly executable SECURITY DEFINER functions.

DROP POLICY IF EXISTS escrows_participant_read ON public.escrows;
DROP POLICY IF EXISTS escrows_participant_update ON public.escrows;
DROP POLICY IF EXISTS trade_events_participant_read ON public.trade_events;
DROP POLICY IF EXISTS trades_update_participant ON public.trades;

CREATE POLICY escrows_participant_read ON public.escrows
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.trades t
  WHERE t.id = escrows.trade_id
    AND (t.maker_id = auth.uid() OR t.taker_id = auth.uid())
) OR EXISTS (
  SELECT 1 FROM public.user_roles r
  WHERE r.user_id = auth.uid() AND r.role = 'arbitrator'
));

CREATE POLICY escrows_participant_update ON public.escrows
FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.trades t
  WHERE t.id = escrows.trade_id
    AND (t.maker_id = auth.uid() OR t.taker_id = auth.uid())
) OR EXISTS (
  SELECT 1 FROM public.user_roles r
  WHERE r.user_id = auth.uid() AND r.role = 'arbitrator'
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.trades t
  WHERE t.id = escrows.trade_id
    AND (t.maker_id = auth.uid() OR t.taker_id = auth.uid())
) OR EXISTS (
  SELECT 1 FROM public.user_roles r
  WHERE r.user_id = auth.uid() AND r.role = 'arbitrator'
));

CREATE POLICY trade_events_participant_read ON public.trade_events
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.trades t
  WHERE t.id = trade_events.trade_id
    AND (t.maker_id = auth.uid() OR t.taker_id = auth.uid())
) OR EXISTS (
  SELECT 1 FROM public.user_roles r
  WHERE r.user_id = auth.uid() AND r.role = 'arbitrator'
));

CREATE POLICY trades_update_participant ON public.trades
FOR UPDATE TO authenticated
USING (
  auth.uid() = maker_id OR auth.uid() = taker_id OR EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = auth.uid() AND r.role = 'arbitrator'
  )
)
WITH CHECK (
  auth.uid() = maker_id OR auth.uid() = taker_id OR EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = auth.uid() AND r.role = 'arbitrator'
  )
);

-- Revoke direct API execution of SECURITY DEFINER helpers.
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_trade_participant(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.custody_snapshot() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_expired_delegations() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_trade_participant(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.custody_snapshot() TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_expired_delegations() TO service_role;