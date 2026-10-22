-- Read-only postflight for the named payment-review migration. No RPC execution.
BEGIN READ ONLY;
DO $$ DECLARE signature regprocedure;
BEGIN
 signature:=to_regprocedure('public.trusted_review_payment(uuid,bigint,text,text,text,text,text,text,text,timestamptz,boolean)');
 IF signature IS NULL OR to_regclass('checkout_private.payment_reviews') IS NULL THEN
  RAISE EXCEPTION 'Payment review migration absent'; END IF;
 IF (SELECT prosecdef FROM pg_proc WHERE oid=signature)
 OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid='checkout_private.payment_reviews'::regclass)
 OR has_function_privilege('anon',signature,'EXECUTE')
 OR has_function_privilege('authenticated',signature,'EXECUTE')
 OR NOT has_function_privilege('service_role',signature,'EXECUTE') THEN
  RAISE EXCEPTION 'Payment review RPC/RLS boundary mismatch'; END IF;
 IF has_table_privilege('anon','checkout_private.payment_reviews','SELECT')
 OR has_table_privilege('authenticated','checkout_private.payment_reviews','SELECT')
 OR has_table_privilege('service_role','checkout_private.payment_reviews','UPDATE')
 OR has_table_privilege('service_role','checkout_private.payment_reviews','DELETE')
 OR has_table_privilege('service_role','checkout_private.payment_reviews','TRUNCATE') THEN
  RAISE EXCEPTION 'Payment review audit privilege mismatch'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='checkout_private.payment_reviews'::regclass
  AND tgname='payment_reviews_append_only' AND NOT tgisinternal AND tgenabled='O') THEN
  RAISE EXCEPTION 'Payment review append-only guard missing'; END IF;
END $$;
SELECT true AS payment_review_postflight_passed;
COMMIT;
