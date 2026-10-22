\set ON_ERROR_STOP on
BEGIN;
-- All records below belong to this disposable local transaction.
INSERT INTO auth.users(id) VALUES('31000000-0000-4000-8000-000000000001');
INSERT INTO public.products(id,name,slug,price,is_active,is_out_of_stock,sizes,colors)
 VALUES('31000000-0000-4000-8000-000000000002','Review fixture','review-fixture',20000,true,false,'{}','{}');
INSERT INTO public.addresses(id,user_id,line1)
 VALUES('31000000-0000-4000-8000-000000000003','31000000-0000-4000-8000-000000000001','Synthetic');
CREATE TEMP TABLE review_cases(n integer PRIMARY KEY,order_id uuid,attempt_id uuid);
CREATE FUNCTION pg_temp.make_review_case(n integer) RETURNS void LANGUAGE plpgsql AS $$
DECLARE q jsonb;r jsonb;a jsonb;sel jsonb;key uuid:=gen_random_uuid();
BEGIN
 sel:=jsonb_build_object('addressId','31000000-0000-4000-8000-000000000003','shippingOption','tipax',
  'items',jsonb_build_array(jsonb_build_object('productId','31000000-0000-4000-8000-000000000002','quantity',1)));
 q:=public.trusted_checkout('31000000-0000-4000-8000-000000000001',key,sel,NULL);
 r:=public.trusted_checkout('31000000-0000-4000-8000-000000000001',key,sel,q->>'quote');
 a:=public.trusted_payment_claim((r->>'orderId')::uuid,'31000000-0000-4000-8000-000000000001','review-fixture-only');
 PERFORM public.trusted_payment_attach((a->>'id')::uuid,(710000+n)::text);
 INSERT INTO review_cases VALUES(n,(r->>'orderId')::uuid,(a->>'id')::uuid);
