-- Prepared only; new top-ups stay disabled after installation.
BEGIN;
SET LOCAL lock_timeout='5s';
ALTER TABLE public.wallet_topups ADD COLUMN payment_version integer NOT NULL DEFAULT 1 CHECK(payment_version IN(1,2));
ALTER TABLE checkout_private.wallet_control ADD COLUMN topups_enabled boolean NOT NULL DEFAULT false;
CREATE TABLE checkout_private.wallet_topup_requests(
 user_id uuid NOT NULL REFERENCES public.profiles(id),operation_key uuid NOT NULL,
 topup_id uuid NOT NULL UNIQUE REFERENCES public.wallet_topups(id),
 amount bigint NOT NULL CHECK(amount BETWEEN 5000 AND 99999999),merchant text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,operation_key)
);
ALTER TABLE checkout_private.wallet_topup_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON checkout_private.wallet_topup_requests FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON checkout_private.wallet_topup_requests TO service_role;
CREATE TRIGGER wallet_topup_requests_append_only BEFORE UPDATE OR DELETE ON checkout_private.wallet_topup_requests FOR EACH ROW EXECUTE FUNCTION checkout_private.append_only();
CREATE FUNCTION public.trusted_wallet_topup_claim(p_user uuid,p_key uuid,p_amount bigint,p_merchant text)
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
 IF (SELECT count(*) FROM public.wallet_topups WHERE user_id=p_user AND payment_trans_id IS NULL AND status='pending_payment')>=5 THEN RAISE EXCEPTION 'Pending topup limit'; END IF;
 SELECT coalesce(sum(amount),0) INTO reserved FROM public.wallet_topups WHERE user_id=p_user AND payment_trans_id IS NULL AND status='pending_payment';
 -- Current profiles use numeric(10,2): reserve headroom for unresolved top-ups.
 IF b+reserved+p_amount>99999999 THEN RAISE EXCEPTION 'Wallet balance capacity'; END IF;
 INSERT INTO public.wallet_topups(user_id,amount,status,payment_version) VALUES(p_user,p_amount,'pending_payment',2) RETURNING id INTO tid;
 INSERT INTO checkout_private.attempts(topup_id,version,merchant,amount,state) VALUES(tid,2,p_merchant,p_amount,'creating') RETURNING * INTO a;
 INSERT INTO checkout_private.wallet_topup_requests(user_id,operation_key,topup_id,amount,merchant) VALUES(p_user,p_key,tid,p_amount,p_merchant);
 RETURN to_jsonb(a)||jsonb_build_object('claimed',true);
