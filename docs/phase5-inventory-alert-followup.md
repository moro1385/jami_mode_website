# Inventory alert follow-up — local preparation

This checkpoint prepares persistent follow-up state and append-only history for saved per-variant stock alerts. It does not complete Phase 5 or activate any hosted feature.

## Behavior

- The global saved-alert queue offers **پیگیری و سابقه** for every row, including a missing product/variant. Missing entities permit history reads only.
- States are `open`, `in_progress`, `reviewed`. Reviewed means a manager reviewed a particular stock/policy context; it does not resolve a shortage, hide an alert, change sale eligibility or change stock.
- A reason (3–500 characters), explicit preview and separate confirmation are required. The server supplies the authenticated actor and checks the current admin role; SQL checks that role again, including before idempotent replay.
- A UUID inventory revision changes on actual quantity, SKU, size, color or parent-product changes. A quantity changing away and back cannot revive an old review. Price-only and no-op updates preserve this revision. Policy revision changes also invalidate an old review even if the threshold is unchanged.
- The effective state becomes open when stock context/policy changes. Previous state/actor/receipt remain in history. Invalidation is evaluated on read/write; no scheduled worker or notification is implied.
- Product name, price, category, sale flag and payment-state-only changes do not rotate the stock context. This is stock-shortage follow-up, not a general product approval workflow.
- History is bounded to 20 entries per API page, ordered by full PostgreSQL timestamp precision and UUID. Cursor ordering, ownership of rows and receipt identity are checked at both HTTP/client boundaries.
- On an unknown write outcome, the open dialog retries the same command and idempotency key. The pending command is in memory only. After closing/reloading, read current server state/history; no background retry or cross-device pending-command recovery is provided.

## SQL and access

Migration `20261024200926_phase5_inventory_alert_followup.sql` and its normalized bootstrap copy add a protected revision column/trigger and two private RLS tables. No new SECURITY DEFINER function is introduced. Public RPCs execute only as service_role and require an admin actor. Browser roles cannot set the revision column or read/write private tables/call the RPCs. Existing authenticated-admin metadata updates still work through the trigger.

Each confirmed command atomically updates current state and appends its receipt. Failure to append rolls back state. Actor/key serialization permits exact replay and rejects changed payload reuse. Parent-product → variant → policy → current-state lock order matches existing stock paths; expected context and follow-up revisions reject stale or competing writes. The event table has no entity FK cascade; a removed variant does not erase evidence. Service-role event UPDATE/DELETE/TRUNCATE are denied; the append-only row trigger also rejects owner row UPDATE/DELETE. Database-owner operations such as disabling triggers or TRUNCATE remain trusted administrative powers; this is not a tamper-proof ledger against the owner.

The application gate `JAMI_INVENTORY_FOLLOWUPS_ENABLED` defaults false, independently of stock/policy/report gates. The private `followups_enabled` database gate also defaults false. A database-gate closure permits replay of a previously confirmed identical command but prevents a new command; a server-gate closure prevents all API access until deliberately reopened. Reads do not mutate state or history.

## Local validation, 2026-10-24

- 1,315 unit/integration tests in 82 files; 50 offline browser scenarios.
- 82 new real PostgreSQL/loopback HTTP assertions plus one two-admin race; all preceding inventory SQL checks repeated by the disposable runner.
- Actual trusted checkout and expiry tested after installing the new trigger: reservation reduces stock and invalidates a review; expiry restores stock and invalidates it again; repeated expiry does not rotate context.
- Validated ABA quantity changes, admin metadata edits, protected-token writes, no-op/price preservation, policy revisions, disabled gates, role revocation before replay, stale revisions, payload conflict, invalid legacy quantity, audit rollback, history pagination and retained history after deletion.
- Fresh 38-migration synthetic bootstrap, bootstrap hash/order parity, typecheck, lint and isolated build passed. Final layout adjustments received 69 affected tests and 3 browser reruns; screenshot inspected.
- All PostgreSQL fixtures were disposable/local and their own clusters stopped/removed. Browser backend/auth requests were synthetic fixtures; production Supabase and test-project services were not contacted. The build uses test-only configuration and must not be deployed.

## Outstanding / rollout prerequisites

- No commit, push, merge, deployment, hosted SQL or feature activation was performed. Hosted CI, official advisors, real Supabase Auth/PostgREST acceptance and production migration-history/schema compatibility remain unverified.
- Adding a non-null UUID column with a volatile default can rewrite the existing variants table and requires a table lock. Before any separately approved rollout, inspect actual table size, current grants/triggers/schema and migration history, arrange the migration window and recovery plan, and evaluate lock duration. A local 5-second lock timeout is not proof of safe production rollout.
- Explicit assignee/delegation and follow-up filters across the whole queue are not part of this slice. The actor is recorded, but it is not an assigned owner.
- Notification scheduling/channel/delivery/retry policy remains open; no email/SMS/external notification was sent or enabled.
- Full stock movement ledger, physical counts, returns and the other open ERP tasks remain separate work. Do not mark the inventory task or Phase 5 Done.


## Later local checkpoint: follow-up queue filtering

See [phase5-inventory-followup-queue.md](phase5-inventory-followup-queue.md). Effective follow-up state and server-side open/in-progress/reviewed/needs-re-review filtering are now locally prepared. Both filters apply before keyset pagination; old un-enriched reads remain supported only for all-status access with follow-ups off and never imply a state. No hosted action/activation/commit/push/deploy. Evidence: 1,333 tests in 82 files, 52 synthetic browser scenarios, 40 new SQL assertions plus previous inventory checks, fresh 39-migration replay. Assignment/delegation, monitoring/notification policy and coordinated rollout remain open; the whole inventory task and Phase 5 are not Done.


## Later local checkpoint: assignment and delegation

See [phase5-inventory-alert-assignments.md](phase5-inventory-alert-assignments.md). Assigning, transferring and clearing a current administrator is locally prepared, independently of stock review, with reason/preview/confirmation, separate revisions and retained append-only history. Former-admin assignments remain visible as inactive. Both new gates default false. Evidence: 1,370 tests / 84 files, 56 synthetic browser scenarios, 70 new SQL assertions and one race, fresh 40-migration replay; final 37 affected tests and four browser cases also passed. No hosted action/activation/commit/push/merge/deploy. Global assignment filters, monitoring/notification policy and coordinated rollout remain open; Phase 5 is not Done. This checkpoint's Notion sync is pending because its connector became unavailable.
