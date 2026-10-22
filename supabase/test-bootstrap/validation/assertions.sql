\set ON_ERROR_STOP on
INSERT INTO auth.users(id,phone) VALUES
 ('10000000-0000-0000-0000-000000000001','+12025550101'),
 ('10000000-0000-0000-0000-000000000002','+12025550102'),
 ('10000000-0000-0000-0000-000000000003','+12025550103');
INSERT INTO public.user_roles(user_id,role) VALUES('10000000-0000-0000-0000-000000000003','admin');
INSERT INTO public.products(id,name,slug,price,sizes,colors) VALUES
 ('40000000-0000-0000-0000-000000000001','Synthetic variant shirt','synthetic-shirt',10000,ARRAY['M'],ARRAY['red']);
INSERT INTO public.product_variants(id,product_id,size,color,price,stock_quantity) VALUES
 ('50000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','M','red',20000,2);
INSERT INTO public.addresses(id,user_id,line1) VALUES
 ('60000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Synthetic street');
SET ROLE anon;
SELECT count(*) FROM public.products;
RESET ROLE;
DO $$ BEGIN
 IF has_function_privilege('anon','public.trusted_checkout(uuid,uuid,jsonb,text)','EXECUTE')
 OR has_function_privilege('authenticated','public.trusted_checkout(uuid,uuid,jsonb,text)','EXECUTE')
 OR has_column_privilege('authenticated','public.profiles','wallet_balance','UPDATE')
 OR has_column_privilege('authenticated','public.orders','total_amount','UPDATE')
 OR has_table_privilege('authenticated','public.orders','INSERT') THEN RAISE EXCEPTION 'Financial isolation failed'; END IF;
 IF NOT has_column_privilege('authenticated','public.orders','status','UPDATE')
 OR NOT has_table_privilege('authenticated','public.carts','INSERT') THEN RAISE EXCEPTION 'Required UI grant missing'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='test_orders_profile_fkey')
 OR NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='product-images') THEN RAISE EXCEPTION 'Relationship/bucket missing'; END IF;
END $$;
SET ROLE service_role;
SELECT public.trusted_checkout('10000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001',
 '{"addressId":"60000000-0000-0000-0000-000000000001","shippingOption":"express","items":[{"productId":"40000000-0000-0000-0000-000000000001","quantity":2,"size":"M","color":"red"}]}',NULL) AS quote \gset
SELECT public.trusted_checkout('10000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001',
 '{"addressId":"60000000-0000-0000-0000-000000000001","shippingOption":"express","items":[{"productId":"40000000-0000-0000-0000-000000000001","quantity":2,"size":"M","color":"red"}]}',:'quote'::jsonb->>'quote') AS result \gset
SELECT public.trusted_payment_claim((:'result'::jsonb->>'orderId')::uuid,'10000000-0000-0000-0000-000000000001','test:localhost-fake') AS attempt \gset
SELECT public.trusted_payment_attach((:'attempt'::jsonb->>'id')::uuid,'1234');
SELECT public.trusted_payment_settle((:'attempt'::jsonb->>'id')::uuid,2040000,'test:localhost-fake','1234','91234');
SELECT public.trusted_payment_settle((:'attempt'::jsonb->>'id')::uuid,2040000,'test:localhost-fake','1234','91234');
DO $$ BEGIN
 IF (SELECT count(*) FROM checkout_private.outbox)<>1
 OR (SELECT stock_quantity FROM public.product_variants WHERE sku IS NULL)<>0
 OR NOT EXISTS(SELECT 1 FROM public.orders WHERE payment_state='paid' AND items_frozen AND total_amount=2040000)
 THEN RAISE EXCEPTION 'Checkout persistence/idempotency failed'; END IF;
END $$;
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',false);
UPDATE public.orders SET status='processing' WHERE payment_state='paid';
RESET ROLE;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.orders WHERE status='processing') THEN RAISE EXCEPTION 'Admin fulfillment failed'; END IF;
END $$;
\echo 'All 32 migrations, scoped bootstrap fixes, anonymous catalog, financial isolation, checkout settlement and admin fulfillment passed.'
