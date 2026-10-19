-- PREPARED ONLY. Separate approval: install pg_cron and a bounded temporary test job.
-- The reviewed controller must replace exactly one __EXPIRES_AT__ with a UTC deadline <=10 minutes away.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'Review scheduling role before proceeding'; END IF;
 IF to_regprocedure('public.trusted_maintenance_run(integer,integer)') IS NULL THEN RAISE EXCEPTION 'Maintenance migration missing'; END IF;
 IF EXISTS(SELECT 1 FROM public.orders) OR EXISTS(SELECT 1 FROM checkout_private.attempts) THEN RAISE EXCEPTION 'Synthetic test baseline changed'; END IF;
END $$;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM cron.job WHERE jobname='jamimode-phase0-expiry-acceptance') THEN RAISE EXCEPTION 'Test job already exists; inspect instead of overwriting'; END IF;
END $$;
SELECT cron.schedule('jamimode-phase0-expiry-acceptance','* * * * *', $job$
 BEGIN;
 SET LOCAL ROLE service_role;
 SET LOCAL statement_timeout='30s';
 SELECT public.trusted_maintenance_run(50,0) WHERE clock_timestamp()<timestamptz '__EXPIRES_AT__';
 COMMIT;
$job$) AS job_id;
COMMIT;
-- Controller observes two successful runs and verifies expiry-only service logs,
-- then cron.unschedule()s only the recorded job id after checking its name/command/owner.
-- If the controller is interrupted, the deadline prevents further maintenance work.
-- Extension and historical logs remain installed; they are not silently deleted.
