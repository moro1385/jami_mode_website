-- Prospective zero opening only. No Auth/profile trigger, backfill, credit or gate activation.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE checkout_private.wallet_zero_policy(singleton boolean PRIMARY KEY CHECK(singleton),installed_at timestamptz NOT NULL);
INSERT INTO checkout_private.wallet_zero_policy VALUES(true,clock_timestamp());
CREATE TABLE checkout_private.wallet_zero_origins(
 user_id uuid PRIMARY KEY REFERENCES checkout_private.wallet_accounts(user_id),
 source text NOT NULL CHECK(source='prospective-zero-v1'),
 auth_created_at timestamptz NOT NULL,profile_created_at timestamptz NOT NULL,policy_installed_at timestamptz NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(auth_created_at>=policy_installed_at AND profile_created_at>=policy_installed_at)
);
ALTER TABLE checkout_private.wallet_zero_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkout_private.wallet_zero_origins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON checkout_private.wallet_zero_policy,checkout_private.wallet_zero_origins FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON checkout_private.wallet_zero_policy,checkout_private.wallet_zero_origins TO service_role;
CREATE TRIGGER wallet_zero_policy_immutable BEFORE UPDATE OR DELETE ON checkout_private.wallet_zero_policy FOR EACH ROW EXECUTE FUNCTION checkout_private.append_only();
CREATE TRIGGER wallet_zero_origins_immutable BEFORE UPDATE OR DELETE ON checkout_private.wallet_zero_origins FOR EACH ROW EXECUTE FUNCTION checkout_private.append_only();
-- Narrow definer: reads only trusted identity timestamps and wallet facts.
-- It never returns Auth metadata, phones, tokens or other users' identities.
CREATE FUNCTION checkout_private.wallet_zero_candidate(p_user uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('authCreatedAt',u.created_at,'profileCreatedAt',p.created_at,'policyInstalledAt',z.installed_at)
 FROM auth.users u JOIN public.profiles p ON p.id=u.id CROSS JOIN checkout_private.wallet_zero_policy z
 LEFT JOIN checkout_private.wallet_accounts a ON a.user_id=p.id
 WHERE p.id=p_user AND z.singleton AND p.wallet_balance=0 AND u.created_at>=z.installed_at AND p.created_at>=z.installed_at
 AND isfinite(u.created_at) AND isfinite(p.created_at) AND u.created_at<=now() AND p.created_at<=now()
 AND (a.user_id IS NULL OR (a.opening_balance=0 AND a.balance=0))
 AND NOT EXISTS(SELECT 1 FROM public.wallet_topups t WHERE t.user_id=p.id)
 AND NOT EXISTS(SELECT 1 FROM checkout_private.wallet_entries e WHERE e.user_id=p.id)
 AND NOT EXISTS(SELECT 1 FROM checkout_private.wallet_credits c WHERE c.user_id=p.id)
 AND NOT EXISTS(SELECT 1 FROM checkout_private.wallet_opening_reviews r WHERE r.user_id=p.id);
$$;
-- The only automatic issuance path. Locks the profile before checking facts,
-- writes a fixed zero account/provenance, and cannot add money or change an opening.
CREATE FUNCTION checkout_private.wallet_prepare_zero(p_user uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE proof jsonb;
BEGIN
 PERFORM 1 FROM public.profiles WHERE id=p_user FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Missing wallet owner';END IF;
 IF EXISTS(SELECT 1 FROM checkout_private.wallet_zero_origins WHERE user_id=p_user) THEN
  RETURN (public.trusted_wallet_reconcile(p_user)->>'consistent')::boolean IS TRUE;
 END IF;
 proof:=checkout_private.wallet_zero_candidate(p_user);
 IF proof IS NULL THEN RETURN false;END IF;
 INSERT INTO checkout_private.wallet_accounts(user_id,opening_balance,balance) VALUES(p_user,0,0) ON CONFLICT DO NOTHING;
 INSERT INTO checkout_private.wallet_zero_origins(user_id,source,auth_created_at,profile_created_at,policy_installed_at)
 VALUES(p_user,'prospective-zero-v1',(proof->>'authCreatedAt')::timestamptz,(proof->>'profileCreatedAt')::timestamptz,(proof->>'policyInstalledAt')::timestamptz);
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION checkout_private.wallet_zero_candidate(uuid),checkout_private.wallet_prepare_zero(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION checkout_private.wallet_zero_candidate(uuid),checkout_private.wallet_prepare_zero(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.trusted_wallet_reconcile(p_user uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE b numeric;a checkout_private.wallet_accounts;expected numeric;
BEGIN
 SELECT wallet_balance INTO STRICT b FROM public.profiles WHERE id=p_user FOR UPDATE;
 SELECT * INTO a FROM checkout_private.wallet_accounts WHERE user_id=p_user;
 IF NOT FOUND THEN RETURN jsonb_build_object('managed',false,'reviewed',false,'consistent',false); END IF;
 SELECT a.opening_balance+coalesce(sum(delta),0) INTO expected FROM checkout_private.wallet_entries WHERE user_id=p_user;
 RETURN jsonb_build_object('managed',true,'reviewed',(EXISTS(SELECT 1 FROM checkout_private.wallet_opening_reviews r WHERE r.user_id=p_user AND r.opening_balance=a.opening_balance) OR (a.opening_balance=0 AND EXISTS(SELECT 1 FROM checkout_private.wallet_zero_origins z WHERE z.user_id=p_user))),
 'consistent',expected=a.balance AND b=a.balance,'balance',a.balance,'opening',a.opening_balance,'ledgerBalance',expected);
END $$;

CREATE OR REPLACE FUNCTION public.trusted_wallet_view(p_user uuid,p_before timestamptz DEFAULT NULL,p_before_id uuid DEFAULT NULL,p_limit integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE b numeric;a checkout_private.wallet_accounts;expected numeric;reviewed boolean;consistent boolean;history jsonb;pending jsonb;more boolean;
BEGIN
 IF p_user IS NULL OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50
 OR (p_before IS NULL)<>(p_before_id IS NULL) OR (p_before IS NOT NULL AND NOT isfinite(p_before)) THEN RAISE EXCEPTION 'Invalid wallet view';END IF;
 SELECT wallet_balance INTO STRICT b FROM public.profiles WHERE id=p_user;
 IF b IS NULL OR b<0 OR b<>trunc(b) OR b>9007199254740991 THEN RAISE EXCEPTION 'Invalid wallet balance';END IF;
 SELECT * INTO a FROM checkout_private.wallet_accounts WHERE user_id=p_user;
 SELECT a.opening_balance+coalesce(sum(delta),0) INTO expected FROM checkout_private.wallet_entries WHERE user_id=p_user;
 consistent:=coalesce(expected=a.balance AND b=a.balance,false);
 reviewed:=(EXISTS(SELECT 1 FROM checkout_private.wallet_opening_reviews r WHERE r.user_id=p_user AND r.opening_balance=a.opening_balance) OR (a.opening_balance=0 AND EXISTS(SELECT 1 FROM checkout_private.wallet_zero_origins z WHERE z.user_id=p_user)));
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'kind',e.kind,'amount',e.delta,'balanceAfter',e.balance_after,'createdAt',e.created_at,'orderId',e.order_id,'topupId',e.topup_id) ORDER BY e.created_at DESC,e.id DESC),'[]'::jsonb)
 INTO history FROM (SELECT * FROM checkout_private.wallet_entries WHERE user_id=p_user
 AND (p_before IS NULL OR (created_at,id)<(p_before,p_before_id)) ORDER BY created_at DESC,id DESC LIMIT p_limit) e;
 SELECT count(*)>p_limit INTO more FROM (SELECT 1 FROM checkout_private.wallet_entries WHERE user_id=p_user AND (p_before IS NULL OR (created_at,id)<(p_before,p_before_id)) LIMIT p_limit+1) e;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',t.id,'amount',t.amount,'createdAt',t.created_at) ORDER BY t.created_at DESC,t.id DESC),'[]'::jsonb)
 INTO pending FROM (SELECT * FROM public.wallet_topups WHERE user_id=p_user AND payment_trans_id IS NULL AND status='pending_payment' ORDER BY created_at DESC,id DESC LIMIT 5) t;
 RETURN jsonb_build_object('balance',b,'currency','IRR','reviewed',reviewed,'consistent',consistent,
 'spendingEnabled',consistent AND reviewed AND coalesce((SELECT spending_enabled FROM checkout_private.wallet_control WHERE singleton),false),
 'topupsEnabled',coalesce((SELECT topups_enabled FROM checkout_private.wallet_control WHERE singleton),false) AND ((consistent AND reviewed) OR checkout_private.wallet_zero_candidate(p_user) IS NOT NULL),
 'topupReviewRequired',coalesce((SELECT topups_enabled FROM checkout_private.wallet_control WHERE singleton),false) AND NOT ((consistent AND reviewed) OR checkout_private.wallet_zero_candidate(p_user) IS NOT NULL),
 'entries',history,'hasMore',more,'pendingTopups',pending);
END $$;

CREATE OR REPLACE FUNCTION public.trusted_wallet_topup_claim(p_user uuid,p_key uuid,p_amount bigint,p_merchant text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE r checkout_private.wallet_topup_requests;a checkout_private.attempts;tid uuid;b numeric;reserved numeric;
BEGIN
 IF p_user IS NULL OR p_key IS NULL OR p_amount IS NULL OR p_amount NOT BETWEEN 5000 AND 99999999
 OR p_merchant IS NULL OR length(p_merchant) NOT BETWEEN 1 AND 128 OR btrim(p_merchant)<>p_merchant OR p_merchant ~ '[[:cntrl:]]' THEN RAISE EXCEPTION 'Invalid topup request'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('wallet-topup:'||p_user::text,0));
 SELECT * INTO r FROM checkout_private.wallet_topup_requests WHERE user_id=p_user AND operation_key=p_key;
 IF FOUND THEN
  IF r.amount<>p_amount OR r.merchant<>p_merchant THEN RAISE EXCEPTION 'Topup idempotency conflict'; END IF;
  SELECT * INTO STRICT a FROM checkout_private.attempts WHERE topup_id=r.topup_id;
  RETURN to_jsonb(a)||jsonb_build_object('claimed',false);
 END IF;
 IF (SELECT topups_enabled FROM checkout_private.wallet_control WHERE singleton) IS NOT TRUE THEN RAISE EXCEPTION 'New topups disabled'; END IF;
 SELECT wallet_balance INTO STRICT b FROM public.profiles WHERE id=p_user FOR UPDATE;
 IF b IS NULL OR b<0 OR b<>trunc(b) THEN RAISE EXCEPTION 'Invalid wallet balance'; END IF;
 PERFORM checkout_private.wallet_prepare_zero(p_user);
 IF (public.trusted_wallet_reconcile(p_user)->>'reviewed')::boolean IS NOT TRUE
 OR (public.trusted_wallet_reconcile(p_user)->>'consistent')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'Wallet review required';END IF;
 IF (SELECT count(*) FROM public.wallet_topups WHERE user_id=p_user AND payment_trans_id IS NULL AND status='pending_payment')>=5 THEN RAISE EXCEPTION 'Pending topup limit'; END IF;
 SELECT coalesce(sum(amount),0) INTO reserved FROM public.wallet_topups WHERE user_id=p_user AND payment_trans_id IS NULL AND status='pending_payment';
 -- Current profiles use numeric(10,2): reserve headroom for unresolved top-ups.
 IF b+reserved+p_amount>99999999 THEN RAISE EXCEPTION 'Wallet balance capacity'; END IF;
 INSERT INTO public.wallet_topups(user_id,amount,status,payment_version) VALUES(p_user,p_amount,'pending_payment',2) RETURNING id INTO tid;
 INSERT INTO checkout_private.attempts(topup_id,version,merchant,amount,state) VALUES(tid,2,p_merchant,p_amount,'creating') RETURNING * INTO a;
 INSERT INTO checkout_private.wallet_topup_requests(user_id,operation_key,topup_id,amount,merchant) VALUES(p_user,p_key,tid,p_amount,p_merchant);
 RETURN to_jsonb(a)||jsonb_build_object('claimed',true);
END $$;

CREATE OR REPLACE FUNCTION public.trusted_review_payment(
 p_attempt uuid,p_amount bigint,p_merchant text,p_ref text,p_transaction text,
 p_evidence_sha256 text,p_source text,p_case text,p_reviewer text,p_reviewed_at timestamptz,
 p_apply boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE a checkout_private.attempts; o public.orders; t public.wallet_topups; owner_id uuid; wallet boolean; parent_paid boolean;
 v checkout_private.verifications; r checkout_private.payment_reviews;
BEGIN
 IF p_attempt IS NULL OR p_amount IS NULL OR p_amount<=0 OR p_amount>9007199254740991
 OR p_merchant IS NULL OR length(p_merchant) NOT BETWEEN 1 AND 128 OR btrim(p_merchant)<>p_merchant OR p_merchant ~ '[[:cntrl:]]'
 OR p_ref IS NULL OR p_ref !~ '^[1-9][0-9]{0,255}$'
 OR p_transaction IS NULL OR p_transaction !~ '^[1-9][0-9]{0,255}$'
 OR p_evidence_sha256 IS NULL OR p_evidence_sha256 !~ '^[0-9a-f]{64}$'
 OR p_source IS NULL OR p_source NOT IN ('provider_portal','provider_support')
 OR p_case IS NULL OR p_case !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{2,127}$'
 OR p_reviewer IS NULL OR p_reviewer !~ '^[A-Za-z0-9][A-Za-z0-9._-]{2,79}$'
 OR p_reviewed_at IS NULL OR NOT isfinite(p_reviewed_at) OR p_apply IS NULL THEN
  RAISE EXCEPTION 'Invalid payment review';
 END IF;
 SELECT * INTO STRICT a FROM checkout_private.attempts WHERE id=p_attempt;
 IF a.version<>2 OR a.provider<>'bitpay' OR (a.order_id IS NULL)=(a.topup_id IS NULL) THEN
  RAISE EXCEPTION 'Only reviewed v2 payments are supported';
 END IF;
 -- Same lock order as the existing callback: parent, attempt, verification.
 wallet:=a.topup_id IS NOT NULL;
 IF wallet THEN SELECT * INTO STRICT t FROM public.wallet_topups WHERE id=a.topup_id FOR UPDATE;owner_id:=t.user_id;
 ELSE SELECT * INTO STRICT o FROM public.orders WHERE id=a.order_id FOR UPDATE;owner_id:=o.user_id;END IF;
 SELECT * INTO STRICT a FROM checkout_private.attempts WHERE id=p_attempt FOR UPDATE;
 IF a.amount IS DISTINCT FROM p_amount OR a.currency<>'IRR'
 OR a.merchant IS DISTINCT FROM p_merchant OR a.provider_ref IS DISTINCT FROM p_ref
 OR (wallet AND (t.payment_version<>2 OR t.amount IS DISTINCT FROM a.amount::numeric OR t.payment_ref IS DISTINCT FROM a.provider_ref))
 OR (NOT wallet AND (o.checkout_version<>2 OR o.payment_method<>'gateway' OR NOT o.items_frozen OR o.total_amount IS DISTINCT FROM a.amount::numeric)) THEN
  RAISE EXCEPTION 'Payment review binding mismatch';
 END IF;
 parent_paid:=CASE WHEN wallet THEN t.status='confirmed' AND t.payment_trans_id=p_transaction
  AND (public.trusted_wallet_topup_status(owner_id,t.id)->>'paid')::boolean
  ELSE o.payment_state='paid' AND o.payment_trans_id=p_transaction END;
 SELECT * INTO r FROM checkout_private.payment_reviews WHERE attempt_id=a.id;
 IF FOUND THEN
  IF r.amount IS DISTINCT FROM p_amount OR r.merchant IS DISTINCT FROM p_merchant
  OR r.provider_ref IS DISTINCT FROM p_ref OR r.transaction_id IS DISTINCT FROM p_transaction
  OR r.evidence_sha256 IS DISTINCT FROM p_evidence_sha256 OR r.source IS DISTINCT FROM p_source
  OR r.case_reference IS DISTINCT FROM p_case OR r.reviewer IS DISTINCT FROM p_reviewer
  OR r.reviewed_at IS DISTINCT FROM p_reviewed_at THEN RAISE EXCEPTION 'Payment review conflicts with recorded decision'; END IF;
  IF a.state<>'settled' OR a.transaction_id IS DISTINCT FROM p_transaction
  OR parent_paid IS NOT TRUE THEN
   RAISE EXCEPTION 'Recorded review settlement inconsistent';
  END IF;
  RETURN jsonb_build_object('outcome','already_settled','applied',false);
 END IF;
 IF a.state='settled' THEN
  IF a.transaction_id IS DISTINCT FROM p_transaction OR parent_paid IS NOT TRUE THEN RAISE EXCEPTION 'Existing settlement mismatch'; END IF;
  RETURN jsonb_build_object('outcome','already_settled','applied',false);
 END IF;
 IF a.state<>'ready' OR (wallet AND (t.status<>'pending_payment' OR t.payment_trans_id IS NOT NULL))
 OR (NOT wallet AND (o.status<>'pending_payment' OR o.payment_state<>'pending' OR o.payment_trans_id IS NOT NULL)) THEN RAISE EXCEPTION 'Payment is not eligible for review'; END IF;
 SELECT * INTO v FROM checkout_private.verifications WHERE attempt_id=a.id FOR UPDATE;
 IF FOUND THEN
  IF v.transaction_id IS DISTINCT FROM p_transaction OR v.amount IS DISTINCT FROM p_amount
  OR v.merchant IS DISTINCT FROM p_merchant OR v.provider_ref IS DISTINCT FROM p_ref
  OR v.currency<>'IRR' THEN RAISE EXCEPTION 'Existing verification identity mismatch'; END IF;
  IF v.state='verified' THEN
   RETURN jsonb_build_object('outcome','durable_evidence_available','applied',false);
  END IF;
 END IF;
 IF p_reviewed_at<now()-interval '24 hours' OR p_reviewed_at>now()+interval '5 minutes'
 OR p_reviewed_at<a.created_at THEN
  RAISE EXCEPTION 'A recent provider review is required';
 END IF;
 IF NOT p_apply THEN RETURN jsonb_build_object('outcome','eligible','applied',false); END IF;
 -- Audit, evidence and financial settlement commit or roll back together.
 INSERT INTO checkout_private.payment_reviews(attempt_id,provider,merchant,provider_ref,amount,currency,
  transaction_id,evidence_sha256,source,case_reference,reviewer,reviewed_at)
 VALUES(a.id,a.provider,a.merchant,a.provider_ref,a.amount,a.currency,p_transaction,
  p_evidence_sha256,p_source,p_case,p_reviewer,p_reviewed_at);
 PERFORM public.trusted_verification_claim(a.id,p_transaction,owner_id);
 PERFORM public.trusted_verification_record(a.id,p_amount,p_merchant,p_ref,p_transaction);
 PERFORM public.trusted_payment_settle(a.id,p_amount,p_merchant,p_ref,p_transaction);
 RETURN jsonb_build_object('outcome','settled','applied',true);
END $$;
COMMIT;
