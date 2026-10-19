-- PREPARED ONLY: requires approval on pinned jamimode-test, after new migration.
-- Temporary Cron metadata is never committed or visible to the worker.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'Review test owner'; END IF;
 IF EXISTS(SELECT 1 FROM cron.job WHERE jobname='jamimode-expire-unstarted-v1') THEN RAISE EXCEPTION 'Expected empty test job slot'; END IF;
 IF EXISTS(SELECT 1 FROM checkout_private.log_retention_runs) THEN RAISE EXCEPTION 'Expected fresh retention audit'; END IF;
END $$;
SELECT set_config('jami.retention.fixture_job',cron.schedule('jamimode-expire-unstarted-v1','0 0 1 1 *','SELECT 1')::text,true);
-- Explicit negative fixture ids avoid granting access to pg_cron-owned sequences.
INSERT INTO cron.job_run_details(runid,jobid,status,end_time) VALUES
 (-910001,current_setting('jami.retention.fixture_job')::bigint,'succeeded',now()-interval '31 days'),
 (-910002,current_setting('jami.retention.fixture_job')::bigint,'succeeded',now()-interval '29 days'),
 (-910003,current_setting('jami.retention.fixture_job')::bigint,'failed',now()-interval '91 days'),
 (-910004,current_setting('jami.retention.fixture_job')::bigint,'failed',now()-interval '89 days'),
 (-910005,current_setting('jami.retention.fixture_job')::bigint,'running',now()-interval '120 days');
DO $$ DECLARE result jsonb; job bigint:=current_setting('jami.retention.fixture_job')::bigint; BEGIN
 result:=checkout_private.prune_expiry_cron_history(1);
 IF (result->>'deleted')::integer<>1 OR (result->>'failed')::integer<>1 THEN RAISE EXCEPTION 'Bounded failure retention mismatch'; END IF;
 result:=checkout_private.prune_expiry_cron_history(1000);
 IF (result->>'deleted')::integer<>1 OR (result->>'succeeded')::integer<>1 THEN RAISE EXCEPTION 'Success retention mismatch'; END IF;
 IF (SELECT count(*) FROM cron.job_run_details WHERE jobid=job)<>3 THEN RAISE EXCEPTION 'Recent/running logs not preserved'; END IF;
 IF (SELECT count(*) FROM checkout_private.log_retention_runs)<>2 OR (SELECT sum(deleted) FROM checkout_private.log_retention_runs)<>2 THEN RAISE EXCEPTION 'Missing atomic summary'; END IF;
 IF (checkout_private.prune_expiry_cron_history()->>'deleted')::integer<>0 THEN RAISE EXCEPTION 'Prune not idempotent'; END IF;
END $$;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM checkout_private.prune_expiry_cron_history(); RAISE check_violation USING MESSAGE='Customer pruning unexpectedly allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET LOCAL ROLE service_role;
DO $$ BEGIN
 BEGIN PERFORM checkout_private.prune_expiry_cron_history(); RAISE check_violation USING MESSAGE='Service pruning unexpectedly allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF (SELECT count(*) FROM checkout_private.log_retention_runs)<>2 THEN RAISE EXCEPTION 'Audit not readable by operator'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
SELECT jsonb_build_object('fixtureJobs',(SELECT count(*) FROM cron.job WHERE jobname='jamimode-expire-unstarted-v1'),
 'retentionAuditRows',(SELECT count(*) FROM checkout_private.log_retention_runs)) AS cleanup;
