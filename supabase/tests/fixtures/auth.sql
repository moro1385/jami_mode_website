-- Minimal synthetic Auth contract for standalone PostgreSQL permission tests.
-- Not a replacement for Supabase Auth/PostgREST compatibility testing.
-- Roles are cluster-wide; the runner also creates a second fresh test database.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='fixture_auth_admin') THEN CREATE ROLE fixture_auth_admin NOLOGIN; END IF;
END $$;
CREATE SCHEMA auth;
CREATE TABLE auth.users (
  id uuid PRIMARY KEY,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA auth TO fixture_auth_admin;
GRANT INSERT ON auth.users TO fixture_auth_admin;
