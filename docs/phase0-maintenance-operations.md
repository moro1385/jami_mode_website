Production update: [maintenance migration and persistent expiry-only Cron applied; first scheduled run passed](phase0-production-maintenance.md). Earlier prepared-only notes below are historical and do not describe the current installation status.

Latest local closeout update: see [phase0-closeout-status.md](phase0-closeout-status.md) for the Router 7 fix, 390-test result, full audit 8/runtime audit 0, and prepared hosted acceptance scope. Earlier validation/counts below describe the preceding operations package.

# Phase 0 maintenance operations — prepared 2026-10-19

Status: the user-approved new migration was applied to jamimode-test only (hosted version 20261019155408). Hosted metadata and read-only PostgREST checks passed. Production has not received this migration, and no Cron job has been installed in either project. This document does not authorize further deployment, payment-provider requests or hosted data changes.

## Scope and defaults

`20261019142741_phase0_maintenance_operations.sql` adds two service-only invoker RPCs and an append-only, RLS-protected operation log. It requires the existing payment-recovery and reservation-expiry migrations. It does not enable pg_cron, recovery routes or any scheduled work. Keep `checkout_private` outside exposed schemas.

- `trusted_maintenance_status()` reports aggregate counts without customer details, provider references or credentials. It makes no writes.
- `trusted_maintenance_run(50,0)` expires at most 50 eligible reservations. Eligibility remains the existing strict rule: expired, unreleased v2 order still pending, no payment references and no payment attempt ever created. It does not backfill legacy reservations.
- `trusted_maintenance_run(0,25)` explicitly replays at most 25 already committed, verified payment records through the existing atomic settlement function. It never contacts the payment provider or treats a pending attempt as paid.
- Both tasks share a transaction advisory lock. An overlapping invocation returns `skipped:true`. The operation log is inserted in the same transaction; logging failure rolls back the operation. No automatic retry is added.

The log records completed batches, not every attempted invocation. Lock skips and rolled-back failures have no log row. Use the CLI exit status or Cron job history for failures.

## Operator CLI

Run only from a trusted server environment containing `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Never use browser/VITE variables, paste credentials into commands or send them through chat. The script does not load `.env`. The explicit ref must match the configured Supabase origin. Public keys and mismatched legacy service JWT claims are rejected; the Supabase server validates the actual credential.

```text
npm run maintenance -- report --project-ref cifhcrlmjnsxpkhyloen
npm run maintenance -- expire --project-ref cifhcrlmjnsxpkhyloen --execute --batch 50
npm run maintenance -- reconcile --project-ref cifhcrlmjnsxpkhyloen --execute --batch 25
```

These are examples for jamimode-test, not instructions to run hosted writes before approval. Production requires the explicit production ref and separate authorization. `report` rejects execution/batch flags. Mutation tasks require `--execute`; batches are limited to 1–100. Network requests are restricted to the configured origin and the two maintenance RPC paths, with redirects rejected and a 15-second deadline. Output contains only sanitized aggregate counts. After a timeout or error, inspect/report before considering another invocation; the database transaction may have committed even if its response was lost.

## Ambiguous payments require evidence

`verificationUncertain`, `creatingOver15m` and `readyWithoutEvidenceOver30m` are review queues. Age alone does not prove nonpayment. Read-only production inspection on 2026-10-19 found three old ready attempts without committed verified evidence. This package does not settle, cancel or release those attempts.

For each ambiguous case, an authorized operator must review the provider portal and correlate the existing order, amount, merchant and provider reference. Do not manufacture verification rows, promote provider status 11 to success, reverify blindly, refund, remove an attempt or release stock automatically. If verification was consumed before durable evidence committed, the automatic replay path cannot recover that evidence. Any supported manual resolution needs its own reviewed procedure and authorization. Legacy callbacks and `PAYMENT_RECOVERY_ENABLED=false` remain outside this package's activation scope.

## Cron activation — separate reviewed step

Read-only production preflight found pg_cron absent. `ops/enable-phase0-cron.sql` is an unexecuted template. After hosted test validation and separate approval, an operator must review extension installation, the scheduling role and existing jobs before enabling it. The script requires the extension and new RPC to exist, rejects an existing job name and schedules only `trusted_maintenance_run(50,0)` every five minutes with a 30-second statement timeout. It has no HTTP requests or embedded secrets. Reconciliation is deliberately manual.

The job runs with the scheduling database role's permissions; review that role explicitly. Do not grant maintenance RPCs to browser roles or add a public maintenance endpoint. Stop a deployed job using its reviewed job id with `cron.unschedule` only after operational approval; stopping a job does not reverse earlier completed batches.

After activation, check successful job history and `lastRun` at least once after two intervals. Alert if the latest successful completion is more than 15 minutes old; inspect failed job details and accumulated eligible reservations. A skipped overlap is not a successful completion. Any `pending` replay result or uncertain payment requires manual attention. No external alerting or retention cleanup is activated here. Cron history grows unless retention is configured; the append-only application log also grows (approximately 288 rows/day at five-minute intervals). Review capacity and a separate auditable archival/retention policy before long-term unattended operation.

Official Cron behavior and monitoring reference: https://supabase.com/docs/guides/cron/quickstart

## Local validation and limits

- 379 unit tests passed across 19 files.
- TypeScript passed; ESLint had 0 errors and 14 warnings.
- Disposable PostgreSQL 17 passed existing financial/concurrency checks and new permission, expiry-only default, explicit replay, idempotency, log rollback and overlapping-operation checks.
- All 26 bootstrap migrations passed in a separate disposable PostgreSQL database using synthetic Auth/Storage.
- Isolated production-mode build passed with placeholder test public configuration and a large-chunk warning. Its generated `dist` is a validation artifact, not a deployment bundle for the real site.

Hosted test checks confirmed both RPCs are invoker/service-only, the log has RLS and an append-only trigger, and service_role cannot update/delete its rows. The actual CLI report implementation read zero aggregate queues and lastRun null through PostgREST. Anonymous HTTP calls to both RPCs failed with permission denial 42501. No hosted maintenance mutation, test fixture or Cron execution was performed. The Management API read-only role cannot invoke service-only status; its metadata checks were separate from service-role HTTP reporting. No permission was broadened.

No real gateway/SMS request, hosted scheduler integration or authenticated live-site payment acceptance was performed. Local PostgreSQL synthetic state-transition/concurrency tests remain separate from this limited hosted API coverage.

## Dependencies and remaining Phase 0 work

Compatible lockfile updates include @humanfs/node 0.16.8, glob 10.5.0, fast-glob 3.3.3 and picomatch 2.3.2/4.0.7. npm audit decreased from 13 findings (8 high, 5 moderate) to 10 (6 high, 4 moderate, 0 critical). These counts include affected parent packages and are not ten independent vulnerabilities.

Remaining chains include braces through Tailwind/chokidar/micromatch/fast-glob/lovable-tagger, postcss-selector-parser through typography, and React Router. The audit proposes major changes or other incompatible resolutions; no forced fix or override was applied. Dependency findings remain open until a reviewed upgrade and regression checks are complete. Do not infer absence of runtime risk from a package's development usage.

Completed hosted gate: named migration applied to the approved test project; metadata, service report and anonymous HTTP permissions validated. Next gates: approve hosted synthetic state-transition validation and review/install Cron to validate actual job behavior in test; separately approve production migration and expiry schedule; resolve ambiguous payment cases with evidence; complete the remaining dependency upgrades and hosted acceptance. Phase 0 remains incomplete.
