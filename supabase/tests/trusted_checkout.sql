\set ON_ERROR_STOP on
CREATE FUNCTION public.test_assert(ok boolean, message text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN IF ok IS NOT TRUE THEN RAISE EXCEPTION 'FAIL: %',message; END IF; RETURN 'PASS: '||message; END $$;
CREATE FUNCTION public.test_reject(command text, message text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE command; EXCEPTION WHEN OTHERS THEN RETURN 'PASS: '||message||' ('||SQLERRM||')'; END;
 RAISE EXCEPTION 'FAIL: expected rejection: %',message;
END $$;
GRANT EXECUTE ON FUNCTION public.test_assert(boolean,text),public.test_reject(text,text) TO service_role,authenticated,anon;

INSERT INTO public.products(id,name,slug,price,sizes,colors) VALUES
 ('40000000-0000-0000-0000-000000000001','Shirt','shirt',10000,ARRAY['M'],ARRAY['red']),
 ('40000000-0000-0000-0000-000000000002','Variant shirt','variant-shirt',10000,'{}','{}');
INSERT INTO public.product_variants(id,product_id,size,color,price,stock_quantity) VALUES
 ('50000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002','M','red',20000,2);
INSERT INTO public.addresses(id,user_id,line1,city) VALUES
 ('60000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Fixture street','Tehran');

SET ROLE service_role;
SELECT set_config('test.request','{"addressId":"60000000-0000-0000-0000-000000000001","shippingOption":"express","items":[{"productId":"40000000-0000-0000-0000-000000000001","quantity":2,"size":"M","color":"red"}]}',false);
SELECT public.trusted_checkout('10000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001',current_setting('test.request')::jsonb,NULL) AS quote \gset
SELECT public.test_assert((:'quote'::jsonb->>'total')::bigint=2020000,'server catalog and shipping calculate integer rials');
SELECT public.test_reject(format('SELECT public.trusted_checkout(%L,%L,%L,NULL)',
 '10000000-0000-0000-0000-000000000002','70000000-0000-0000-0000-000000000001',current_setting('test.request')),'foreign owned address rejected');
SELECT public.test_reject(format('SELECT public.trusted_checkout(%L,%L,%L,NULL)',
 '10000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001',
 (current_setting('test.request')::jsonb||'{"shipping_cost":0,"total_amount":1}')::text),'forged shipping and total rejected');
SELECT public.test_reject(format('SELECT public.trusted_checkout(%L,%L,%L,NULL)',
 '10000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001',
 jsonb_set(current_setting('test.request')::jsonb,'{items,0,price}','1')::text),'forged price rejected');
SELECT public.test_reject(format('SELECT public.trusted_checkout(%L,%L,%L,NULL)',
 '10000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001',
 jsonb_set(current_setting('test.request')::jsonb,'{items,0,quantity}','-1')::text),'negative quantity rejected');
SELECT public.test_reject(format('SELECT public.trusted_checkout(%L,%L,%L,NULL)',
 '10000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001',
 jsonb_set(current_setting('test.request')::jsonb,'{items,0,variantId}','"50000000-0000-0000-0000-000000000001"')::text),'wrong variant rejected');
SELECT public.test_reject(format('SELECT public.trusted_checkout(%L,%L,%L,NULL)',
 '10000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001',
 jsonb_set(current_setting('test.request')::jsonb,'{shippingOption}','"free-forged"')::text),'unknown shipping rejected');
SELECT public.test_reject(format('SELECT public.trusted_checkout(%L,%L,%L,NULL)',
 '10000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001',
 jsonb_set(current_setting('test.request')::jsonb,'{items,0,quantity}',value)::text),'invalid quantity '||value::text)
 FROM jsonb_array_elements('[0,1.5,101,99999999999999999,null,"2"]'::jsonb);
SELECT public.test_reject(format('SELECT public.trusted_checkout(%L,%L,%L,NULL)',
 '10000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001',
 (current_setting('test.request')::jsonb-'items')::text),'missing items rejected');
RESET ROLE;
UPDATE public.products SET price=11000 WHERE slug='shirt';
SET ROLE service_role;
SELECT public.test_reject(format('SELECT public.trusted_checkout(%L,%L,%L,%L)',
 '10000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001',current_setting('test.request'),:'quote'::jsonb->>'quote'),'stale catalog quote rejected');
SELECT public.trusted_checkout('10000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001',current_setting('test.request')::jsonb,NULL) AS quote \gset
SELECT public.trusted_checkout('10000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001',current_setting('test.request')::jsonb,:'quote'::jsonb->>'quote') AS result \gset
SELECT public.trusted_checkout('10000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001',current_setting('test.request')::jsonb,:'quote'::jsonb->>'quote') AS duplicate \gset
SELECT public.test_assert(:'result'::jsonb=:'duplicate'::jsonb,'same key returns identical order');
SELECT public.test_assert((SELECT count(*)=1 FROM public.order_items WHERE order_id=(:'result'::jsonb->>'orderId')::uuid),'transaction contains frozen items');
SELECT public.test_reject(format('INSERT INTO public.order_items(order_id,quantity,price) VALUES(%L,1,1)',:'result'::jsonb->>'orderId'),'privileged insert into frozen order rejected');
SELECT public.test_reject(format('DELETE FROM public.order_items WHERE order_id=%L',:'result'::jsonb->>'orderId'),'frozen item delete rejected');
SELECT public.test_assert((SELECT count(*)=1 FROM checkout_private.requests),'only one checkout created before rollback test');
RESET ROLE;
CREATE FUNCTION public.fixture_item_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.product_id='40000000-0000-0000-0000-000000000002'::uuid THEN RAISE EXCEPTION 'Injected item snapshot failure'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER aaa_fixture_item_failure BEFORE INSERT ON public.order_items FOR EACH ROW EXECUTE FUNCTION public.fixture_item_failure();
SET ROLE service_role;
SELECT jsonb_set(current_setting('test.request')::jsonb,'{items}',
 (current_setting('test.request')::jsonb->'items')||'[{"productId":"40000000-0000-0000-0000-000000000002","quantity":1,"size":"M","color":"red"}]'::jsonb) AS failing_request \gset
SELECT public.trusted_checkout('10000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000077',:'failing_request'::jsonb,NULL) AS failing_quote \gset
SELECT count(*) AS order_count FROM public.orders \gset
SELECT public.test_reject(format('SELECT public.trusted_checkout(%L,%L,%L,%L)',
 '10000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000077',:'failing_request',:'failing_quote'::jsonb->>'quote'),'failed item snapshot aborts checkout transaction');
SELECT public.test_assert((SELECT count(*)=:'order_count'::integer FROM public.orders),'failed checkout leaves no orphan order');
SELECT public.test_assert((SELECT count(*)=1 FROM checkout_private.requests),'failed checkout leaves no retry record');
SELECT public.test_assert((SELECT stock_quantity=2 FROM public.product_variants WHERE id='50000000-0000-0000-0000-000000000001'),'failed checkout preserves stock');
RESET ROLE;
DROP TRIGGER aaa_fixture_item_failure ON public.order_items;
SET ROLE service_role;
SELECT public.trusted_payment_claim((:'result'::jsonb->>'orderId')::uuid,'10000000-0000-0000-0000-000000000001','fixture-merchant') AS attempt \gset
SELECT public.trusted_payment_claim((:'result'::jsonb->>'orderId')::uuid,'10000000-0000-0000-0000-000000000001','fixture-merchant') AS retry \gset
SELECT public.test_assert((:'attempt'::jsonb->>'claimed')::boolean AND NOT (:'retry'::jsonb->>'claimed')::boolean,'duplicate initiation claims only once');
SELECT public.trusted_payment_attach((:'attempt'::jsonb->>'id')::uuid,'1234');
SELECT public.test_reject(format('SELECT public.trusted_payment_settle(%L,1,%L,%L,%L)',:'attempt'::jsonb->>'id','fixture-merchant','1234','t1'),'wrong amount settlement rejected');
SELECT public.test_reject(format('SELECT public.trusted_payment_settle(%L,2022000,%L,%L,%L)',:'attempt'::jsonb->>'id','wrong-merchant','1234','t1'),'wrong merchant rejected');
SELECT public.trusted_payment_settle((:'attempt'::jsonb->>'id')::uuid,2022000,'fixture-merchant','1234','t1');
SELECT public.trusted_payment_settle((:'attempt'::jsonb->>'id')::uuid,2022000,'fixture-merchant','1234','t1');
SELECT public.test_assert((SELECT count(*)=1 FROM checkout_private.outbox),'duplicate callbacks settle once');
SELECT public.test_reject(format('UPDATE checkout_private.attempts SET amount=1 WHERE id=%L',:'attempt'::jsonb->>'id'),'persisted amount is immutable');
SELECT public.test_reject(format('UPDATE checkout_private.attempts SET state=%L,transaction_id=NULL WHERE id=%L','ready',:'attempt'::jsonb->>'id'),'settled attempt cannot downgrade');

-- Inject a write failure AFTER wallet/order updates, within the same function.
RESET ROLE;
CREATE FUNCTION public.fixture_outbox_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected outbox failure'; END $$;
CREATE TRIGGER fixture_outbox_failure BEFORE INSERT ON checkout_private.outbox FOR EACH ROW EXECUTE FUNCTION public.fixture_outbox_failure();
SET ROLE service_role;
SELECT public.trusted_payment_lookup('30000000-0000-0000-0000-000000000001',true,'old-topup-reference','fixture-merchant') AS wallet \gset
SELECT public.test_reject(format('SELECT public.trusted_payment_settle(%L,1000,%L,%L,%L)',:'wallet'::jsonb->>'id','fixture-merchant','old-topup-reference','wallet-t1'),'failed outbox write aborts entire settlement');
SELECT public.test_assert((SELECT wallet_balance=5000 FROM public.profiles WHERE id='10000000-0000-0000-0000-000000000001'),'failed settlement preserves wallet');
SELECT public.test_assert((SELECT count(*)=0 FROM checkout_private.wallet_credits),'failed settlement preserves ledger');
SELECT public.test_assert((SELECT state='ready' FROM checkout_private.attempts WHERE id=(:'wallet'::jsonb->>'id')::uuid),'failed settlement leaves retryable attempt');
RESET ROLE;
DROP TRIGGER fixture_outbox_failure ON checkout_private.outbox;
SET ROLE service_role;

-- Legacy topup settlement changes existing balance only by a proven new credit.
SELECT public.trusted_payment_lookup('30000000-0000-0000-0000-000000000001',true,'old-topup-reference','fixture-merchant') AS wallet \gset
BEGIN;
SELECT public.trusted_payment_settle((:'wallet'::jsonb->>'id')::uuid,1000,'fixture-merchant','old-topup-reference','wallet-t1');
ROLLBACK;
SELECT public.test_assert((SELECT wallet_balance=5000 FROM public.profiles WHERE id='10000000-0000-0000-0000-000000000001'),'rollback preserves wallet balance');
SELECT public.test_assert((SELECT count(*)=0 FROM checkout_private.wallet_credits),'rollback removes ledger credit');
SELECT public.trusted_payment_settle((:'wallet'::jsonb->>'id')::uuid,1000,'fixture-merchant','old-topup-reference','wallet-t1');
SELECT public.trusted_payment_settle((:'wallet'::jsonb->>'id')::uuid,1000,'fixture-merchant','old-topup-reference','wallet-t1');
SELECT public.test_assert((SELECT wallet_balance=6000 FROM public.profiles WHERE id='10000000-0000-0000-0000-000000000001'),'wallet double credit prevented');
SELECT public.test_reject('UPDATE checkout_private.wallet_credits SET delta=1','ledger append only');

RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',false);
SELECT public.test_reject('SELECT public.trusted_checkout(NULL,NULL,NULL,NULL)','customer cannot invoke trusted routines');
SELECT public.test_reject('INSERT INTO public.orders(user_id,total_amount) VALUES(auth.uid(),1)','direct order insert rejected');
SELECT public.test_reject(format('INSERT INTO public.order_items(order_id,quantity,price) VALUES(%L,1,1)',:'result'::jsonb->>'orderId'),'direct item insert rejected');
SELECT public.test_reject('UPDATE public.profiles SET wallet_balance=100000','direct wallet credit rejected');
UPDATE public.profiles SET first_name='Compatible signup' WHERE id=auth.uid();
SELECT public.test_assert((SELECT first_name='Compatible signup' FROM public.profiles WHERE id=auth.uid()),'profile updates remain compatible');
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',false);
UPDATE public.orders SET status='processing' WHERE id=(:'result'::jsonb->>'orderId')::uuid;
SELECT public.test_assert((SELECT status='processing' FROM public.orders WHERE id=(:'result'::jsonb->>'orderId')::uuid),'admin fulfillment remains compatible');
SET ROLE anon;
SELECT public.test_reject('SELECT public.trusted_payment_settle(NULL,1,NULL,NULL,NULL)','anonymous settlement rejected');
RESET ROLE;
SET ROLE fixture_auth_admin;
INSERT INTO auth.users(id,raw_user_meta_data) VALUES('10000000-0000-0000-0000-000000000088','{"wallet_balance":999999,"role":"admin"}');
RESET ROLE;
SELECT public.test_assert((SELECT wallet_balance=0 FROM public.profiles WHERE id='10000000-0000-0000-0000-000000000088'),'signup trigger preserves zero initial balance');
SELECT public.test_assert(NOT public.has_role('10000000-0000-0000-0000-000000000088','admin'::public.app_role),'signup metadata cannot grant admin');
