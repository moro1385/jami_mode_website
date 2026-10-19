-- PREPARED ONLY. Requires separate approval on the explicitly pinned project.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'Review extension installer role'; END IF;
 IF to_regprocedure('public.trusted_maintenance_run(integer,integer)') IS NULL THEN RAISE EXCEPTION 'Maintenance migration missing'; END IF;
END $$;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
COMMIT;
