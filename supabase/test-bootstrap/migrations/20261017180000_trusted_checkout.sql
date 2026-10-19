-- Forward only. Depends on first_security_containment and catalog detail migrations.
-- CLI migration creation was unavailable locally (CLI telemetry write denied).
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.products'::regclass
   AND attname='sizes' AND atttypid='text[]'::regtype AND NOT attisdropped)
 OR NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.products'::regclass
   AND attname='colors' AND atttypid='text[]'::regtype AND NOT attisdropped)
 OR NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.products'::regclass
   AND attname='is_out_of_stock' AND atttypid='boolean'::regtype AND NOT attisdropped) THEN
  RAISE EXCEPTION 'Trusted checkout requires reviewed catalog detail/colors/out-of-stock migrations';
 END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS checkout_private;
REVOKE ALL ON SCHEMA checkout_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA checkout_private TO service_role;
GRANT SELECT,UPDATE ON public.wallet_topups TO service_role;

ALTER TABLE public.orders ADD COLUMN checkout_version integer NOT NULL DEFAULT 1;
ALTER TABLE public.orders ADD COLUMN items_frozen boolean NOT NULL DEFAULT false;
ALTER TABLE public.orders ADD COLUMN payment_state text NOT NULL DEFAULT 'legacy';
ALTER TABLE public.orders ADD CONSTRAINT trusted_order_money CHECK
 (checkout_version <> 2 OR (total_amount > 0 AND total_amount = trunc(total_amount)
 AND shipping_cost >= 0 AND shipping_cost = trunc(shipping_cost)
 AND payment_method = 'gateway' AND payment_state IN ('pending','paid')) ) NOT VALID;