END $$;
CREATE FUNCTION pg_temp.review_case(n integer,apply boolean DEFAULT false,patch jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE a checkout_private.attempts;j jsonb;
BEGIN
 SELECT t.* INTO STRICT a FROM checkout_private.attempts t JOIN review_cases c ON c.attempt_id=t.id WHERE c.n=review_case.n;
 j:=jsonb_build_object('attempt',a.id,'amount',a.amount,'merchant',a.merchant,'ref',a.provider_ref,'transaction','98'||a.provider_ref,
  'hash',repeat('a',64),'source','provider_support','case','ticket-'||a.provider_ref,'reviewer','fixture-reviewer','at',now())||patch;
 RETURN public.trusted_review_payment((j->>'attempt')::uuid,(j->>'amount')::bigint,j->>'merchant',j->>'ref',j->>'transaction',
  j->>'hash',j->>'source',j->>'case',j->>'reviewer',(j->>'at')::timestamptz,apply);
END $$;
SELECT pg_temp.make_review_case(1);
SELECT public.test_assert((pg_temp.review_case(1)->>'outcome')='eligible','review plan identifies eligible case');
SELECT public.test_assert((SELECT count(*)=0 FROM checkout_private.payment_reviews),'plan creates no audit');
SELECT public.test_assert(NOT EXISTS(SELECT 1 FROM checkout_private.verifications v JOIN review_cases c USING(attempt_id)),'plan creates no evidence');
SELECT public.test_assert((SELECT payment_state='pending' FROM public.orders WHERE id=(SELECT order_id FROM review_cases WHERE n=1)),'plan leaves order pending');

SELECT public.test_assert(NOT has_function_privilege('anon','public.trusted_review_payment(uuid,bigint,text,text,text,text,text,text,text,timestamptz,boolean)','EXECUTE')
 AND NOT has_function_privilege('authenticated','public.trusted_review_payment(uuid,bigint,text,text,text,text,text,text,text,timestamptz,boolean)','EXECUTE'),'review RPC denied to all browser roles including admin');
SELECT public.test_assert(NOT has_table_privilege('authenticated','checkout_private.payment_reviews','SELECT')
 AND NOT has_table_privilege('service_role','checkout_private.payment_reviews','DELETE')
 AND NOT has_table_privilege('service_role','checkout_private.payment_reviews','UPDATE')
 AND NOT has_table_privilege('service_role','checkout_private.payment_reviews','TRUNCATE'),'private audit least privileges');
SELECT public.test_assert((SELECT relrowsecurity FROM pg_class WHERE oid='checkout_private.payment_reviews'::regclass),'review audit RLS enabled');
SELECT public.test_assert((SELECT NOT prosecdef FROM pg_proc WHERE oid='public.trusted_review_payment(uuid,bigint,text,text,text,text,text,text,text,timestamptz,boolean)'::regprocedure),'review RPC uses invoker permissions');

SELECT public.test_reject($q$SELECT pg_temp.review_case(1,true,'{"amount":1}')$q$,'review rejects amount mismatch');
SELECT public.test_reject($q$SELECT pg_temp.review_case(1,true,'{"merchant":"different"}')$q$,'review rejects merchant mismatch');
SELECT public.test_reject($q$SELECT pg_temp.review_case(1,true,'{"ref":"999"}')$q$,'review rejects reference mismatch');
SELECT public.test_reject($q$SELECT pg_temp.review_case(1,true,'{"transaction":"0"}')$q$,'review rejects invalid transaction');
SELECT public.test_reject($q$SELECT pg_temp.review_case(1,true,'{"source":"callback"}')$q$,'callback is not operator evidence');
SELECT public.test_reject($q$SELECT pg_temp.review_case(1,true,'{"source":"customer_screenshot"}')$q$,'customer screenshot is not operator evidence');
SELECT public.test_reject($q$SELECT pg_temp.review_case(1,true,'{"hash":null}')$q$,'review requires evidence digest');
SELECT public.test_reject($q$SELECT pg_temp.review_case(1,true,'{"reviewer":null}')$q$,'review requires accountable reviewer label');
SELECT public.test_reject($q$SELECT pg_temp.review_case(1,true,jsonb_build_object('at',now()-interval '2 days'))$q$,'stale review rejected');
SELECT public.test_reject($q$SELECT pg_temp.review_case(1,true,jsonb_build_object('at',now()+interval '1 day'))$q$,'future review rejected');
SELECT public.test_assert((SELECT count(*)=0 FROM checkout_private.payment_reviews),'invalid reviews create no audit');

GRANT SELECT ON review_cases TO service_role;
DO $$ BEGIN EXECUTE format('GRANT USAGE ON SCHEMA %I TO service_role',pg_my_temp_schema()::regnamespace); END $$;
SET ROLE service_role;
SELECT public.test_assert((pg_temp.review_case(1,true)->>'outcome')='settled','service-only operator review settles valid order');
SELECT public.test_assert((pg_temp.review_case(1,true)->>'outcome')='already_settled','review retry is idempotent');
RESET ROLE;
SELECT public.test_assert((SELECT count(*)=1 FROM checkout_private.payment_reviews),'one immutable operator review');
SELECT public.test_assert((SELECT count(*)=1 FROM checkout_private.outbox b JOIN review_cases c ON c.attempt_id=b.attempt_id),'one settlement event');
SELECT public.test_assert((SELECT count(*)=1 FROM checkout_private.verifications v JOIN review_cases c USING(attempt_id) WHERE state='verified'),'review retains durable verification evidence');
SELECT public.test_reject($q$SELECT pg_temp.review_case(1,true,'{"hash":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}')$q$,'review cannot overwrite prior attestation');
SELECT public.test_reject('DELETE FROM checkout_private.payment_reviews','owner cannot delete immutable review');
SELECT public.test_reject($q$UPDATE checkout_private.payment_reviews SET reviewer='other-reviewer'$q$,'owner cannot edit immutable review');

SELECT pg_temp.make_review_case(2);
SELECT public.trusted_verification_claim((SELECT attempt_id FROM review_cases WHERE n=2),'98710002','31000000-0000-4000-8000-000000000001');
SELECT public.test_reject($q$SELECT pg_temp.review_case(2,true,'{"transaction":"123456"}')$q$,'review cannot rewrite existing verification identity');
SELECT public.test_assert((pg_temp.review_case(2,true)->>'outcome')='settled','ambiguous verifying claim resolves from reviewed provider evidence');

SELECT pg_temp.make_review_case(3);
SELECT public.trusted_verification_claim((SELECT attempt_id FROM review_cases WHERE n=3),'98710003','31000000-0000-4000-8000-000000000001');
SELECT public.trusted_verification_record((SELECT attempt_id FROM review_cases WHERE n=3),20000,'review-fixture-only','710003','98710003');
SELECT public.test_assert((pg_temp.review_case(3,true)->>'outcome')='durable_evidence_available','existing durable evidence uses ordinary replay instead of manual attestation');
SELECT public.test_assert(NOT EXISTS(SELECT 1 FROM checkout_private.payment_reviews r JOIN review_cases c USING(attempt_id) WHERE c.n=3),'existing evidence receives no invented manual review');

SELECT pg_temp.make_review_case(4);
SELECT public.test_reject($q$SELECT pg_temp.review_case(4,true,'{"transaction":"98710001"}')$q$,'provider transaction cannot settle a different order');
CREATE FUNCTION pg_temp.reject_review_settlement() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic outbox failure'; END $$;
CREATE TRIGGER review_test_settlement_failure BEFORE INSERT ON checkout_private.outbox FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_review_settlement();
SELECT public.test_reject('SELECT pg_temp.review_case(4,true)','settlement failure rolls back operator resolution');
DROP TRIGGER review_test_settlement_failure ON checkout_private.outbox;
SELECT public.test_assert(NOT EXISTS(SELECT 1 FROM checkout_private.payment_reviews r JOIN review_cases c USING(attempt_id) WHERE c.n=4),'failed settlement leaves no operator attestation');
SELECT public.test_assert(NOT EXISTS(SELECT 1 FROM checkout_private.verifications v JOIN review_cases c USING(attempt_id) WHERE c.n=4),'failed settlement leaves no newly fabricated durable evidence');
SELECT public.test_assert((SELECT payment_state='pending' FROM public.orders WHERE id=(SELECT order_id FROM review_cases WHERE n=4)),'failed settlement leaves payment pending');
SELECT public.test_assert((pg_temp.review_case(4,true)->>'outcome')='settled','retry after rolled-back settlement creates one valid decision');
ROLLBACK;
\echo 'Payment review operator boundary, matching, idempotency, immutable audit and atomic rollback passed.'
