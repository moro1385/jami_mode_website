# Phase 5 persistent low-stock policy — local checkpoint, 2026-10-24

The inventory page now offers “حد کمبود ذخیره‌شده” per variant. This central setting is keyed by stable product/variant UUIDs, not editable SKU text or browser storage. The existing page threshold remains a temporary filter for that page; the persisted setting is read and its alert evaluated in the new dialog. Closing/reopening/reloading reads the server value. This is not a site-wide alert inbox, scheduled notification, email/SMS or background monitoring system.

## Behavior

- Threshold accepts a Persian/Arabic integer 0–100000. Null explicitly disables this variant’s warning; zero remains a real threshold. No universal default is silently saved.
- Valid current quantity equal to or below the configured positive threshold is low; zero quantity with any enabled threshold is zero. Invalid stock is invalid, including when no threshold exists. Unconfigured/disabled policy is unset. The server and browser independently check the reported alert against stock and threshold.
- The dialog displays the current server value/revision, current remaining stock and product publication/out-of-stock restriction. It does not subtract reservations again or infer physical counts.
- A new value or disable action requires a reason, frozen preview and separate confirmation. It updates only policy metadata, not stock, product status or orders.
- An unknown result keeps the original immutable command/key in this open dialog for explicit retry. No automatic retry occurs. The pending command is not persisted to browser storage; closing/reloading instead reads current server policy. Server receipts remain durable. CAS prevents an old revision from overwriting a later setting; a known stale failure reloads the setting and requires a new preview.

## Database and server boundaries

CLI generated `20261024193126_phase5_inventory_low_stock_policy.sql`. It is only a local file tested in disposable PostgreSQL. No hosted migration, activation, deploy, commit, push or merge occurred. Real configuration remains unchanged/off.

`inventory_private.low_stock_policies` holds current threshold, monotonic revision and actor/key/timestamp. Private append-only `policy_changes` records canonical command and before/after threshold receipt with reason. Both use RLS, restricted grants and no cascading foreign keys. Service-role policy writes are trusted and retain direct current-setting privileges; this is not protection against a compromised service key/table owner or a complete global Audit Trail. Owner/service-role maintenance and orphan review remain outside browser authorization.

Service-only SECURITY INVOKER read/write RPCs independently require a current admin. The write obtains actor/key advisory lock, replays only an identical canonical request, checks the database new-write gate and locks product then variant before comparing the current revision. Initial revision zero is serialized by those parent locks. Setting and audit append share one transaction; audit failure rolls back the setting. A matching old receipt can be replayed after a newer policy or closed database gate, but revoked admins cannot replay. A reused key with another body conflicts. Reason/delta are not confused: this policy path has no stock delta.

GET/POST `/api/admin/inventory/policy` share the existing bearer getUser/admin-role validation, rate limiting, bounded parser and no-store responses. Caller actor/stock/unknown fields are rejected; receipts must match actor/key/product/variant/revision/value/reason. The server flag `JAMI_INVENTORY_POLICIES_ENABLED` independently defaults false. The database adds `inventory_private.settings.policies_enabled DEFAULT false`, with no service-role grant to enable it. The server gate controls read and write access; when server access is enabled and the DB gate remains false, existing policies/alerts can be read while new writes remain closed. No stock adjustment/report gate is enabled by this implementation.

The locking and permission design follows [PostgreSQL advisory/row locks](https://www.postgresql.org/docs/17/explicit-locking.html) and [Supabase function security](https://supabase.com/docs/guides/database/functions). The hosted environment’s actual schema/role compatibility and official advisors are not established by disposable tests and require separately approved staging/release review.

## Verification

- 1230 tests in 78 files passed, including 35 new contract/authorization/domain/UI/HTTP-adapter tests. They cover zero versus disabled, Persian input, separate confirmation, matching receipt, scope lifetime, exact-key retry, stale revision and no fabricated read defaults.
- All 45 offline browser scenarios passed. Three new paths cover confirmed save, an uncertain first response with the exact same command retried and a closed database gate. Reload/reopen retains the server fixture value; changing the temporary page threshold does not change the stored policy. No stock PATCH/POST is sent. Browser backend calls are intercepted synthetic fixtures.
- 45 real disposable SQL assertions and one real concurrent-session race passed: default-off/private-role denial, persistence, inclusive low/zero/invalid alerts, same-key replay/conflict, two admins racing from the same revision, failed-audit rollback, explicit disabling, append-only protection, replay after gate close and denial after role revocation. Current policy is shared across synthetic admins and persisted in actual temporary PostgreSQL. No actual hosted Supabase Auth/PostgREST or messaging/gateway service was called.
- Previous boundary (39), adjustment (99/five races) and balance (33/one concurrent observation) SQL/HTTP checks were rerun and passed. The runner stopped/removed its own temporary cluster. Full fresh 36-migration bootstrap replay, copy/hash parity, TypeScript, zero-error/zero-warning lint, isolated build and diff checks passed. The existing approximately 877 kB main bundle warning remains; synthetic dist is not deployable and hosted CI has not run.

## Remaining

Review/activation in a real staging environment, a bounded global list of configured low-stock variants, scheduled/deduplicated alert delivery and acknowledgment policy remain open. No external notifications are enabled. Full stock movement/physical counts/net returns, global SKU reconciliation, cross-device pending-operation recovery, variant archival and the other Phase 5 order/customer/report/image/Audit Trail tasks remain open. The inventory task and all of Phase 5 remain In progress.


## Global saved alert queue continuation — 2026-10-24

The inventory page now lazily opens a server-paginated queue of all enabled saved policies currently low/zero/invalid/missing, independently of product-page filters/caps. Stable UUID cursors, owner scoping and allowlisted results protect pagination; live pages can change and should be restarted for new warnings. Existing policy/adjustment/reservation dialogs are reachable from each valid entity; missing references are read-only and visible for review. Viewing never acknowledges or suppresses a warning. See [queue scope, evidence and remaining handling work](phase5-inventory-alert-queue.md). 1263 tests/80 files, 47 synthetic browser scenarios, 32 new SQL checks plus all previous inventory checks and fresh 37-migration bootstrap passed. No hosted migration/activation/deployment/commit/push occurred; persistent handling/delivery and whole Phase 5 remain open.


## Later local checkpoint: persistent follow-up

See [phase5-inventory-alert-followup.md](phase5-inventory-alert-followup.md). Context-specific open/in-progress/reviewed state and retained history are now locally prepared. A stock/policy revision invalidates an old review; recording a follow-up never hides a shortage. The actor is recorded but explicit assignee/delegation and external notifications remain open. Independent follow-up gates default false. No hosted migration, activation or commit/push/deploy occurred. Local checkpoint: 1,315 tests / 82 files, 50 synthetic browser scenarios, 82 new disposable PostgreSQL/HTTP assertions and one admin race; fresh 38-migration replay. After layout changes, 69 affected tests and three browser scenarios passed again. Complete inventory ledger/count/returns and coordinated rollout remain separate work; Phase 5 is not Done.
