-- PREPARED ONLY: synthetic transaction on the pinned jamimode-test project.
-- Requires separate approval. No provider/network calls; all fixture rows roll back.
-- Sequence values consumed by log inserts can leave harmless gaps after rollback.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN
 IF (SELECT count(*) FROM public.orders)<>0 OR (SELECT count(*) FROM checkout_private.attempts)<>0
 OR (SELECT count(*) FROM checkout_private.maintenance_runs)<>0 THEN
  RAISE EXCEPTION 'Test baseline is not empty; inspect instead of mutating existing rows';
 END IF;
 IF (SELECT count(*) FROM auth.users WHERE phone IN ('+12025550101','12025550101'))<>1 THEN
  RAISE EXCEPTION 'Expected synthetic fixture account missing';
 END IF;
END $$;
SELECT set_config('jami.fixture.actor',(SELECT id::text FROM auth.users WHERE phone IN ('+12025550101','12025550101')),true);
SELECT set_config('jami.fixture.unstarted',gen_random_uuid()::text,true);
SELECT set_config('jami.fixture.verified',gen_random_uuid()::text,true);
SELECT set_config('jami.fixture.uncertain',gen_random_uuid()::text,true);
SET LOCAL ROLE anon;
DO $$ BEGIN
 BEGIN PERFORM public.trusted_maintenance_status(); RAISE check_violation USING MESSAGE='Anonymous status unexpectedly allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.trusted_maintenance_run(0,0); RAISE check_violation USING MESSAGE='Anonymous execution unexpectedly allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM public.trusted_maintenance_status(); RAISE check_violation USING MESSAGE='Customer status unexpectedly allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM count(*) FROM checkout_private.maintenance_runs; RAISE check_violation USING MESSAGE='Customer log unexpectedly readable'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
INSERT INTO public.orders(id,user_id,status,payment_method,total_amount,shipping_cost,checkout_version,payment_state,items_frozen)
SELECT current_setting(key)::uuid,current_setting('jami.fixture.actor')::uuid,'pending_payment','gateway',10000,0,2,'pending',true
 FROM unnest(ARRAY['jami.fixture.unstarted','jami.fixture.verified','jami.fixture.uncertain']) AS key;
INSERT INTO checkout_private.reservations(order_id,expires_at)
SELECT current_setting(key)::uuid,now()-interval '1 minute' FROM unnest(ARRAY['jami.fixture.unstarted','jami.fixture.uncertain']) AS key;
SET LOCAL ROLE service_role;
DO $$
DECLARE actor uuid:=current_setting('jami.fixture.actor')::uuid; verified uuid:=current_setting('jami.fixture.verified')::uuid;
 uncertain uuid:=current_setting('jami.fixture.uncertain')::uuid; attempt jsonb; verified_attempt uuid; result jsonb;
BEGIN
 BEGIN PERFORM public.trusted_maintenance_run(0,0); RAISE check_violation USING MESSAGE='Empty batch unexpectedly allowed'; EXCEPTION WHEN raise_exception THEN NULL; END;
 BEGIN PERFORM public.trusted_maintenance_run(101,0); RAISE check_violation USING MESSAGE='Unbounded batch unexpectedly allowed'; EXCEPTION WHEN raise_exception THEN NULL; END;
 attempt:=public.trusted_payment_claim(verified,actor,'phase0-synthetic'); verified_attempt:=(attempt->>'id')::uuid;
 PERFORM public.trusted_payment_attach(verified_attempt,'87101');
 PERFORM public.trusted_verification_claim(verified_attempt,'98101',actor);
 -- Synthetic service-owned evidence, never a claim about a real payment.
 PERFORM public.trusted_verification_record(verified_attempt,10000,'phase0-synthetic','87101','98101');
 attempt:=public.trusted_payment_claim(uncertain,actor,'phase0-synthetic');
 PERFORM public.trusted_payment_attach((attempt->>'id')::uuid,'87102');
 IF (public.trusted_maintenance_status()->>'verifiedReady')::integer<>1 THEN RAISE EXCEPTION 'Verified queue mismatch'; END IF;
 result:=public.trusted_maintenance_run(50,0);
 IF result->>'skipped'<>'false' OR (result->>'expired')::integer<>1 OR (result->>'settled')::integer<>0 THEN RAISE EXCEPTION 'Expiry-only task mismatch'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.orders WHERE id=uncertain AND status='pending_payment') THEN RAISE EXCEPTION 'Started attempt expired'; END IF;
 IF (public.trusted_maintenance_run(0,50)->>'settled')::integer<>1 THEN RAISE EXCEPTION 'Explicit replay failed'; END IF;
 IF (public.trusted_maintenance_run(0,50)->>'settled')::integer<>0 THEN RAISE EXCEPTION 'Replay duplicated settlement'; END IF;
 IF (SELECT count(*) FROM checkout_private.outbox WHERE attempt_id=verified_attempt)<>1 THEN RAISE EXCEPTION 'Outbox duplicated'; END IF;
 BEGIN UPDATE checkout_private.maintenance_runs SET expired=99; RAISE check_violation USING MESSAGE='Service log rewrite unexpectedly allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
-- A successful response must additionally confirm no fixture records remain.
SELECT jsonb_build_object('orders',(SELECT count(*) FROM public.orders),'attempts',(SELECT count(*) FROM checkout_private.attempts),
 'reservations',(SELECT count(*) FROM checkout_private.reservations),'verifications',(SELECT count(*) FROM checkout_private.verifications),
 'outbox',(SELECT count(*) FROM checkout_private.outbox),'runs',(SELECT count(*) FROM checkout_private.maintenance_runs)) AS cleanup;
