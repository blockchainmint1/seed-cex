-- Requires the temporary "QA-0018 verification — no sends" fixture.
-- Every mutation is rolled back in an exception subtransaction; no route becomes visible to a sender.
DO $$
DECLARE pid uuid; uid uuid; cid uuid; mid uuid; lid uuid; rid uuid; again uuid;
  args jsonb; n integer; rejected boolean;
BEGIN
  BEGIN
    SELECT id,user_id INTO STRICT pid,uid FROM public.ai_plans WHERE name = 'QA-0018 verification — no sends';
    SELECT id INTO STRICT cid FROM public.ai_plan_checks WHERE plan_id = pid;
    SELECT id INTO STRICT mid FROM public.ai_plan_moves WHERE check_id = cid AND seq = 0;
    SELECT id INTO STRICT lid FROM public.hme_links WHERE user_id = uid ORDER BY created_at DESC LIMIT 1;
    SELECT jsonb_build_object('_user_id',uid,'_link_id',lid,'_direction','buy','_coin','TRX','_coin_asset','TRON.TRX',
      '_amount_in',10,'_amount_usd',10,'_shown_usdc',10,'_shown_out',10,'_bridge_fee_bps',0,
      '_txc_address',txc_address,'_evm_address',evm_address,'_coin_address','test-only-not-broadcast',
      '_per_swap_max_usd',1000000,'_daily_max_usd',1000000,'_protocol','thorchain') INTO STRICT args
      FROM public.tsd_routes WHERE user_id = uid ORDER BY created_at DESC LIMIT 1;

    UPDATE public.ai_plan_checks SET exec_status = 'approved' WHERE id = cid;
    UPDATE public.ai_plan_moves SET status = 'starting' WHERE id = mid;
    rejected := false;
    BEGIN PERFORM public.reserve_ai_tsd_route(mid,args || jsonb_build_object('_amount_in',11));
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM <> 'Plan trade terms do not match.' THEN RAISE; END IF;
      rejected := true;
    END;
    IF NOT rejected THEN RAISE EXCEPTION 'ASSERT: over-budget reservation accepted'; END IF;
    rid := public.reserve_ai_tsd_route(mid,args);
    IF NOT EXISTS (SELECT 1 FROM public.ai_plan_moves WHERE id = mid AND route_id = rid AND status = 'running') THEN
      RAISE EXCEPTION 'ASSERT: route was not atomically linked'; END IF;
    again := public.reserve_ai_tsd_route(mid,args);
    IF again <> rid THEN RAISE EXCEPTION 'ASSERT: reservation repeated'; END IF;
    UPDATE public.ai_plan_moves SET status = 'failed' WHERE id = mid AND route_id IS NULL AND status = 'starting';
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 0 THEN RAISE EXCEPTION 'ASSERT: late failure overwrote a reserved swap'; END IF;
    UPDATE public.ai_plan_checks SET exec_status = 'cancelled' WHERE id = cid;
    UPDATE public.ai_plan_moves SET status = CASE WHEN seq = 0 THEN 'failed' ELSE 'cancelled' END, updated_at = now()-interval '20 minutes' WHERE check_id = cid;
    rejected := false;
    BEGIN PERFORM public.retry_ai_unstarted_day(uid,cid);
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM <> 'A trade may already have started. This basket cannot be retried.' THEN RAISE; END IF;
      rejected := true;
    END;
    IF NOT rejected THEN RAISE EXCEPTION 'ASSERT: linked swap was retried'; END IF;

    DELETE FROM public.tsd_routes WHERE id = rid;
    UPDATE public.ai_plan_moves SET route_id = NULL, started_at = now()-interval '20 minutes' WHERE check_id = cid;
    PERFORM public.retry_ai_unstarted_day(uid,cid);
    SELECT count(*) INTO n FROM public.ai_plan_moves WHERE check_id = cid AND status = 'queued' AND route_id IS NULL;
    IF n <> 5 OR NOT EXISTS (SELECT 1 FROM public.ai_plan_checks WHERE id = cid AND exec_status = 'waiting' AND exec_decided_at IS NULL AND exec_telegram_message_id IS NULL) THEN
      RAISE EXCEPTION 'ASSERT: five buys not awaiting a fresh confirmation'; END IF;
    rejected := false;
    BEGIN PERFORM public.reserve_ai_tsd_route(mid,args);
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM <> 'This plan trade is no longer approved to start.' THEN RAISE; END IF;
      rejected := true;
    END;
    IF NOT rejected THEN RAISE EXCEPTION 'ASSERT: stale worker started an unapproved retry'; END IF;
    IF has_function_privilege('authenticated','public.reserve_ai_tsd_route(uuid,jsonb)','EXECUTE')
      OR has_function_privilege('anon','public.retry_ai_unstarted_day(uuid,uuid)','EXECUTE') THEN
      RAISE EXCEPTION 'ASSERT: recovery functions are exposed'; END IF;
    RAISE SQLSTATE 'ZX018' USING MESSAGE = 'QA-0018 database assertions passed; roll back fixture changes';
  EXCEPTION WHEN SQLSTATE 'ZX018' THEN
    RAISE NOTICE 'QA-0018 database assertions passed; all test mutations rolled back';
  END;
END $$;