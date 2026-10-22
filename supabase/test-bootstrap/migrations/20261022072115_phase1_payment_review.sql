-- Operator-attested resolution of a v2 gateway order after independent provider
-- portal/support review. No provider request, public/admin-browser permission,
-- automatic retry, refund, wallet activation, or age-based paid inference.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $$ BEGIN
 IF to_regprocedure('public.trusted_verification_claim(uuid,text,uuid)') IS NULL
 OR to_regprocedure('public.trusted_verification_record(uuid,bigint,text,text,text)') IS NULL
 OR to_regprocedure('public.trusted_payment_settle(uuid,bigint,text,text,text)') IS NULL
 OR to_regprocedure('checkout_private.append_only()') IS NULL THEN
  RAISE EXCEPTION 'Reviewed payment recovery prerequisites required';
 END IF;
END $$;

CREATE TABLE checkout_private.payment_reviews (
 attempt_id uuid PRIMARY KEY REFERENCES checkout_private.attempts(id),
 provider text NOT NULL CHECK(provider='bitpay'),
 merchant text NOT NULL, provider_ref text NOT NULL, amount bigint NOT NULL CHECK(amount>0),
 currency text NOT NULL CHECK(currency='IRR'), transaction_id text NOT NULL,
 evidence_sha256 text NOT NULL CHECK(evidence_sha256 ~ '^[0-9a-f]{64}$'),
 source text NOT NULL CHECK(source IN ('provider_portal','provider_support')),
 case_reference text NOT NULL, reviewer text NOT NULL,
 reviewed_at timestamptz NOT NULL, recorded_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(provider,merchant,transaction_id)
);
COMMENT ON TABLE checkout_private.payment_reviews IS
 'Immutable trusted-operator attestations, not automatically authenticated provider responses. Evidence hash identifies the reviewed artifact; it does not prove its truth.';
ALTER TABLE checkout_private.payment_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON checkout_private.payment_reviews FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON checkout_private.payment_reviews TO service_role;
CREATE TRIGGER payment_reviews_append_only BEFORE UPDATE OR DELETE ON checkout_private.payment_reviews
 FOR EACH ROW EXECUTE FUNCTION checkout_private.append_only();

CREATE FUNCTION public.trusted_review_payment(
 p_attempt uuid,p_amount bigint,p_merchant text,p_ref text,p_transaction text,
 p_evidence_sha256 text,p_source text,p_case text,p_reviewer text,p_reviewed_at timestamptz,
 p_apply boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE a checkout_private.attempts; o public.orders;
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
 IF a.order_id IS NULL OR a.topup_id IS NOT NULL OR a.version<>2 OR a.provider<>'bitpay' THEN
  RAISE EXCEPTION 'Only reviewed v2 gateway orders are supported';
 END IF;
 -- Same lock order as the existing callback: parent, attempt, verification.
 SELECT * INTO STRICT o FROM public.orders WHERE id=a.order_id FOR UPDATE;
 SELECT * INTO STRICT a FROM checkout_private.attempts WHERE id=p_attempt FOR UPDATE;
 IF a.amount IS DISTINCT FROM p_amount OR a.currency<>'IRR'
 OR a.merchant IS DISTINCT FROM p_merchant OR a.provider_ref IS DISTINCT FROM p_ref
 OR o.checkout_version<>2 OR o.payment_method<>'gateway' OR NOT o.items_frozen
 OR o.total_amount IS DISTINCT FROM a.amount::numeric THEN
  RAISE EXCEPTION 'Payment review binding mismatch';
 END IF;
 SELECT * INTO r FROM checkout_private.payment_reviews WHERE attempt_id=a.id;
 IF FOUND THEN
  IF r.amount IS DISTINCT FROM p_amount OR r.merchant IS DISTINCT FROM p_merchant
  OR r.provider_ref IS DISTINCT FROM p_ref OR r.transaction_id IS DISTINCT FROM p_transaction
  OR r.evidence_sha256 IS DISTINCT FROM p_evidence_sha256 OR r.source IS DISTINCT FROM p_source
  OR r.case_reference IS DISTINCT FROM p_case OR r.reviewer IS DISTINCT FROM p_reviewer
  OR r.reviewed_at IS DISTINCT FROM p_reviewed_at THEN RAISE EXCEPTION 'Payment review conflicts with recorded decision'; END IF;
  IF a.state<>'settled' OR a.transaction_id IS DISTINCT FROM p_transaction
  OR o.payment_state<>'paid' OR o.payment_trans_id IS DISTINCT FROM p_transaction THEN
   RAISE EXCEPTION 'Recorded review settlement inconsistent';
  END IF;
  RETURN jsonb_build_object('outcome','already_settled','applied',false);
 END IF;
 IF a.state='settled' THEN
  IF a.transaction_id IS DISTINCT FROM p_transaction OR o.payment_state<>'paid'
  OR o.payment_trans_id IS DISTINCT FROM p_transaction THEN RAISE EXCEPTION 'Existing settlement mismatch'; END IF;
  RETURN jsonb_build_object('outcome','already_settled','applied',false);
 END IF;
 IF a.state<>'ready' OR o.status<>'pending_payment' OR o.payment_state<>'pending'
 OR o.payment_trans_id IS NOT NULL THEN RAISE EXCEPTION 'Payment is not eligible for review'; END IF;
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
 PERFORM public.trusted_verification_claim(a.id,p_transaction,o.user_id);
 PERFORM public.trusted_verification_record(a.id,p_amount,p_merchant,p_ref,p_transaction);
 PERFORM public.trusted_payment_settle(a.id,p_amount,p_merchant,p_ref,p_transaction);
 RETURN jsonb_build_object('outcome','settled','applied',true);
END $$;
REVOKE ALL ON FUNCTION public.trusted_review_payment(uuid,bigint,text,text,text,text,text,text,text,timestamptz,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.trusted_review_payment(uuid,bigint,text,text,text,text,text,text,text,timestamptz,boolean) TO service_role;
COMMIT;
