-- Forward only; installation does not enable wallet spending or create money.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE checkout_private.wallet_control(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),spending_enabled boolean NOT NULL DEFAULT false);
INSERT INTO checkout_private.wallet_control VALUES(true,false);
CREATE TABLE checkout_private.wallet_accounts(
 user_id uuid PRIMARY KEY REFERENCES public.profiles(id),
 opening_balance bigint NOT NULL CHECK(opening_balance BETWEEN 0 AND 9007199254740991),
 balance bigint NOT NULL CHECK(balance BETWEEN 0 AND 9007199254740991),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE checkout_private.wallet_opening_reviews(
 user_id uuid PRIMARY KEY REFERENCES checkout_private.wallet_accounts(user_id),
 opening_balance bigint NOT NULL CHECK(opening_balance BETWEEN 0 AND 9007199254740991),
 evidence_sha256 text NOT NULL CHECK(evidence_sha256 ~ '^[0-9a-f]{64}$'),
 case_reference text NOT NULL CHECK(case_reference ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{2,127}$'),
 reviewer text NOT NULL CHECK(reviewer ~ '^[A-Za-z0-9][A-Za-z0-9._-]{2,79}$'),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE checkout_private.wallet_entries(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES checkout_private.wallet_accounts(user_id),
 operation_key uuid NOT NULL,kind text NOT NULL CHECK(kind IN ('topup','purchase')),
 delta bigint NOT NULL CHECK(delta<>0 AND delta BETWEEN -9007199254740991 AND 9007199254740991),
 balance_after bigint NOT NULL CHECK(balance_after BETWEEN 0 AND 9007199254740991),
 topup_id uuid UNIQUE REFERENCES checkout_private.wallet_credits(topup_id),
 order_id uuid UNIQUE REFERENCES public.orders(id),created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,operation_key),
 CHECK((kind='topup' AND delta>0 AND topup_id IS NOT NULL AND order_id IS NULL)
 OR (kind='purchase' AND delta<0 AND order_id IS NOT NULL AND topup_id IS NULL))
);
CREATE INDEX wallet_entries_user_history ON checkout_private.wallet_entries(user_id,created_at,id);
CREATE TABLE checkout_private.wallet_events(
 entry_id uuid PRIMARY KEY REFERENCES checkout_private.wallet_entries(id),
 event jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER wallet_entries_append_only BEFORE UPDATE OR DELETE ON checkout_private.wallet_entries FOR EACH ROW EXECUTE FUNCTION checkout_private.append_only();
CREATE TRIGGER wallet_reviews_append_only BEFORE UPDATE OR DELETE ON checkout_private.wallet_opening_reviews FOR EACH ROW EXECUTE FUNCTION checkout_private.append_only();
CREATE TRIGGER wallet_events_append_only BEFORE UPDATE OR DELETE ON checkout_private.wallet_events FOR EACH ROW EXECUTE FUNCTION checkout_private.append_only();
ALTER TABLE checkout_private.wallet_control ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkout_private.wallet_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkout_private.wallet_opening_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkout_private.wallet_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkout_private.wallet_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON checkout_private.wallet_control,checkout_private.wallet_accounts,checkout_private.wallet_opening_reviews,checkout_private.wallet_entries,checkout_private.wallet_events FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON checkout_private.wallet_control TO service_role;
GRANT SELECT,INSERT ON checkout_private.wallet_accounts,checkout_private.wallet_opening_reviews,checkout_private.wallet_entries,checkout_private.wallet_events TO service_role;
GRANT UPDATE(balance) ON checkout_private.wallet_accounts TO service_role;

-- Call only while holding the profile row lock. No historical credit is replayed.
CREATE FUNCTION checkout_private.wallet_observe(p_user uuid) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE b numeric;
BEGIN
 SELECT wallet_balance INTO STRICT b FROM public.profiles WHERE id=p_user FOR UPDATE;
 IF b IS NULL OR b<0 OR b>9007199254740991 OR b<>trunc(b) THEN RAISE EXCEPTION 'Invalid historical wallet balance'; END IF;
 INSERT INTO checkout_private.wallet_accounts(user_id,opening_balance,balance) VALUES(p_user,b,b) ON CONFLICT DO NOTHING;
END $$;
CREATE FUNCTION public.trusted_wallet_reconcile(p_user uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE b numeric;a checkout_private.wallet_accounts;expected numeric;
BEGIN
 SELECT wallet_balance INTO STRICT b FROM public.profiles WHERE id=p_user FOR UPDATE;
 SELECT * INTO a FROM checkout_private.wallet_accounts WHERE user_id=p_user;
 IF NOT FOUND THEN RETURN jsonb_build_object('managed',false,'reviewed',false,'consistent',false); END IF;
 SELECT a.opening_balance+coalesce(sum(delta),0) INTO expected FROM checkout_private.wallet_entries WHERE user_id=p_user;
 RETURN jsonb_build_object('managed',true,'reviewed',EXISTS(SELECT 1 FROM checkout_private.wallet_opening_reviews r WHERE r.user_id=p_user AND r.opening_balance=a.opening_balance),
 'consistent',expected=a.balance AND b=a.balance,'balance',a.balance,'opening',a.opening_balance,'ledgerBalance',expected);
END $$;
-- This is a trusted operator attestation, not automated proof of historical funds.
CREATE FUNCTION public.trusted_wallet_review_opening(p_user uuid,p_opening bigint,p_hash text,p_case text,p_reviewer text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE a checkout_private.wallet_accounts;r checkout_private.wallet_opening_reviews;
BEGIN
 IF p_user IS NULL OR p_opening IS NULL OR p_opening<0 OR p_hash IS NULL OR p_hash !~ '^[0-9a-f]{64}$'
 OR p_case IS NULL OR p_case !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{2,127}$'
 OR p_reviewer IS NULL OR p_reviewer !~ '^[A-Za-z0-9][A-Za-z0-9._-]{2,79}$' THEN RAISE EXCEPTION 'Invalid opening review'; END IF;
 PERFORM checkout_private.wallet_observe(p_user);
 SELECT * INTO STRICT a FROM checkout_private.wallet_accounts WHERE user_id=p_user;
 IF a.opening_balance<>p_opening OR (public.trusted_wallet_reconcile(p_user)->>'consistent')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'Opening review mismatch'; END IF;
 SELECT * INTO r FROM checkout_private.wallet_opening_reviews WHERE user_id=p_user;
 IF FOUND THEN
  IF r.opening_balance<>p_opening OR r.evidence_sha256<>p_hash OR r.case_reference<>p_case OR r.reviewer<>p_reviewer THEN RAISE EXCEPTION 'Opening review conflict'; END IF;
 ELSE INSERT INTO checkout_private.wallet_opening_reviews VALUES(p_user,p_opening,p_hash,p_case,p_reviewer,now()); END IF;
 RETURN public.trusted_wallet_reconcile(p_user);
END $$;
-- Existing trusted settlement already locks topup -> attempt -> profile before
-- inserting its one-time credit. Capture the entry before its profile update.
CREATE FUNCTION checkout_private.wallet_capture_credit() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE a checkout_private.wallet_accounts;entry uuid;
BEGIN
 PERFORM checkout_private.wallet_observe(NEW.user_id);
 IF (public.trusted_wallet_reconcile(NEW.user_id)->>'consistent')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'Wallet reconciliation required'; END IF;
 SELECT * INTO STRICT a FROM checkout_private.wallet_accounts WHERE user_id=NEW.user_id;
 IF a.balance::numeric+NEW.delta>9007199254740991 THEN RAISE EXCEPTION 'Wallet amount overflow'; END IF;
 INSERT INTO checkout_private.wallet_entries(user_id,operation_key,kind,delta,balance_after,topup_id)
 VALUES(NEW.user_id,NEW.topup_id,'topup',NEW.delta,a.balance+NEW.delta,NEW.topup_id) RETURNING id INTO entry;
 UPDATE checkout_private.wallet_accounts SET balance=a.balance+NEW.delta WHERE user_id=NEW.user_id;
 INSERT INTO checkout_private.wallet_events(entry_id,event) VALUES(entry,jsonb_build_object('type','wallet_credit','topupId',NEW.topup_id));
 RETURN NEW;
END $$;
CREATE TRIGGER wallet_capture_credit AFTER INSERT ON checkout_private.wallet_credits FOR EACH ROW EXECUTE FUNCTION checkout_private.wallet_capture_credit();
CREATE FUNCTION checkout_private.wallet_balance_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NEW.wallet_balance IS DISTINCT FROM OLD.wallet_balance AND NOT EXISTS(
 SELECT 1 FROM checkout_private.wallet_accounts a WHERE a.user_id=NEW.id AND a.balance=NEW.wallet_balance
 AND a.balance::numeric=a.opening_balance::numeric+(SELECT coalesce(sum(e.delta),0) FROM checkout_private.wallet_entries e WHERE e.user_id=a.user_id))
 THEN RAISE EXCEPTION 'Wallet balance requires matching ledger'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER wallet_balance_guard BEFORE UPDATE OF wallet_balance ON public.profiles FOR EACH ROW EXECUTE FUNCTION checkout_private.wallet_balance_guard();

ALTER TABLE public.orders DROP CONSTRAINT trusted_order_money;
ALTER TABLE public.orders ADD CONSTRAINT trusted_order_money CHECK
 (checkout_version<>2 OR (total_amount>0 AND total_amount=trunc(total_amount) AND shipping_cost>=0 AND shipping_cost=trunc(shipping_cost)
 AND payment_method IN ('gateway','wallet') AND payment_state IN ('pending','paid'))) NOT VALID;
CREATE FUNCTION public.trusted_wallet_pay(p_order uuid,p_user uuid,p_key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE o public.orders;a checkout_private.wallet_accounts;e checkout_private.wallet_entries;entry uuid;
BEGIN
 IF p_user IS NULL OR p_order IS NULL OR p_key IS NULL THEN RAISE EXCEPTION 'Invalid wallet payment'; END IF;
 -- Parent lock first, same as gateway claim/expiry. Never switch an attempted order.
 SELECT * INTO STRICT o FROM public.orders WHERE id=p_order AND user_id=p_user FOR UPDATE;
 SELECT * INTO e FROM checkout_private.wallet_entries WHERE order_id=o.id;
 IF FOUND THEN
  IF e.user_id<>p_user OR e.operation_key<>p_key OR e.delta<>-o.total_amount OR o.payment_state<>'paid' OR o.payment_method<>'wallet' THEN RAISE EXCEPTION 'Wallet retry conflict'; END IF;
  RETURN jsonb_build_object('success',true,'orderId',o.id,'alreadyPaid',true);
 END IF;
 IF (SELECT spending_enabled FROM checkout_private.wallet_control WHERE singleton) IS NOT TRUE THEN RAISE EXCEPTION 'Wallet spending disabled'; END IF;
 IF o.checkout_version<>2 OR NOT o.items_frozen OR o.status<>'pending_payment' OR o.payment_state<>'pending'
 OR o.payment_method<>'gateway' OR o.payment_ref IS NOT NULL OR o.payment_trans_id IS NOT NULL
 OR EXISTS(SELECT 1 FROM checkout_private.attempts WHERE order_id=o.id)
 OR NOT EXISTS(SELECT 1 FROM checkout_private.reservations WHERE order_id=o.id AND released_at IS NULL AND expires_at>now()) THEN RAISE EXCEPTION 'Order not wallet payable'; END IF;
 PERFORM 1 FROM public.profiles WHERE id=p_user FOR UPDATE;
 IF (public.trusted_wallet_reconcile(p_user)->>'consistent')::boolean IS NOT TRUE
 OR (public.trusted_wallet_reconcile(p_user)->>'reviewed')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'Wallet review required'; END IF;
 SELECT * INTO STRICT a FROM checkout_private.wallet_accounts WHERE user_id=p_user;
 IF a.balance<o.total_amount THEN RAISE EXCEPTION 'Insufficient wallet funds'; END IF;
 INSERT INTO checkout_private.wallet_entries(user_id,operation_key,kind,delta,balance_after,order_id)
 VALUES(p_user,p_key,'purchase',-o.total_amount,a.balance-o.total_amount,o.id) RETURNING id INTO entry;
 UPDATE checkout_private.wallet_accounts SET balance=a.balance-o.total_amount WHERE user_id=p_user;
 UPDATE public.profiles SET wallet_balance=a.balance-o.total_amount WHERE id=p_user;
 UPDATE public.orders SET payment_method='wallet',payment_state='paid',status='confirmed' WHERE id=o.id;
 INSERT INTO checkout_private.wallet_events(entry_id,event) VALUES(entry,jsonb_build_object('type','wallet_purchase','orderId',o.id));
 RETURN jsonb_build_object('success',true,'orderId',o.id,'alreadyPaid',false);
END $$;
CREATE FUNCTION public.trusted_wallet_checkout(p_user uuid,p_key uuid,p_request jsonb,p_quote text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE r jsonb;paid jsonb;
BEGIN
 IF p_quote IS NOT NULL AND (SELECT spending_enabled FROM checkout_private.wallet_control WHERE singleton) IS NOT TRUE THEN RAISE EXCEPTION 'Wallet spending disabled'; END IF;
 r:=public.trusted_checkout(p_user,p_key,p_request,p_quote);
 IF p_quote IS NULL OR r ? 'code' THEN RETURN r; END IF;
 paid:=public.trusted_wallet_pay((r->>'orderId')::uuid,p_user,p_key);
 RETURN r||paid;
END $$;
CREATE FUNCTION public.trusted_wallet_receipt(p_order uuid,p_user uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.orders o JOIN checkout_private.wallet_entries e ON e.order_id=o.id
 WHERE o.id=p_order AND o.user_id=p_user AND e.user_id=p_user AND e.kind='purchase' AND e.delta=-o.total_amount
 AND o.payment_method='wallet' AND o.payment_state='paid' AND o.items_frozen);
$$;
REVOKE ALL ON FUNCTION checkout_private.wallet_observe(uuid),checkout_private.wallet_capture_credit(),checkout_private.wallet_balance_guard(),
 public.trusted_wallet_reconcile(uuid),public.trusted_wallet_review_opening(uuid,bigint,text,text,text),public.trusted_wallet_pay(uuid,uuid,uuid),
 public.trusted_wallet_checkout(uuid,uuid,jsonb,text),public.trusted_wallet_receipt(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION checkout_private.wallet_observe(uuid),checkout_private.wallet_capture_credit(),checkout_private.wallet_balance_guard(),
 public.trusted_wallet_reconcile(uuid),public.trusted_wallet_review_opening(uuid,bigint,text,text,text),public.trusted_wallet_pay(uuid,uuid,uuid),
 public.trusted_wallet_checkout(uuid,uuid,jsonb,text),public.trusted_wallet_receipt(uuid,uuid) TO service_role;
COMMIT;
