-- Local preparation only. Hosted rollout and all real refund execution are separate.
BEGIN;
SET LOCAL lock_timeout='5s';
GRANT SELECT ON public.return_requests,public.tickets,public.user_messages TO service_role;
GRANT UPDATE(status) ON public.return_requests,public.tickets TO service_role;
CREATE SCHEMA erp_private;
REVOKE ALL ON SCHEMA erp_private FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA erp_private TO service_role;
CREATE TABLE erp_private.settings(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),operations_enabled boolean NOT NULL DEFAULT false);
INSERT INTO erp_private.settings DEFAULT VALUES;
CREATE TABLE erp_private.events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor_id uuid NOT NULL,request_id uuid NOT NULL,resource text NOT NULL,entity_id uuid NOT NULL,request jsonb NOT NULL,receipt jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(actor_id,request_id));
CREATE INDEX erp_events_cursor ON erp_private.events(created_at DESC,id DESC);
CREATE TABLE erp_private.activity(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor_id uuid,source text NOT NULL,resource text NOT NULL,entity_id uuid,action text NOT NULL,changed_fields text[] NOT NULL,before_values jsonb NOT NULL,after_values jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE INDEX erp_activity_cursor ON erp_private.activity(created_at DESC,id DESC);
CREATE INDEX erp_activity_actor ON erp_private.activity(actor_id,id);
CREATE INDEX erp_activity_entity ON erp_private.activity(entity_id,id);
CREATE TABLE erp_private.return_cases(return_id uuid PRIMARY KEY,state text NOT NULL CHECK(state IN ('pending','approved','received','rejected','closed')),revision integer NOT NULL CHECK(revision>0));
CREATE TABLE erp_private.refund_cases(order_id uuid PRIMARY KEY,state text NOT NULL CHECK(state IN ('requested','approved','rejected','externally_recorded')),revision integer NOT NULL CHECK(revision>0),amount bigint NOT NULL CHECK(amount>0),reference text);
CREATE TABLE erp_private.item_costs(item_id uuid PRIMARY KEY,unit_cost bigint NOT NULL CHECK(unit_cost BETWEEN 0 AND 99999999),revision integer NOT NULL CHECK(revision>0));
ALTER TABLE erp_private.item_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.return_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.refund_cases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA erp_private FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA erp_private TO service_role;
GRANT SELECT,INSERT,UPDATE ON erp_private.item_costs TO service_role;
GRANT INSERT ON erp_private.events TO service_role;
GRANT SELECT,INSERT,UPDATE ON erp_private.return_cases,erp_private.refund_cases TO service_role;
CREATE TRIGGER erp_events_append_only BEFORE UPDATE OR DELETE ON erp_private.events FOR EACH ROW EXECUTE FUNCTION inventory_private.append_only();
CREATE TRIGGER erp_activity_append_only BEFORE UPDATE OR DELETE ON erp_private.activity FOR EACH ROW EXECUTE FUNCTION inventory_private.append_only();
-- A narrowly scoped private trigger needs owner INSERT authority; clients receive no audit-table grant.
CREATE FUNCTION erp_private.capture_activity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid();old_row jsonb;new_row jsonb;fields text[];before_values jsonb;after_values jsonb;
BEGIN
 IF actor IS NULL OR NOT public.has_role(actor,'admin'::public.app_role) THEN RETURN NULL;END IF;
 IF TG_OP<>'INSERT' THEN old_row:=to_jsonb(OLD);END IF;
 IF TG_OP<>'DELETE' THEN new_row:=to_jsonb(NEW);END IF;
 SELECT coalesce(array_agg(key ORDER BY key),'{}') INTO fields FROM jsonb_object_keys(coalesce(new_row,old_row)) key WHERE key<>'updated_at' AND (TG_OP<>'UPDATE' OR new_row->key IS DISTINCT FROM old_row->key);
 SELECT coalesce(jsonb_object_agg(key,old_row->>key),'{}'::jsonb),coalesce(jsonb_object_agg(key,new_row->>key),'{}'::jsonb) INTO before_values,after_values FROM unnest(fields) key WHERE key=ANY(ARRAY['price','stock_quantity','is_active','is_out_of_stock','status','payment_state','total_amount','shipping_cost','is_read']);
 IF cardinality(fields)>0 THEN INSERT INTO erp_private.activity(actor_id,source,resource,entity_id,action,changed_fields,before_values,after_values) VALUES(actor,'authenticated-admin',TG_TABLE_NAME,(coalesce(new_row,old_row)->>'id')::uuid,TG_OP,fields,before_values,after_values);END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION erp_private.capture_activity() FROM PUBLIC,anon,authenticated,service_role;
DO $$ DECLARE name text;BEGIN FOREACH name IN ARRAY ARRAY['products','product_variants','orders','return_requests','tickets','user_messages','profiles','addresses'] LOOP
 EXECUTE format('CREATE TRIGGER erp_admin_activity AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION erp_private.capture_activity()',name);
END LOOP;END $$;
-- Activate the reviewed workflow boundary together with the explicit DB gate.
CREATE FUNCTION erp_private.guard_browser_workflow() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF current_setting('role',true) IN ('anon','authenticated') AND coalesce((SELECT operations_enabled FROM erp_private.settings WHERE singleton),false) THEN RAISE EXCEPTION 'Use the audited ERP workflow' USING ERRCODE='42501';END IF;RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION erp_private.guard_browser_workflow() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER erp_workflow_boundary BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION erp_private.guard_browser_workflow();
CREATE TRIGGER erp_workflow_boundary BEFORE UPDATE ON public.return_requests FOR EACH ROW EXECUTE FUNCTION erp_private.guard_browser_workflow();
CREATE TRIGGER erp_workflow_boundary BEFORE UPDATE ON public.tickets FOR EACH ROW EXECUTE FUNCTION erp_private.guard_browser_workflow();
CREATE FUNCTION public.trusted_erp_operation(p_actor uuid,p_key uuid,p_resource text,p_entity uuid,p_expected text,p_next text,p_reason text,p_detail text DEFAULT NULL,p_amount bigint DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' SET lock_timeout='5s' AS $$
DECLARE prior erp_private.events;body jsonb;result jsonb;o public.orders;r public.return_requests;ticket public.tickets;return_case erp_private.return_cases;refund erp_private.refund_cases;item public.order_items;cost erp_private.item_costs;before_state text;revision integer;event_id uuid:=gen_random_uuid();
BEGIN
 PERFORM inventory_private.require_admin(p_actor);
 IF p_key IS NULL OR p_entity IS NULL OR p_resource IS NULL OR p_resource NOT IN ('order','return','refund','ticket','cost') OR p_expected IS NULL OR p_next IS NULL OR p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 3 AND 500 OR p_reason ~ '[[:cntrl:]]' OR (p_detail IS NOT NULL AND (char_length(p_detail)>200 OR p_detail ~ '[[:cntrl:]]')) THEN RAISE EXCEPTION 'ERP_INVALID';END IF;
 body:=jsonb_build_object('resource',p_resource,'entityId',p_entity,'expected',p_expected,'next',p_next,'reason',btrim(p_reason),'detail',p_detail,'amount',p_amount);
 PERFORM pg_advisory_xact_lock(hashtextextended('erp:'||p_actor::text||':'||p_key::text,0));SELECT * INTO prior FROM erp_private.events WHERE actor_id=p_actor AND request_id=p_key;
 IF FOUND THEN IF prior.request<>body THEN RAISE EXCEPTION 'ERP_CONFLICT';END IF;RETURN prior.receipt;END IF;
 IF NOT (SELECT operations_enabled FROM erp_private.settings WHERE singleton) THEN RAISE EXCEPTION 'ERP_DISABLED';END IF;
 IF p_resource IN ('order','refund') THEN
  SELECT * INTO o FROM public.orders WHERE id=p_entity FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'ERP_NOT_FOUND';END IF;
  IF o.id IS NULL OR o.payment_state IS DISTINCT FROM 'paid' OR o.checkout_version IS DISTINCT FROM 2 THEN RAISE EXCEPTION 'ERP_PAYMENT_REVIEW';END IF;
  IF p_resource='order' THEN
   before_state:=o.status;IF p_expected<>before_state THEN RAISE EXCEPTION 'ERP_STALE';END IF;
   IF NOT ((before_state='confirmed' AND p_next='processing') OR (before_state='processing' AND p_next='shipped' AND nullif(btrim(p_detail),'') IS NOT NULL) OR (before_state='shipped' AND p_next='delivered') OR (before_state IN ('confirmed','processing') AND p_next='cancelled')) OR p_amount IS NOT NULL THEN RAISE EXCEPTION 'ERP_TRANSITION';END IF;
   UPDATE public.orders SET status=p_next WHERE id=p_entity;
  ELSE
   SELECT * INTO refund FROM erp_private.refund_cases WHERE order_id=p_entity FOR UPDATE;
   before_state:=coalesce(refund.state,'none');revision:=coalesce(refund.revision,0);
   IF p_expected<>before_state||':'||revision THEN RAISE EXCEPTION 'ERP_STALE';END IF;
   IF p_amount IS NULL OR p_amount<1 OR p_amount>o.total_amount OR (refund.amount IS NOT NULL AND p_amount<>refund.amount) THEN RAISE EXCEPTION 'ERP_INVALID';END IF;
   IF NOT ((before_state='none' AND p_next='requested') OR (before_state='requested' AND p_next IN ('approved','rejected')) OR (before_state='approved' AND p_next='externally_recorded' AND length(btrim(coalesce(p_detail,'')))>=3)) THEN RAISE EXCEPTION 'ERP_TRANSITION';END IF;
   -- Administrative evidence only: never changes payment state, wallet balance, stock or provider.
   INSERT INTO erp_private.refund_cases VALUES(p_entity,p_next,revision+1,p_amount,p_detail) ON CONFLICT(order_id) DO UPDATE SET state=excluded.state,revision=excluded.revision,reference=excluded.reference;
  END IF;
 ELSIF p_resource='return' THEN
  SELECT order_id INTO r.order_id FROM public.return_requests WHERE id=p_entity;IF NOT FOUND THEN RAISE EXCEPTION 'ERP_NOT_FOUND';END IF;
  SELECT * INTO o FROM public.orders WHERE id=r.order_id FOR UPDATE;
  SELECT * INTO r FROM public.return_requests WHERE id=p_entity FOR UPDATE;
  IF o.id IS NULL OR o.payment_state IS DISTINCT FROM 'paid' OR o.checkout_version IS DISTINCT FROM 2 OR r.user_id<>o.user_id THEN RAISE EXCEPTION 'ERP_PAYMENT_REVIEW';END IF;
  IF p_next='approved' AND o.status NOT IN ('shipped','delivered') THEN RAISE EXCEPTION 'ERP_TRANSITION';END IF;
  SELECT * INTO return_case FROM erp_private.return_cases WHERE return_id=p_entity FOR UPDATE;
  before_state:=coalesce(return_case.state,r.status);revision:=coalesce(return_case.revision,0);
  IF p_expected<>before_state||':'||revision THEN RAISE EXCEPTION 'ERP_STALE';END IF;
  IF NOT ((before_state='pending' AND p_next IN ('approved','rejected')) OR (before_state='approved' AND p_next='received') OR (before_state='received' AND p_next='closed')) OR p_amount IS NOT NULL THEN RAISE EXCEPTION 'ERP_TRANSITION';END IF;
  INSERT INTO erp_private.return_cases VALUES(p_entity,p_next,revision+1) ON CONFLICT(return_id) DO UPDATE SET state=excluded.state,revision=excluded.revision;
  UPDATE public.return_requests SET status=p_next WHERE id=p_entity;
 ELSIF p_resource='cost' THEN
  SELECT order_id INTO item.order_id FROM public.order_items WHERE id=p_entity;IF NOT FOUND THEN RAISE EXCEPTION 'ERP_NOT_FOUND';END IF;
  SELECT * INTO o FROM public.orders WHERE id=item.order_id FOR UPDATE;
  SELECT * INTO item FROM public.order_items WHERE id=p_entity FOR SHARE;
  IF o.id IS NULL OR o.payment_state IS DISTINCT FROM 'paid' OR o.checkout_version IS DISTINCT FROM 2 OR item.quantity<1 THEN RAISE EXCEPTION 'ERP_PAYMENT_REVIEW';END IF;
  SELECT * INTO cost FROM erp_private.item_costs WHERE item_id=p_entity FOR UPDATE;
  revision:=coalesce(cost.revision,0);before_state:=coalesce(cost.unit_cost::text,'unrecorded');
  IF p_expected<>revision::text THEN RAISE EXCEPTION 'ERP_STALE';END IF;
  IF p_next<>'recorded' OR p_amount IS NULL OR p_amount NOT BETWEEN 0 AND 99999999 OR cost.unit_cost IS NOT DISTINCT FROM p_amount THEN RAISE EXCEPTION 'ERP_INVALID';END IF;
  INSERT INTO erp_private.item_costs VALUES(p_entity,p_amount,revision+1) ON CONFLICT(item_id) DO UPDATE SET unit_cost=excluded.unit_cost,revision=excluded.revision;
 ELSE
  SELECT * INTO ticket FROM public.tickets WHERE id=p_entity FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'ERP_NOT_FOUND';END IF;
  IF ticket.status IS NULL THEN RAISE EXCEPTION 'ERP_TRANSITION';END IF;before_state:=ticket.status;IF p_expected<>before_state THEN RAISE EXCEPTION 'ERP_STALE';END IF;
  IF NOT ((before_state='pending' AND p_next='resolved') OR (before_state='resolved' AND p_next='pending')) OR p_amount IS NOT NULL THEN RAISE EXCEPTION 'ERP_TRANSITION';END IF;
  UPDATE public.tickets SET status=p_next WHERE id=p_entity;
 END IF;
 result:=body||jsonb_build_object('id',event_id,'actorId',p_actor,'requestId',p_key,'before',before_state,'revision',coalesce(revision,0)+1,'createdAt',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
 INSERT INTO erp_private.events(id,actor_id,request_id,resource,entity_id,request,receipt) VALUES(event_id,p_actor,p_key,p_resource,p_entity,body,result);RETURN result;
END $$;
CREATE FUNCTION public.trusted_erp_list(p_actor uuid,p_resource text,p_after uuid DEFAULT NULL,p_parent uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE rows jsonb;more boolean;query text;log_table text;
BEGIN
 PERFORM inventory_private.require_admin(p_actor);
 IF p_resource='orders' THEN query:='SELECT jsonb_build_object(''id'',o.id,''status'',o.status,''paymentState'',o.payment_state,''amount'',o.total_amount::text,''createdAt'',o.created_at,''refundState'',coalesce(r.state,''none''),''refundRevision'',coalesce(r.revision,0),''refundAmount'',r.amount::text) row,o.id FROM public.orders o LEFT JOIN erp_private.refund_cases r ON r.order_id=o.id';
 ELSIF p_resource='returns' THEN query:='SELECT jsonb_build_object(''id'',r.id,''orderId'',r.order_id,''status'',coalesce(c.state,r.status),''revision'',coalesce(c.revision,0),''createdAt'',r.created_at) row,r.id FROM public.return_requests r LEFT JOIN erp_private.return_cases c ON c.return_id=r.id';
 ELSIF p_resource='costs' THEN query:='SELECT jsonb_build_object(''id'',i.id,''orderId'',i.order_id,''quantity'',i.quantity,''salePrice'',i.price::text,''unitCost'',c.unit_cost::text,''revision'',coalesce(c.revision,0)) row,i.id FROM public.order_items i JOIN public.orders o ON o.id=i.order_id LEFT JOIN erp_private.item_costs c ON c.item_id=i.id WHERE o.checkout_version=2 AND o.payment_state=''paid''';
 ELSIF p_resource='customers' THEN query:='SELECT jsonb_build_object(''id'',id,''firstName'',first_name,''lastName'',last_name,''phone'',phone,''createdAt'',created_at) row,id FROM public.profiles';
 ELSIF p_resource='addresses' AND p_parent IS NOT NULL THEN query:='SELECT jsonb_build_object(''id'',id,''recipient'',recipient,''city'',city,''line1'',line1,''postalCode'',postal_code) row,id FROM public.addresses WHERE user_id=$2';
 ELSIF p_resource='tickets' THEN query:='SELECT jsonb_build_object(''id'',id,''subject'',subject,''status'',status,''message'',left(message,2000),''createdAt'',created_at) row,id FROM public.tickets';
 ELSIF p_resource='messages' THEN query:='SELECT jsonb_build_object(''id'',id,''userId'',user_id,''title'',title,''body'',left(body,2000),''isRead'',is_read,''createdAt'',created_at) row,id FROM public.user_messages';
 ELSIF p_resource='activity' THEN query:='SELECT jsonb_build_object(''id'',id,''actorId'',actor_id,''resource'',resource,''entityId'',entity_id,''action'',action,''changedFields'',changed_fields,''beforeValues'',before_values,''afterValues'',after_values,''createdAt'',to_char(created_at AT TIME ZONE ''UTC'',''YYYY-MM-DD"T"HH24:MI:SS.US"Z"'')) row,id,created_at cursor_time FROM erp_private.activity WHERE ($2 IS NULL OR actor_id=$2 OR entity_id=$2)';
 ELSIF p_resource='operations' THEN query:='SELECT receipt||jsonb_build_object(''id'',id,''createdAt'',to_char(created_at AT TIME ZONE ''UTC'',''YYYY-MM-DD"T"HH24:MI:SS.US"Z"'')) row,id,created_at cursor_time FROM erp_private.events WHERE ($2 IS NULL OR actor_id=$2 OR entity_id=$2)';
 ELSE RAISE EXCEPTION 'ERP_INVALID';END IF;
 IF p_resource NOT IN ('addresses','activity','operations') AND p_parent IS NOT NULL THEN RAISE EXCEPTION 'ERP_INVALID';END IF;
 IF p_resource IN ('activity','operations') THEN
  log_table:=CASE WHEN p_resource='activity' THEN 'erp_private.activity' ELSE 'erp_private.events' END;
  IF p_after IS NOT NULL THEN EXECUTE 'SELECT EXISTS(SELECT 1 FROM '||log_table||' WHERE id=$1)' INTO more USING p_after;IF NOT more THEN RAISE EXCEPTION 'ERP_INVALID';END IF;END IF;
  EXECUTE 'WITH selected AS (SELECT * FROM ('||query||') source WHERE ($1 IS NULL OR (cursor_time,id)<(SELECT created_at,id FROM '||log_table||' WHERE id=$1)) ORDER BY cursor_time DESC,id DESC LIMIT 51) SELECT coalesce(jsonb_agg(row ORDER BY cursor_time DESC,id DESC) FILTER(WHERE n<=50),''[]''::jsonb),count(*)>50 FROM (SELECT *,row_number() OVER(ORDER BY cursor_time DESC,id DESC) n FROM selected) numbered' INTO rows,more USING p_after,p_parent;
  RETURN jsonb_build_object('rows',rows,'hasMore',more);
 END IF;
 -- Dynamic text is selected only from the constant allowlist above. Values remain bound.
 EXECUTE 'WITH selected AS (SELECT * FROM ('||query||') source WHERE ($1 IS NULL OR id>$1) ORDER BY id LIMIT 51) SELECT coalesce(jsonb_agg(row ORDER BY id) FILTER(WHERE n<=50),''[]''::jsonb),count(*)>50 FROM (SELECT *,row_number() OVER(ORDER BY id) n FROM selected) numbered' INTO rows,more USING p_after,p_parent;
 RETURN jsonb_build_object('rows',rows,'hasMore',more);
END $$;
CREATE FUNCTION public.trusted_erp_sales(p_actor uuid,p_from timestamptz,p_to timestamptz) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 PERFORM inventory_private.require_admin(p_actor);
 IF p_from IS NULL OR p_to IS NULL OR p_to<=p_from OR p_to-p_from>interval '366 days' THEN RAISE EXCEPTION 'ERP_INVALID';END IF;
 WITH paid AS (SELECT * FROM public.orders WHERE created_at>=p_from AND created_at<p_to AND checkout_version=2 AND payment_state='paid'),
 top_products AS (SELECT i.product_id,sum(i.quantity)::text units,sum(i.quantity*i.price)::text amount FROM public.order_items i JOIN paid o ON o.id=i.order_id GROUP BY i.product_id ORDER BY sum(i.quantity) DESC,i.product_id NULLS LAST LIMIT 20)
 SELECT jsonb_build_object('currency','IRR','from',p_from,'to',p_to,'paidOrders',(SELECT count(*)::text FROM paid),'paidTotal',coalesce((SELECT sum(total_amount)::text FROM paid),'0'),'shippingTotal',coalesce((SELECT sum(shipping_cost)::text FROM paid),'0'),
  'grossProfit',CASE WHEN EXISTS(SELECT 1 FROM paid) AND NOT EXISTS(SELECT 1 FROM paid o WHERE NOT EXISTS(SELECT 1 FROM public.order_items i WHERE i.order_id=o.id)) AND NOT EXISTS(SELECT 1 FROM public.order_items i JOIN paid o ON o.id=i.order_id LEFT JOIN erp_private.item_costs c ON c.item_id=i.id WHERE c.item_id IS NULL) THEN (SELECT sum((i.price-c.unit_cost)*i.quantity)::text FROM public.order_items i JOIN paid o ON o.id=i.order_id JOIN erp_private.item_costs c ON c.item_id=i.id) ELSE NULL END,
  'profitUnavailableReason',CASE WHEN EXISTS(SELECT 1 FROM paid) AND NOT EXISTS(SELECT 1 FROM paid o WHERE NOT EXISTS(SELECT 1 FROM public.order_items i WHERE i.order_id=o.id)) AND NOT EXISTS(SELECT 1 FROM public.order_items i JOIN paid o ON o.id=i.order_id LEFT JOIN erp_private.item_costs c ON c.item_id=i.id WHERE c.item_id IS NULL) THEN NULL ELSE 'purchase-cost-snapshots-unavailable' END,'topProducts',coalesce((SELECT jsonb_agg(to_jsonb(t)) FROM top_products t),'[]'::jsonb),
  'unpaidOrLegacy',(SELECT count(*)::text FROM public.orders WHERE created_at>=p_from AND created_at<p_to AND (checkout_version<>2 OR payment_state<>'paid')),
  'recordedExternalRefunds',coalesce((SELECT sum(r.amount)::text FROM erp_private.refund_cases r JOIN paid o ON o.id=r.order_id WHERE r.state='externally_recorded'),'0')) INTO result;RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.trusted_erp_operation(uuid,uuid,text,uuid,text,text,text,text,bigint),public.trusted_erp_list(uuid,text,uuid,uuid),public.trusted_erp_sales(uuid,timestamptz,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.trusted_erp_operation(uuid,uuid,text,uuid,text,text,text,text,bigint),public.trusted_erp_list(uuid,text,uuid,uuid),public.trusted_erp_sales(uuid,timestamptz,timestamptz) TO service_role;
COMMIT;