END $$;
CREATE FUNCTION public.trusted_wallet_topup_attach(p_attempt uuid,p_user uuid,p_ref text,p_merchant text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE a checkout_private.attempts;t public.wallet_topups;
BEGIN
 IF p_user IS NULL OR p_ref IS NULL OR p_ref !~ '^[1-9][0-9]{0,255}$' THEN RAISE EXCEPTION 'Invalid topup reference'; END IF;
 SELECT * INTO STRICT a FROM checkout_private.attempts WHERE id=p_attempt AND topup_id IS NOT NULL AND version=2;
 SELECT * INTO STRICT t FROM public.wallet_topups WHERE id=a.topup_id AND user_id=p_user FOR UPDATE;
 SELECT * INTO STRICT a FROM checkout_private.attempts WHERE id=p_attempt FOR UPDATE;
 IF t.payment_version<>2 OR a.merchant IS DISTINCT FROM p_merchant OR a.amount::numeric IS DISTINCT FROM t.amount THEN RAISE EXCEPTION 'Topup attachment mismatch'; END IF;
 IF a.state<>'creating' THEN
  IF a.provider_ref=p_ref AND t.payment_ref=p_ref THEN RETURN to_jsonb(a); END IF;
  RAISE EXCEPTION 'Topup reference already attached';
 END IF;
 UPDATE checkout_private.attempts SET provider_ref=p_ref,state='ready' WHERE id=a.id RETURNING * INTO a;
 UPDATE public.wallet_topups SET payment_ref=p_ref WHERE id=t.id;
 RETURN to_jsonb(a);
END $$;
CREATE FUNCTION public.trusted_wallet_topup_status(p_user uuid,p_topup uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE t public.wallet_topups;a checkout_private.attempts;paid boolean;
BEGIN
 SELECT * INTO STRICT t FROM public.wallet_topups WHERE id=p_topup AND user_id=p_user;
 SELECT * INTO a FROM checkout_private.attempts WHERE topup_id=t.id;
 paid:=t.status='confirmed' AND a.state='settled' AND t.payment_trans_id IS NOT NULL AND t.payment_trans_id=a.transaction_id
 AND EXISTS(SELECT 1 FROM checkout_private.wallet_credits c JOIN checkout_private.wallet_entries e ON e.topup_id=c.topup_id
 WHERE c.topup_id=t.id AND c.attempt_id=a.id AND c.user_id=p_user AND c.delta::numeric=t.amount AND e.user_id=p_user AND e.delta=c.delta AND e.kind='topup');
 RETURN jsonb_build_object('topupId',t.id,'amount',t.amount,'currency','IRR','state',coalesce(a.state,'legacy'),'paid',coalesce(paid,false));
END $$;
CREATE FUNCTION checkout_private.wallet_topup_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' THEN IF OLD.payment_version=2 THEN RAISE EXCEPTION 'Trusted topup retained'; END IF;RETURN OLD;END IF;
 IF NEW.payment_version IS DISTINCT FROM OLD.payment_version THEN RAISE EXCEPTION 'Topup version immutable'; END IF;
 IF OLD.payment_version=2 THEN
  IF (to_jsonb(NEW)-ARRAY['status','payment_ref','payment_trans_id']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','payment_ref','payment_trans_id'])
  OR (OLD.payment_ref IS NOT NULL AND NEW.payment_ref IS DISTINCT FROM OLD.payment_ref)
  OR (OLD.payment_trans_id IS NOT NULL AND NEW IS DISTINCT FROM OLD) THEN RAISE EXCEPTION 'Trusted topup immutable'; END IF;
  IF NEW.status NOT IN ('pending_payment','confirmed') OR (NEW.status='confirmed')<>(NEW.payment_trans_id IS NOT NULL) THEN RAISE EXCEPTION 'Invalid topup transition'; END IF;
  IF NEW.status='confirmed' AND NOT EXISTS(
   SELECT 1 FROM checkout_private.wallet_credits c JOIN checkout_private.verifications v ON v.attempt_id=c.attempt_id
   WHERE c.topup_id=NEW.id AND c.user_id=NEW.user_id AND c.delta::numeric=NEW.amount AND v.state='verified'
    AND v.transaction_id=NEW.payment_trans_id AND v.provider_ref=NEW.payment_ref AND v.amount=c.delta)
  THEN RAISE EXCEPTION 'Durable topup credit evidence required'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER wallet_topup_guard BEFORE UPDATE OR DELETE ON public.wallet_topups FOR EACH ROW EXECUTE FUNCTION checkout_private.wallet_topup_guard();
CREATE OR REPLACE FUNCTION public.trusted_payment_lookup(p_id uuid,p_wallet boolean,p_ref text,p_merchant text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE a checkout_private.attempts; o public.orders; t public.wallet_topups; amount numeric; trans text;
BEGIN
 IF p_wallet THEN
  SELECT * INTO STRICT t FROM public.wallet_topups WHERE id=p_id FOR UPDATE;
  IF t.payment_ref IS DISTINCT FROM p_ref OR p_ref IS NULL THEN RAISE EXCEPTION 'Invalid reference'; END IF;
  amount:=t.amount; trans:=t.payment_trans_id;
 ELSE
  SELECT * INTO STRICT o FROM public.orders WHERE id=p_id FOR UPDATE;
  IF o.payment_ref IS DISTINCT FROM p_ref OR p_ref IS NULL OR o.payment_method<>'gateway' THEN RAISE EXCEPTION 'Invalid reference'; END IF;
  amount:=o.total_amount; trans:=o.payment_trans_id;
 END IF;
 SELECT * INTO a FROM checkout_private.attempts WHERE (p_wallet AND topup_id=p_id) OR (NOT p_wallet AND order_id=p_id) FOR UPDATE;
 IF NOT FOUND THEN
  IF p_wallet AND t.payment_version<>1 THEN RAISE EXCEPTION 'Missing trusted topup attempt'; END IF;
  IF NOT p_wallet AND o.checkout_version<>1 THEN RAISE EXCEPTION 'Missing trusted attempt'; END IF;
  IF amount<=0 OR amount<>trunc(amount) THEN RAISE EXCEPTION 'Invalid legacy amount'; END IF;
  -- Already settled historical topups MUST NOT be credited again.
  INSERT INTO checkout_private.attempts(order_id,topup_id,version,merchant,amount,state,provider_ref,transaction_id)
  VALUES(CASE WHEN NOT p_wallet THEN p_id END,CASE WHEN p_wallet THEN p_id END,1,p_merchant,amount,
    CASE WHEN trans IS NULL THEN 'ready' ELSE 'settled' END,p_ref,trans) RETURNING * INTO a;
 END IF;
 IF a.merchant<>p_merchant OR a.provider_ref<>p_ref THEN RAISE EXCEPTION 'Payment namespace mismatch'; END IF;
 RETURN to_jsonb(a);
END $$;

CREATE OR REPLACE FUNCTION public.trusted_payment_settle(p_attempt uuid,p_amount bigint,p_merchant text,p_ref text,p_transaction text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE a checkout_private.attempts; t public.wallet_topups;
BEGIN
 -- All payment routines lock parent -> attempt -> profile, in that order.
 SELECT * INTO STRICT a FROM checkout_private.attempts WHERE id=p_attempt;
 IF a.topup_id IS NOT NULL THEN
  PERFORM 1 FROM public.wallet_topups WHERE id=a.topup_id FOR UPDATE;
 ELSE
  PERFORM 1 FROM public.orders WHERE id=a.order_id FOR UPDATE;
 END IF;
 SELECT * INTO STRICT a FROM checkout_private.attempts WHERE id=p_attempt FOR UPDATE;
 IF a.amount<>p_amount OR a.merchant<>p_merchant OR a.provider_ref IS DISTINCT FROM p_ref
 OR p_transaction IS NULL OR p_transaction='' OR p_transaction='0' THEN RAISE EXCEPTION 'Verification binding mismatch'; END IF;
 -- New wallet top-ups require durable, namespace-bound verification evidence.
 IF a.topup_id IS NOT NULL AND a.version=2 AND (
  a.amount IS DISTINCT FROM p_amount OR a.merchant IS DISTINCT FROM p_merchant OR a.provider_ref IS DISTINCT FROM p_ref
  OR NOT EXISTS(
  SELECT 1 FROM checkout_private.verifications v WHERE v.attempt_id=a.id AND v.state='verified'
   AND v.provider=a.provider AND v.merchant=a.merchant AND v.provider_ref=a.provider_ref
   AND v.amount=a.amount AND v.currency=a.currency AND v.transaction_id=p_transaction))
 THEN RAISE EXCEPTION 'Durable topup verification required'; END IF;
 IF a.state='settled' THEN
  IF a.transaction_id<>p_transaction THEN RAISE EXCEPTION 'Transaction mismatch'; END IF;
  RETURN jsonb_build_object('success',true);
 END IF;
 IF a.state<>'ready' THEN RAISE EXCEPTION 'Attempt not ready'; END IF;
 -- Include historical rows not yet adopted into the registry. Never reuse old
 -- evidence across purchases/topups during the compatibility period.
 IF EXISTS(SELECT 1 FROM public.orders WHERE payment_trans_id=p_transaction AND id IS DISTINCT FROM a.order_id)
 OR EXISTS(SELECT 1 FROM public.wallet_topups WHERE payment_trans_id=p_transaction AND id IS DISTINCT FROM a.topup_id) THEN
  RAISE EXCEPTION 'Transaction already used by historical payment';
 END IF;
 IF a.topup_id IS NOT NULL THEN
  SELECT * INTO STRICT t FROM public.wallet_topups WHERE id=a.topup_id FOR UPDATE;
  IF t.payment_trans_id IS NOT NULL THEN RAISE EXCEPTION 'Legacy credit needs reconciliation'; END IF;
  PERFORM 1 FROM public.profiles WHERE id=t.user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Missing wallet owner'; END IF;
  INSERT INTO checkout_private.wallet_credits(topup_id,attempt_id,user_id,delta) VALUES(t.id,a.id,t.user_id,a.amount);
  UPDATE public.profiles SET wallet_balance=wallet_balance+a.amount WHERE id=t.user_id;
  UPDATE public.wallet_topups SET status='confirmed',payment_trans_id=p_transaction WHERE id=t.id;
 ELSE
  UPDATE public.orders SET status='confirmed',payment_state='paid',payment_trans_id=p_transaction,items_frozen=true
   WHERE id=a.order_id AND payment_trans_id IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order settlement conflict'; END IF;
 END IF;
 UPDATE checkout_private.attempts SET state='settled',transaction_id=p_transaction,settled_at=now() WHERE id=a.id;
 INSERT INTO checkout_private.outbox VALUES(a.id,jsonb_build_object('orderId',a.order_id,'topupId',a.topup_id,'type','payment_settled'),now());
 RETURN jsonb_build_object('success',true);
END $$;
REVOKE ALL ON FUNCTION public.trusted_wallet_topup_claim(uuid,uuid,bigint,text),public.trusted_wallet_topup_attach(uuid,uuid,text,text),
 public.trusted_wallet_topup_status(uuid,uuid),checkout_private.wallet_topup_guard() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.trusted_wallet_topup_claim(uuid,uuid,bigint,text),public.trusted_wallet_topup_attach(uuid,uuid,text,text),
 public.trusted_wallet_topup_status(uuid,uuid),checkout_private.wallet_topup_guard() TO service_role;
COMMIT;
