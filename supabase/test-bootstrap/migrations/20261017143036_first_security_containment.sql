-- Containment only: gateway prices, inventory and settlement remain untrusted.
-- Apply as the migration owner in one transaction. No historical data is changed.
BEGIN;
SET LOCAL lock_timeout = '5s';

-- Fail before changing ACLs if the reviewed schema/role contract is absent.
-- RLS cannot contain owners, superusers, or BYPASSRLS roles.
DO $$
DECLARE client_role text; relation_name text;
BEGIN
  -- MEMBER deliberately rejects privileged role graphs even if current
  -- INHERIT/SET options disable their use; do not confuse this with USAGE.
  FOREACH client_role IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE (rolsuper OR rolbypassrls)
        AND pg_has_role(client_role, oid, 'MEMBER')) THEN
      RAISE EXCEPTION 'Containment blocked: % has privileged-role membership', client_role;
    END IF;
  END LOOP;
  FOREACH relation_name IN ARRAY ARRAY['profiles','orders','order_items','wallet_topups','user_roles'] LOOP
    IF to_regclass('public.' || relation_name) IS NULL THEN
      RAISE EXCEPTION 'Containment prerequisite missing: public.%', relation_name;
    END IF;
    FOREACH client_role IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_class WHERE oid = to_regclass('public.' || relation_name)
          AND pg_has_role(client_role, relowner, 'MEMBER')) THEN
        RAISE EXCEPTION 'Containment blocked: % has owner-role membership for public.%', client_role, relation_name;
      END IF;
    END LOOP;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('anon','authenticated') AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'Containment blocked: client role bypasses RLS';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role' AND rolbypassrls) THEN
    RAISE EXCEPTION 'Containment prerequisite missing: trusted service_role BYPASSRLS';
  END IF;
  IF to_regtype('public.app_role') IS NULL OR to_regprocedure('auth.uid()') IS NULL THEN
    RAISE EXCEPTION 'Containment prerequisite missing: app_role or auth.uid()';
  END IF;
  IF to_regprocedure('public.has_role(uuid,public.app_role)') IS NULL THEN
    RAISE EXCEPTION 'Containment prerequisite missing: public.has_role(uuid,public.app_role)';
  END IF;
  IF (SELECT prorettype <> 'uuid'::regtype FROM pg_proc WHERE oid = 'auth.uid()'::regprocedure)
     OR (SELECT prorettype <> 'boolean'::regtype FROM pg_proc WHERE oid = 'public.has_role(uuid,public.app_role)'::regprocedure)
     OR (SELECT proargnames IS DISTINCT FROM ARRAY['_user_id','_role']::text[] FROM pg_proc WHERE oid = 'public.has_role(uuid,public.app_role)'::regprocedure)
     OR NOT has_function_privilege('authenticated','public.has_role(uuid,public.app_role)','EXECUTE') THEN
    RAISE EXCEPTION 'Containment prerequisite invalid: auth/role function type or EXECUTE privilege or RPC argument names';
  END IF;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='has_role'
      AND p.proargnames=ARRAY['_user_id','_role']::text[]) > 1 THEN
    RAISE EXCEPTION 'Containment prerequisite invalid: ambiguous PostgREST has_role overload';
  END IF;
END $$;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_topups ENABLE ROW LEVEL SECURITY;

-- The existing profile form always sends email. An optional grant alone would
-- allow migration success but break every profile save on the historical schema.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.profiles'::regclass
      AND attname='email' AND NOT attisdropped
      AND (atttypid NOT IN ('text'::regtype, 'varchar'::regtype) OR attnotnull
           OR attgenerated <> '' OR attidentity <> '')) THEN
    RAISE EXCEPTION 'Containment prerequisite invalid: contact email must be nullable writable text';
  END IF;
END $$;
-- Only the default changes: historical balances are neither reset nor backfilled.
ALTER TABLE public.profiles ALTER COLUMN wallet_balance SET DEFAULT 0;

-- A column revoke does not override a table grant. Reset both, including old
-- explicit column grants, before restoring only the client profile fields.
REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE ON public.profiles, public.orders, public.order_items, public.wallet_topups
  FROM PUBLIC, anon, authenticated;
DO $$
DECLARE columns_sql text;
BEGIN
  SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum)
    INTO columns_sql FROM pg_attribute
    WHERE attrelid = 'public.profiles'::regclass AND attnum > 0 AND NOT attisdropped;
  EXECUTE format('REVOKE INSERT (%s), UPDATE (%s) ON public.profiles FROM PUBLIC, anon, authenticated',
    columns_sql, columns_sql);
END $$;

GRANT INSERT (id, first_name, last_name, phone, avatar_url)
  ON public.profiles TO authenticated;
GRANT UPDATE (first_name, last_name, phone, avatar_url)
  ON public.profiles TO authenticated;
GRANT INSERT (email), UPDATE (email) ON public.profiles TO authenticated;

-- Fail atomically if inherited grants or role attributes defeat this boundary.
-- Run this before creating policies, so a refused retry cannot partially apply.
DO $$ DECLARE client_role text; relation_name text; BEGIN
  FOREACH client_role IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF has_column_privilege(client_role, 'public.profiles', 'wallet_balance', 'INSERT')
       OR has_column_privilege(client_role, 'public.profiles', 'wallet_balance', 'UPDATE') THEN
      RAISE EXCEPTION 'Containment blocked: % retains financial privileges', client_role;
    END IF;
    FOREACH relation_name IN ARRAY ARRAY['profiles','orders','order_items','wallet_topups'] LOOP
      IF has_table_privilege(client_role, 'public.' || relation_name, 'TRUNCATE') THEN
        RAISE EXCEPTION 'Containment blocked: % retains TRUNCATE on public.%', client_role, relation_name;
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- Preserve ownership even if another permissive policy is present in production.
DROP POLICY IF EXISTS "Users insert own profile" ON public.profiles;
CREATE POLICY "Users insert own profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (id = (SELECT auth.uid()));
CREATE POLICY "Containment profile insert ownership" ON public.profiles
  AS RESTRICTIVE FOR INSERT TO PUBLIC WITH CHECK (id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));
