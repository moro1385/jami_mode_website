\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id) VALUES('51000000-0000-4000-8000-000000000001'),('51000000-0000-4000-8000-000000000002');
SELECT public.test_assert(NOT (SELECT topups_enabled FROM checkout_private.wallet_control),'new topups disabled at installation');
SELECT public.test_reject($q$SELECT public.trusted_wallet_topup_claim('51000000-0000-4000-8000-000000000001',gen_random_uuid(),20000,'topup-fixture')$q$,'database gate rejects');
UPDATE checkout_private.wallet_control SET topups_enabled=true;
SELECT public.test_reject($q$SELECT public.trusted_wallet_topup_claim('51000000-0000-4000-8000-000000000001',gen_random_uuid(),4999,'topup-fixture')$q$,'minimum amount enforced');
SELECT public.test_reject($q$SELECT public.trusted_wallet_topup_claim('51000000-0000-4000-8000-000000000001',gen_random_uuid(),100000000,'topup-fixture')$q$,'capacity maximum enforced');
SELECT public.test_reject($q$SELECT public.trusted_wallet_topup_claim('51000000-0000-4000-8000-000000000001',gen_random_uuid(),20000,NULL)$q$,'merchant required');
CREATE TEMP TABLE topup_cases(n int PRIMARY KEY,attempt jsonb);
INSERT INTO topup_cases VALUES(1,public.trusted_wallet_topup_claim('51000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000003',20000,'topup-fixture'));
SELECT public.test_assert((SELECT (attempt->>'claimed')::boolean AND attempt->>'state'='creating' FROM topup_cases WHERE n=1),'claim persisted before transport');
SELECT public.test_assert(NOT (public.trusted_wallet_topup_claim('51000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000003',20000,'topup-fixture')->>'claimed')::boolean,'retry reuses unresolved claim');
SELECT public.test_reject($q$SELECT public.trusted_wallet_topup_claim('51000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000003',25000,'topup-fixture')$q$,'same key different amount rejects');
SELECT public.test_reject($q$SELECT public.trusted_wallet_topup_claim('51000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000003',20000,'other-merchant')$q$,'same key different namespace rejects');
SELECT public.test_reject($q$SELECT public.trusted_wallet_topup_attach((SELECT (attempt->>'id')::uuid FROM topup_cases WHERE n=1),'51000000-0000-4000-8000-000000000002','951001','topup-fixture')$q$,'foreign attach denied');
SELECT public.test_reject($q$SELECT public.trusted_wallet_topup_attach((SELECT (attempt->>'id')::uuid FROM topup_cases WHERE n=1),'51000000-0000-4000-8000-000000000001','951001','wrong-merchant')$q$,'attach namespace checked');
SELECT public.trusted_wallet_topup_attach((SELECT (attempt->>'id')::uuid FROM topup_cases WHERE n=1),'51000000-0000-4000-8000-000000000001','951001','topup-fixture');
SELECT public.trusted_wallet_topup_attach((SELECT (attempt->>'id')::uuid FROM topup_cases WHERE n=1),'51000000-0000-4000-8000-000000000001','951001','topup-fixture');
SELECT public.test_reject($q$SELECT public.trusted_wallet_topup_attach((SELECT (attempt->>'id')::uuid FROM topup_cases WHERE n=1),'51000000-0000-4000-8000-000000000001','951999','topup-fixture')$q$,'attached reference immutable');
SELECT public.test_reject($q$SELECT public.trusted_wallet_topup_status('51000000-0000-4000-8000-000000000002',(SELECT (attempt->>'topup_id')::uuid FROM topup_cases WHERE n=1))$q$,'foreign status denied');
SELECT public.test_reject($q$UPDATE public.wallet_topups SET amount=1 WHERE payment_version=2$q$,'persisted amount immutable');
SELECT public.test_reject($q$UPDATE public.wallet_topups SET payment_version=1 WHERE payment_version=2$q$,'cannot downgrade to legacy');
SELECT public.test_reject($q$DELETE FROM public.wallet_topups WHERE payment_version=2$q$,'unresolved topup retained');
SELECT public.test_reject($q$SELECT public.trusted_payment_settle((SELECT (attempt->>'id')::uuid FROM topup_cases WHERE n=1),20000,'topup-fixture','951001','951002')$q$,'cannot credit without durable verification');
SELECT public.trusted_verification_claim((SELECT (attempt->>'id')::uuid FROM topup_cases WHERE n=1),'951002','51000000-0000-4000-8000-000000000001');
SELECT public.test_reject($q$SELECT public.trusted_payment_settle((SELECT (attempt->>'id')::uuid FROM topup_cases WHERE n=1),20000,'topup-fixture','951001','951002')$q$,'verifying is not verified');
SELECT public.test_reject($q$SELECT public.trusted_verification_record((SELECT (attempt->>'id')::uuid FROM topup_cases WHERE n=1),20001,'topup-fixture','951001','951002')$q$,'evidence amount exact');
SELECT public.trusted_verification_record((SELECT (attempt->>'id')::uuid FROM topup_cases WHERE n=1),20000,'topup-fixture','951001','951002');
SELECT public.test_reject($q$SELECT public.trusted_payment_settle((SELECT (attempt->>'id')::uuid FROM topup_cases WHERE n=1),NULL,'topup-fixture','951001','951002')$q$,'null amount cannot bypass exact evidence binding');
SELECT public.test_reject($q$SELECT public.trusted_payment_settle((SELECT (attempt->>'id')::uuid FROM topup_cases WHERE n=1),20000,'topup-fixture','951001','951003')$q$,'different transaction cannot reuse evidence');
SELECT public.test_reject($q$UPDATE public.wallet_topups SET status='confirmed',payment_trans_id='951002' WHERE payment_version=2$q$,'cannot mark confirmed without a matching credit');
CREATE FUNCTION pg_temp.reject_topup_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic outbox failure';END $$;
CREATE TRIGGER topup_test_outbox BEFORE INSERT ON checkout_private.outbox FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_topup_outbox();
SELECT public.test_reject($q$SELECT public.trusted_payment_settle((SELECT (attempt->>'id')::uuid FROM topup_cases WHERE n=1),20000,'topup-fixture','951001','951002')$q$,'late failure rolls back all credit effects');
DROP TRIGGER topup_test_outbox ON checkout_private.outbox;
SELECT public.test_assert((SELECT wallet_balance=0 FROM public.profiles WHERE id='51000000-0000-4000-8000-000000000001') AND NOT EXISTS(SELECT 1 FROM checkout_private.wallet_credits WHERE topup_id=(SELECT (attempt->>'topup_id')::uuid FROM topup_cases WHERE n=1)),'no partial credit after failure');
SELECT public.test_assert((SELECT state='verified' FROM checkout_private.verifications WHERE attempt_id=(SELECT (attempt->>'id')::uuid FROM topup_cases WHERE n=1)),'independent durable evidence survives failed settlement');
SELECT public.trusted_reconcile_verified(500);
SELECT public.trusted_payment_settle((SELECT (attempt->>'id')::uuid FROM topup_cases WHERE n=1),20000,'topup-fixture','951001','951002');
SELECT public.test_assert((SELECT wallet_balance=20000 FROM public.profiles WHERE id='51000000-0000-4000-8000-000000000001') AND (SELECT count(*)=1 FROM checkout_private.wallet_entries WHERE user_id='51000000-0000-4000-8000-000000000001'),'recovery and retry credit exactly once');
SELECT public.test_assert((public.trusted_wallet_topup_status('51000000-0000-4000-8000-000000000001',(SELECT (attempt->>'topup_id')::uuid FROM topup_cases WHERE n=1))->>'paid')::boolean,'receipt proves settled credit');
SELECT public.test_assert((public.trusted_wallet_reconcile('51000000-0000-4000-8000-000000000001')->>'consistent')::boolean,'profile and ledger reconcile');
-- New accounts remain unreviewed; credit is not authorization to spend.
SELECT public.test_assert(NOT EXISTS(SELECT 1 FROM checkout_private.wallet_opening_reviews WHERE user_id='51000000-0000-4000-8000-000000000001'),'no invented opening review');
SELECT public.test_reject($q$UPDATE public.wallet_topups SET payment_trans_id='99999' WHERE payment_version=2$q$,'settled transaction immutable');
-- Quota and reserved capacity also cover unresolved provider calls.
SELECT public.trusted_wallet_topup_claim('51000000-0000-4000-8000-000000000002',gen_random_uuid(),99990000,'topup-fixture');
SELECT public.test_reject($q$SELECT public.trusted_wallet_topup_claim('51000000-0000-4000-8000-000000000002',gen_random_uuid(),10000,'topup-fixture')$q$,'pending amount reserves balance headroom');
SELECT public.trusted_wallet_topup_claim('51000000-0000-4000-8000-000000000001',gen_random_uuid(),5000,'topup-fixture') FROM generate_series(1,5);
SELECT public.test_reject($q$SELECT public.trusted_wallet_topup_claim('51000000-0000-4000-8000-000000000001',gen_random_uuid(),5000,'topup-fixture')$q$,'sixth unresolved request denied');
-- Exact retries are available after the operator closes new initiation.
UPDATE checkout_private.wallet_control SET topups_enabled=false;
SELECT public.test_assert(public.trusted_wallet_topup_claim('51000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000003',20000,'topup-fixture')->>'state'='settled','gate closure preserves exact existing retry');
SELECT public.test_assert(NOT has_function_privilege('authenticated','public.trusted_wallet_topup_claim(uuid,uuid,bigint,text)','EXECUTE') AND NOT has_function_privilege('anon','public.trusted_wallet_topup_status(uuid,uuid)','EXECUTE'),'browser money RPC denied');
SET ROLE authenticated;
SELECT public.test_reject($q$SELECT public.trusted_wallet_topup_claim('51000000-0000-4000-8000-000000000001',gen_random_uuid(),5000,'topup-fixture')$q$,'actual browser role denied');
RESET ROLE;
SELECT public.test_reject('UPDATE checkout_private.wallet_topup_requests SET amount=5000','request journal immutable');
SELECT public.test_assert(NOT has_table_privilege('service_role','checkout_private.wallet_control','UPDATE'),'server key cannot enable topups');
-- Existing pending v1 returns still settle through the preserved legacy path.
INSERT INTO public.wallet_topups(id,user_id,amount,payment_ref) VALUES('51000000-0000-4000-8000-000000000005','51000000-0000-4000-8000-000000000001',10000,'951010');
SELECT public.trusted_payment_lookup('51000000-0000-4000-8000-000000000005',true,'951010','topup-fixture');
SELECT public.trusted_payment_settle((SELECT id FROM checkout_private.attempts WHERE topup_id='51000000-0000-4000-8000-000000000005'),10000,'topup-fixture','951010','951011');
SELECT public.test_assert((SELECT wallet_balance=30000 FROM public.profiles WHERE id='51000000-0000-4000-8000-000000000001'),'legacy credit still works after installation');
-- A broken v2 record must never silently adopt the legacy verifier.
INSERT INTO public.wallet_topups(id,user_id,amount,payment_ref,payment_version) VALUES('51000000-0000-4000-8000-000000000006','51000000-0000-4000-8000-000000000001',10000,'951020',2);
SELECT public.test_reject($q$SELECT public.trusted_payment_lookup('51000000-0000-4000-8000-000000000006',true,'951020','topup-fixture')$q$,'v2 cannot adopt a missing attempt as legacy');
ROLLBACK;
\echo PASS: new topup bindings, evidence, atomic recovery, quota, receipts and permissions.
