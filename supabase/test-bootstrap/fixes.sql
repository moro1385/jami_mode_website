-- Fresh test bootstrap only. Never apply these fixes to production.
BEGIN;
SET LOCAL lock_timeout = '5s';
-- Avoid invoking the authenticated-only role helper for anonymous catalog reads.
DROP POLICY "Active products are publicly viewable" ON public.products;
CREATE POLICY "Active products are publicly viewable" ON public.products
 FOR SELECT TO anon, authenticated USING (is_active);
-- Baseline admin FOR ALL policy continues to authorize authenticated admins.

-- Explicit grants, independent of hosted project's default table privileges.
REVOKE ALL ON public.carts, public.wallet_topups, public.tickets,
 public.return_requests, public.user_messages FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.carts TO authenticated;
GRANT SELECT ON public.wallet_topups TO authenticated;
GRANT INSERT(first_name, last_name, email, subject, message) ON public.tickets TO anon, authenticated;
GRANT SELECT, UPDATE(status) ON public.tickets TO authenticated;
GRANT SELECT ON public.return_requests TO authenticated;
GRANT INSERT(user_id, order_id, phone, description, image_urls) ON public.return_requests TO authenticated;
GRANT UPDATE(status, admin_note) ON public.return_requests TO authenticated;
GRANT SELECT, INSERT ON public.user_messages TO authenticated;
GRANT UPDATE(is_read) ON public.user_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.carts, public.tickets,
 public.return_requests, public.user_messages TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.wallet_topups TO service_role;
-- Scope browser fulfillment to one column. Existing restrictive policies and
-- containment_order_fulfillment_guard still enforce admin/transition rules.
REVOKE UPDATE ON public.orders FROM PUBLIC, anon, authenticated;
DO $$ DECLARE cols text; BEGIN
 SELECT string_agg(quote_ident(attname), ',') INTO cols FROM pg_attribute
 WHERE attrelid='public.orders'::regclass AND attnum>0 AND NOT attisdropped;
 EXECUTE format('REVOKE UPDATE (%s) ON public.orders FROM PUBLIC, anon, authenticated', cols);
END $$;
GRANT UPDATE(status) ON public.orders TO authenticated;
-- Direct PostgREST relationships used by admin views. The Auth FK remains.
ALTER TABLE public.orders ADD CONSTRAINT test_orders_profile_fkey
 FOREIGN KEY(user_id) REFERENCES public.profiles(id);
ALTER TABLE public.user_messages ADD CONSTRAINT test_messages_profile_fkey
 FOREIGN KEY(user_id) REFERENCES public.profiles(id);
INSERT INTO storage.buckets(id,name,public) VALUES('product-images','product-images',true)
 ON CONFLICT(id) DO NOTHING;
-- All newly exposed tables retain RLS enabled by their source migrations.
DO $$ DECLARE rel text; BEGIN
 FOREACH rel IN ARRAY ARRAY['carts','wallet_topups','tickets','return_requests','user_messages'] LOOP
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid=('public.'||rel)::regclass) THEN
  RAISE EXCEPTION 'RLS missing: %',rel;
 END IF;
 END LOOP;
END $$;
COMMIT;
