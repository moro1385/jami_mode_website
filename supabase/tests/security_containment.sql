-- Run only on a disposable database after the fixture and containment migration.
-- Every assertion below uses actual PostgreSQL privileges/RLS, not SQL text matching.
BEGIN;
CREATE FUNCTION pg_temp.ok(condition boolean, label text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  IF condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %', label; END IF;
  RETURN 'PASS: ' || label;
END $$;
CREATE FUNCTION pg_temp.denied(statement text, label text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE statement;
  EXCEPTION WHEN insufficient_privilege THEN RETURN 'PASS: ' || label;
  END;
  RAISE EXCEPTION 'FAIL: % (expected SQLSTATE 42501)', label;
END $$;

SELECT pg_temp.ok(NOT has_column_privilege('authenticated','public.profiles','wallet_balance','INSERT'), 'no effective wallet INSERT');
SELECT pg_temp.ok(NOT has_column_privilege('authenticated','public.profiles','wallet_balance','UPDATE'), 'no effective wallet UPDATE');
SELECT pg_temp.ok(NOT has_table_privilege('authenticated','public.profiles','INSERT'), 'no table-wide profile INSERT');
SELECT pg_temp.ok(NOT has_table_privilege('authenticated','public.profiles','UPDATE'), 'no table-wide profile UPDATE');
SELECT pg_temp.ok(EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.profiles'::regclass AND attname='email' AND NOT attisdropped), 'missing contact email column supplied for existing profile form');
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname LIKE 'Containment%' AND roles <> ARRAY['public']::name[]), 'restrictive guards apply to anonymous and authenticated roles');
SELECT pg_temp.ok(NOT has_table_privilege('authenticated','public.orders','TRUNCATE'), 'RLS-bypassing TRUNCATE revoked');
SELECT pg_temp.ok(NOT has_column_privilege('anon','public.profiles','wallet_balance','UPDATE'), 'anon/public wallet grant removed');
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='order_items' AND policyname='Users can insert order items'), 'known unconditional item policy removed');
SELECT pg_temp.ok((SELECT wallet_balance=5000 FROM public.profiles WHERE id='10000000-0000-0000-0000-000000000001'), 'historical balance unchanged');
SELECT pg_temp.ok((SELECT wallet_balance=77 FROM public.profiles WHERE id='10000000-0000-0000-0000-000000000002'), 'normalizing default did not rewrite historical balance');
SELECT pg_temp.ok((SELECT status='confirmed' AND payment_method='wallet' FROM public.orders WHERE id='20000000-0000-0000-0000-000000000002'), 'historical wallet order unchanged');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
SELECT pg_temp.denied($q$UPDATE public.profiles SET wallet_balance=999999 WHERE id=auth.uid()$q$, 'own balance update blocked');
SELECT pg_temp.denied($q$UPDATE public.profiles SET wallet_balance=0, first_name='bad' WHERE id=auth.uid()$q$, 'mixed financial profile update blocked');
SELECT pg_temp.denied($q$UPDATE public.profiles SET id='10000000-0000-0000-0000-000000000002' WHERE id=auth.uid()$q$, 'profile identity change blocked');
SELECT pg_temp.denied($q$INSERT INTO public.profiles(id,wallet_balance) VALUES(auth.uid(),999) ON CONFLICT(id) DO UPDATE SET wallet_balance=excluded.wallet_balance$q$, 'wallet upsert blocked');
WITH changed AS (UPDATE public.profiles SET first_name='safe', last_name='customer', email='customer@example.invalid' WHERE id=auth.uid() RETURNING id)
SELECT pg_temp.ok((SELECT count(*)=1 FROM changed), 'narrow profile edit succeeds');
SELECT pg_temp.ok((SELECT first_name='safe' AND wallet_balance=5000 FROM public.profiles WHERE id=auth.uid()), 'failed mixed update did not change balance');
WITH changed AS (UPDATE public.profiles SET first_name='intruder' WHERE id='10000000-0000-0000-0000-000000000002' RETURNING id)
SELECT pg_temp.ok((SELECT count(*)=0 FROM changed), 'cross-user profile update blocked');
WITH removed AS (DELETE FROM public.profiles WHERE id=auth.uid() RETURNING id)
SELECT pg_temp.ok((SELECT count(*)=0 FROM removed), 'inherited DELETE plus FOR ALL cannot remove own financial profile');
SELECT pg_temp.denied($q$INSERT INTO public.profiles(id,first_name) VALUES('10000000-0000-0000-0000-000000000004','intruder')$q$, 'cross-user profile insert blocked despite permissive policy');

