# Production maintenance package — applied and first scheduled run verified

Explicit user approval: named maintenance migration, installation of pg_cron and persistent expiry-only scheduling on klfmscuogsocfjxqkuib (Jami Mode Project). No authorization was inferred for financial reconciliation, gateway access, recovery-flag changes, Git publication or deployment.

## Applied package

- Local source 20261019142741_phase0_maintenance_operations.sql was installed through the official migration API as hosted version **20261019165445**, name phase0_maintenance_operations. Normalized SHA256 b8f06e6ea890be17d07c1636900b1615b4e832e8ff067797a0da4e66f4eca95d. No historical migration replay or repair.
- Installed pg_cron with the separately reviewed ops/install-phase0-cron.sql (SHA256 ce2d61c3f5780b08ddd31b6b8a1538728009992becf726fc2d2b71faa41c6bd6).
- Applied ops/enable-phase0-cron.sql (SHA256 f79d3eff98eaeac3684f46691063c450c97ec89d7b766869bdeb21e5d6013298). Production job id **1**, name **jamimode-expire-unstarted-v1**, active, schedule every five minutes. The scheduling owner is postgres; each job transaction explicitly assumes service_role, sets a 30-second timeout and calls trusted_maintenance_run(50,0). No secrets or provider requests in the job body. Reconciliation limit remains zero.

## Verified live result

Actual first Cron execution succeeded at **2026-10-19 17:00:00 UTC** (20:30 Tehran). The corresponding durable application row has expire_limit 50, reconcile_limit 0 and expired/settled/pending all zero. There were no eligible unstarted reservations at this snapshot. This verifies real scheduler/function/role/log integration, not a real inventory-release case on customer orders; the synthetic state transitions were separately tested in jamimode-test and rolled back.

New maintenance table RLS and append-only trigger are enabled. Both public maintenance functions are SECURITY INVOKER, executable by service_role and denied to anon/authenticated. Client log reads are denied; service_role can read/append but cannot update/delete log rows. Read-only validation also confirmed the original six checkout/recovery function gates and preserved checkout body. The reused earlier validation helper has an obsolete pre-code phase label; its actual current bucket flag is false (private), not the historical prose label.

Before and after application/first scheduled execution: three v2 orders pending with three ready attempts, one legacy pending order, zero verification journal records and zero reservations. The three ready attempts still lack verified evidence. No existing attempt was settled, cancelled, reset or released. Their review requires trustworthy provider evidence; age and provider status 11 alone remain insufficient.

## Release preparation, not publication

During local packaging, the installed Liara CLI archive implementation excluded bare directory entries when the allowlist used trailing slashes. Local .liaraignore root directory entries were corrected to omit the trailing slash. The real CLI archive then included all 208 runtime/build inputs; required server, account/receipt and maintenance files were present and excluded secrets/test artifacts stayed out. The earlier incomplete operations-candidate directory is a failed check, not a release artifact.

The exact corrected 208-file source snapshot passed frozen offline installation (663 packages, install scripts disabled) and a production-mode Vite build in a clean directory with synthetic public test configuration. Generated dist is not a production deployment bundle. Large-chunk and package deprecation warnings remain. The source archive does not contain the validation dist.

Current local code evidence remains 390 passing unit tests, TypeScript pass, lint zero errors/14 warnings, 26 bootstrap migrations with local acceptance pass; full dependency audit 8 build-chain findings, runtime --omit=dev audit zero reported findings. No new source code was committed, pushed, merged or deployed during this production database package.

## Operating limits and remaining gates

The persistent job stays enabled as approved. Cron history and append-only application evidence grow; long-term alerting/retention remain an operational task. A successful empty batch does not resolve the three ambiguous payment attempts. PAYMENT_RECOVERY_ENABLED was not changed. No backup or restore drill was created because the earlier owner cancellation remains in force.

Next release gate: review and separately authorize committing/pushing the new operations, Router and account-isolation changes, run remote CI, then merge/deploy and verify the actual released version. Exclude the pre-existing CLI temp file, PDFs and ZIP archives from Git. Phase 0 is still not fully complete; remaining provider-evidence/recoverability decisions and build-tool advisories must be recorded honestly.

Evidence: PRODUCTION-MAINTENANCE-migrate-APPLIED.json, PRODUCTION-MAINTENANCE-install-APPLIED.json, PRODUCTION-MAINTENANCE-schedule-APPLIED.json, PRODUCTION-MAINTENANCE-STATUS-2026-10-19.json and each durable submission intent. Credentials were used only in process memory and do not appear in these reports.
