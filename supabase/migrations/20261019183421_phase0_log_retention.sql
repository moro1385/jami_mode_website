-- Does not schedule or prune anything at installation time.
BEGIN;
SET LOCAL lock_timeout='5s';
-- A manual reconciliation must not make an expired scheduler look healthy.
CREATE INDEX maintenance_expiry_latest ON checkout_private.maintenance_runs(id DESC)
 WHERE expire_limit>0 AND reconcile_limit=0;
CREATE OR REPLACE FUNCTION public.trusted_maintenance_status() RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object(
  'expiredUnstarted',(SELECT count(*) FROM checkout_private.reservations r JOIN public.orders o ON o.id=r.order_id
   WHERE r.released_at IS NULL AND r.expires_at<=now() AND o.checkout_version=2 AND o.status='pending_payment'
   AND o.payment_state='pending' AND o.payment_ref IS NULL AND o.payment_trans_id IS NULL
   AND NOT EXISTS(SELECT 1 FROM checkout_private.attempts a WHERE a.order_id=o.id)),
  'verifiedReady',(SELECT count(*) FROM checkout_private.verifications v JOIN checkout_private.attempts a ON a.id=v.attempt_id WHERE v.state='verified' AND a.state='ready'),
  'verificationUncertain',(SELECT count(*) FROM checkout_private.verifications v JOIN checkout_private.attempts a ON a.id=v.attempt_id WHERE v.state='verifying' AND a.state='ready'),
  'creatingOver15m',(SELECT count(*) FROM checkout_private.attempts WHERE state='creating' AND created_at<now()-interval '15 minutes'),
  'readyWithoutEvidenceOver30m',(SELECT count(*) FROM checkout_private.attempts a WHERE a.state='ready' AND a.created_at<now()-interval '30 minutes'
   AND NOT EXISTS(SELECT 1 FROM checkout_private.verifications v WHERE v.attempt_id=a.id AND v.state='verified')),
  'lastRun',(SELECT jsonb_build_object('finishedAt',finished_at,'expired',expired,'settled',settled,'pending',pending)
   FROM checkout_private.maintenance_runs ORDER BY id DESC LIMIT 1),
  'lastExpiryRun',(SELECT jsonb_build_object('finishedAt',finished_at,'expired',expired,'settled',settled,'pending',pending)
   FROM checkout_private.maintenance_runs WHERE expire_limit>0 AND reconcile_limit=0 ORDER BY id DESC LIMIT 1)
 );
$$;
REVOKE ALL ON FUNCTION public.trusted_maintenance_status() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.trusted_maintenance_status() TO service_role;
CREATE TABLE checkout_private.log_retention_runs (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 finished_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 job_name text NOT NULL CHECK(job_name='jamimode-expire-unstarted-v1'),
 deleted integer NOT NULL CHECK(deleted BETWEEN 1 AND 1000),
 succeeded integer NOT NULL CHECK(succeeded>=0),
 failed integer NOT NULL CHECK(failed>=0),
 oldest_end timestamptz NOT NULL,
 newest_end timestamptz NOT NULL,
 CHECK(succeeded+failed=deleted)
);
ALTER TABLE checkout_private.log_retention_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON checkout_private.log_retention_runs FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON checkout_private.log_retention_runs TO service_role;
CREATE TRIGGER log_retention_runs_append_only BEFORE UPDATE OR DELETE ON checkout_private.log_retention_runs
 FOR EACH ROW EXECUTE FUNCTION checkout_private.append_only();

-- Only the scheduling owner can invoke this function; service keys get no cron
-- privileges. No payment/verification/application-operation evidence is deleted.
CREATE FUNCTION checkout_private.prune_expiry_cron_history(p_limit integer DEFAULT 1000)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE removed integer; successes integer; failures integer; first_end timestamptz; last_end timestamptz;
BEGIN
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Invalid history batch'; END IF;
 IF to_regclass('cron.job_run_details') IS NULL OR to_regclass('cron.job') IS NULL THEN RAISE EXCEPTION 'Cron is not installed'; END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('jamimode-phase0-history-prune',0)) THEN RETURN jsonb_build_object('skipped',true); END IF;
 WITH candidates AS (
  SELECT d.runid FROM cron.job_run_details d JOIN cron.job j ON j.jobid=d.jobid
  WHERE j.jobname='jamimode-expire-unstarted-v1' AND j.username='postgres'
   AND ((d.status='succeeded' AND d.end_time<now()-interval '30 days')
     OR (d.status='failed' AND d.end_time<now()-interval '90 days'))
  ORDER BY d.end_time,d.runid LIMIT p_limit FOR UPDATE OF d SKIP LOCKED
 ), deleted AS (
  DELETE FROM cron.job_run_details d USING candidates c WHERE d.runid=c.runid
  RETURNING d.status,d.end_time
 ) SELECT count(*)::integer,count(*) FILTER(WHERE status='succeeded')::integer,
  count(*) FILTER(WHERE status='failed')::integer,min(end_time),max(end_time)
  INTO removed,successes,failures,first_end,last_end FROM deleted;
 IF removed>0 THEN
  INSERT INTO checkout_private.log_retention_runs(job_name,deleted,succeeded,failed,oldest_end,newest_end)
   VALUES('jamimode-expire-unstarted-v1',removed,successes,failures,first_end,last_end);
 END IF;
 RETURN jsonb_build_object('skipped',false,'deleted',removed,'succeeded',successes,'failed',failures);
END $$;
REVOKE ALL ON FUNCTION checkout_private.prune_expiry_cron_history(integer) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