CREATE POLICY "Containment profile update ownership" ON public.profiles
  AS RESTRICTIVE FOR UPDATE TO PUBLIC USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));
CREATE POLICY "Containment profiles cannot be deleted by clients" ON public.profiles
  AS RESTRICTIVE FOR DELETE TO PUBLIC USING (false);

DROP POLICY IF EXISTS "Users create own orders" ON public.orders;
CREATE POLICY "Users create own orders" ON public.orders
  FOR INSERT TO authenticated WITH CHECK (
    user_id = (SELECT auth.uid()) AND status = 'pending_payment'
    AND payment_method = 'gateway' AND payment_ref IS NULL AND payment_trans_id IS NULL
  );
CREATE POLICY "Containment unpaid gateway inserts" ON public.orders
  AS RESTRICTIVE FOR INSERT TO PUBLIC WITH CHECK (
    user_id = (SELECT auth.uid()) AND status = 'pending_payment'
    AND payment_method = 'gateway' AND payment_ref IS NULL AND payment_trans_id IS NULL
  );
-- Keep existing admin UPDATE authorization; this does not add any UPDATE grant.
CREATE POLICY "Containment order updates require admin" ON public.orders
  AS RESTRICTIVE FOR UPDATE TO PUBLIC
  USING (public.has_role((SELECT auth.uid()), 'admin'::public.app_role))
  WITH CHECK (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));
CREATE POLICY "Containment order deletes require admin" ON public.orders
  AS RESTRICTIVE FOR DELETE TO PUBLIC
  USING (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));

-- Confirmed live policy: permissive true OR ownership allowed arbitrary inserts.
DROP POLICY IF EXISTS "Users can insert order items" ON public.order_items;
DROP POLICY IF EXISTS "Users create own order items" ON public.order_items;
CREATE POLICY "Users create own order items" ON public.order_items
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id
      AND o.user_id = (SELECT auth.uid()) AND o.status = 'pending_payment'
      AND o.payment_method = 'gateway' AND o.payment_ref IS NULL AND o.payment_trans_id IS NULL)
  );
CREATE POLICY "Containment order item ownership and state" ON public.order_items
  AS RESTRICTIVE FOR INSERT TO PUBLIC WITH CHECK (
    EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id
      AND o.user_id = (SELECT auth.uid()) AND o.status = 'pending_payment'
      AND o.payment_method = 'gateway' AND o.payment_ref IS NULL AND o.payment_trans_id IS NULL)
  );
-- A permissive FOR ALL policy also applies to UPDATE/DELETE. Do not let such
-- ambient policies turn an INSERT-only fix into a post-payment tampering path.
CREATE POLICY "Containment order item updates require admin" ON public.order_items
  AS RESTRICTIVE FOR UPDATE TO PUBLIC
  USING (public.has_role((SELECT auth.uid()), 'admin'::public.app_role))
  WITH CHECK (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));
CREATE POLICY "Containment order item deletes require admin" ON public.order_items
  AS RESTRICTIVE FOR DELETE TO PUBLIC
  USING (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));

-- Old tabs/direct REST calls cannot create top-ups while initiation is paused.
-- service_role settlement bypasses RLS and remains available for old payments.
CREATE POLICY "Containment suspend new wallet topups" ON public.wallet_topups
  AS RESTRICTIVE FOR INSERT TO PUBLIC WITH CHECK (false);
CREATE POLICY "Containment topup settlement is server only" ON public.wallet_topups
  AS RESTRICTIVE FOR UPDATE TO PUBLIC USING (false) WITH CHECK (false);
CREATE POLICY "Containment topups cannot be deleted by clients" ON public.wallet_topups
  AS RESTRICTIVE FOR DELETE TO PUBLIC USING (false);

-- RLS authorizes rows, not OLD -> NEW transitions. Browser admins may manage
-- fulfillment but cannot create payment evidence or edit an order's finances.
-- Invoker trigger: no privileged RPC and no new table grants. Trusted settlement
-- identities retain their existing authority (preflight excludes client bypass).
CREATE FUNCTION public.containment_order_fulfillment_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles
             WHERE rolname = current_user AND (rolsuper OR rolbypassrls)) THEN
    RETURN NEW;
  END IF;
  IF public.has_role(auth.uid(), 'admin'::public.app_role) IS NOT TRUE
     OR (to_jsonb(NEW) - ARRAY['status','updated_at'])
        IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','updated_at'])
     OR (NEW.status IS DISTINCT FROM OLD.status AND (
       OLD.status IN ('confirmed','processing','shipped','delivered')
       AND NEW.status IN ('processing','shipped','delivered','cancelled')
     ) IS NOT TRUE) THEN
    RAISE EXCEPTION 'Only fulfillment changes are permitted; payment requires server verification'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.containment_order_fulfillment_guard() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER containment_order_fulfillment_guard
  BEFORE UPDATE ON public.orders FOR EACH ROW
  EXECUTE FUNCTION public.containment_order_fulfillment_guard();

COMMIT;
