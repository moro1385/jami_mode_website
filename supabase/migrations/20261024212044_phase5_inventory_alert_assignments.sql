-- Local preparation only; no hosted activation is authorized.
BEGIN;
SET LOCAL lock_timeout='5s';
ALTER TABLE inventory_private.settings ADD COLUMN assignments_enabled boolean NOT NULL DEFAULT false;
CREATE TABLE inventory_private.alert_assignments(product_id uuid NOT NULL,variant_id uuid NOT NULL,revision integer NOT NULL CHECK(revision>0),assignee_id uuid,updated_by uuid NOT NULL,request_id uuid NOT NULL,updated_at timestamptz NOT NULL,PRIMARY KEY(product_id,variant_id));
CREATE TABLE inventory_private.assignment_events(id uuid PRIMARY KEY,product_id uuid NOT NULL,variant_id uuid NOT NULL,actor_id uuid NOT NULL,request_id uuid NOT NULL,request jsonb NOT NULL,receipt jsonb NOT NULL,created_at timestamptz NOT NULL,UNIQUE(actor_id,request_id));
CREATE INDEX inventory_assignment_history ON inventory_private.assignment_events(product_id,variant_id,created_at DESC,id DESC);
ALTER TABLE inventory_private.alert_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_private.assignment_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON inventory_private.alert_assignments,inventory_private.assignment_events FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON inventory_private.alert_assignments TO service_role;
GRANT SELECT,INSERT ON inventory_private.assignment_events TO service_role;
CREATE TRIGGER inventory_assignments_immutable BEFORE UPDATE OR DELETE ON inventory_private.assignment_events FOR EACH ROW EXECUTE FUNCTION inventory_private.append_only();
CREATE FUNCTION public.trusted_inventory_assignees(p_actor uuid,p_after uuid DEFAULT NULL,p_limit integer DEFAULT 50) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 PERFORM inventory_private.require_admin(p_actor);
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'ASSIGNMENT_INVALID';END IF;
 WITH selected AS (SELECT r.user_id,left(nullif(btrim(coalesce(p.first_name,'')||' '||coalesce(p.last_name,'')),''),200) display_name
  FROM public.user_roles r LEFT JOIN public.profiles p ON p.id=r.user_id WHERE r.role='admin' AND (p_after IS NULL OR r.user_id>p_after) ORDER BY r.user_id LIMIT p_limit+1),
 page AS (SELECT * FROM selected ORDER BY user_id LIMIT p_limit)
 SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(jsonb_build_object('id',user_id,'name',display_name) ORDER BY user_id) FROM page),'[]'::jsonb),'hasMore',(SELECT count(*) FROM selected)>p_limit) INTO result;RETURN result;
