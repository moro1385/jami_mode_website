-- Expire ONLY v2 orders for which no payment attempt has EVER been claimed.
-- Never infer non-payment from age, browser cancellation, or provider status 11.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE checkout_private.reservations (
 order_id uuid PRIMARY KEY REFERENCES public.orders(id),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '30 minutes',
 released_at timestamptz
);
ALTER TABLE checkout_private.reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON checkout_private.reservations FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON checkout_private.reservations TO service_role;
GRANT UPDATE(released_at) ON checkout_private.reservations TO service_role;
CREATE INDEX reservation_expiry_pending ON checkout_private.reservations(expires_at) WHERE released_at IS NULL;
CREATE FUNCTION public.trusted_expire_unstarted(p_user uuid DEFAULT NULL,p_limit integer DEFAULT 50) RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE o public.orders; line record; released integer:=0;
BEGIN
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Invalid expiry batch'; END IF;
 FOR o IN SELECT orders.* FROM public.orders orders JOIN checkout_private.reservations r ON r.order_id=orders.id
  WHERE r.released_at IS NULL AND r.expires_at<=now() AND orders.checkout_version=2
   AND orders.status='pending_payment' AND orders.payment_state='pending' AND orders.payment_ref IS NULL AND orders.payment_trans_id IS NULL
   AND (p_user IS NULL OR orders.user_id=p_user)
   AND NOT EXISTS(SELECT 1 FROM checkout_private.attempts a WHERE a.order_id=orders.id)
  ORDER BY orders.id LIMIT p_limit FOR UPDATE OF orders SKIP LOCKED LOOP
  -- Recheck after taking the same parent lock as claim/attach/settle.
  IF EXISTS(SELECT 1 FROM checkout_private.attempts a WHERE a.order_id=o.id) THEN CONTINUE; END IF;
  PERFORM 1 FROM checkout_private.reservations WHERE order_id=o.id AND released_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN CONTINUE; END IF;
  -- Product -> variant locking matches the existing catalog guard.
  FOR line IN SELECT DISTINCT product_id FROM public.order_items WHERE order_id=o.id AND variant_id IS NOT NULL ORDER BY product_id LOOP
   PERFORM 1 FROM public.products WHERE id=line.product_id FOR UPDATE;
  END LOOP;
  FOR line IN SELECT variant_id,sum(quantity)::integer quantity FROM public.order_items
   WHERE order_id=o.id AND variant_id IS NOT NULL GROUP BY variant_id ORDER BY variant_id LOOP
   UPDATE public.product_variants SET stock_quantity=stock_quantity+line.quantity WHERE id=line.variant_id;
  END LOOP;
  UPDATE public.orders SET status='cancelled' WHERE id=o.id;
  UPDATE checkout_private.reservations SET released_at=now() WHERE order_id=o.id;
  released:=released+1;
 END LOOP;
 RETURN released;
END $$;
-- Keep reviewed price/idempotency/locking logic intact behind a service-only wrapper.
ALTER FUNCTION public.trusted_checkout(uuid,uuid,jsonb,text) SET SCHEMA checkout_private;
CREATE FUNCTION public.trusted_checkout(p_user uuid,p_key uuid,p_request jsonb,p_quote text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb; old_order uuid;
BEGIN
 IF p_user IS NULL THEN RAISE EXCEPTION 'User required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('phase0-user:'||p_user::text,0));
 PERFORM public.trusted_expire_unstarted(p_user,50);
 SELECT order_id INTO old_order FROM checkout_private.requests WHERE user_id=p_user AND key=p_key;
 IF old_order IS NOT NULL AND EXISTS(SELECT 1 FROM checkout_private.reservations WHERE order_id=old_order AND released_at IS NOT NULL) THEN
  RETURN jsonb_build_object('code','CHECKOUT_EXPIRED');
 END IF;
 IF p_quote IS NOT NULL AND old_order IS NULL AND (SELECT count(*) FROM public.orders
  WHERE user_id=p_user AND checkout_version=2 AND payment_state='pending' AND status='pending_payment')>=5 THEN
  RETURN jsonb_build_object('code','PENDING_ORDER_LIMIT');
 END IF;
 result:=checkout_private.trusted_checkout(p_user,p_key,p_request,p_quote);
 IF p_quote IS NOT NULL THEN INSERT INTO checkout_private.reservations(order_id) VALUES((result->>'orderId')::uuid) ON CONFLICT DO NOTHING; END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.trusted_expire_unstarted(uuid,integer),public.trusted_checkout(uuid,uuid,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.trusted_expire_unstarted(uuid,integer),public.trusted_checkout(uuid,uuid,jsonb,text) TO service_role;
COMMIT;