CREATE TABLE checkout_private.requests (
 user_id uuid NOT NULL REFERENCES auth.users(id), key uuid NOT NULL,
 request jsonb NOT NULL, quote jsonb NOT NULL, order_id uuid NOT NULL UNIQUE REFERENCES public.orders(id),
 PRIMARY KEY(user_id,key)
);
-- Server-owned shipping rules. No discounts are supported by this version.
CREATE TABLE checkout_private.shipping (
 id text PRIMARY KEY, rial bigint NOT NULL CHECK(rial BETWEEN 0 AND 99999999), active boolean NOT NULL DEFAULT true
);
INSERT INTO checkout_private.shipping VALUES ('express',2000000,true),('tipax',0,true);
CREATE TABLE checkout_private.attempts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 order_id uuid UNIQUE REFERENCES public.orders(id), topup_id uuid UNIQUE REFERENCES public.wallet_topups(id),
 version integer NOT NULL CHECK(version IN (1,2)), provider text NOT NULL DEFAULT 'bitpay',
 merchant text NOT NULL CHECK(length(merchant)>0), amount bigint NOT NULL CHECK(amount>0),
 currency text NOT NULL DEFAULT 'IRR' CHECK(currency='IRR'),
 state text NOT NULL CHECK(state IN ('creating','ready','settled')),
 provider_ref text, transaction_id text, created_at timestamptz NOT NULL DEFAULT now(),
 settled_at timestamptz,
 CHECK(num_nonnulls(order_id,topup_id)=1),
 CHECK(state='creating' OR provider_ref IS NOT NULL),
 CHECK((state='settled') = (transaction_id IS NOT NULL)),
 UNIQUE(provider,merchant,provider_ref), UNIQUE(provider,merchant,transaction_id)
);
CREATE TABLE checkout_private.wallet_credits (
 topup_id uuid PRIMARY KEY REFERENCES public.wallet_topups(id),
 attempt_id uuid NOT NULL UNIQUE REFERENCES checkout_private.attempts(id),
 user_id uuid NOT NULL REFERENCES public.profiles(id),
 delta bigint NOT NULL CHECK(delta>0), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE checkout_private.outbox (
 attempt_id uuid PRIMARY KEY REFERENCES checkout_private.attempts(id),
 event jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION checkout_private.attempt_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Payment attempts cannot be deleted'; END IF;
 IF (to_jsonb(NEW)-ARRAY['state','provider_ref','transaction_id','settled_at'])
  IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','provider_ref','transaction_id','settled_at'])
 OR (OLD.provider_ref IS NOT NULL AND NEW.provider_ref IS DISTINCT FROM OLD.provider_ref)
 OR (OLD.state='settled' AND NEW IS DISTINCT FROM OLD)
 OR (NEW.state<>OLD.state AND NOT ((OLD.state='creating' AND NEW.state='ready') OR (OLD.state='ready' AND NEW.state='settled'))) THEN
  RAISE EXCEPTION 'Invalid payment attempt transition';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER attempt_guard BEFORE UPDATE OR DELETE ON checkout_private.attempts
 FOR EACH ROW EXECUTE FUNCTION checkout_private.attempt_guard();
CREATE FUNCTION checkout_private.append_only() RETURNS trigger LANGUAGE plpgsql
SET search_path='' AS $$ BEGIN RAISE EXCEPTION 'append only'; END $$;
CREATE TRIGGER wallet_credits_append_only BEFORE UPDATE OR DELETE ON checkout_private.wallet_credits
 FOR EACH ROW EXECUTE FUNCTION checkout_private.append_only();
REVOKE ALL ON ALL TABLES IN SCHEMA checkout_private FROM PUBLIC, anon, authenticated;
GRANT SELECT,INSERT ON checkout_private.requests,checkout_private.wallet_credits,checkout_private.outbox TO service_role;
GRANT SELECT ON checkout_private.shipping TO service_role;
-- PostgreSQL row locking requires UPDATE on at least one column.
GRANT UPDATE(rial) ON checkout_private.shipping TO service_role;
GRANT SELECT,INSERT,UPDATE ON checkout_private.attempts TO service_role;
ALTER TABLE checkout_private.requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkout_private.shipping ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkout_private.attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkout_private.wallet_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkout_private.outbox ENABLE ROW LEVEL SECURITY;

-- Privilege revocation plus restrictive policies protect against ambient FOR ALL.
REVOKE INSERT,DELETE ON public.orders FROM PUBLIC,anon,authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.order_items FROM PUBLIC,anon,authenticated;
CREATE POLICY "Trusted checkout only" ON public.orders AS RESTRICTIVE FOR INSERT TO PUBLIC WITH CHECK(false);
CREATE POLICY "Trusted financial orders retained" ON public.orders AS RESTRICTIVE FOR DELETE TO PUBLIC USING(false);
CREATE POLICY "Frozen items insert" ON public.order_items AS RESTRICTIVE FOR INSERT TO PUBLIC WITH CHECK(false);
CREATE POLICY "Frozen items update" ON public.order_items AS RESTRICTIVE FOR UPDATE TO PUBLIC USING(false) WITH CHECK(false);
CREATE POLICY "Frozen items delete" ON public.order_items AS RESTRICTIVE FOR DELETE TO PUBLIC USING(false);

-- Lock the parent for EVERY mutation, including privileged INSERT and FK cascades.
-- The parent lock serializes inserts with freezing even at READ COMMITTED.
CREATE FUNCTION public.trusted_item_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path='' AS $$
DECLARE parent public.orders; parent_id uuid;
BEGIN
 parent_id := CASE WHEN TG_OP='DELETE' THEN OLD.order_id ELSE NEW.order_id END;
 IF TG_OP='UPDATE' AND NEW.order_id IS DISTINCT FROM OLD.order_id THEN RAISE EXCEPTION 'Cannot move items'; END IF;
 SELECT * INTO parent FROM public.orders WHERE id=parent_id FOR UPDATE;
 IF NOT FOUND OR parent.items_frozen OR parent.payment_ref IS NOT NULL OR parent.payment_trans_id IS NOT NULL THEN
  RAISE EXCEPTION 'Order items frozen';
 END IF;
 IF TG_OP<>'DELETE' AND (NEW.quantity NOT BETWEEN 1 AND 100 OR NEW.price<0 OR NEW.price<>trunc(NEW.price)) THEN
  RAISE EXCEPTION 'Invalid item money or quantity';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trusted_item_guard BEFORE INSERT OR UPDATE OR DELETE ON public.order_items
 FOR EACH ROW EXECUTE FUNCTION public.trusted_item_guard();

-- Invoker routines: no definer privilege escalation, callable only by service_role.
-- p_user is supplied exclusively by Express after auth.getUser, never by browser.
CREATE FUNCTION public.trusted_checkout(p_user uuid,p_key uuid,p_request jsonb,p_quote text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE line jsonb; product public.products; variant public.product_variants;
 address public.addresses; shipping checkout_private.shipping; old_request checkout_private.requests;
 snapshots jsonb := '[]'; snapshot jsonb; quote jsonb; fingerprint text;
 qty integer; unit numeric; subtotal bigint:=0; total bigint; order_id uuid; variant_count integer;
BEGIN
 IF p_user IS NULL OR p_key IS NULL OR jsonb_typeof(p_request)<>'object'
 OR (p_request - ARRAY['addressId','shippingOption','items'])<>'{}'::jsonb
 OR jsonb_typeof(p_request->'items') IS DISTINCT FROM 'array' OR coalesce(jsonb_array_length(p_request->'items'),0) NOT BETWEEN 1 AND 100 THEN
  RAISE EXCEPTION 'Invalid checkout request';
 END IF;
 -- Also serializes duplicate checkout creation before reading stock.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text||p_key::text,0));
 SELECT * INTO old_request FROM checkout_private.requests WHERE user_id=p_user AND key=p_key;
 IF FOUND THEN
  IF old_request.request<>p_request THEN RAISE EXCEPTION 'Idempotency conflict'; END IF;
  IF p_quote IS NULL THEN RETURN old_request.quote||jsonb_build_object('quote',md5(old_request.quote::text)); END IF;
  RETURN (SELECT jsonb_build_object('orderId',o.id,'total',o.total_amount,'shipping',o.shipping_cost) FROM public.orders o WHERE id=old_request.order_id);
 END IF;
 SELECT * INTO address FROM public.addresses WHERE id=(p_request->>'addressId')::uuid AND user_id=p_user FOR SHARE;
 IF NOT FOUND OR coalesce(address.line1,'')='' THEN RAISE EXCEPTION 'Invalid owned address'; END IF;
 SELECT * INTO shipping FROM checkout_private.shipping WHERE id=p_request->>'shippingOption' AND active FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invalid shipping option'; END IF;
 -- Deterministic product locking; variant writes must lock their product too.
 FOR line IN SELECT value FROM jsonb_array_elements(p_request->'items') ORDER BY value->>'productId',value->>'size',value->>'color' LOOP
  IF jsonb_typeof(line)<>'object' OR (line-ARRAY['productId','variantId','quantity','size','color'])<>'{}'::jsonb
  OR jsonb_typeof(line->'quantity') IS DISTINCT FROM 'number' OR (line->>'quantity') !~ '^[1-9][0-9]{0,2}$'
  OR (line->>'quantity')::integer>100 THEN RAISE EXCEPTION 'Invalid quantity or selection'; END IF;
  qty:=(line->>'quantity')::integer;
  SELECT * INTO product FROM public.products WHERE id=(line->>'productId')::uuid FOR UPDATE;
  IF NOT FOUND OR NOT product.is_active OR product.is_out_of_stock THEN RAISE EXCEPTION 'Unavailable product'; END IF;
  SELECT count(*) INTO variant_count FROM public.product_variants WHERE product_id=product.id;
  variant:=NULL;
  IF variant_count>0 THEN
   SELECT * INTO STRICT variant FROM public.product_variants WHERE product_id=product.id
    AND size IS NOT DISTINCT FROM (line->>'size') AND color IS NOT DISTINCT FROM (line->>'color')
    AND ((line->>'variantId') IS NULL OR id=(line->>'variantId')::uuid) FOR UPDATE;
   IF variant.stock_quantity<qty THEN RAISE EXCEPTION 'Insufficient stock'; END IF;
  ELSE
   IF (line->>'variantId') IS NOT NULL
    OR (coalesce(cardinality(product.sizes),0)>0 AND coalesce((line->>'size')=ANY(product.sizes),false)=false)
    OR (coalesce(cardinality(product.sizes),0)=0 AND (line->>'size') IS NOT NULL)
    OR (coalesce(cardinality(product.colors),0)>0 AND coalesce((line->>'color')=ANY(product.colors),false)=false)
    OR (coalesce(cardinality(product.colors),0)=0 AND (line->>'color') IS NOT NULL) THEN RAISE EXCEPTION 'Invalid product options'; END IF;
  END IF;
  unit:=coalesce(variant.price,product.price);
  IF unit<=0 OR unit<>trunc(unit) OR unit>99999999 THEN RAISE EXCEPTION 'Invalid catalog rial amount'; END IF;
  subtotal:=subtotal+unit::bigint*qty;
  snapshot:=jsonb_build_object('product_id',product.id,'variant_id',variant.id,'quantity',qty,'price',unit::bigint,
    'title',product.name,'variant_title',concat_ws(' / ',line->>'size',line->>'color'));
  snapshots:=snapshots||jsonb_build_array(snapshot);
 END LOOP;
 IF EXISTS (SELECT 1 FROM jsonb_array_elements(snapshots) s GROUP BY s->>'product_id',s->>'variant_title' HAVING count(*)>1) THEN RAISE EXCEPTION 'Duplicate selection'; END IF;
 total:=subtotal+shipping.rial;
 IF total NOT BETWEEN 5000 AND 99999999 THEN RAISE EXCEPTION 'Unsupported total'; END IF;
 quote:=jsonb_build_object('items',snapshots,'address',to_jsonb(address),'shipping',shipping.rial,'total',total);
 fingerprint:=md5(quote::text);
 IF p_quote IS NULL THEN RETURN quote||jsonb_build_object('quote',fingerprint); END IF;
 IF p_quote<>fingerprint THEN RAISE EXCEPTION 'Stale quote; review current catalog'; END IF;
 INSERT INTO public.orders(user_id,status,total_amount,shipping_cost,shipping_method,payment_method,shipping_address,checkout_version,payment_state)
 VALUES(p_user,'pending_payment',total,shipping.rial,shipping.id,'gateway',to_jsonb(address)::text,2,'pending') RETURNING id INTO order_id;
 FOR snapshot IN SELECT value FROM jsonb_array_elements(snapshots) LOOP
  INSERT INTO public.order_items(order_id,product_id,variant_id,quantity,price,title,variant_title)
  VALUES(order_id,(snapshot->>'product_id')::uuid,(snapshot->>'variant_id')::uuid,(snapshot->>'quantity')::integer,
   (snapshot->>'price')::bigint,snapshot->>'title',snapshot->>'variant_title');
  IF (snapshot->>'variant_id') IS NOT NULL THEN
   UPDATE public.product_variants SET stock_quantity=stock_quantity-(snapshot->>'quantity')::integer WHERE id=(snapshot->>'variant_id')::uuid;
  END IF;
 END LOOP;
 UPDATE public.orders SET items_frozen=true WHERE id=order_id;
 INSERT INTO checkout_private.requests VALUES(p_user,p_key,p_request,quote,order_id);
 RETURN jsonb_build_object('orderId',order_id,'total',total,'shipping',shipping.rial);
END $$;

CREATE FUNCTION public.trusted_payment_claim(p_order uuid,p_user uuid,p_merchant text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE o public.orders; a checkout_private.attempts; created boolean:=false;
BEGIN
 SELECT * INTO o FROM public.orders WHERE id=p_order AND user_id=p_user FOR UPDATE;
 IF NOT FOUND OR o.checkout_version<>2 OR NOT o.items_frozen OR o.payment_method<>'gateway' THEN RAISE EXCEPTION 'Invalid trusted order'; END IF;
 SELECT * INTO a FROM checkout_private.attempts WHERE order_id=o.id FOR UPDATE;
 IF NOT FOUND THEN
  IF o.status<>'pending_payment' OR o.payment_state<>'pending' THEN RAISE EXCEPTION 'Order not payable'; END IF;
  INSERT INTO checkout_private.attempts(order_id,version,merchant,amount,state) VALUES(o.id,2,p_merchant,o.total_amount,'creating') RETURNING * INTO a;
  created:=true;
 END IF;
 IF a.merchant<>p_merchant THEN RAISE EXCEPTION 'Merchant changed'; END IF;
 RETURN to_jsonb(a)||jsonb_build_object('claimed',created);
END $$;
CREATE FUNCTION public.trusted_payment_attach(p_attempt uuid,p_ref text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE a checkout_private.attempts;
BEGIN
 IF p_ref !~ '^[1-9][0-9]*$' THEN RAISE EXCEPTION 'Invalid provider reference'; END IF;
 SELECT * INTO STRICT a FROM checkout_private.attempts WHERE id=p_attempt;
 PERFORM 1 FROM public.orders WHERE id=a.order_id FOR UPDATE;
 SELECT * INTO STRICT a FROM checkout_private.attempts WHERE id=p_attempt FOR UPDATE;
 IF a.state<>'creating' THEN
  IF a.provider_ref=p_ref THEN RETURN to_jsonb(a); END IF;
  RAISE EXCEPTION 'Already attached';
 END IF;
 UPDATE checkout_private.attempts SET provider_ref=p_ref,state='ready' WHERE id=a.id RETURNING * INTO a;
 UPDATE public.orders SET payment_ref=p_ref WHERE id=a.order_id;
 RETURN to_jsonb(a);
END $$;

-- Stored-version dispatch; this only adopts already initiated legacy references.
CREATE FUNCTION public.trusted_payment_lookup(p_id uuid,p_wallet boolean,p_ref text,p_merchant text) RETURNS jsonb
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

CREATE FUNCTION public.trusted_payment_settle(p_attempt uuid,p_amount bigint,p_merchant text,p_ref text,p_transaction text)
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

-- Serialize catalog variant insert/delete with product checkout locks.
CREATE FUNCTION public.trusted_variant_lock() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.product_id<>OLD.product_id THEN RAISE EXCEPTION 'Cannot move variant'; END IF;
 PERFORM 1 FROM public.products WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.product_id ELSE NEW.product_id END FOR UPDATE;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER trusted_variant_lock BEFORE INSERT OR UPDATE OR DELETE ON public.product_variants
 FOR EACH ROW EXECUTE FUNCTION public.trusted_variant_lock();

REVOKE ALL ON FUNCTION public.trusted_item_guard(),public.trusted_variant_lock(),checkout_private.append_only(),checkout_private.attempt_guard() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.trusted_checkout(uuid,uuid,jsonb,text),public.trusted_payment_claim(uuid,uuid,text),
 public.trusted_payment_attach(uuid,text),public.trusted_payment_lookup(uuid,boolean,text,text),
 public.trusted_payment_settle(uuid,bigint,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.trusted_checkout(uuid,uuid,jsonb,text),public.trusted_payment_claim(uuid,uuid,text),
 public.trusted_payment_attach(uuid,text),public.trusted_payment_lookup(uuid,boolean,text,text),
 public.trusted_payment_settle(uuid,bigint,text,text,text) TO service_role;
DO $$ DECLARE role_name text; routine regprocedure; BEGIN
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
  FOR routine IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN ('trusted_checkout','trusted_payment_claim','trusted_payment_attach','trusted_payment_lookup','trusted_payment_settle') LOOP
   IF has_function_privilege(role_name,routine,'EXECUTE') THEN
    RAISE EXCEPTION 'Trusted checkout blocked: % retains inherited EXECUTE on %',role_name,routine;
   END IF;
  END LOOP;
 END LOOP;
END $$;
COMMIT;
