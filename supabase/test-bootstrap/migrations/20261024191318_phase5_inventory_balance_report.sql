-- Local preparation only; no hosted rollout/activation is authorized here.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE INDEX inventory_order_items_variant ON public.order_items(variant_id) WHERE variant_id IS NOT NULL;
CREATE FUNCTION public.trusted_inventory_balance(p_actor uuid,p_product uuid,p_variant uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' SET statement_timeout='8s' AS $$
DECLARE result jsonb;
BEGIN
 PERFORM inventory_private.require_admin(p_actor);
 IF p_product IS NULL OR p_variant IS NULL THEN RAISE EXCEPTION 'INVENTORY_INVALID'; END IF;
 -- One SELECT snapshot for stock, reservation state, orders and all counters.
 WITH lines AS (
  SELECT i.quantity,i.product_id,o.checkout_version,o.payment_state,o.status,
   r.order_id reservation_id,r.released_at,r.expires_at,
   (o.checkout_version=2 AND i.product_id=p_product AND i.quantity>0
    AND r.order_id IS NOT NULL AND r.released_at IS NULL
    AND o.payment_state='pending' AND o.status='pending_payment') pending_reservation
  FROM public.order_items i JOIN public.orders o ON o.id=i.order_id
  LEFT JOIN checkout_private.reservations r ON r.order_id=o.id
  WHERE i.variant_id=p_variant
 ), totals AS (
  SELECT coalesce(sum(quantity) FILTER(WHERE pending_reservation),0)::text reserved,
   coalesce(sum(quantity) FILTER(WHERE pending_reservation AND expires_at<=statement_timestamp()),0)::text overdue,
   coalesce(sum(quantity) FILTER(WHERE checkout_version=2 AND product_id=p_product AND quantity>0 AND payment_state='paid'),0)::text paid,
   coalesce(sum(quantity) FILTER(WHERE checkout_version=2 AND product_id=p_product AND quantity>0 AND released_at IS NOT NULL AND status='cancelled' AND payment_state='pending'),0)::text released,
   coalesce(sum(quantity) FILTER(WHERE checkout_version IS DISTINCT FROM 2 AND product_id=p_product AND quantity>0),0)::text legacy,
   count(*) FILTER(WHERE product_id IS DISTINCT FROM p_product OR quantity IS NULL OR quantity<=0
    OR (checkout_version=2 AND (reservation_id IS NULL
     OR (NOT pending_reservation AND NOT (payment_state='paid' AND released_at IS NULL)
       AND NOT (status='cancelled' AND payment_state='pending' AND released_at IS NOT NULL)))))::text review
  FROM lines
 )
 SELECT jsonb_build_object('version',1,'productId',p.id,'variantId',v.id,
  'available',CASE WHEN v.stock_quantity>=0 THEN v.stock_quantity ELSE NULL END,
  'reserved',t.reserved,'overdue',t.overdue,'paid',t.paid,'released',t.released,'legacy',t.legacy,'reviewLines',t.review,
  'saleEnabled',p.is_active AND NOT p.is_out_of_stock,
  'asOf',to_char(statement_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) INTO result
 FROM public.products p JOIN public.product_variants v ON v.product_id=p.id CROSS JOIN totals t
 WHERE p.id=p_product AND v.id=p_variant;
 IF result IS NULL THEN RAISE EXCEPTION 'INVENTORY_NOT_FOUND'; END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.trusted_inventory_balance(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.trusted_inventory_balance(uuid,uuid,uuid) TO service_role;
DO $$ DECLARE role_name text; BEGIN
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF has_function_privilege(role_name,'public.trusted_inventory_balance(uuid,uuid,uuid)','EXECUTE')
  THEN RAISE EXCEPTION 'Inventory report inherited access retained by %',role_name; END IF;
 END LOOP;
END $$;
COMMIT;
