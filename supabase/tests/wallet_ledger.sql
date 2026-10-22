\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id) VALUES('41000000-0000-4000-8000-000000000001'),('41000000-0000-4000-8000-000000000002');
INSERT INTO public.products(id,name,slug,price,is_active,is_out_of_stock,sizes,colors)
 VALUES('41000000-0000-4000-8000-000000000003','Wallet fixture','wallet-fixture',20000,true,false,'{}','{}');
INSERT INTO public.addresses(id,user_id,line1) VALUES('41000000-0000-4000-8000-000000000004','41000000-0000-4000-8000-000000000001','Synthetic');
CREATE FUNCTION pg_temp.wallet_order(k uuid) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE sel jsonb;q jsonb;r jsonb;
BEGIN
 sel:='{"addressId":"41000000-0000-4000-8000-000000000004","shippingOption":"tipax","items":[{"productId":"41000000-0000-4000-8000-000000000003","quantity":1}]}';
 q:=public.trusted_checkout('41000000-0000-4000-8000-000000000001',k,sel,NULL);
 r:=public.trusted_checkout('41000000-0000-4000-8000-000000000001',k,sel,q->>'quote');RETURN (r->>'orderId')::uuid;
END $$;
CREATE TEMP TABLE wallet_cases(n integer PRIMARY KEY,order_id uuid,key uuid DEFAULT gen_random_uuid());
INSERT INTO wallet_cases(n,order_id) VALUES(1,pg_temp.wallet_order(gen_random_uuid()));
SELECT public.test_assert(NOT (SELECT spending_enabled FROM checkout_private.wallet_control),'installation keeps spending disabled');
SELECT public.test_reject($q$SELECT public.trusted_wallet_pay((SELECT order_id FROM wallet_cases WHERE n=1),'41000000-0000-4000-8000-000000000001',gen_random_uuid())$q$,'disabled debit rejects');
UPDATE checkout_private.wallet_control SET spending_enabled=true;
SELECT public.test_reject($q$SELECT public.trusted_wallet_pay((SELECT order_id FROM wallet_cases WHERE n=1),'41000000-0000-4000-8000-000000000001',gen_random_uuid())$q$,'unmanaged balance not spendable');
-- Exercise the preserved legacy verifier's real settlement routine, no provider request.
INSERT INTO public.wallet_topups(id,user_id,amount,payment_ref) VALUES('41000000-0000-4000-8000-000000000005','41000000-0000-4000-8000-000000000001',50000,'810001');
SELECT public.trusted_payment_lookup('41000000-0000-4000-8000-000000000005',true,'810001','wallet-fixture');
SELECT public.trusted_payment_settle((SELECT id FROM checkout_private.attempts WHERE topup_id='41000000-0000-4000-8000-000000000005'),50000,'wallet-fixture','810001','98810001');
SELECT public.trusted_payment_settle((SELECT id FROM checkout_private.attempts WHERE topup_id='41000000-0000-4000-8000-000000000005'),50000,'wallet-fixture','810001','98810001');
SELECT public.test_assert((SELECT count(*)=1 FROM checkout_private.wallet_entries WHERE user_id='41000000-0000-4000-8000-000000000001'),'legacy credit journaled once');
SELECT public.test_assert((public.trusted_wallet_reconcile('41000000-0000-4000-8000-000000000001')->>'consistent')::boolean,'credit matches profile and ledger');
SELECT public.test_reject($q$SELECT public.trusted_wallet_pay((SELECT order_id FROM wallet_cases WHERE n=1),'41000000-0000-4000-8000-000000000001',gen_random_uuid())$q$,'observed opening is not reviewed funds');
SELECT public.test_reject($q$SELECT public.trusted_wallet_review_opening('41000000-0000-4000-8000-000000000001',1,repeat('a',64),'case-1','fixture')$q$,'cannot change opening');
SELECT public.trusted_wallet_review_opening('41000000-0000-4000-8000-000000000001',0,repeat('a',64),'case-1','fixture');
SELECT public.trusted_wallet_review_opening('41000000-0000-4000-8000-000000000001',0,repeat('a',64),'case-1','fixture');
SELECT public.test_reject($q$SELECT public.trusted_wallet_review_opening('41000000-0000-4000-8000-000000000001',0,repeat('b',64),'case-1','fixture')$q$,'cannot replace opening proof');
SELECT public.test_reject($q$SELECT public.trusted_wallet_pay((SELECT order_id FROM wallet_cases WHERE n=1),'41000000-0000-4000-8000-000000000002',gen_random_uuid())$q$,'other owner rejected');
GRANT SELECT ON wallet_cases TO service_role;
DO $$ BEGIN EXECUTE format('GRANT USAGE ON SCHEMA %I TO service_role',pg_my_temp_schema()::regnamespace); END $$;
SET ROLE service_role;
SELECT public.test_assert((public.trusted_wallet_pay((SELECT order_id FROM wallet_cases WHERE n=1),'41000000-0000-4000-8000-000000000001',(SELECT key FROM wallet_cases WHERE n=1))->>'success')::boolean,'service debit succeeds');
SELECT public.test_assert((public.trusted_wallet_pay((SELECT order_id FROM wallet_cases WHERE n=1),'41000000-0000-4000-8000-000000000001',(SELECT key FROM wallet_cases WHERE n=1))->>'alreadyPaid')::boolean,'identical retry does not debit twice');
RESET ROLE;
SELECT public.test_assert((SELECT wallet_balance=30000 FROM public.profiles WHERE id='41000000-0000-4000-8000-000000000001'),'exact balance after one debit');
SELECT public.test_assert(public.trusted_wallet_receipt((SELECT order_id FROM wallet_cases WHERE n=1),'41000000-0000-4000-8000-000000000001'),'paid receipt has matching ledger debit');
SELECT public.test_assert(NOT public.trusted_wallet_receipt((SELECT order_id FROM wallet_cases WHERE n=1),'41000000-0000-4000-8000-000000000002'),'receipt owner checked');
SELECT public.test_reject($q$SELECT public.trusted_wallet_pay((SELECT order_id FROM wallet_cases WHERE n=1),'41000000-0000-4000-8000-000000000001',gen_random_uuid())$q$,'different retry key rejected');
SELECT public.test_reject($q$UPDATE public.profiles SET wallet_balance=wallet_balance+1 WHERE id='41000000-0000-4000-8000-000000000001'$q$,'direct balance mutation rejected');
SELECT public.test_reject('DELETE FROM checkout_private.wallet_entries','owner cannot erase journal');
SELECT public.test_reject('UPDATE checkout_private.wallet_entries SET delta=1','owner cannot edit journal');
SELECT public.test_reject('DELETE FROM checkout_private.wallet_opening_reviews','opening audit immutable');
SELECT public.test_assert(NOT has_function_privilege('authenticated','public.trusted_wallet_pay(uuid,uuid,uuid)','EXECUTE') AND NOT has_function_privilege('anon','public.trusted_wallet_checkout(uuid,uuid,jsonb,text)','EXECUTE'),'browser cannot invoke wallet money RPCs');
SELECT public.test_assert(NOT has_table_privilege('authenticated','checkout_private.wallet_entries','SELECT') AND NOT has_table_privilege('service_role','checkout_private.wallet_entries','DELETE') AND NOT has_table_privilege('service_role','checkout_private.wallet_control','UPDATE'),'private journal and separate operator gate');

