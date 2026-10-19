\set ON_ERROR_STOP on
SET ROLE anon;
SELECT public.test_reject('SELECT public.trusted_maintenance_status()','anonymous maintenance reporting denied');
SELECT public.test_reject('SELECT public.trusted_maintenance_run()','anonymous maintenance execution denied');
RESET ROLE;
SET ROLE authenticated;
SELECT public.test_reject('SELECT public.trusted_maintenance_status()','customer maintenance reporting denied');
SELECT public.test_reject('SELECT * FROM checkout_private.maintenance_runs','customer operation log denied');
RESET ROLE;
INSERT INTO public.orders(id,user_id,status,payment_method,total_amount,shipping_cost,checkout_version,payment_state,items_frozen)
 VALUES('22000000-0000-0000-0000-000000000501','10000000-0000-0000-0000-000000000001','pending_payment','gateway',10000,0,2,'pending',true),
 ('22000000-0000-0000-0000-000000000502','10000000-0000-0000-0000-000000000001','pending_payment','gateway',10000,0,2,'pending',true);
INSERT INTO checkout_private.reservations(order_id,expires_at) VALUES('22000000-0000-0000-0000-000000000501',now()-interval '1 minute');
SET ROLE service_role;
SELECT public.test_reject('SELECT public.trusted_maintenance_run(0,0)','empty maintenance batch rejected');
SELECT public.test_reject('SELECT public.trusted_maintenance_run(101,0)','unbounded maintenance batch rejected');
SELECT public.trusted_payment_claim('22000000-0000-0000-0000-000000000502','10000000-0000-0000-0000-000000000001','ops-fixture') AS attempt \gset
SELECT public.trusted_payment_attach((:'attempt'::jsonb->>'id')::uuid,'89501');
SELECT public.trusted_verification_claim((:'attempt'::jsonb->>'id')::uuid,'99501','10000000-0000-0000-0000-000000000001');
SELECT public.trusted_verification_record((:'attempt'::jsonb->>'id')::uuid,10000,'ops-fixture','89501','99501');
SELECT public.test_assert((public.trusted_maintenance_status()->>'verifiedReady')::integer=1,'read-only status identifies committed replay evidence');
SELECT public.trusted_maintenance_run(50,0) AS expiry \gset
SELECT public.test_assert((:'expiry'::jsonb->>'expired')::integer=1 AND (:'expiry'::jsonb->>'settled')::integer=0,'default scheduled task expires only unstarted reservation');
SELECT public.test_assert((SELECT state='ready' FROM checkout_private.attempts WHERE id=(:'attempt'::jsonb->>'id')::uuid),'expiry task does not replay payment evidence');
SELECT public.test_assert((public.trusted_maintenance_run(0,50)->>'settled')::integer=1,'explicit evidence-only reconcile settles once');
SELECT public.test_assert((public.trusted_maintenance_run(0,50)->>'settled')::integer=0,'repeat maintenance cannot duplicate settlement');
SELECT public.test_assert((SELECT count(*)=1 FROM checkout_private.outbox WHERE attempt_id=(:'attempt'::jsonb->>'id')::uuid),'one outbox event after maintenance replay');
SELECT public.test_assert(public.trusted_maintenance_status()->'lastRun'->>'finishedAt' IS NOT NULL,'status includes durable run metrics');
SELECT public.test_reject('UPDATE checkout_private.maintenance_runs SET expired=99','service cannot rewrite operation history');
RESET ROLE;
INSERT INTO public.orders(id,user_id,status,payment_method,total_amount,shipping_cost,checkout_version,payment_state,items_frozen)
 VALUES('22000000-0000-0000-0000-000000000503','10000000-0000-0000-0000-000000000001','pending_payment','gateway',10000,0,2,'pending',true);
INSERT INTO checkout_private.reservations(order_id,expires_at) VALUES('22000000-0000-0000-0000-000000000503',now()-interval '1 minute');
CREATE FUNCTION public.ops_fixture_log_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected operation log failure'; END $$;
CREATE TRIGGER ops_fixture_log_failure BEFORE INSERT ON checkout_private.maintenance_runs FOR EACH ROW EXECUTE FUNCTION public.ops_fixture_log_failure();
SET ROLE service_role;
SELECT public.test_reject('SELECT public.trusted_maintenance_run(50,0)','failed durable operation log rolls back expiry');
SELECT public.test_assert((SELECT status='pending_payment' FROM public.orders WHERE id='22000000-0000-0000-0000-000000000503'),'failed operation leaves order pending');
SELECT public.test_assert((SELECT released_at IS NULL FROM checkout_private.reservations WHERE order_id='22000000-0000-0000-0000-000000000503'),'failed operation preserves unreleased reservation');
RESET ROLE;
DROP TRIGGER ops_fixture_log_failure ON checkout_private.maintenance_runs;
SELECT public.test_reject('DELETE FROM checkout_private.maintenance_runs','even owner cannot delete append-only operation evidence');
\echo 'Maintenance service permissions, explicit replay, expiry, idempotency and audit rollback passed.'
