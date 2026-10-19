-- PREPARED ONLY. Requires approval after retention migration/test validation.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'Review scheduling role'; END IF;
 IF coalesce(current_setting('cron.timezone',true),'GMT') NOT IN ('GMT','UTC','Etc/UTC') THEN RAISE EXCEPTION 'Review Cron timezone before scheduling'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN RAISE EXCEPTION 'Cron missing'; END IF;
 IF to_regprocedure('checkout_private.prune_expiry_cron_history(integer)') IS NULL THEN RAISE EXCEPTION 'Retention migration missing'; END IF;
 IF EXISTS(SELECT 1 FROM cron.job WHERE jobname='jamimode-expiry-history-retention-v1') THEN RAISE EXCEPTION 'Retention job already exists; inspect'; END IF;
END $$;
SELECT cron.schedule('jamimode-expiry-history-retention-v1','17 2 * * *',
 $job$SET statement_timeout='30s'; SELECT checkout_private.prune_expiry_cron_history(1000);$job$);
COMMIT;
