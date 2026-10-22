BEGIN READ ONLY;
DO $$ DECLARE t text;f regprocedure;
BEGIN
 FOREACH t IN ARRAY ARRAY['wallet_control','wallet_accounts','wallet_opening_reviews','wallet_entries','wallet_events'] LOOP
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid=('checkout_private.'||t)::regclass)
   OR has_table_privilege('anon','checkout_private.'||t,'SELECT')
   OR has_table_privilege('authenticated','checkout_private.'||t,'INSERT')
   OR has_table_privilege('service_role','checkout_private.'||t,'TRUNCATE') THEN RAISE EXCEPTION 'Wallet private table boundary mismatch: %',t; END IF;
 END LOOP;
 FOREACH f IN ARRAY ARRAY['public.trusted_wallet_pay(uuid,uuid,uuid)'::regprocedure,'public.trusted_wallet_checkout(uuid,uuid,jsonb,text)'::regprocedure,
 'public.trusted_wallet_review_opening(uuid,bigint,text,text,text)'::regprocedure,'public.trusted_wallet_reconcile(uuid)'::regprocedure,'public.trusted_wallet_receipt(uuid,uuid)'::regprocedure] LOOP
  IF (SELECT prosecdef FROM pg_proc WHERE oid=f) OR has_function_privilege('anon',f,'EXECUTE') OR has_function_privilege('authenticated',f,'EXECUTE') OR NOT has_function_privilege('service_role',f,'EXECUTE') THEN RAISE EXCEPTION 'Wallet RPC boundary mismatch'; END IF;
 END LOOP;
 IF has_table_privilege('service_role','checkout_private.wallet_entries','UPDATE') OR has_table_privilege('service_role','checkout_private.wallet_entries','DELETE')
 OR has_column_privilege('service_role','checkout_private.wallet_accounts','opening_balance','UPDATE')
 OR has_table_privilege('service_role','checkout_private.wallet_control','UPDATE') THEN RAISE EXCEPTION 'Wallet immutable/control boundary mismatch'; END IF;
END $$;
SELECT true AS wallet_ledger_postflight_passed;
COMMIT;
