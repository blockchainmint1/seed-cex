CREATE FUNCTION public.reserve_ai_tsd_route(_move_id uuid, _args jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE m public.ai_plan_moves; c public.ai_plan_checks; p public.ai_plans; rid uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('swap_send:' || (_args->>'_user_id')));
  SELECT * INTO m FROM public.ai_plan_moves WHERE id = _move_id FOR UPDATE;
  IF NOT FOUND OR m.user_id <> (_args->>'_user_id')::uuid THEN RAISE EXCEPTION 'Plan trade not found.'; END IF;
  IF m.route_id IS NOT NULL THEN RETURN m.route_id; END IF;
  SELECT * INTO c FROM public.ai_plan_checks WHERE id = m.check_id FOR SHARE;
  SELECT * INTO p FROM public.ai_plans WHERE id = m.plan_id FOR SHARE;
  IF m.status <> 'starting' OR c.exec_status NOT IN ('approved','running') OR NOT p.execute OR p.status <> 'locked'
    OR c.user_id <> m.user_id OR p.user_id <> m.user_id OR c.plan_id <> m.plan_id THEN RAISE EXCEPTION 'This plan trade is no longer approved to start.'; END IF;
  IF _args->>'_coin' <> m.swap_coin OR _args->>'_direction' <> m.side
    OR (_args->>'_amount_in')::numeric <= 0 OR (_args->>'_amount_in')::numeric > m.amount
    OR _args->>'_parent_id' IS NOT NULL THEN RAISE EXCEPTION 'Plan trade terms do not match.'; END IF;
  rid := public.reserve_tsd_route(
    m.user_id, (_args->>'_link_id')::uuid, m.side, m.swap_coin, _args->>'_coin_asset',
    (_args->>'_amount_in')::numeric, (_args->>'_amount_usd')::numeric, (_args->>'_shown_usdc')::numeric,
    (_args->>'_shown_out')::numeric, (_args->>'_bridge_fee_bps')::integer,
    _args->>'_txc_address', _args->>'_evm_address', _args->>'_coin_address',
    (_args->>'_per_swap_max_usd')::numeric, (_args->>'_daily_max_usd')::numeric, _args->>'_protocol', NULL);
  UPDATE public.ai_plan_moves SET route_id = rid, status = 'running', updated_at = now() WHERE id = m.id;
  RETURN rid;
END $$;
REVOKE ALL ON FUNCTION public.reserve_ai_tsd_route(uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_tsd_route(uuid,jsonb) TO service_role;

CREATE FUNCTION public.retry_ai_unstarted_day(_user uuid, _check uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE c public.ai_plan_checks; p public.ai_plans; since_at timestamptz;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('swap_send:' || _user::text));
  SELECT * INTO c FROM public.ai_plan_checks WHERE id = _check AND user_id = _user FOR UPDATE;
  IF NOT FOUND OR c.exec_status <> 'cancelled' THEN RAISE EXCEPTION 'This day is not a stopped, unstarted basket.'; END IF;
  SELECT * INTO p FROM public.ai_plans WHERE id = c.plan_id AND user_id = _user FOR SHARE;
  IF NOT FOUND OR NOT p.execute OR p.status <> 'locked' THEN RAISE EXCEPTION 'Real buying is off for this plan.'; END IF;
  IF EXISTS (SELECT 1 FROM public.ai_plan_checks WHERE plan_id = c.plan_id AND day > c.day) THEN RAISE EXCEPTION 'A newer daily check exists. Use that check instead.'; END IF;
  PERFORM 1 FROM public.ai_plan_moves WHERE check_id = c.id FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM public.ai_plan_moves WHERE check_id = c.id AND status = 'failed')
    OR EXISTS (SELECT 1 FROM public.ai_plan_moves WHERE check_id = c.id AND (user_id <> _user OR route_id IS NOT NULL OR status NOT IN ('failed','cancelled')))
    OR EXISTS (SELECT 1 FROM public.ai_plan_moves WHERE user_id = _user AND status IN ('starting','running')) THEN
    RAISE EXCEPTION 'A trade may already have started. This basket cannot be retried.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.ai_plan_moves WHERE check_id = c.id AND updated_at > now() - interval '10 minutes') THEN
    RAISE EXCEPTION 'Wait 10 minutes after the stop before requesting a retry.';
  END IF;
  SELECT min(COALESCE(started_at, created_at)) - interval '10 seconds' INTO since_at FROM public.ai_plan_moves WHERE check_id = c.id;
  -- Legacy starts had no atomic link. Any candidate, even failed or completed, blocks retry.
  IF EXISTS (SELECT 1 FROM public.tsd_routes r JOIN public.ai_plan_moves m ON m.check_id = c.id AND r.coin = m.swap_coin AND r.direction = m.side
    WHERE r.user_id = _user AND r.created_at >= since_at) THEN
    RAISE EXCEPTION 'A matching swap exists. Review its status before trying again.';
  END IF;
  UPDATE public.ai_plan_moves SET status = 'queued', error = NULL, started_at = NULL, finished_at = NULL, updated_at = now() WHERE check_id = c.id;
  UPDATE public.ai_plan_checks SET exec_status = 'waiting', exec_expires_at = now() + interval '24 hours', exec_decided_at = NULL,
    exec_decided_via = NULL, exec_telegram_chat_id = NULL, exec_telegram_message_id = NULL WHERE id = c.id;
END $$;
REVOKE ALL ON FUNCTION public.retry_ai_unstarted_day(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.retry_ai_unstarted_day(uuid,uuid) TO service_role;