END $$;
CREATE FUNCTION public.trusted_inventory_assignment(p_actor uuid,p_product uuid,p_variant uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE context jsonb;record inventory_private.alert_assignments;active boolean;display_name text;
BEGIN
 context:=public.trusted_inventory_followup(p_actor,p_product,p_variant);
 SELECT * INTO record FROM inventory_private.alert_assignments WHERE product_id=p_product AND variant_id=p_variant;
 active:=record.assignee_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=record.assignee_id AND role='admin');
 SELECT left(nullif(btrim(coalesce(first_name,'')||' '||coalesce(last_name,'')),''),200) INTO display_name FROM public.profiles WHERE id=record.assignee_id;
 RETURN jsonb_build_object('context',context,'revision',coalesce(record.revision,0),'assigneeId',record.assignee_id,'assigneeActive',active,'assigneeName',CASE WHEN active THEN display_name ELSE NULL END,
  'updatedBy',record.updated_by,'lastRequestId',record.request_id,'updatedAt',CASE WHEN record.updated_at IS NULL THEN NULL ELSE to_char(record.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END,
  'canWrite',(context->>'hasEntity')::boolean AND context->>'alert' IN ('low','zero','invalid') AND coalesce((SELECT assignments_enabled FROM inventory_private.settings WHERE singleton),false));
END $$;
CREATE FUNCTION public.trusted_inventory_assignment_set(p_actor uuid,p_key uuid,p_product uuid,p_variant uuid,p_inventory_revision uuid,p_policy_revision integer,p_revision integer,p_assignee uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' SET lock_timeout='5s' AS $$
DECLARE v public.product_variants;policy inventory_private.low_stock_policies;previous inventory_private.alert_assignments;prior inventory_private.assignment_events;body jsonb;result jsonb;stamp timestamptz;event_id uuid;
BEGIN
 PERFORM inventory_private.require_admin(p_actor);
 IF p_key IS NULL OR p_product IS NULL OR p_variant IS NULL OR p_inventory_revision IS NULL OR p_policy_revision IS NULL OR p_policy_revision<1 OR p_revision IS NULL OR p_revision NOT BETWEEN 0 AND 2147483646 OR p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 3 AND 500 OR p_reason ~ '[[:cntrl:]]' THEN RAISE EXCEPTION 'ASSIGNMENT_INVALID';END IF;
 body:=jsonb_build_object('productId',p_product,'variantId',p_variant,'inventoryRevision',p_inventory_revision,'policyRevision',p_policy_revision,'expectedRevision',p_revision,'assigneeId',p_assignee,'reason',btrim(p_reason));
 PERFORM pg_advisory_xact_lock(hashtextextended('inventory-assignment:'||p_actor::text||':'||p_key::text,0));
 SELECT * INTO prior FROM inventory_private.assignment_events WHERE actor_id=p_actor AND request_id=p_key;
 IF FOUND THEN IF prior.request<>body THEN RAISE EXCEPTION 'ASSIGNMENT_CONFLICT';END IF;RETURN prior.receipt;END IF;
 IF NOT coalesce((SELECT assignments_enabled FROM inventory_private.settings WHERE singleton),false) THEN RAISE EXCEPTION 'ASSIGNMENT_DISABLED';END IF;
 PERFORM 1 FROM public.products WHERE id=p_product FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'ASSIGNMENT_NOT_FOUND';END IF;
 SELECT * INTO v FROM public.product_variants WHERE id=p_variant AND product_id=p_product FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'ASSIGNMENT_NOT_FOUND';END IF;
 SELECT * INTO policy FROM inventory_private.low_stock_policies WHERE product_id=p_product AND variant_id=p_variant FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'ASSIGNMENT_NOT_FOUND';END IF;
 IF v.inventory_revision<>p_inventory_revision OR policy.revision<>p_policy_revision THEN RAISE EXCEPTION 'ASSIGNMENT_STALE_CONTEXT';END IF;
 IF policy.threshold IS NULL OR v.stock_quantity>policy.threshold THEN RAISE EXCEPTION 'ASSIGNMENT_INACTIVE';END IF;
 SELECT * INTO previous FROM inventory_private.alert_assignments WHERE product_id=p_product AND variant_id=p_variant FOR UPDATE;
 IF coalesce(previous.revision,0)<>p_revision THEN RAISE EXCEPTION 'ASSIGNMENT_STALE_REVISION';END IF;
 IF p_assignee IS NOT NULL THEN
  PERFORM 1 FROM public.user_roles WHERE user_id=p_assignee AND role='admin' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ASSIGNMENT_TARGET_INACTIVE';END IF;
 END IF;
 IF previous.revision IS NOT NULL AND previous.assignee_id IS NOT DISTINCT FROM p_assignee THEN RAISE EXCEPTION 'ASSIGNMENT_UNCHANGED';END IF;
 IF previous.revision IS NULL AND p_assignee IS NULL THEN RAISE EXCEPTION 'ASSIGNMENT_UNCHANGED';END IF;
 stamp:=clock_timestamp();event_id:=gen_random_uuid();
 result:=jsonb_build_object('id',event_id,'productId',p_product,'variantId',p_variant,'actorId',p_actor,'requestId',p_key,'inventoryRevision',p_inventory_revision,'policyRevision',p_policy_revision,'revision',p_revision+1,'assigneeId',p_assignee,'beforeAssigneeId',previous.assignee_id,'reason',btrim(p_reason),'createdAt',to_char(stamp AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
 INSERT INTO inventory_private.alert_assignments(product_id,variant_id,revision,assignee_id,updated_by,request_id,updated_at) VALUES(p_product,p_variant,p_revision+1,p_assignee,p_actor,p_key,stamp)
 ON CONFLICT(product_id,variant_id) DO UPDATE SET revision=excluded.revision,assignee_id=excluded.assignee_id,updated_by=excluded.updated_by,request_id=excluded.request_id,updated_at=excluded.updated_at;
 INSERT INTO inventory_private.assignment_events VALUES(event_id,p_product,p_variant,p_actor,p_key,body,result,stamp);RETURN result;
END $$;
CREATE FUNCTION public.trusted_inventory_assignment_history(p_actor uuid,p_product uuid,p_variant uuid,p_before timestamptz DEFAULT NULL,p_before_id uuid DEFAULT NULL,p_limit integer DEFAULT 20) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE entry inventory_private.assignment_events;entries jsonb:='[]';more boolean:=false;
BEGIN
 PERFORM inventory_private.require_admin(p_actor);
 IF p_product IS NULL OR p_variant IS NULL OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 OR (p_before IS NULL)<>(p_before_id IS NULL) THEN RAISE EXCEPTION 'ASSIGNMENT_INVALID';END IF;
 FOR entry IN SELECT * FROM inventory_private.assignment_events e WHERE e.product_id=p_product AND e.variant_id=p_variant AND (p_before IS NULL OR (e.created_at,e.id)<(p_before,p_before_id)) ORDER BY e.created_at DESC,e.id DESC LIMIT p_limit+1 LOOP
  IF jsonb_array_length(entries)>=p_limit THEN more:=true;EXIT;END IF;entries:=entries||jsonb_build_array(entry.receipt);
 END LOOP;RETURN jsonb_build_object('entries',entries,'hasMore',more);
END $$;
REVOKE ALL ON FUNCTION public.trusted_inventory_assignees(uuid,uuid,integer),public.trusted_inventory_assignment(uuid,uuid,uuid),public.trusted_inventory_assignment_set(uuid,uuid,uuid,uuid,uuid,integer,integer,uuid,text),public.trusted_inventory_assignment_history(uuid,uuid,uuid,timestamptz,uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.trusted_inventory_assignees(uuid,uuid,integer),public.trusted_inventory_assignment(uuid,uuid,uuid),public.trusted_inventory_assignment_set(uuid,uuid,uuid,uuid,uuid,integer,integer,uuid,text),public.trusted_inventory_assignment_history(uuid,uuid,uuid,timestamptz,uuid,integer) TO service_role;
COMMIT;