-- A missing trigger-created profile can still be inserted with the narrow payload.
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000004',true);
SELECT pg_temp.denied($q$INSERT INTO public.profiles(id,wallet_balance) VALUES(auth.uid(),0)$q$, 'explicit zero balance insert blocked');
SELECT pg_temp.denied($q$INSERT INTO public.profiles(id,wallet_balance) VALUES(auth.uid(),999)$q$, 'nonzero balance insert blocked');
INSERT INTO public.profiles(id, first_name, last_name, phone) VALUES(auth.uid(),'new','customer','+989110000004');
SELECT pg_temp.ok((SELECT wallet_balance=0 FROM public.profiles WHERE id=auth.uid()), 'signup fallback inserts default zero balance');
WITH changed AS (UPDATE public.profiles SET first_name='trigger-compatible' WHERE id=auth.uid() RETURNING id)
SELECT pg_temp.ok((SELECT count(*)=1 FROM changed), 'trigger-existing profile update succeeds without updating id');

SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
SELECT pg_temp.denied(format('INSERT INTO public.orders(user_id,status,payment_method) VALUES(auth.uid(),%L,''gateway'')',state), 'blocked order state: ' || coalesce(state,'NULL'))
FROM unnest(ARRAY['confirmed','paid','processing','delivered','pending','payment_failed',NULL]::text[]) state;
SELECT pg_temp.denied($q$INSERT INTO public.orders(user_id,status,payment_method) VALUES(auth.uid(),'pending_payment','wallet')$q$, 'wallet order insert blocked');
SELECT pg_temp.denied($q$INSERT INTO public.orders(user_id,status,payment_method) VALUES(auth.uid(),'pending_payment',NULL)$q$, 'null method insert blocked');
SELECT pg_temp.denied($q$INSERT INTO public.orders(user_id,status,payment_method) VALUES('10000000-0000-0000-0000-000000000002','pending_payment','gateway')$q$, 'cross-user order insert blocked despite permissive policy');
SELECT pg_temp.denied($q$INSERT INTO public.orders(user_id,status,payment_method,payment_ref) VALUES(auth.uid(),'pending_payment','gateway','')$q$, 'supplied reference insert blocked');
SELECT pg_temp.denied($q$INSERT INTO public.orders(user_id,status,payment_method,payment_trans_id) VALUES(auth.uid(),'pending_payment','gateway','fake-paid')$q$, 'supplied transaction insert blocked');
INSERT INTO public.orders(id,user_id,status,payment_method,total_amount)
VALUES('20000000-0000-0000-0000-000000000004',auth.uid(),'pending_payment','gateway',1000);
SELECT pg_temp.ok((SELECT status='pending_payment' AND payment_trans_id IS NULL FROM public.orders WHERE id='20000000-0000-0000-0000-000000000004'), 'unpaid gateway intent succeeds');
WITH changed AS (UPDATE public.orders SET status='confirmed',payment_trans_id='fake' WHERE id='20000000-0000-0000-0000-000000000004' RETURNING id)
SELECT pg_temp.ok((SELECT count(*)=0 FROM changed), 'customer cannot update own order despite permissive update policy');
SELECT pg_temp.denied($q$INSERT INTO public.orders(id,user_id,status,payment_method) VALUES('20000000-0000-0000-0000-000000000004',auth.uid(),'confirmed','gateway') ON CONFLICT(id) DO UPDATE SET status=excluded.status$q$, 'paid order upsert blocked');
SELECT pg_temp.denied($q$INSERT INTO public.orders(id,user_id,status,payment_method) VALUES('20000000-0000-0000-0000-000000000004',auth.uid(),'pending_payment','gateway') ON CONFLICT(id) DO UPDATE SET status='confirmed'$q$, 'pending INSERT cannot use conflict UPDATE to confirm');
WITH removed AS (DELETE FROM public.orders WHERE id='20000000-0000-0000-0000-000000000002' RETURNING id)
SELECT pg_temp.ok((SELECT count(*)=0 FROM removed), 'FOR ALL cannot remove paid order history');

