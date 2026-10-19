# Phase 0 monitoring and log retention

Status (2026-10-20, Asia/Tehran): the reviewed migration is installed and permission-validated in test and production. Hosted rollback-only acceptance passed in test; daily production retention is enabled. Code publication is tracked by the accompanying PR. Liara deployment and independent notification delivery remain separate gates.

## What the monitor does

The Node server performs a read-only maintenance status check once shortly after startup, then once per minute. Missing/invalid configuration fails closed without contacting another project. Requests are restricted to the exact configured production/test Supabase origin and trusted_maintenance_status RPC; redirects are rejected and transport has a five-second deadline. No payment provider or financial mutation RPC is called.

The shared checker coalesces concurrent reads and caches the result for 30 seconds per process. Completion of expiry-only work more than 15 minutes ago is stale. No recorded expiry run, malformed time, time more than one minute in the future, network failure or the old RPC contract yields an unhealthy result. Clock rollback forces a refresh. A recent manual reconciliation cannot mask stale expiry: the migration adds lastExpiryRun, selected only from expire_limit>0/reconcile_limit=0 records, while preserving lastRun for existing clients. This measures expiry-work freshness; it does not independently inspect cron.job.active, and an explicit manual expiry legitimately refreshes it.

Only fixed structured state events are logged: {"event":"maintenance_health","state":"healthy|stale|never_run|unavailable"}. A state change is logged once; a continuing unhealthy state repeats no more often than every 15 minutes. Recovery emits healthy once. No raw RPC error, customer id, amount, reference, token or journal row is logged. Each replica has its own short cache/transition log; this is not distributed alert deduplication.

Public GET /api/health/maintenance returns exactly {"status":"ok"} with HTTP 200 when fresh, otherwise {"status":"unavailable"} with HTTP 503. Responses are no-store, use existing security headers and a separate bounded rate limiter. GET /api/health/live returns HTTP 200 without reading the database. These endpoints use the API prefix so the old SPA fallback cannot masquerade as a healthy JSON response.

Do not configure scheduler health as a container restart test. A database/Cron outage is not repaired by repeatedly restarting the storefront. Use /api/health/live for process liveness if a separately reviewed Liara health check is enabled; /api/health/maintenance is for an independent monitor with an alert destination.

CLI from the trusted server environment:

```text
npm run maintenance -- check --project-ref klfmscuogsocfjxqkuib
```

It only reads status, prints project/state and exits 0 when healthy, 1 otherwise. --execute/--batch are rejected. Existing report/expire/reconcile behavior is retained. Credentials remain server-side; do not place service keys in a public monitor.

## Notification boundary

This package implements redacted log warnings, health signals and an operator check. It does not send email, Telegram, Slack or other messages, and it does not claim an external uptime service is configured. A process cannot alert from its own logs while the entire process/host/network is down. Before marking automatic notification complete, configure an independent monitor to poll /api/health/maintenance every 1–5 minutes, require both HTTP 200 and JSON status=ok, and route failures/recoveries to the owner's chosen channel. Confirm reachability from the intended customer region; this work session has repeatedly timed out reaching jamimode.ir, so blindly scheduling a foreign-region poller could create continuous false alarms. No external account, paid service or recipient has been added.

## Bounded Cron history retention

New migration: 20261019183421_phase0_log_retention.sql. Installation adds an expiry-only latest-run index/status field, an RLS-protected append-only summary table and a private invoker pruning function. It does not delete or schedule anything at installation.

checkout_private.prune_expiry_cron_history(integer) is not executable by PUBLIC/anon/authenticated/service_role. The cron owner invokes it directly; browser/service credentials receive no cron schema/delete privilege. It targets only the current job named jamimode-expire-unstarted-v1 owned by postgres, and only completed rows with a non-null end time:

- succeeded: retain at least 30 days;
- failed: retain at least 90 days;
- running/starting/unknown statuses, null end times, other jobs and other owners: preserve.

Each invocation accepts 1–1000 rows, locks eligible rows with SKIP LOCKED, and uses a transaction advisory lock to avoid overlapping batches. Deleted counts, success/failure counts and oldest/newest end times are inserted into checkout_private.log_retention_runs in the same transaction. Audit insertion failure rolls back deletion. Repeated calls with nothing eligible add no duplicate summary. The summary is not a full raw-log archive; raw messages older than the policy window are intentionally removed after approval.

