-- PREPARED ONLY. Separate approval required for the persistent expiry-only job.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'Review scheduling role'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN RAISE EXCEPTION 'Enable reviewed pg_cron extension separately first'; END IF;
 IF to_regprocedure('public.trusted_maintenance_run(integer,integer)') IS NULL THEN RAISE EXCEPTION 'Maintenance migration missing'; END IF;
 IF NOT has_function_privilege('service_role','public.trusted_maintenance_run(integer,integer)','EXECUTE') THEN RAISE EXCEPTION 'Service execute permission missing'; END IF;
 IF EXISTS(SELECT 1 FROM cron.job WHERE jobname='jamimode-expire-unstarted-v1') THEN RAISE EXCEPTION 'Job already exists; inspect instead of overwriting'; END IF;
END $$;
-- Matches the tested service-role transaction; no secrets, gateway calls or reconciliation.
SELECT cron.schedule('jamimode-expire-unstarted-v1','*/5 * * * *',$job$
 BEGIN;
 SET LOCAL ROLE service_role;
 SET LOCAL statement_timeout='30s';
 SELECT public.trusted_maintenance_run(50,0);
 COMMIT;
$job$) AS job_id;
COMMIT;
