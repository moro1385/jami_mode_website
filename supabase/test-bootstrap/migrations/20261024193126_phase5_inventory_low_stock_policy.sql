-- Local preparation only; hosted rollout and activation require separate approval.
BEGIN;
SET LOCAL lock_timeout='5s';
ALTER TABLE inventory_private.settings ADD COLUMN policies_enabled boolean NOT NULL DEFAULT false;
CREATE TABLE inventory_private.low_stock_policies(
 product_id uuid NOT NULL,variant_id uuid NOT NULL,threshold integer CHECK(threshold BETWEEN 0 AND 100000),
 revision integer NOT NULL CHECK(revision>0),updated_by uuid NOT NULL,request_id uuid NOT NULL,updated_at timestamptz NOT NULL,
 PRIMARY KEY(product_id,variant_id)
);
CREATE TABLE inventory_private.policy_changes(
 actor_id uuid NOT NULL,request_id uuid NOT NULL,request jsonb NOT NULL,receipt jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(actor_id,request_id)
);
ALTER TABLE inventory_private.low_stock_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_private.policy_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON inventory_private.low_stock_policies,inventory_private.policy_changes FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON inventory_private.low_stock_policies TO service_role;
GRANT SELECT,INSERT ON inventory_private.policy_changes TO service_role;
CREATE TRIGGER inventory_policy_changes_immutable BEFORE UPDATE OR DELETE ON inventory_private.policy_changes
 FOR EACH ROW EXECUTE FUNCTION inventory_private.append_only();
CREATE FUNCTION public.trusted_inventory_policy(p_actor uuid,p_product uuid,p_variant uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 PERFORM inventory_private.require_admin(p_actor);
 IF p_product IS NULL OR p_variant IS NULL THEN RAISE EXCEPTION 'POLICY_INVALID'; END IF;
 SELECT jsonb_build_object('version',1,'productId',p.id,'variantId',v.id,'threshold',policy.threshold,
  'revision',coalesce(policy.revision,0),'updatedBy',policy.updated_by,'lastRequestId',policy.request_id,
  'updatedAt',CASE WHEN policy.updated_at IS NULL THEN NULL ELSE to_char(policy.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END,
  'available',CASE WHEN v.stock_quantity>=0 THEN v.stock_quantity ELSE NULL END,
  'alert',CASE WHEN v.stock_quantity<0 THEN 'invalid' WHEN policy.threshold IS NULL THEN 'unset'
   WHEN v.stock_quantity=0 THEN 'zero' WHEN v.stock_quantity<=policy.threshold THEN 'low' ELSE 'ok' END,
  'saleEnabled',p.is_active AND NOT p.is_out_of_stock,
  'writesEnabled',coalesce((SELECT policies_enabled FROM inventory_private.settings WHERE singleton),false)) INTO result
 FROM public.products p JOIN public.product_variants v ON v.product_id=p.id
 LEFT JOIN inventory_private.low_stock_policies policy ON policy.product_id=p.id AND policy.variant_id=v.id
 WHERE p.id=p_product AND v.id=p_variant;
 IF result IS NULL THEN RAISE EXCEPTION 'POLICY_NOT_FOUND'; END IF;
 RETURN result;
END $$;
CREATE FUNCTION public.trusted_inventory_policy_set(p_actor uuid,p_key uuid,p_product uuid,p_variant uuid,p_revision integer,p_threshold integer,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' SET lock_timeout='5s' AS $$
DECLARE previous inventory_private.low_stock_policies; prior inventory_private.policy_changes; body jsonb; result jsonb; next_revision integer; stamp timestamptz;
BEGIN
 PERFORM inventory_private.require_admin(p_actor);
 IF p_key IS NULL OR p_product IS NULL OR p_variant IS NULL OR p_revision IS NULL OR p_revision NOT BETWEEN 0 AND 2147483646
  OR (p_threshold IS NOT NULL AND p_threshold NOT BETWEEN 0 AND 100000) OR p_reason IS NULL
  OR char_length(btrim(p_reason)) NOT BETWEEN 3 AND 500 OR p_reason ~ '[[:cntrl:]]' THEN RAISE EXCEPTION 'POLICY_INVALID'; END IF;
 body:=jsonb_build_object('productId',p_product,'variantId',p_variant,'expectedRevision',p_revision,'threshold',p_threshold,'reason',btrim(p_reason));
 PERFORM pg_advisory_xact_lock(hashtextextended('inventory-policy:'||p_actor::text||':'||p_key::text,0));
 SELECT * INTO prior FROM inventory_private.policy_changes WHERE actor_id=p_actor AND request_id=p_key;
 IF FOUND THEN IF prior.request<>body THEN RAISE EXCEPTION 'POLICY_CONFLICT'; END IF; RETURN prior.receipt; END IF;
 IF NOT coalesce((SELECT policies_enabled FROM inventory_private.settings WHERE singleton),false) THEN RAISE EXCEPTION 'POLICY_DISABLED'; END IF;
 PERFORM 1 FROM public.products WHERE id=p_product FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'POLICY_NOT_FOUND'; END IF;
 PERFORM 1 FROM public.product_variants WHERE id=p_variant AND product_id=p_product FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'POLICY_NOT_FOUND'; END IF;
 SELECT * INTO previous FROM inventory_private.low_stock_policies WHERE product_id=p_product AND variant_id=p_variant FOR UPDATE;
 IF coalesce(previous.revision,0)<>p_revision THEN RAISE EXCEPTION 'POLICY_STALE'; END IF;
 next_revision:=p_revision+1;stamp:=clock_timestamp();
 result:=jsonb_build_object('productId',p_product,'variantId',p_variant,'revision',next_revision,'threshold',p_threshold,
  'beforeThreshold',previous.threshold,'requestId',p_key,'actorId',p_actor,'reason',btrim(p_reason),
  'createdAt',to_char(stamp AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
 INSERT INTO inventory_private.low_stock_policies(product_id,variant_id,threshold,revision,updated_by,request_id,updated_at)
 VALUES(p_product,p_variant,p_threshold,next_revision,p_actor,p_key,stamp)
 ON CONFLICT(product_id,variant_id) DO UPDATE SET threshold=excluded.threshold,revision=excluded.revision,updated_by=excluded.updated_by,request_id=excluded.request_id,updated_at=excluded.updated_at;
 INSERT INTO inventory_private.policy_changes(actor_id,request_id,request,receipt) VALUES(p_actor,p_key,body,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.trusted_inventory_policy(uuid,uuid,uuid),public.trusted_inventory_policy_set(uuid,uuid,uuid,uuid,integer,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.trusted_inventory_policy(uuid,uuid,uuid),public.trusted_inventory_policy_set(uuid,uuid,uuid,uuid,integer,integer,text) TO service_role;
DO $$ DECLARE role_name text; routine regprocedure; BEGIN
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF has_table_privilege(role_name,'inventory_private.low_stock_policies','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
   OR has_table_privilege(role_name,'inventory_private.policy_changes','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') THEN RAISE EXCEPTION 'Policy private grants retained'; END IF;
  FOREACH routine IN ARRAY ARRAY['public.trusted_inventory_policy(uuid,uuid,uuid)'::regprocedure,'public.trusted_inventory_policy_set(uuid,uuid,uuid,uuid,integer,integer,text)'::regprocedure] LOOP
   IF has_function_privilege(role_name,routine,'EXECUTE') THEN RAISE EXCEPTION 'Policy inherited RPC grant retained'; END IF;
  END LOOP;
 END LOOP;
END $$;
COMMIT;
