# Phase 0 closeout status — 2026-10-20 (Asia/Tehran)

Latest local follow-up: build dependency remediation on security/phase0-build-dependencies has received separate publication approval, subject to green CI: full and runtime audits both zero,414tests passed and34 offline visual states compared. Publication is tracked by the build-dependency PR; these dependency changes have not been deployed. See [build dependency remediation](phase0-build-dependencies.md). The owner confirmed deployment of the preceding monitoring release and both live health responses; its first scheduled retention run succeeded. Independent notifications are now explicitly deferred by the owner.

This is the current evidence ledger. Earlier dated reports are historical snapshots. Phase 0 is not complete, and passing these checks does not establish that the entire site is free of security defects. No Notion checkbox update is claimed by this record.

## Completed and verified

Financial table/column containment, trusted checkout settlement, payment verification evidence, reservation expiry and private return image controls were installed in production in the preceding approved releases. Local and hosted synthetic boundary tests passed. Payment/receipt authorization remains enforced server-side; frontend route guards also reset stale approval when the account/session changes.

PR104 merged as ba973368f879a3be695122ba7f2a42a7540aeb33 after successful CI, including the React Router 7.18.4 update and audited maintenance operations. The owner reported deployment, unauthorized receipt rejection, ordinary-user admin redirection and an invalid checkout return error. Exact live revision and every authenticated HTTP path were not independently verified from this work session, which repeatedly timed out reaching the public site. The owner previously confirmed signed SMS login worked. No new real SMS was sent.

The owner confirmed PAYMENT_RECOVERY_ENABLED=true in the Liara runtime. This confirms the environment flag, not a successful live recovery. The three existing ready payment attempts were identified by the owner as their abandoned unpaid tests; their records were not rewritten or treated as provider-verified failures. Provider-evidence handling remains necessary for any future ambiguous real attempt.

Production expiry job jamimode-expire-unstarted-v1 runs every five minutes, with expiry batch 50 and reconciliation zero. The latest monitoring-package readback showed it active, completion less than five minutes old and no failed Cron runs. Financial counts remained four orders, three attempts, zero verification entries and zero reservations across this package's activation. This is a scoped observation, not a claim that customer data can never change.

The monitoring/retention migration was permission-validated in jamimode-test (history 20261019205937) and production (20261019210257). Its normalized source hash is 56edfa5a5c4a1321ec903a3777666ebe744bf389cfb20c26122b72b5d8d69888. Exact hosted rollback acceptance passed in test after explicit fixture ids avoided pg_cron's restricted runid sequence; no privilege expansion was needed and no test job/audit rows remained.

Production retention job 2, jamimode-expiry-history-retention-v1, is active at 02:17 UTC / 05:47 Tehran daily. It removes at most 1000 eligible expiry-job Cron rows: successes older than 30 days, failures older than 90 days. Atomic append-only summaries and all financial/application-operation evidence remain. No row was eligible at activation; the first scheduled production retention execution subsequently succeeded (one success, zero failures at follow-up).

The associated monitoring code provides read-only expiry freshness checks, fixed redacted state logs, minimal public health responses and a CLI check. It distinguishes process liveness from scheduler freshness and does not call the payment provider. Code publication is tracked by the accompanying monitoring PR; Liara deployment is separate. Details: [monitoring and retention](phase0-monitoring-retention.md).

## Verification and remaining gates

| Gate | Current evidence | Still required |
|---|---|---|
| Database/server authorization | Previous production containment and hosted synthetic permission tests; new status/pruning ACL checks passed | Retain regression coverage; evaluate new functionality against the same server-side boundaries |
| Expiry maintenance | Active production five-minute job; fresh durable completion and no failures at readback | Independent failure notification and ongoing observation |
| Monitoring code | 410 tests across 21 files, TypeScript, isolated build, real local HTTP boundary checks and all 27 bootstrap migrations passed | Monitoring PR105 and main CI passed; owner confirmed deployment and both live JSON responses. Independent inspection of transition logs/live Git SHA remains limited |
| Retention | Scoped 30/90-day function validated locally and in hosted test; production daily schedule read back | First scheduled run succeeded; retain atomic summaries and ongoing observation |
| Independent notification | Redacted local logs and minimal polling signal implemented | Deferred by owner; no independent delivery claim |
| Live checkout/recovery | Owner confirmed gateway redirect and runtime recovery flag; synthetic journal/replay/idempotency tests passed | Real paid flow/recovery acceptance deferred by owner; do not report this as passed |
| Recoverability | Backup preflight history only | Database backup and restore acceptance cancelled/deferred by owner; no recoverability claim |
| Dependencies | New local build-remediation candidate: full and runtime audits both zero | Publish the owner-approved Tailwind4 upgrade after green CI; owner deployment and browser verification remain. Previous deployed dependency baseline had eight build-chain findings |
| Release evidence | Previous PR/main CI and owner deployment confirmation | Record exact next deployed revision and host responses; do not equate repository merge with deployment |

ESLint has zero errors and 14 existing warnings; the isolated build retains its existing large-chunk warning. Its placeholder test configuration makes that generated dist unsuitable for production deployment. The disposable bootstrap uses initdb --no-sync only for initial test-cluster setup; normal server/WAL fsync remains enabled. This is not a production restore/crash-recovery test.

The public scheduler health response indicates recent expiry work, not overall payment correctness, absence of security issues or verified notification delivery. A recent manual expiry can refresh it; recent reconciliation cannot. Do not use scheduler health to trigger container restart loops during database outages. A distributed rate limiter remains outside the current implementation.

## Source architecture

Broad folder/domain cleanup, separation of page/data/business logic and duplicate-code reduction remain a separate stage after Phase 0, with regression protection. No specific numbered Notion phase has been verified or created in this package. Avoid mixing that restructuring into the current operational security release.

Related historical records: [hosted maintenance acceptance](phase0-hosted-maintenance-acceptance.md), [production maintenance](phase0-production-maintenance.md). Those record their own earlier scope and dates; use this ledger and the monitoring runbook for current status.
