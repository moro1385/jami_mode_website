-- LOCAL PREPARATION ONLY. Rollout and database gate activation need separate approval.
-- Manual delta adjustments only; this is not a ledger of all stock movements.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE SCHEMA inventory_private;
REVOKE ALL ON SCHEMA inventory_private FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA inventory_private TO service_role;
CREATE TABLE inventory_private.settings (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 adjustments_enabled boolean NOT NULL DEFAULT false
);
INSERT INTO inventory_private.settings(singleton) VALUES(true);
CREATE TABLE inventory_private.adjustments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 actor_id uuid NOT NULL,
 request_id uuid NOT NULL,
 product_id uuid NOT NULL,
 variant_id uuid NOT NULL,
 before_quantity integer NOT NULL CHECK(before_quantity>=0),
 delta integer NOT NULL CHECK(delta<>0 AND delta BETWEEN -1000000 AND 1000000),
 after_quantity integer NOT NULL CHECK(after_quantity>=0 AND after_quantity::bigint=before_quantity::bigint+delta),
 sku text, size text, color text,
 reason text NOT NULL CHECK(char_length(reason) BETWEEN 3 AND 500 AND reason=btrim(reason) AND reason !~ '[[:cntrl:]]'),
 request jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(actor_id,request_id)
);
-- Deliberately no cascading foreign keys: history survives product/account deletion.
CREATE INDEX inventory_variant_history ON inventory_private.adjustments(product_id,variant_id,created_at DESC,id DESC);
ALTER TABLE inventory_private.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_private.adjustments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON inventory_private.settings,inventory_private.adjustments FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON inventory_private.settings TO service_role;
GRANT SELECT,INSERT ON inventory_private.adjustments TO service_role;
CREATE FUNCTION inventory_private.append_only() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'Inventory adjustments are append-only'; END $$;
CREATE TRIGGER inventory_adjustments_immutable BEFORE UPDATE OR DELETE ON inventory_private.adjustments
 FOR EACH ROW EXECUTE FUNCTION inventory_private.append_only();
CREATE FUNCTION inventory_private.require_admin(p_actor uuid) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF p_actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_actor AND role='admin') THEN RAISE EXCEPTION 'INVENTORY_FORBIDDEN'; END IF;
END $$;
CREATE FUNCTION inventory_private.entry_json(item inventory_private.adjustments) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('id',item.id,'requestId',item.request_id,'actorId',item.actor_id,'productId',item.product_id,'variantId',item.variant_id,
 'before',item.before_quantity,'after',item.after_quantity,'delta',item.delta,'reason',item.reason,'sku',item.sku,'size',item.size,'color',item.color,
 'createdAt',to_char(item.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))
