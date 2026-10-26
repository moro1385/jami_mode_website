-- Local preparation only. Hosted migration/release requires separate approval.
-- Browser roles may edit identity/price and create zero-stock variants only.
-- Permanent catalog deletion is closed; products can still be set to draft.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $$ BEGIN
 IF (SELECT pg_get_expr(d.adbin,d.adrelid) FROM pg_catalog.pg_attrdef d
     JOIN pg_catalog.pg_attribute a ON a.attrelid=d.adrelid AND a.attnum=d.adnum
     WHERE d.adrelid='public.product_variants'::regclass AND a.attname='stock_quantity') IS DISTINCT FROM '0'
 THEN RAISE EXCEPTION 'Inventory default differs; review schema before applying boundary'; END IF;
END $$;
REVOKE DELETE,TRUNCATE ON public.products,public.product_variants FROM PUBLIC,anon,authenticated;
REVOKE INSERT,UPDATE ON public.product_variants FROM PUBLIC,anon,authenticated;
-- Table revocation does not remove earlier column grants: clear them explicitly.
DO $$ DECLARE col record; BEGIN
 FOR col IN SELECT attname FROM pg_catalog.pg_attribute
   WHERE attrelid='public.product_variants'::regclass AND attnum>0 AND NOT attisdropped LOOP
  EXECUTE format('REVOKE INSERT (%I), UPDATE (%I) ON public.product_variants FROM PUBLIC,anon,authenticated',col.attname,col.attname);
 END LOOP;
END $$;
GRANT INSERT(product_id,size,color,sku,price) ON public.product_variants TO authenticated;
GRANT UPDATE(size,color,sku,price) ON public.product_variants TO authenticated;
-- RLS remains enabled and unchanged: these grants do not authorize ordinary users.
DO $$ DECLARE role_name text; col record; BEGIN
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF has_table_privilege(role_name,'public.products','DELETE,TRUNCATE')
    OR has_table_privilege(role_name,'public.product_variants','DELETE,TRUNCATE,INSERT,UPDATE')
  THEN RAISE EXCEPTION 'Inventory inherited table privilege retained by %',role_name; END IF;
  FOR col IN SELECT attname FROM pg_catalog.pg_attribute
    WHERE attrelid='public.product_variants'::regclass AND attnum>0 AND NOT attisdropped LOOP
   IF (role_name='anon' OR col.attname NOT IN ('product_id','size','color','sku','price'))
     AND has_column_privilege(role_name,'public.product_variants',col.attname,'INSERT')
    OR (role_name='anon' OR col.attname NOT IN ('size','color','sku','price'))
     AND has_column_privilege(role_name,'public.product_variants',col.attname,'UPDATE')
   THEN RAISE EXCEPTION 'Inventory inherited column privilege retained by % on %',role_name,col.attname; END IF;
  END LOOP;
 END LOOP;
 IF NOT (SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid='public.product_variants'::regclass)
   OR NOT (SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid='public.products'::regclass)
 THEN RAISE EXCEPTION 'Catalog RLS prerequisite missing'; END IF;
END $$;
COMMIT;
