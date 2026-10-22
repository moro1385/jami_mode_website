-- Read-only installation checks. Never changes gates, accounts or payments.
DO $$ DECLARE r text; f text; BEGIN
 IF NOT EXISTS(SELECT 1 FROM checkout_private.wallet_control WHERE singleton) THEN RAISE EXCEPTION 'Missing wallet control';END IF;
 FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
  FOREACH f IN ARRAY ARRAY['public.trusted_wallet_topup_claim(uuid,uuid,bigint,text)','public.trusted_wallet_topup_attach(uuid,uuid,text,text)','public.trusted_wallet_topup_status(uuid,uuid)'] LOOP
   IF has_function_privilege(r,f,'EXECUTE') OR NOT has_function_privilege('service_role',f,'EXECUTE') THEN RAISE EXCEPTION 'Invalid topup RPC grants';END IF;
  END LOOP;
  IF has_table_privilege(r,'checkout_private.wallet_topup_requests','INSERT') THEN RAISE EXCEPTION 'Public topup journal access';END IF;
 END LOOP;
 IF has_table_privilege('service_role','checkout_private.wallet_control','UPDATE') THEN RAISE EXCEPTION 'Server can change activation gate';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.wallet_topups'::regclass AND tgname='wallet_topup_guard' AND tgenabled='O') THEN RAISE EXCEPTION 'Missing topup guard';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.wallet_topups'::regclass AND attname='payment_version' AND attnotnull) THEN RAISE EXCEPTION 'Missing stored topup version';END IF;
END $$;
SELECT 'wallet_topups_installed' AS check,(SELECT topups_enabled FROM checkout_private.wallet_control WHERE singleton) AS topups_enabled,
 (SELECT spending_enabled FROM checkout_private.wallet_control WHERE singleton) AS spending_enabled;
