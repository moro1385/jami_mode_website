\set ON_ERROR_STOP on
-- Durable verification and retry without consuming provider verification twice.
INSERT INTO public.orders(id,user_id,status,payment_method,total_amount,shipping_cost,checkout_version,payment_state,items_frozen)
 VALUES('21000000-0000-0000-0000-000000000101','10000000-0000-0000-0000-000000000001','pending_payment','gateway',10000,0,2,'pending',true);
SET ROLE service_role;
SELECT public.trusted_payment_claim('21000000-0000-0000-0000-000000000101','10000000-0000-0000-0000-000000000001','phase0') AS attempt \gset
SELECT public.trusted_payment_attach((:'attempt'::jsonb->>'id')::uuid,'89001');
SELECT public.trusted_verification_claim((:'attempt'::jsonb->>'id')::uuid,'99001','10000000-0000-0000-0000-000000000001') AS claim \gset
SELECT public.test_assert((:'claim'::jsonb->>'claimed')::boolean,'first verification durably claimed');
SELECT public.test_assert(NOT (public.trusted_verification_claim((:'attempt'::jsonb->>'id')::uuid,'99001','10000000-0000-0000-0000-000000000001')->>'claimed')::boolean,'duplicate verification cannot call provider again');
SELECT public.test_reject(format('SELECT public.trusted_verification_claim(%L,%L,''10000000-0000-0000-0000-000000000001'')',:'attempt'::jsonb->>'id','99002'),'different transaction cannot reuse claim');
SELECT public.test_reject(format('SELECT public.trusted_verification_record(%L,9999,%L,%L,%L)',:'attempt'::jsonb->>'id','phase0','89001','99001'),'wrong evidence amount rejected');
SELECT public.trusted_verification_record((:'attempt'::jsonb->>'id')::uuid,10000,'phase0','89001','99001');
RESET ROLE;
CREATE FUNCTION public.phase0_fixture_settle_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='21000000-0000-0000-0000-000000000101'::uuid THEN RAISE EXCEPTION 'Injected settlement failure'; END IF; RETURN NEW; END $$;
CREATE TRIGGER phase0_fixture_settle_failure BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.phase0_fixture_settle_failure();
SET ROLE service_role;
SELECT public.test_reject(format('SELECT public.trusted_payment_settle(%L,10000,%L,%L,%L)',:'attempt'::jsonb->>'id','phase0','89001','99001'),'injected settlement rollback');
SELECT public.test_assert(public.trusted_verification_claim((:'attempt'::jsonb->>'id')::uuid,'99001','10000000-0000-0000-0000-000000000001')->>'state'='verified','evidence survives a failed settlement transaction');
RESET ROLE;
DROP TRIGGER phase0_fixture_settle_failure ON public.orders;
SET ROLE service_role;
SELECT public.test_assert((public.trusted_reconcile_verified(50)->>'settled')::integer=1,'batch replays durably verified payment without provider');
SELECT public.trusted_payment_settle((:'attempt'::jsonb->>'id')::uuid,10000,'phase0','89001','99001');
SELECT public.test_assert((SELECT count(*)=1 FROM checkout_private.outbox WHERE attempt_id=(:'attempt'::jsonb->>'id')::uuid),'replayed settlement emits one event');
SELECT public.test_reject(format('UPDATE checkout_private.verifications SET state=%L WHERE attempt_id=%L','verifying',:'attempt'::jsonb->>'id'),'verified evidence cannot be reverted');
RESET ROLE;
SET ROLE authenticated;
SELECT public.test_reject(format('SELECT public.trusted_verification_claim(%L,%L,''10000000-0000-0000-0000-000000000001'')',:'attempt'::jsonb->>'id','99001'),'client cannot claim verification');
SELECT public.test_reject('SELECT * FROM checkout_private.verifications','client cannot read verification journal');
RESET ROLE;
-- Fresh orders with variant stock are registered by the wrapper.
INSERT INTO public.products(id,name,slug,price,sizes,colors) VALUES('41000000-0000-0000-0000-000000000001','Expiry shirt','phase0-expiry-shirt',10000,'{}','{}');
INSERT INTO public.product_variants(id,product_id,size,color,price,stock_quantity) VALUES('51000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000001','M','red',10000,100);
INSERT INTO public.addresses(id,user_id,line1,city) VALUES
 ('61000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','Fixture 2','Tehran'),
 ('61000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000004','Fixture 4','Tehran');
