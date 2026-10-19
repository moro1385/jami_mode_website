-- Prepared only: installs service-only operations, does NOT enable Cron.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE checkout_private.maintenance_runs (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 started_at timestamptz NOT NULL,
 finished_at timestamptz NOT NULL,
 expire_limit integer NOT NULL CHECK(expire_limit BETWEEN 0 AND 100),
 reconcile_limit integer NOT NULL CHECK(reconcile_limit BETWEEN 0 AND 100),
 expired integer NOT NULL CHECK(expired BETWEEN 0 AND 100),
 settled integer NOT NULL CHECK(settled BETWEEN 0 AND 100),
 pending integer NOT NULL CHECK(pending BETWEEN 0 AND 100)
);
ALTER TABLE checkout_private.maintenance_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON checkout_private.maintenance_runs FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON checkout_private.maintenance_runs TO service_role;
GRANT USAGE ON SEQUENCE checkout_private.maintenance_runs_id_seq TO service_role;
CREATE TRIGGER maintenance_runs_append_only BEFORE UPDATE OR DELETE ON checkout_private.maintenance_runs
 FOR EACH ROW EXECUTE FUNCTION checkout_private.append_only();

CREATE FUNCTION public.trusted_maintenance_run(p_expire_limit integer DEFAULT 50,p_reconcile_limit integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE started timestamptz:=clock_timestamp(); released integer:=0; replay jsonb:='{"settled":0,"pending":0}'; run_id bigint;
BEGIN
 IF p_expire_limit IS NULL OR p_reconcile_limit IS NULL OR p_expire_limit NOT BETWEEN 0 AND 100
 OR p_reconcile_limit NOT BETWEEN 0 AND 100 OR (p_expire_limit=0 AND p_reconcile_limit=0) THEN
  RAISE EXCEPTION 'Invalid maintenance batch';
 END IF;
 -- Serializes cron/manual maintenance across processes. Checkout uses its existing row locks.
 IF NOT pg_try_advisory_xact_lock(hashtextextended('jamimode-phase0-maintenance',0)) THEN
  RETURN jsonb_build_object('skipped',true);
 END IF;
 IF p_expire_limit>0 THEN released:=public.trusted_expire_unstarted(NULL,p_expire_limit); END IF;
 -- Explicit opt-in only: no gateway requests, and only committed verified evidence is replayed.
 IF p_reconcile_limit>0 THEN replay:=public.trusted_reconcile_verified(p_reconcile_limit); END IF;
 INSERT INTO checkout_private.maintenance_runs(started_at,finished_at,expire_limit,reconcile_limit,expired,settled,pending)
 VALUES(started,clock_timestamp(),p_expire_limit,p_reconcile_limit,released,(replay->>'settled')::integer,(replay->>'pending')::integer)
 RETURNING id INTO run_id;
 RETURN jsonb_build_object('skipped',false,'expired',released,'settled',(replay->>'settled')::integer,
  'pending',(replay->>'pending')::integer,'runId',run_id);
END $$;
REVOKE ALL ON FUNCTION public.trusted_maintenance_run(integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.trusted_maintenance_run(integer,integer) TO service_role;

CREATE FUNCTION public.trusted_maintenance_status() RETURNS jsonb
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
   FROM checkout_private.maintenance_runs ORDER BY id DESC LIMIT 1)
 );
$$;
REVOKE ALL ON FUNCTION public.trusted_maintenance_status() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.trusted_maintenance_status() TO service_role;
COMMIT;
