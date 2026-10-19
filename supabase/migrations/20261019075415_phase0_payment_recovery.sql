-- Prepared locally only. Install before PAYMENT_RECOVERY_ENABLED=true.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE checkout_private.verifications (
 attempt_id uuid PRIMARY KEY REFERENCES checkout_private.attempts(id),
 provider text NOT NULL, merchant text NOT NULL, provider_ref text NOT NULL,
 amount bigint NOT NULL CHECK(amount>0), currency text NOT NULL CHECK(currency='IRR'),
 transaction_id text NOT NULL CHECK(transaction_id ~ '^[1-9][0-9]{0,255}$'),
 state text NOT NULL CHECK(state IN ('verifying','verified')),
 created_at timestamptz NOT NULL DEFAULT now(), verified_at timestamptz,
 CHECK((state='verified')=(verified_at IS NOT NULL)),
 UNIQUE(provider,merchant,transaction_id)
);
ALTER TABLE checkout_private.verifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON checkout_private.verifications FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON checkout_private.verifications TO service_role;
GRANT UPDATE(state,verified_at) ON checkout_private.verifications TO service_role;
CREATE FUNCTION checkout_private.verification_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' OR OLD.state='verified' OR NEW.state<>'verified'
 OR (to_jsonb(NEW)-ARRAY['state','verified_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','verified_at']) THEN
  RAISE EXCEPTION 'Immutable verification evidence';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER verification_guard BEFORE UPDATE OR DELETE ON checkout_private.verifications
 FOR EACH ROW EXECUTE FUNCTION checkout_private.verification_guard();
CREATE FUNCTION public.trusted_verification_claim(p_attempt uuid,p_transaction text,p_user uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE a checkout_private.attempts; v checkout_private.verifications; fresh boolean:=false;
BEGIN
 IF p_transaction IS NULL OR p_transaction !~ '^[1-9][0-9]{0,255}$' THEN RAISE EXCEPTION 'Invalid transaction'; END IF;
 SELECT * INTO STRICT a FROM checkout_private.attempts WHERE id=p_attempt;
 IF a.order_id IS NOT NULL THEN PERFORM 1 FROM public.orders WHERE id=a.order_id FOR UPDATE;
 ELSE PERFORM 1 FROM public.wallet_topups WHERE id=a.topup_id FOR UPDATE; END IF;
 SELECT * INTO STRICT a FROM checkout_private.attempts WHERE id=p_attempt FOR UPDATE;
 IF p_user IS NULL OR NOT (EXISTS(SELECT 1 FROM public.orders WHERE id=a.order_id AND user_id=p_user)
  OR EXISTS(SELECT 1 FROM public.wallet_topups WHERE id=a.topup_id AND user_id=p_user)) THEN RAISE EXCEPTION 'Payment owner required'; END IF;
 IF a.state NOT IN ('ready','settled') THEN RAISE EXCEPTION 'Attempt not ready'; END IF;
 SELECT * INTO v FROM checkout_private.verifications WHERE attempt_id=a.id FOR UPDATE;
 IF NOT FOUND THEN
  IF a.state='settled' THEN RAISE EXCEPTION 'Already settled'; END IF;
  INSERT INTO checkout_private.verifications(attempt_id,provider,merchant,provider_ref,amount,currency,transaction_id,state)
   VALUES(a.id,a.provider,a.merchant,a.provider_ref,a.amount,a.currency,p_transaction,'verifying') RETURNING * INTO v;
  fresh:=true;
 END IF;
 IF v.transaction_id<>p_transaction OR v.provider_ref<>a.provider_ref OR v.merchant<>a.merchant OR v.amount<>a.amount THEN
  RAISE EXCEPTION 'Verification identity mismatch';
 END IF;
 RETURN jsonb_build_object('claimed',fresh,'state',v.state,'evidence',
  CASE WHEN v.state='verified' THEN jsonb_build_object('amount',v.amount,'currency',v.currency,
   'merchant',v.merchant,'reference',v.provider_ref,'transaction',v.transaction_id) ELSE NULL END);
END $$;
CREATE FUNCTION public.trusted_verification_record(p_attempt uuid,p_amount bigint,p_merchant text,p_ref text,p_transaction text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE a checkout_private.attempts; v checkout_private.verifications;
BEGIN
 SELECT * INTO STRICT a FROM checkout_private.attempts WHERE id=p_attempt;
 IF a.order_id IS NOT NULL THEN PERFORM 1 FROM public.orders WHERE id=a.order_id FOR UPDATE;
 ELSE PERFORM 1 FROM public.wallet_topups WHERE id=a.topup_id FOR UPDATE; END IF;
 SELECT * INTO STRICT a FROM checkout_private.attempts WHERE id=p_attempt FOR UPDATE;
 SELECT * INTO STRICT v FROM checkout_private.verifications WHERE attempt_id=a.id FOR UPDATE;
 IF a.amount IS DISTINCT FROM p_amount OR a.merchant IS DISTINCT FROM p_merchant OR a.provider_ref IS DISTINCT FROM p_ref
 OR v.transaction_id IS DISTINCT FROM p_transaction OR a.state NOT IN ('ready','settled')
 OR (a.state='settled' AND a.transaction_id IS DISTINCT FROM p_transaction) THEN
  RAISE EXCEPTION 'Verification evidence mismatch';
 END IF;
 IF v.state='verifying' THEN UPDATE checkout_private.verifications SET state='verified',verified_at=now() WHERE attempt_id=a.id; END IF;
 RETURN jsonb_build_object('recorded',true);
END $$;
REVOKE ALL ON FUNCTION checkout_private.verification_guard(),public.trusted_verification_claim(uuid,text,uuid),
 public.trusted_verification_record(uuid,bigint,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.trusted_verification_claim(uuid,text,uuid),public.trusted_verification_record(uuid,bigint,text,text,text) TO service_role;
-- Operator/scheduler may replay ONLY durably verified evidence, with no provider calls.
CREATE FUNCTION public.trusted_reconcile_verified(p_limit integer DEFAULT 50) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v checkout_private.verifications; successes integer:=0; failures integer:=0;
BEGIN
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Invalid reconciliation batch'; END IF;
 FOR v IN SELECT j.* FROM checkout_private.verifications j JOIN checkout_private.attempts a ON a.id=j.attempt_id
  WHERE j.state='verified' AND a.state='ready' ORDER BY j.created_at,j.attempt_id LIMIT p_limit LOOP
  BEGIN
   PERFORM public.trusted_payment_settle(v.attempt_id,v.amount,v.merchant,v.provider_ref,v.transaction_id);
   successes:=successes+1;
  EXCEPTION WHEN OTHERS THEN failures:=failures+1;
  END;
 END LOOP;
 RETURN jsonb_build_object('settled',successes,'pending',failures);
END $$;
REVOKE ALL ON FUNCTION public.trusted_reconcile_verified(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.trusted_reconcile_verified(integer) TO service_role;
COMMIT;
