-- Local preparation only. Hosted migration/activation requires separate approval.
BEGIN;
SET LOCAL lock_timeout='5s';
ALTER TABLE public.product_variants ADD COLUMN inventory_revision uuid NOT NULL DEFAULT pg_catalog.gen_random_uuid();
CREATE FUNCTION inventory_private.bump_variant_revision() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF TG_OP='INSERT' THEN NEW.inventory_revision:=pg_catalog.gen_random_uuid();
 ELSIF ROW(NEW.product_id,NEW.size,NEW.color,NEW.sku,NEW.stock_quantity) IS DISTINCT FROM ROW(OLD.product_id,OLD.size,OLD.color,OLD.sku,OLD.stock_quantity)
 THEN NEW.inventory_revision:=pg_catalog.gen_random_uuid();
 ELSE NEW.inventory_revision:=OLD.inventory_revision; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION inventory_private.bump_variant_revision() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER inventory_variant_revision BEFORE INSERT OR UPDATE ON public.product_variants FOR EACH ROW EXECUTE FUNCTION inventory_private.bump_variant_revision();
ALTER TABLE inventory_private.settings ADD COLUMN followups_enabled boolean NOT NULL DEFAULT false;
CREATE TABLE inventory_private.alert_followups(
 product_id uuid NOT NULL,variant_id uuid NOT NULL,inventory_revision uuid NOT NULL,policy_revision integer NOT NULL CHECK(policy_revision>0),
 revision integer NOT NULL CHECK(revision>0),status text NOT NULL CHECK(status IN ('open','in_progress','reviewed')),
 updated_by uuid NOT NULL,request_id uuid NOT NULL,updated_at timestamptz NOT NULL,PRIMARY KEY(product_id,variant_id)
);
CREATE TABLE inventory_private.alert_followup_events(
 id uuid PRIMARY KEY,product_id uuid NOT NULL,variant_id uuid NOT NULL,actor_id uuid NOT NULL,request_id uuid NOT NULL,
 request jsonb NOT NULL,receipt jsonb NOT NULL,created_at timestamptz NOT NULL,UNIQUE(actor_id,request_id)
);
CREATE INDEX inventory_followup_history ON inventory_private.alert_followup_events(product_id,variant_id,created_at DESC,id DESC);
ALTER TABLE inventory_private.alert_followups ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_private.alert_followup_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON inventory_private.alert_followups,inventory_private.alert_followup_events FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON inventory_private.alert_followups TO service_role;
GRANT SELECT,INSERT ON inventory_private.alert_followup_events TO service_role;
CREATE TRIGGER inventory_followups_immutable BEFORE UPDATE OR DELETE ON inventory_private.alert_followup_events FOR EACH ROW EXECUTE FUNCTION inventory_private.append_only();
CREATE FUNCTION public.trusted_inventory_followup(p_actor uuid,p_product uuid,p_variant uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 PERFORM inventory_private.require_admin(p_actor);
 WITH context AS (
  SELECT policy.revision policy_revision,policy.threshold,v.inventory_revision,
   CASE WHEN v.stock_quantity>=0 THEN v.stock_quantity ELSE NULL END quantity,
   (p.id IS NOT NULL AND v.id IS NOT NULL) entity_exists,
   CASE WHEN policy.threshold IS NULL THEN 'none' WHEN p.id IS NULL OR v.id IS NULL THEN 'missing'
    WHEN v.stock_quantity IS NULL OR v.stock_quantity<0 THEN 'invalid' WHEN v.stock_quantity=0 THEN 'zero'
    WHEN v.stock_quantity<=policy.threshold THEN 'low' ELSE 'none' END alert,
   f.revision,f.status,f.updated_by,f.request_id,f.updated_at,
   f.revision IS NOT NULL AND (f.inventory_revision IS DISTINCT FROM v.inventory_revision OR f.policy_revision<>policy.revision) changed
  FROM inventory_private.low_stock_policies policy LEFT JOIN public.products p ON p.id=policy.product_id
  LEFT JOIN public.product_variants v ON v.id=policy.variant_id AND v.product_id=policy.product_id
  LEFT JOIN inventory_private.alert_followups f ON f.product_id=policy.product_id AND f.variant_id=policy.variant_id
  WHERE policy.product_id=p_product AND policy.variant_id=p_variant
 ) SELECT jsonb_build_object('version',1,'productId',p_product,'variantId',p_variant,'policyRevision',policy_revision,
  'inventoryRevision',CASE WHEN entity_exists THEN inventory_revision ELSE NULL END,'quantity',quantity,'threshold',threshold,'alert',alert,'hasEntity',entity_exists,
  'revision',coalesce(revision,0),'status',CASE WHEN changed OR alert IN ('none','missing') THEN 'open' ELSE coalesce(status,'open') END,
  'lastStatus',status,'contextChanged',changed,'updatedBy',updated_by,'lastRequestId',request_id,
  'updatedAt',CASE WHEN updated_at IS NULL THEN NULL ELSE to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END,
  'canWrite',entity_exists AND alert IN ('low','zero','invalid') AND coalesce((SELECT followups_enabled FROM inventory_private.settings WHERE singleton),false)) INTO result FROM context;
 IF result IS NULL THEN RAISE EXCEPTION 'FOLLOWUP_NOT_FOUND'; END IF;
 RETURN result;
END $$;
CREATE FUNCTION public.trusted_inventory_followup_set(p_actor uuid,p_key uuid,p_product uuid,p_variant uuid,p_inventory_revision uuid,p_policy_revision integer,p_revision integer,p_status text,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' SET lock_timeout='5s' AS $$
DECLARE v public.product_variants;policy inventory_private.low_stock_policies;previous inventory_private.alert_followups;
 prior inventory_private.alert_followup_events;body jsonb;result jsonb;stamp timestamptz;event_id uuid;before_status text;
BEGIN
 PERFORM inventory_private.require_admin(p_actor);
 IF p_key IS NULL OR p_product IS NULL OR p_variant IS NULL OR p_inventory_revision IS NULL OR p_policy_revision IS NULL OR p_policy_revision<1
  OR p_revision IS NULL OR p_revision NOT BETWEEN 0 AND 2147483646 OR p_status IS NULL OR p_status NOT IN ('open','in_progress','reviewed')
  OR p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 3 AND 500 OR p_reason ~ '[[:cntrl:]]' THEN RAISE EXCEPTION 'FOLLOWUP_INVALID'; END IF;
 body:=jsonb_build_object('productId',p_product,'variantId',p_variant,'inventoryRevision',p_inventory_revision,'policyRevision',p_policy_revision,
  'expectedRevision',p_revision,'status',p_status,'reason',btrim(p_reason));
 PERFORM pg_advisory_xact_lock(hashtextextended('inventory-followup:'||p_actor::text||':'||p_key::text,0));
 SELECT * INTO prior FROM inventory_private.alert_followup_events WHERE actor_id=p_actor AND request_id=p_key;
 IF FOUND THEN IF prior.request<>body THEN RAISE EXCEPTION 'FOLLOWUP_CONFLICT'; END IF;RETURN prior.receipt;END IF;
 IF NOT coalesce((SELECT followups_enabled FROM inventory_private.settings WHERE singleton),false) THEN RAISE EXCEPTION 'FOLLOWUP_DISABLED'; END IF;
 PERFORM 1 FROM public.products WHERE id=p_product FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'FOLLOWUP_NOT_FOUND'; END IF;
 SELECT * INTO v FROM public.product_variants WHERE id=p_variant AND product_id=p_product FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'FOLLOWUP_NOT_FOUND';END IF;
 SELECT * INTO policy FROM inventory_private.low_stock_policies WHERE product_id=p_product AND variant_id=p_variant FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'FOLLOWUP_NOT_FOUND'; END IF;
 IF v.inventory_revision<>p_inventory_revision OR policy.revision<>p_policy_revision THEN RAISE EXCEPTION 'FOLLOWUP_STALE_CONTEXT'; END IF;
 IF policy.threshold IS NULL OR v.stock_quantity>policy.threshold THEN RAISE EXCEPTION 'FOLLOWUP_INACTIVE'; END IF;
 SELECT * INTO previous FROM inventory_private.alert_followups WHERE product_id=p_product AND variant_id=p_variant FOR UPDATE;
 IF coalesce(previous.revision,0)<>p_revision THEN RAISE EXCEPTION 'FOLLOWUP_STALE_REVISION'; END IF;
 before_status:=CASE WHEN previous.inventory_revision=p_inventory_revision AND previous.policy_revision=p_policy_revision THEN previous.status ELSE 'open' END;
 stamp:=clock_timestamp();event_id:=pg_catalog.gen_random_uuid();
 result:=jsonb_build_object('id',event_id,'productId',p_product,'variantId',p_variant,'actorId',p_actor,'requestId',p_key,'revision',p_revision+1,
  'policyRevision',p_policy_revision,'inventoryRevision',p_inventory_revision,'status',p_status,'beforeStatus',before_status,'reason',btrim(p_reason),
  'quantity',CASE WHEN v.stock_quantity>=0 THEN v.stock_quantity ELSE NULL END,'threshold',policy.threshold,
  'createdAt',to_char(stamp AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
 INSERT INTO inventory_private.alert_followups(product_id,variant_id,inventory_revision,policy_revision,revision,status,updated_by,request_id,updated_at)
 VALUES(p_product,p_variant,p_inventory_revision,p_policy_revision,p_revision+1,p_status,p_actor,p_key,stamp)
 ON CONFLICT(product_id,variant_id) DO UPDATE SET inventory_revision=excluded.inventory_revision,policy_revision=excluded.policy_revision,revision=excluded.revision,
  status=excluded.status,updated_by=excluded.updated_by,request_id=excluded.request_id,updated_at=excluded.updated_at;
 INSERT INTO inventory_private.alert_followup_events(id,product_id,variant_id,actor_id,request_id,request,receipt,created_at)
 VALUES(event_id,p_product,p_variant,p_actor,p_key,body,result,stamp);
 RETURN result;
END $$;
CREATE FUNCTION public.trusted_inventory_followup_history(p_actor uuid,p_product uuid,p_variant uuid,p_before timestamptz DEFAULT NULL,p_before_id uuid DEFAULT NULL,p_limit integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE entry inventory_private.alert_followup_events;entries jsonb:='[]';more boolean:=false;
BEGIN
 PERFORM inventory_private.require_admin(p_actor);
 IF p_product IS NULL OR p_variant IS NULL OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 OR (p_before IS NULL)<>(p_before_id IS NULL) THEN RAISE EXCEPTION 'FOLLOWUP_INVALID'; END IF;
 FOR entry IN SELECT * FROM inventory_private.alert_followup_events e WHERE e.product_id=p_product AND e.variant_id=p_variant
  AND (p_before IS NULL OR (e.created_at,e.id)<(p_before,p_before_id)) ORDER BY e.created_at DESC,e.id DESC LIMIT p_limit+1 LOOP
  IF jsonb_array_length(entries)>=p_limit THEN more:=true;EXIT;END IF;entries:=entries||jsonb_build_array(entry.receipt);
 END LOOP;
 RETURN jsonb_build_object('entries',entries,'hasMore',more);
END $$;
REVOKE ALL ON FUNCTION public.trusted_inventory_followup(uuid,uuid,uuid),public.trusted_inventory_followup_set(uuid,uuid,uuid,uuid,uuid,integer,integer,text,text),public.trusted_inventory_followup_history(uuid,uuid,uuid,timestamptz,uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.trusted_inventory_followup(uuid,uuid,uuid),public.trusted_inventory_followup_set(uuid,uuid,uuid,uuid,uuid,integer,integer,text,text),public.trusted_inventory_followup_history(uuid,uuid,uuid,timestamptz,uuid,integer) TO service_role;
DO $$ DECLARE role_name text;routine regprocedure;BEGIN
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF has_column_privilege(role_name,'public.product_variants','inventory_revision','INSERT,UPDATE')
   OR has_table_privilege(role_name,'inventory_private.alert_followups','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
   OR has_table_privilege(role_name,'inventory_private.alert_followup_events','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') THEN RAISE EXCEPTION 'Followup browser grant retained'; END IF;
  FOREACH routine IN ARRAY ARRAY['public.trusted_inventory_followup(uuid,uuid,uuid)'::regprocedure,'public.trusted_inventory_followup_set(uuid,uuid,uuid,uuid,uuid,integer,integer,text,text)'::regprocedure,'public.trusted_inventory_followup_history(uuid,uuid,uuid,timestamptz,uuid,integer)'::regprocedure] LOOP
   IF has_function_privilege(role_name,routine,'EXECUTE') THEN RAISE EXCEPTION 'Followup inherited RPC access retained'; END IF;
  END LOOP;
 END LOOP;
END $$;
COMMIT;