No orders, attempts, verification evidence, wallet credits, outbox or maintenance_runs rows are deleted. Summary UPDATE/DELETE is blocked by an append-only trigger; service_role has SELECT only. Summary history and the underlying application-operation evidence are preserved indefinitely pending a separate archival policy. A privileged database owner can still administer schema/triggers, so this is not cryptographic tamper-proof storage.

ops/enable-phase0-retention.sql schedules one bounded 1000-row batch daily at 02:17 UTC, with a 30-second statement timeout. It requires the reviewed owner, installed extension/migration and unused job name; it never overwrites an existing job. Verify cron.timezone is UTC/GMT before activation. Production job 2, jamimode-expiry-history-retention-v1, is active as postgres with schedule 17 2 * * * and cron.timezone=GMT (05:47 Asia/Tehran). Its first real scheduled execution has not yet been observed; successful hosted test execution is not evidence of a production scheduled run. Its own low-volume Cron history and orphaned/other-job history are not silently swept.

## Validation

- 410 unit tests across 21 files passed; TypeScript passed; ESLint zero errors/14 existing warnings; isolated frontend build passed with the existing large-chunk warning. No dependency versions changed in this package.
- Real local HTTP checks: liveness 200, missing-config scheduler health 503 with minimal JSON, unknown API 404, anonymous receipt 401; security/no-store headers confirmed. No application credentials were inherited and the temporary process was stopped.
- All 27 bootstrap migrations passed on disposable PostgreSQL17, including distinct expiry/reconciliation timestamps and the exact proposed rollback-only hosted acceptance SQL on synthetic Cron metadata.
- Retention tests cover 30/90-day boundaries, owner/job/status scope, batches, caller denials, idempotency, atomic deletion/audit rollback and preservation of financial evidence.
- One local initdb attempt timed out during initial disk sync before SQL execution. The disposable bootstrap harness now uses the documented test-only --no-sync initialization option; normal server/WAL fsync is not disabled. The full rerun passed. This is not evidence of production crash/restore recoverability.

Hosted installation and permissions passed: test migration version 20261019205937; production version 20261019210257 (both phase0_log_retention). Both match normalized source SHA256 56edfa5a5c4a1321ec903a3777666ebe744bf389cfb20c26122b72b5d8d69888. These are API-generated history versions; do not replay or repair history to match the source filename.

The first hosted acceptance attempt failed because postgres cannot use the pg_cron-owned runid_seq. The fixture now supplies explicit negative test ids; no sequence privileges were granted. The revised exact SQL passed locally and on jamimode-test, including caller denials and rollback cleanup with zero fixture jobs/audit rows remaining. Only the test fixture changed; the migration stayed byte-equivalent.

Real production retention execution, live deployment of the new health endpoint and external notification delivery remain unverified. Neither a live payment nor backup work was resumed. The three existing ready attempts remain owner-reported abandoned unpaid tests; they were not modified.

## Reviewed activation order

1. With explicit approval, install only the named migration in jamimode-test. Execute ops/test-phase0-retention.sql: a temporary annual SELECT 1 job and old/recent/running history rows are created only inside one transaction, pruning/permissions checked and everything rolled back. Confirm no fixture job/audit rows remain. Sequence gaps are expected. Do not replay the bootstrap or old migrations.
2. After test success and approved production scope, apply the same pinned migration to klfmscuogsocfjxqkuib, then the daily retention template. No old logs are expected to be eligible today; preserve any unexpected state and inspect rather than blind retry.
3. Publish this backend/CLI code through reviewed commit/PR/green CI/merge and the owner's Liara deployment. The new DB status contract must precede code activation. Verify live JSON, a healthy expiry timestamp and redacted transition logs.
4. Separately connect and test independent notification delivery. Preserve the owner's deferral of real payment testing and backup. Record remaining build-tool advisories and deferred acceptance; do not mark all Phase 0 gates complete merely because health is green.

Sources: https://supabase.com/docs/guides/cron/quickstart ; https://docs.liara.ir/paas/details/health-check/ ; https://www.postgresql.org/docs/17/app-initdb.html
