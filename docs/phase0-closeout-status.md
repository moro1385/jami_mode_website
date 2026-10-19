Latest hosted result: [test maintenance and Cron acceptance passed](phase0-hosted-maintenance-acceptance.md). The two-run temporary job was removed; the extension and historical logs remain in test. Production maintenance was subsequently approved, installed and its first five-minute Cron run passed; see phase0-production-maintenance.md. New Git publication remains pending. The prepared-next-action section below records the approved test scope, now completed.

# Phase 0 closeout status — 2026-10-19

This is the current local evidence ledger. Earlier dated reports remain historical snapshots. Notion was unavailable in this session; this is not a claim that its checkboxes were updated. Phase 0 is not complete yet.

## Latest local changes

- React Router upgraded from 6.30.6 to exact 7.18.4. The published navigation advisory identifies 7.18.0+ as patched: https://github.com/remix-run/react-router/security/advisories/GHSA-wrjc-x8rr-h8h6 . Node >=20 and React >=18 requirements match the verified local/host Node 24 and React 18 baseline.
- Admin route approval is now bound to the current user and session token. Account/session changes clear the previous approval; late responses from an earlier request are ignored. Failed role checks stay closed. The ordinary authenticated route also waits for its profile and session user ids to match. These are frontend isolation improvements; database/server authorization remains necessary.
- Router regression tests use real BrowserRouter for callback preservation, password/OTP callback tests remain in the full suite, unsafe return paths are rejected, product/back/forward navigation works, and stale admin approvals cannot open another account's route.
- The CSS build plugin tailwindcss-animate moved from runtime dependencies to devDependencies; it is used only by Tailwind configuration. This does not remove or silence its full dependency audit findings.
- 390 unit tests / 20 files passed; TypeScript and isolated build passed; ESLint 0 errors, 14 existing warnings. Build uses placeholder test public configuration: generated dist is not a production deployment package.
- Exact proposed hosted maintenance acceptance SQL passed in disposable PostgreSQL before the existing 26-migration bootstrap acceptance suite. All fixture records rolled back to zero. Identity sequences may retain unused ids after a rollback.

## Dependency status

Full lock audit: 8 affected packages, 6 high and 2 moderate, zero critical. Runtime dependency audit with --omit=dev: zero reported findings. These are separate scopes; Phase 0 must not be represented as having a clean full audit.

Remaining build-tool chains are braces / chokidar / micromatch / fast-glob / Tailwind / lovable-tagger, and postcss-selector-parser / typography. npm registry reports braces 3.0.3 as current and it remains affected. No unreviewed override, downgrade or force-fix was applied. Tailwind 4 migration would require CSS regression/visual review and is not bundled into a maintenance/security patch to meet a date.

Reviewed source usage: the server entry point and payment modules do not invoke these CSS/glob parsers; Tailwind scans repository sources during build, not customer input on a request. Build environments still require trusted source and controlled dependency installation. The selector-parser advisory explicitly distinguishes untrusted selector parsing from ordinary trusted build inputs: https://github.com/postcss/postcss-selector-parser/security/advisories/GHSA-rj75-hqrm-r3gf . This does not establish the reachability conditions of every other advisory or waive the remaining upgrade work.

## Current gate ledger

| Gate | Evidence/status | Remaining action |
|---|---|---|
| Financial table/column containment and immutable orders | Production migrations previously applied and read back; local regression remains green | Refresh focused final production read-only checks before closing |
| Project identities and runtime | Production/test refs pinned; owner confirmed Liara Node 24.22 | Confirm exact next deployed revision and runtime env at publication |
| Old financial Edge entry points | Previously deployed containment/legacy bridge; new initiation disabled | Keep callback compatibility; no blind deletion of inflight attempts |
| Signed SMS hook and login | Previously deployed signed hook; owner confirmed SMS/login | Do not send new real SMS without authorization |
| Payment recovery | Journal and recovery code deployed; recovery flag instructed off; evidence replay tested locally | Hosted synthetic operations acceptance and production maintenance are complete; reviewed recovery activation and provider-evidence procedure remain |
| Reservation expiry | Synthetic hosted acceptance and two test Cron runs passed; production maintenance installed as 20261019165445 and first scheduled run passed | Keep evidence/monitoring; ambiguous attempts are never expired by this job |
| Private return images | Production private bucket/policies and public-URL denial verified; hosted owner/other/admin HTTP tests passed in test | Retain existing customer file compatibility; no retrospective privacy guarantee |
| Payment receipt and account isolation | Owner confirmed deployed unauthorized receipt endpoint; unit/component regressions passed | New route guard changes still uncommitted/unpublished; authenticated live acceptance remains limited |
| Auth/PostgREST/Storage and regressions | Hosted Auth/Storage boundary tests and maintenance report/anon-denial checks passed; local DB/races/26 migrations and 390 unit tests passed | Hosted maintenance transitions and two test Cron runs now passed, plus first production run |
| HTTP controls/dependencies/CI | Headers/rate limit deployed; previous main CI green; router upgrade and runtime audit zero locally | New branch publication/CI/deploy; full audit has 8 build-chain findings; distributed limiter not installed |
| Operations/release/recoverability | Previous main merge and owner-confirmed deployment; operation runbook prepared | No validated database backup/restore (owner cancelled); three ambiguous ready attempts need provider evidence; approve production operations and final release decision |

## Prepared next action — requires separate approval

Target only jamimode-test (cifhcrlmjnsxpkhyloen). Preflight confirmed no orders/attempts/operation logs, expected synthetic account, pg_cron available but absent, postgres can assume service_role.

1. Execute ops/test-phase0-maintenance.sql: temporary synthetic order/attempt/evidence records, permission checks, expiry-only behavior, protected started attempt, explicit replay and idempotency; ROLLBACK; verify zero residual rows. No Auth user/settings change, provider/payment request or production access.
2. Install pg_cron in test, then create the uniquely named temporary acceptance job from ops/test-phase0-cron.sql, every minute. It runs as postgres but explicitly SET LOCAL ROLE service_role for the work, with a 30-second timeout, expiry limit 50 and reconciliation limit zero. The SQL has a fixed deadline at most ten minutes after submission; after it expires no maintenance call is made even if the controller is lost.
3. Observe two actual successful Cron runs and matching expiry-only operation logs. Unschedule only the recorded job after verifying id/name/owner/exact command. Extension and historical logs remain. Report failure/cleanup issues without hiding or automatically retrying them.

The prepared controller pins the project and reviewed source hashes, saves exact submission state before scheduling, rejects an existing name/state and never calls a provider. This package has not been executed on the hosted project yet. Production changes, commits/push/merge and deployment are separate gates.

## Source architecture work

Broad source organization is proposed as a separate stage after Phase 0: folder/domain boundaries, page/data/business logic separation, duplicate code and maintainability with regression protection. No existing numbered Notion phase could be verified in this session. Do not claim that a new Notion phase was created or the refactor is already complete.