INSERT INTO wallet_cases(n,order_id) VALUES(2,pg_temp.wallet_order(gen_random_uuid())),(3,pg_temp.wallet_order(gen_random_uuid()));
SELECT public.trusted_payment_claim((SELECT order_id FROM wallet_cases WHERE n=2),'41000000-0000-4000-8000-000000000001','fixture');
SELECT public.test_reject($q$SELECT public.trusted_wallet_pay((SELECT order_id FROM wallet_cases WHERE n=2),'41000000-0000-4000-8000-000000000001',gen_random_uuid())$q$,'gateway claim prevents wallet switching');
UPDATE checkout_private.reservations SET expires_at=now()-interval '1 second' WHERE order_id=(SELECT order_id FROM wallet_cases WHERE n=3);
SELECT public.test_reject($q$SELECT public.trusted_wallet_pay((SELECT order_id FROM wallet_cases WHERE n=3),'41000000-0000-4000-8000-000000000001',gen_random_uuid())$q$,'expired reservation prevents debit');
-- A failing final event must roll back debit, balance and paid state together.
INSERT INTO wallet_cases(n,order_id) VALUES(4,pg_temp.wallet_order(gen_random_uuid()));
CREATE FUNCTION pg_temp.reject_wallet_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic event failure'; END $$;
CREATE TRIGGER wallet_test_event_failure BEFORE INSERT ON checkout_private.wallet_events FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_wallet_event();
SELECT public.test_reject($q$SELECT public.trusted_wallet_pay((SELECT order_id FROM wallet_cases WHERE n=4),'41000000-0000-4000-8000-000000000001',gen_random_uuid())$q$,'event failure rolls back settlement');
DROP TRIGGER wallet_test_event_failure ON checkout_private.wallet_events;
SELECT public.test_assert((SELECT wallet_balance=30000 FROM public.profiles WHERE id='41000000-0000-4000-8000-000000000001') AND NOT EXISTS(SELECT 1 FROM checkout_private.wallet_entries WHERE order_id=(SELECT order_id FROM wallet_cases WHERE n=4)),'failed payment leaves balance and journal intact');
SELECT public.trusted_wallet_pay((SELECT order_id FROM wallet_cases WHERE n=4),'41000000-0000-4000-8000-000000000001',gen_random_uuid());
INSERT INTO wallet_cases(n,order_id) VALUES(5,pg_temp.wallet_order(gen_random_uuid()));
SELECT public.test_reject($q$SELECT public.trusted_wallet_pay((SELECT order_id FROM wallet_cases WHERE n=5),'41000000-0000-4000-8000-000000000001',gen_random_uuid())$q$,'overdraft rejected');
SELECT public.test_assert((public.trusted_wallet_reconcile('41000000-0000-4000-8000-000000000001')->>'consistent')::boolean,'final ledger and balance agree');
-- The wallet checkout itself must roll back its new order and variant allocation.
INSERT INTO public.product_variants(id,product_id,stock_quantity) VALUES('41000000-0000-4000-8000-000000000006','41000000-0000-4000-8000-000000000003',5);
CREATE TEMP TABLE wallet_snapshot AS SELECT count(*) AS orders FROM public.orders WHERE user_id='41000000-0000-4000-8000-000000000001';
CREATE FUNCTION pg_temp.wallet_checkout(k uuid,create_order boolean DEFAULT true,patch jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE sel jsonb;q jsonb;
BEGIN
 sel:='{"addressId":"41000000-0000-4000-8000-000000000004","shippingOption":"tipax","items":[{"productId":"41000000-0000-4000-8000-000000000003","quantity":1}]}';
 sel:=sel||patch;q:=public.trusted_wallet_checkout('41000000-0000-4000-8000-000000000001',k,sel,NULL);
 IF NOT create_order THEN RETURN q;END IF;
 RETURN public.trusted_wallet_checkout('41000000-0000-4000-8000-000000000001',k,sel,q->>'quote');
END $$;
SELECT pg_temp.wallet_checkout(gen_random_uuid(),false);
SELECT public.test_assert((SELECT stock_quantity=5 FROM public.product_variants WHERE id='41000000-0000-4000-8000-000000000006'),'quote never reserves stock');
SELECT public.test_reject('SELECT pg_temp.wallet_checkout(gen_random_uuid())','atomic checkout insufficient balance rejects');
SELECT public.test_assert((SELECT count(*) FROM public.orders WHERE user_id='41000000-0000-4000-8000-000000000001')=(SELECT orders FROM wallet_snapshot)
 AND (SELECT stock_quantity=5 FROM public.product_variants WHERE id='41000000-0000-4000-8000-000000000006'),'failed new checkout leaves no order or stock allocation');
SELECT public.test_reject($q$SELECT pg_temp.wallet_checkout(gen_random_uuid(),true,'{"amount":1}')$q$,'database rejects forged price field');
-- Credit event failure rolls back all legacy settlement side effects, too.
INSERT INTO public.wallet_topups(id,user_id,amount,payment_ref) VALUES('41000000-0000-4000-8000-000000000007','41000000-0000-4000-8000-000000000001',20000,'810002');
SELECT public.trusted_payment_lookup('41000000-0000-4000-8000-000000000007',true,'810002','wallet-fixture');
CREATE TRIGGER wallet_test_event_failure BEFORE INSERT ON checkout_private.wallet_events FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_wallet_event();
SELECT public.test_reject($q$SELECT public.trusted_payment_settle((SELECT id FROM checkout_private.attempts WHERE topup_id='41000000-0000-4000-8000-000000000007'),20000,'wallet-fixture','810002','98810002')$q$,'credit event failure rolls back settlement');
DROP TRIGGER wallet_test_event_failure ON checkout_private.wallet_events;
SELECT public.test_assert((SELECT wallet_balance=10000 FROM public.profiles WHERE id='41000000-0000-4000-8000-000000000001')
 AND NOT EXISTS(SELECT 1 FROM checkout_private.wallet_credits WHERE topup_id='41000000-0000-4000-8000-000000000007')
 AND (SELECT state='ready' FROM checkout_private.attempts WHERE topup_id='41000000-0000-4000-8000-000000000007'),'failed credit leaves balance, credit journal and attempt intact');
SELECT public.trusted_payment_settle((SELECT id FROM checkout_private.attempts WHERE topup_id='41000000-0000-4000-8000-000000000007'),20000,'wallet-fixture','810002','98810002');
CREATE TEMP TABLE wallet_checkout_result AS SELECT pg_temp.wallet_checkout('41000000-0000-4000-8000-000000000008') AS result;
SELECT public.test_assert((SELECT (result->>'success')::boolean FROM wallet_checkout_result),'atomic wallet checkout creates and pays order');
SELECT public.test_assert((pg_temp.wallet_checkout('41000000-0000-4000-8000-000000000008')->>'alreadyPaid')::boolean,'atomic checkout retry reuses paid order');
SELECT public.test_assert((SELECT stock_quantity=4 FROM public.product_variants WHERE id='41000000-0000-4000-8000-000000000006')
 AND (SELECT wallet_balance=10000 FROM public.profiles WHERE id='41000000-0000-4000-8000-000000000001'),'checkout allocates once and debits exact server price');
SELECT public.test_assert((public.trusted_wallet_reconcile('41000000-0000-4000-8000-000000000001')->>'consistent')::boolean,'atomic checkout reconciles');
SET ROLE authenticated;
SELECT public.test_reject($q$SELECT public.trusted_wallet_pay('41000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001')$q$,'actual authenticated caller denied money RPC');
SELECT public.test_reject('SELECT * FROM checkout_private.wallet_entries','actual authenticated caller denied private journal');
RESET ROLE;
SET ROLE anon;
SELECT public.test_reject($q$SELECT public.trusted_wallet_review_opening('41000000-0000-4000-8000-000000000001',0,repeat('a',64),'case-1','fixture')$q$,'actual anonymous caller denied review');
RESET ROLE;
ROLLBACK;
\echo 'Wallet credit/debit, review, permission, idempotency, receipt and rollback assertions passed.'