$$;
CREATE FUNCTION public.trusted_inventory_status(p_actor uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 PERFORM inventory_private.require_admin(p_actor);
 RETURN jsonb_build_object('version',1,'adjustmentsEnabled',coalesce((SELECT adjustments_enabled FROM inventory_private.settings WHERE singleton),false));
END $$;
CREATE FUNCTION public.trusted_inventory_adjust(p_actor uuid,p_key uuid,p_product uuid,p_variant uuid,p_expected jsonb,p_delta integer,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' SET lock_timeout='5s' AS $$
DECLARE v public.product_variants; entry inventory_private.adjustments; body jsonb; next_quantity bigint;
BEGIN
 PERFORM inventory_private.require_admin(p_actor);
 IF p_key IS NULL OR p_product IS NULL OR p_variant IS NULL OR p_delta IS NULL OR p_delta=0 OR p_delta NOT BETWEEN -1000000 AND 1000000
  OR p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 3 AND 500 OR p_reason ~ '[[:cntrl:]]'
  OR jsonb_typeof(p_expected) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVENTORY_INVALID'; END IF;
 IF NOT(p_expected ?& ARRAY['quantity','sku','size','color']) OR (p_expected-ARRAY['quantity','sku','size','color'])<>'{}'::jsonb
  OR jsonb_typeof(p_expected->'quantity') IS DISTINCT FROM 'number' OR (p_expected->>'quantity') !~ '^(0|[1-9][0-9]{0,9})$'
  OR EXISTS(SELECT 1 FROM unnest(ARRAY['sku','size','color']) key WHERE jsonb_typeof(p_expected->key) IS NULL OR jsonb_typeof(p_expected->key) NOT IN ('string','null') OR char_length(p_expected->>key)>500)
  THEN RAISE EXCEPTION 'INVENTORY_INVALID'; END IF;
 next_quantity:=(p_expected->>'quantity')::bigint+p_delta;
 IF (p_expected->>'quantity')::bigint>2147483647 OR next_quantity NOT BETWEEN 0 AND 2147483647 THEN RAISE EXCEPTION 'INVENTORY_INVALID'; END IF;
 body:=jsonb_build_object('productId',p_product,'variantId',p_variant,'expected',p_expected,'delta',p_delta,'reason',btrim(p_reason));
 -- Replay returns the original receipt even if current stock has since changed.
 PERFORM pg_advisory_xact_lock(hashtextextended('inventory-adjust:'||p_actor::text||':'||p_key::text,0));
 SELECT * INTO entry FROM inventory_private.adjustments WHERE actor_id=p_actor AND request_id=p_key;
 IF FOUND THEN
  IF entry.request<>body THEN RAISE EXCEPTION 'INVENTORY_REQUEST_CONFLICT'; END IF;
  RETURN inventory_private.entry_json(entry);
 END IF;
 IF NOT coalesce((SELECT adjustments_enabled FROM inventory_private.settings WHERE singleton),false) THEN RAISE EXCEPTION 'INVENTORY_DISABLED'; END IF;
 -- Matches checkout and expiry parent-product -> variant lock order.
 PERFORM 1 FROM public.products WHERE id=p_product FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'INVENTORY_NOT_FOUND'; END IF;
 SELECT * INTO v FROM public.product_variants WHERE id=p_variant AND product_id=p_product FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'INVENTORY_NOT_FOUND'; END IF;
 IF p_expected<>jsonb_build_object('quantity',v.stock_quantity,'sku',v.sku,'size',v.size,'color',v.color) THEN RAISE EXCEPTION 'INVENTORY_STALE'; END IF;
 UPDATE public.product_variants SET stock_quantity=next_quantity::integer WHERE id=p_variant AND product_id=p_product;
 INSERT INTO inventory_private.adjustments(actor_id,request_id,product_id,variant_id,before_quantity,delta,after_quantity,sku,size,color,reason,request)
 VALUES(p_actor,p_key,p_product,p_variant,v.stock_quantity,p_delta,next_quantity::integer,v.sku,v.size,v.color,btrim(p_reason),body) RETURNING * INTO entry;
 RETURN inventory_private.entry_json(entry);
END $$;
CREATE FUNCTION public.trusted_inventory_history(p_actor uuid,p_product uuid,p_variant uuid,p_before timestamptz DEFAULT NULL,p_before_id uuid DEFAULT NULL,p_limit integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE entry inventory_private.adjustments; entries jsonb:='[]'; more boolean:=false;
BEGIN
 PERFORM inventory_private.require_admin(p_actor);
 IF p_product IS NULL OR p_variant IS NULL OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 OR (p_before IS NULL)<>(p_before_id IS NULL) THEN RAISE EXCEPTION 'INVENTORY_INVALID'; END IF;
 FOR entry IN SELECT a.* FROM inventory_private.adjustments a WHERE a.product_id=p_product AND a.variant_id=p_variant
  AND (p_before IS NULL OR (a.created_at,a.id)<(p_before,p_before_id)) ORDER BY a.created_at DESC,a.id DESC LIMIT p_limit+1 LOOP
  IF jsonb_array_length(entries)>=p_limit THEN more:=true; EXIT; END IF;
  entries:=entries||jsonb_build_array(inventory_private.entry_json(entry));
 END LOOP;
 RETURN jsonb_build_object('entries',entries,'hasMore',more);
END $$;
REVOKE ALL ON FUNCTION inventory_private.append_only(),inventory_private.require_admin(uuid),inventory_private.entry_json(inventory_private.adjustments) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION inventory_private.require_admin(uuid),inventory_private.entry_json(inventory_private.adjustments) TO service_role;
REVOKE ALL ON FUNCTION public.trusted_inventory_status(uuid),public.trusted_inventory_adjust(uuid,uuid,uuid,uuid,jsonb,integer,text),public.trusted_inventory_history(uuid,uuid,uuid,timestamptz,uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.trusted_inventory_status(uuid),public.trusted_inventory_adjust(uuid,uuid,uuid,uuid,jsonb,integer,text),public.trusted_inventory_history(uuid,uuid,uuid,timestamptz,uuid,integer) TO service_role;
DO $$ DECLARE role_name text; routine regprocedure; BEGIN
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF has_schema_privilege(role_name,'inventory_private','USAGE') OR has_table_privilege(role_name,'inventory_private.adjustments','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') THEN RAISE EXCEPTION 'Inventory private access retained by %',role_name; END IF;
  FOR routine IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('trusted_inventory_status','trusted_inventory_adjust','trusted_inventory_history') LOOP
   IF has_function_privilege(role_name,routine,'EXECUTE') THEN RAISE EXCEPTION 'Inventory RPC inherited access retained by %',role_name; END IF;
  END LOOP;
 END LOOP;
END $$;
COMMIT;