SELECT set_config('phase0.request','{"addressId":"61000000-0000-0000-0000-000000000002","shippingOption":"tipax","items":[{"productId":"41000000-0000-0000-0000-000000000001","quantity":2,"size":"M","color":"red"}]}',false);
SET ROLE service_role;
SELECT public.trusted_checkout('10000000-0000-0000-0000-000000000002','71000000-0000-0000-0000-000000000001',current_setting('phase0.request')::jsonb,NULL) AS quote \gset
SELECT public.trusted_checkout('10000000-0000-0000-0000-000000000002','71000000-0000-0000-0000-000000000001',current_setting('phase0.request')::jsonb,:'quote'::jsonb->>'quote') AS reserved \gset
SELECT public.test_assert((SELECT stock_quantity=98 FROM public.product_variants WHERE id='51000000-0000-0000-0000-000000000001'),'checkout reserves variant stock');
RESET ROLE;
UPDATE checkout_private.reservations SET expires_at=now()-interval '1 second' WHERE order_id=(:'reserved'::jsonb->>'orderId')::uuid;
SET ROLE service_role;
SELECT public.test_assert(public.trusted_expire_unstarted('10000000-0000-0000-0000-000000000002',50)=1,'unstarted expired order released');
SELECT public.test_assert(public.trusted_expire_unstarted('10000000-0000-0000-0000-000000000002',50)=0,'expiry is idempotent');
SELECT public.test_assert((SELECT stock_quantity=100 FROM public.product_variants WHERE id='51000000-0000-0000-0000-000000000001'),'stock restored exactly once');
SELECT public.test_reject(format('SELECT public.trusted_payment_claim(%L,%L,%L)',:'reserved'::jsonb->>'orderId','10000000-0000-0000-0000-000000000002','phase0'),'expired order cannot initiate payment');
SELECT public.test_assert(public.trusted_checkout('10000000-0000-0000-0000-000000000002','71000000-0000-0000-0000-000000000001',current_setting('phase0.request')::jsonb,NULL)->>'code'='CHECKOUT_EXPIRED','expired idempotency key cannot reuse stock');
SELECT public.trusted_checkout('10000000-0000-0000-0000-000000000002','71000000-0000-0000-0000-000000000002',current_setting('phase0.request')::jsonb,NULL) AS quote \gset
SELECT public.trusted_checkout('10000000-0000-0000-0000-000000000002','71000000-0000-0000-0000-000000000002',current_setting('phase0.request')::jsonb,:'quote'::jsonb->>'quote') AS held \gset
SELECT public.trusted_payment_claim((:'held'::jsonb->>'orderId')::uuid,'10000000-0000-0000-0000-000000000002','phase0');
RESET ROLE;
UPDATE checkout_private.reservations SET expires_at=now()-interval '1 second' WHERE order_id=(:'held'::jsonb->>'orderId')::uuid;
SET ROLE service_role;
SELECT public.test_assert(public.trusted_expire_unstarted(NULL,50)=0,'creating/ambiguous payment never releases stock by age');
DO $$ DECLARE q jsonb; req jsonb:=jsonb_set(current_setting('phase0.request')::jsonb,'{addressId}','"61000000-0000-0000-0000-000000000004"'); BEGIN
 FOR i IN 1..5 LOOP q:=public.trusted_checkout('10000000-0000-0000-0000-000000000004',gen_random_uuid(),req,NULL);
 PERFORM public.trusted_checkout('10000000-0000-0000-0000-000000000004',gen_random_uuid(),req,q->>'quote'); END LOOP;
END $$;
SELECT public.test_assert(public.trusted_checkout('10000000-0000-0000-0000-000000000004',gen_random_uuid(),
 jsonb_set(current_setting('phase0.request')::jsonb,'{addressId}','"61000000-0000-0000-0000-000000000004"'),'any-quote')->>'code'='PENDING_ORDER_LIMIT','sixth pending order rejected');
RESET ROLE;
-- Storage isolation, including hostile broad permissive policy from fixture.
GRANT SELECT,INSERT,UPDATE,DELETE ON public.return_requests TO authenticated;
INSERT INTO storage.objects(bucket_id,name) VALUES('return-request-images','10000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000001.jpg');
SET ROLE anon;
SELECT public.test_assert((SELECT count(*)=0 FROM storage.objects),'anonymous cannot read private images');
SELECT public.test_reject($q$ INSERT INTO storage.objects(bucket_id,name) VALUES('return-request-images','10000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000002.jpg') $q$,'anonymous upload rejected');
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',false);
SELECT public.test_assert((SELECT count(*)=0 FROM storage.objects),'another customer cannot read images');
SELECT public.test_reject($q$ INSERT INTO storage.objects(bucket_id,name) VALUES('return-request-images','10000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000002.jpg') $q$,'foreign folder upload rejected');
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',false);
SELECT public.test_assert((SELECT count(*)=1 FROM storage.objects),'owner can read own image');
INSERT INTO storage.objects(bucket_id,name) VALUES('return-request-images','10000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000003.png');
WITH updated AS(UPDATE storage.objects SET name='10000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000004.jpg' RETURNING *) SELECT public.test_assert((SELECT count(*)=0 FROM updated),'image overwrite denied');
SELECT public.test_reject($q$ INSERT INTO public.return_requests(user_id,order_id,phone,description,status) VALUES('10000000-0000-0000-0000-000000000001','21000000-0000-0000-0000-000000000101','synthetic','fixture','approved') $q$,'client cannot approve own return');
INSERT INTO public.return_requests(user_id,order_id,phone,description,image_urls) VALUES('10000000-0000-0000-0000-000000000001','21000000-0000-0000-0000-000000000101','synthetic','fixture',ARRAY['10000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000001.jpg']);
WITH deleted AS(DELETE FROM storage.objects WHERE name LIKE '10000000-0000-0000-0000-000000000001/%000001.jpg' RETURNING *) SELECT public.test_assert((SELECT count(*)=0 FROM deleted),'linked return proof retained');
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',false);
SELECT public.test_assert((SELECT count(*)=2 FROM storage.objects),'admin reads authorized return images');
RESET ROLE;
SELECT public.test_assert((SELECT NOT public FROM storage.buckets WHERE id='return-request-images'),'return bucket private');
