# Hosted maintenance and Cron acceptance — PASS

Explicit user approval covered only jamimode-test (cifhcrlmjnsxpkhyloen): rollback-only synthetic transitions, installing pg_cron, observing a temporary bounded job and removing that job. Executed 2026-10-19.

## Results

The exact locally validated synthetic SQL executed successfully on the hosted test database. Anonymous/customer permission denials, batch validation, expiry-only default, protection of a started payment attempt, explicit verified-evidence replay, idempotency and one outbox event were checked. All temporary order/attempt/evidence/reservation/outbox/operation-log rows were rolled back; final counts for all six categories were zero. No Auth users, provider settings, real SMS or gateway requests were involved. PostgreSQL sequences may retain harmless gaps after rolled-back log inserts.

pg_cron was then installed in the test project. Temporary job 1, jamimode-phase0-expiry-acceptance, ran every minute as postgres with explicit SET LOCAL ROLE service_role, 30-second statement timeout, expiry limit 50 and reconcile limit zero. Its SQL had a fixed ten-minute deadline as protection against controller interruption.

Two actual Cron executions succeeded, and two corresponding application operation rows had expiry-only parameters and zero expired/settled/pending counts. No jobs failed. The empty-baseline Cron test establishes scheduler/role/function integration; the separate synthetic transaction establishes financial state-transition behavior.

After verifying exact id, name, owner and command, the controller unscheduled only that job. Removal was independently confirmed by querying cron.job and finding zero rows for its id. pg_cron and historical Cron/application logs remain installed as authorized; they were not silently deleted. The two retained application rows are genuine scheduled runs, not leaked synthetic fixtures. The pre-removal report field active:true is the snapshot taken before unscheduling; unscheduled:true and the subsequent zero-row check establish cleanup.

## Production boundary and next package

Only read-only production inspection was performed: correct project identity, reviewed expiry/reconcile bodies unchanged, new operations absent, Cron absent but available, zero eligible unstarted expiries and three ready attempts without verified journal evidence. None of those attempts was settled, cancelled or changed.

Prepared but NOT executed on production: the named maintenance migration; ops/install-phase0-cron.sql; ops/enable-phase0-cron.sql for a persistent expiry-only job every five minutes, using the tested service-role transaction with no reconciliation/provider calls. These require separate production approval. The new frontend/dependency changes remain uncommitted and unpublished. No backup/restore evidence was created; the earlier owner cancellation remains in force. Phase 0 is not complete yet.

Evidence: TEST-OPS-ROLLBACK-ACCEPTANCE.json, TEST-CRON-ACCEPTANCE-START.json, TEST-CRON-ACCEPTANCE-stop-cron.json, TEST-CRON-ACCEPTANCE-STATE.json, and PRODUCTION-MAINTENANCE-PLAN-2026-10-19.json. No credentials or tokens appear in these reports.
