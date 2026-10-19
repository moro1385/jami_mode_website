-- Reviewed synthetic drift: explicit table/column grants + permissive policies.
-- Deliberately omit email: migration must supply the column the form always sends.
ALTER TABLE public.profiles ALTER COLUMN wallet_balance SET DEFAULT 77;
GRANT INSERT(wallet_balance), UPDATE(wallet_balance) ON public.profiles TO PUBLIC, anon, authenticated;
GRANT INSERT, UPDATE ON public.profiles TO PUBLIC, anon;
GRANT SELECT, INSERT ON public.wallet_topups TO authenticated;
GRANT ALL ON public.wallet_topups TO service_role;
-- Exercise containment against ambient grants (admin UPDATE is not added by PR).
GRANT UPDATE ON public.orders TO authenticated;
CREATE POLICY "Users can insert order items" ON public.order_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Fixture another permissive item insert" ON public.order_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Fixture permissive order insert" ON public.orders FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Fixture permissive order update" ON public.orders FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Fixture permissive profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Fixture permissive profile update" ON public.profiles FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
-- FOR ALL policies and anonymous grants are deliberately hostile synthetic drift.
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON public.orders, public.order_items, public.wallet_topups TO anon, authenticated;
GRANT TRUNCATE ON public.profiles TO PUBLIC;
CREATE POLICY "Fixture public all orders" ON public.orders FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "Fixture public all items" ON public.order_items FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "Fixture public all topups" ON public.wallet_topups FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "Fixture public all profiles" ON public.profiles FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
-- Newly created containment policies must bind the enum signature, not this
-- otherwise preferred text overload. Existing policies retain their bound OIDs.
CREATE FUNCTION public.has_role(uuid, text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='fixture_profile_delete') THEN CREATE ROLE fixture_profile_delete NOLOGIN; END IF;
END $$;
GRANT DELETE ON public.profiles TO fixture_profile_delete;
GRANT fixture_profile_delete TO authenticated;

INSERT INTO auth.users(id, phone) VALUES
 ('10000000-0000-0000-0000-000000000001', '+989110000001'),
 ('10000000-0000-0000-0000-000000000002', '+989110000002'),
 ('10000000-0000-0000-0000-000000000003', '+989110000003'),
 ('10000000-0000-0000-0000-000000000004', '+989110000004');
INSERT INTO public.user_roles(user_id, role) VALUES ('10000000-0000-0000-0000-000000000003', 'admin');
UPDATE public.profiles SET wallet_balance = 5000 WHERE id = '10000000-0000-0000-0000-000000000001';
DELETE FROM public.profiles WHERE id = '10000000-0000-0000-0000-000000000004';
INSERT INTO public.orders(id, user_id, status, payment_method, payment_ref, payment_trans_id, total_amount) VALUES
 ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'pending_payment', 'gateway', NULL, NULL, 1000),
 ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'confirmed', 'wallet', NULL, NULL, 1000),
 ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'pending_payment', 'gateway', 'old-reference', NULL, 1000);
INSERT INTO public.wallet_topups(id, user_id, amount, payment_ref) VALUES
 ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 1000, 'old-topup-reference');
