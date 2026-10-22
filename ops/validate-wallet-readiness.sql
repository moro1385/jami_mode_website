-- Read-only installation/activation report. Never enables, reviews or repairs money.
BEGIN READ ONLY;
DO $$ DECLARE f regprocedure;r text;BEGIN
 IF (SELECT count(*) FROM checkout_private.wallet_zero_policy)<>1 THEN RAISE EXCEPTION 'Missing zero-opening policy';END IF;
 FOREACH f IN ARRAY ARRAY['checkout_private.wallet_zero_candidate(uuid)'::regprocedure,'checkout_private.wallet_prepare_zero(uuid)'::regprocedure] LOOP
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid=f) OR NOT has_function_privilege('service_role',f,'EXECUTE') THEN RAISE EXCEPTION 'Missing narrow provenance issuer';END IF;
  IF (SELECT proconfig FROM pg_proc WHERE oid=f) IS DISTINCT FROM ARRAY['search_path=""']::text[] THEN RAISE EXCEPTION 'Unsafe provenance search path';END IF;
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP IF has_function_privilege(r,f,'EXECUTE') THEN RAISE EXCEPTION 'Browser provenance access';END IF;END LOOP;
 END LOOP;
 FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF has_function_privilege(r,'public.trusted_review_payment(uuid,bigint,text,text,text,text,text,text,text,timestamptz,boolean)','EXECUTE') THEN RAISE EXCEPTION 'Browser review permission';END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM checkout_private.wallet_zero_origins z JOIN checkout_private.wallet_accounts a ON a.user_id=z.user_id CROSS JOIN checkout_private.wallet_zero_policy p
 WHERE a.opening_balance<>0 OR z.policy_installed_at<>p.installed_at OR z.auth_created_at<p.installed_at OR z.profile_created_at<p.installed_at) THEN RAISE EXCEPTION 'Inconsistent zero provenance';END IF;
 IF has_table_privilege('service_role','checkout_private.wallet_zero_origins','INSERT') OR has_table_privilege('service_role','checkout_private.wallet_zero_policy','UPDATE') OR has_table_privilege('service_role','checkout_private.wallet_control','UPDATE') THEN RAISE EXCEPTION 'Server key can forge policy or activation';END IF;
END $$;
SELECT jsonb_build_object('readOnly',true,'spendingEnabled',(SELECT spending_enabled FROM checkout_private.wallet_control),'topupsEnabled',(SELECT topups_enabled FROM checkout_private.wallet_control),
 'zeroOrigins',(SELECT count(*) FROM checkout_private.wallet_zero_origins),'operatorReviewedAccounts',(SELECT count(*) FROM checkout_private.wallet_opening_reviews),
 'unreviewedHistoricalProfiles',(SELECT count(*) FROM public.profiles p LEFT JOIN checkout_private.wallet_accounts a ON a.user_id=p.id
 WHERE checkout_private.wallet_zero_candidate(p.id) IS NULL AND NOT EXISTS(SELECT 1 FROM checkout_private.wallet_zero_origins z WHERE z.user_id=p.id AND a.opening_balance=0)
 AND NOT EXISTS(SELECT 1 FROM checkout_private.wallet_opening_reviews r WHERE r.user_id=p.id AND r.opening_balance=a.opening_balance)),
 'unresolvedWithoutReference',(SELECT count(*) FROM checkout_private.attempts WHERE topup_id IS NOT NULL AND version=2 AND state='creating'),
 'pendingVerification',(SELECT count(*) FROM checkout_private.verifications v JOIN checkout_private.attempts a ON a.id=v.attempt_id WHERE a.topup_id IS NOT NULL AND v.state='verifying')) AS wallet_readiness_report;
COMMIT;