SELECT pg_temp.denied($q$INSERT INTO public.order_items(order_id,quantity,price) VALUES('20000000-0000-0000-0000-000000000001',1,1000)$q$, 'cross-user item insert blocked despite another true policy');
SELECT pg_temp.denied($q$INSERT INTO public.order_items(order_id,quantity,price) VALUES('20000000-0000-0000-0000-000000000002',1,1000)$q$, 'item append to confirmed order blocked');
SELECT pg_temp.denied($q$INSERT INTO public.order_items(order_id,quantity,price) VALUES('20000000-0000-0000-0000-000000000003',1,1000)$q$, 'item append after initiation blocked');
INSERT INTO public.order_items(order_id,quantity,price) VALUES('20000000-0000-0000-0000-000000000004',1,1000);
SELECT pg_temp.ok((SELECT count(*)=1 FROM public.order_items WHERE order_id='20000000-0000-0000-0000-000000000004'), 'own unpaid uninitialized order accepts items');
WITH changed AS (UPDATE public.order_items SET price=0, order_id='20000000-0000-0000-0000-000000000001' RETURNING id)
SELECT pg_temp.ok((SELECT count(*)=0 FROM changed), 'FOR ALL cannot mutate or reparent items');
WITH removed AS (DELETE FROM public.order_items RETURNING id)
SELECT pg_temp.ok((SELECT count(*)=0 FROM removed), 'FOR ALL cannot delete items');
SELECT pg_temp.denied($q$INSERT INTO public.wallet_topups(user_id,amount) VALUES(auth.uid(),1000)$q$, 'direct new topup blocked');
WITH changed AS (UPDATE public.wallet_topups SET amount=1, status='confirmed',payment_trans_id='fake' RETURNING id)
SELECT pg_temp.ok((SELECT count(*)=0 FROM changed), 'FOR ALL cannot alter legacy topup amount or settlement');
WITH removed AS (DELETE FROM public.wallet_topups RETURNING id)
SELECT pg_temp.ok((SELECT count(*)=0 FROM removed), 'FOR ALL cannot remove legacy topups');
SELECT pg_temp.ok((SELECT payment_ref='old-topup-reference' FROM public.wallet_topups WHERE id='30000000-0000-0000-0000-000000000001'), 'existing topup remains readable');

SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
-- Existing UPDATE policy + ambient grant must not authorize payment manufacture.
SELECT pg_temp.denied($q$UPDATE public.orders SET status='confirmed' WHERE id='20000000-0000-0000-0000-000000000003'$q$, 'admin cannot confirm unpaid gateway intent');
SELECT pg_temp.denied($q$UPDATE public.orders SET status='shipped' WHERE id='20000000-0000-0000-0000-000000000003'$q$, 'admin cannot fulfill unpaid gateway intent');
SELECT pg_temp.denied($q$UPDATE public.orders SET payment_trans_id='fake' WHERE id='20000000-0000-0000-0000-000000000002'$q$, 'admin cannot inject payment evidence');
SELECT pg_temp.denied($q$UPDATE public.orders SET total_amount=1 WHERE id='20000000-0000-0000-0000-000000000002'$q$, 'admin cannot change paid amount');
SELECT pg_temp.denied($q$UPDATE public.orders SET payment_method='wallet' WHERE id='20000000-0000-0000-0000-000000000003'$q$, 'admin cannot change payment method');
WITH changed AS (UPDATE public.orders SET status='shipped' WHERE id='20000000-0000-0000-0000-000000000002' RETURNING id)
SELECT pg_temp.ok((SELECT count(*)=1 FROM changed), 'existing admin order UPDATE still works with ambient grant');
SELECT pg_temp.denied($q$UPDATE public.orders SET status=NULL WHERE id='20000000-0000-0000-0000-000000000002'$q$, 'admin cannot erase fulfillment state');
SELECT pg_temp.denied($q$UPDATE public.orders SET status='confirmed' WHERE id='20000000-0000-0000-0000-000000000002'$q$, 'admin cannot re-confirm a fulfillment order');
UPDATE public.orders SET status='processing' WHERE id='20000000-0000-0000-0000-000000000002';
UPDATE public.orders SET status='delivered' WHERE id='20000000-0000-0000-0000-000000000002';
UPDATE public.orders SET status='cancelled' WHERE id='20000000-0000-0000-0000-000000000002';
SELECT pg_temp.ok((SELECT status='cancelled' FROM public.orders WHERE id='20000000-0000-0000-0000-000000000002'), 'existing processing delivery and cancellation workflows preserved');
SELECT pg_temp.denied($q$UPDATE public.orders SET status='shipped' WHERE id='20000000-0000-0000-0000-000000000002'$q$, 'cancelled order requires reconciliation before reopening');
SELECT pg_temp.denied($q$INSERT INTO public.orders(user_id,status,payment_method) VALUES(auth.uid(),'confirmed','gateway')$q$, 'browser admin cannot insert pre-paid order');
SELECT pg_temp.denied($q$UPDATE public.profiles SET wallet_balance=1 WHERE id=auth.uid()$q$, 'browser admin cannot write balance');

SET LOCAL ROLE service_role;
UPDATE public.profiles SET wallet_balance=wallet_balance+1000 WHERE id='10000000-0000-0000-0000-000000000001';
UPDATE public.wallet_topups SET status='confirmed',payment_trans_id='trusted-old-topup' WHERE id='30000000-0000-0000-0000-000000000001';
UPDATE public.orders SET status='confirmed',payment_trans_id='trusted-order' WHERE id='20000000-0000-0000-0000-000000000003';
SELECT pg_temp.ok((SELECT wallet_balance=6000 FROM public.profiles WHERE id='10000000-0000-0000-0000-000000000001'), 'trusted balance write remains permitted');
SELECT pg_temp.ok((SELECT status='confirmed' FROM public.wallet_topups WHERE id='30000000-0000-0000-0000-000000000001'), 'trusted old-topup settlement remains permitted');
SELECT pg_temp.ok((SELECT status='confirmed' FROM public.orders WHERE id='20000000-0000-0000-0000-000000000003'), 'trusted order verification remains permitted');

RESET ROLE;
-- A non-owner, non-BYPASSRLS auth writer must still invoke the definer trigger.
SET LOCAL ROLE fixture_auth_admin;
INSERT INTO auth.users(id,phone) VALUES('10000000-0000-0000-0000-000000000005','+989110000005');
RESET ROLE;
SELECT pg_temp.ok((SELECT wallet_balance=0 FROM public.profiles WHERE id='10000000-0000-0000-0000-000000000005'), 'auth signup trigger still creates zero-balance profile');
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub','',true);
SELECT pg_temp.denied($q$INSERT INTO public.profiles(id) VALUES('10000000-0000-0000-0000-000000000006')$q$, 'anonymous profile insert blocked');
SELECT pg_temp.denied($q$INSERT INTO public.orders(user_id,status,payment_method) VALUES('10000000-0000-0000-0000-000000000001','confirmed','gateway')$q$, 'anonymous paid order blocked');
SELECT pg_temp.denied($q$INSERT INTO public.order_items(order_id) VALUES('20000000-0000-0000-0000-000000000001')$q$, 'anonymous item insert blocked');
SELECT pg_temp.denied($q$INSERT INTO public.wallet_topups(user_id,amount) VALUES('10000000-0000-0000-0000-000000000001',1000)$q$, 'anonymous topup blocked despite INSERT grant and FOR ALL policy');
SELECT pg_temp.denied($q$TRUNCATE public.orders$q$, 'anonymous TRUNCATE blocked');
ROLLBACK;
