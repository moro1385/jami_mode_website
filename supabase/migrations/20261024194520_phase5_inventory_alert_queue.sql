-- Local preparation only. No hosted rollout or activation is authorized here.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE INDEX inventory_enabled_policy_cursor ON inventory_private.low_stock_policies(product_id,variant_id) WHERE threshold IS NOT NULL;
CREATE FUNCTION public.trusted_inventory_alerts(p_actor uuid,p_filter text DEFAULT 'all',p_after_product uuid DEFAULT NULL,p_after_variant uuid DEFAULT NULL,p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 PERFORM inventory_private.require_admin(p_actor);
 IF p_filter IS NULL OR p_filter NOT IN ('all','low','zero','invalid','missing')
  OR (p_after_product IS NULL)<>(p_after_variant IS NULL) OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50
 THEN RAISE EXCEPTION 'ALERT_INVALID'; END IF;
 WITH scoped AS (
  SELECT policy.product_id,policy.variant_id,policy.threshold,policy.revision,
   left(coalesce(p.name,'محصول پیدا نشد'),300) product_name,v.sku,v.size,v.color,
   CASE WHEN v.stock_quantity>=0 THEN v.stock_quantity ELSE NULL END quantity,
   (p.id IS NOT NULL AND v.id IS NOT NULL) entity_exists,
   coalesce(p.id IS NOT NULL AND v.id IS NOT NULL AND p.is_active AND NOT p.is_out_of_stock,false) sale_enabled,
   CASE WHEN p.id IS NULL OR v.id IS NULL THEN 'missing' WHEN v.stock_quantity IS NULL OR v.stock_quantity<0 THEN 'invalid'
    WHEN v.stock_quantity=0 THEN 'zero' WHEN v.stock_quantity<=policy.threshold THEN 'low' ELSE 'ok' END alert
  FROM inventory_private.low_stock_policies policy
  LEFT JOIN public.products p ON p.id=policy.product_id
  LEFT JOIN public.product_variants v ON v.id=policy.variant_id AND v.product_id=policy.product_id
  WHERE policy.threshold IS NOT NULL AND (p_after_product IS NULL OR (policy.product_id,policy.variant_id)>(p_after_product,p_after_variant))
 ), selected AS (
  SELECT * FROM scoped WHERE alert<>'ok' AND (p_filter='all' OR alert=p_filter)
  ORDER BY product_id,variant_id LIMIT p_limit+1
 ), page AS (SELECT * FROM selected ORDER BY product_id,variant_id LIMIT p_limit)
 SELECT jsonb_build_object('version',1,
  'rows',coalesce((SELECT jsonb_agg(jsonb_build_object('productId',product_id,'variantId',variant_id,'productName',product_name,
   'sku',sku,'size',size,'color',color,'quantity',quantity,'threshold',threshold,'revision',revision,
   'alert',alert,'entityExists',entity_exists,'saleEnabled',sale_enabled) ORDER BY product_id,variant_id) FROM page),'[]'::jsonb),
  'hasMore',(SELECT count(*) FROM selected)>p_limit,
  'asOf',to_char(statement_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.trusted_inventory_alerts(uuid,text,uuid,uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.trusted_inventory_alerts(uuid,text,uuid,uuid,integer) TO service_role;
DO $$ DECLARE role_name text; BEGIN
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF has_function_privilege(role_name,'public.trusted_inventory_alerts(uuid,text,uuid,uuid,integer)','EXECUTE') THEN RAISE EXCEPTION 'Alert inherited RPC access retained'; END IF;
 END LOOP;
END $$;
COMMIT;
