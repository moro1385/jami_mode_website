# Inventory alert assignment — local checkpoint 2026-10-25

Managers can open **مسئول پیگیری** from each saved-alert row, select a current administrator, transfer responsibility or explicitly clear the assignee. A reason, preview and separate confirmation are required. This action does not send a message, change stock, resolve a shortage or approve a follow-up review.

Assignment has its own revision and append-only change history, independently of follow-up status. Responsibility persists across stock/policy context changes, while a previous review can become invalid. Assignment writes still require a current active shortage/entity, matching inventory token, matching policy revision and assignment revision. A missing entity permits retained history reads only. A former administrator remains recorded with an explicit inactive marker; the UI never treats their historical assignment as current authority.

## Access and concurrency

Migration `20261024212044_phase5_inventory_alert_assignments.sql` adds two private RLS tables and four invoker RPCs with empty search paths. Browser roles have no table/RPC access. The server verifies the session and explicit admin role, derives the actor, allowlists request fields and validates read/receipt/history/list consistency. SQL checks the actor again before replay or writing. The current manager roster is bounded to 50 per page, keyset ordered, and contains only UUID/name; no phone, email or authentication secrets. User-editable names are display labels, never role evidence; UUIDs remain visible.

New targets must have an admin-role record, locked FOR SHARE during assignment, so deleting/changing that target role cannot race past validation before commit. The lock order is product → variant → policy → current assignment → target role. Concurrent assignment edits serialize and compare revisions. Actor/request-key serialization returns the original receipt for identical retries and rejects changed payloads. Event append failure rolls back the current assignment. No-op assignments are rejected. No FK cascade erases assignment evidence when an entity/user disappears; database-owner powers remain trusted and this is not an owner-tamper-proof ledger.

The application gate `JAMI_INVENTORY_ASSIGNMENTS_ENABLED` and database `assignments_enabled` flag independently default false. A closed application gate prevents all assignment API service access. A closed database gate prevents new assignment writes while authorized reads remain available; an exact previously committed request can replay its original receipt. Replay does not claim the target is still active: the current read exposes that separately. Actor-role revocation prevents replay.

Pending commands live only in the open dialog, with no automatic retry. Unknown outcomes retain the same target/key for explicit retry; after closing or reloading, read current state/history. Stale context/revision or a revoked target requires refreshed data and a new preview. Reads are scoped to the signed-in owner/selected entity; writes use synchronous in-flight protection against double clicks.

## Evidence

- 1,370 unit/integration tests in 84 files; 56 offline browser scenarios passed.
- 70 new real disposable PostgreSQL assertions and one concurrent-admin race passed, along with every preceding inventory SQL suite. Genuine SQL results were passed through the API's read/receipt/history/roster validators.
- Covered initial assignment, transfer, removal, unchanged targets, customer/inactive target denial, stale context/revision, receipt replay/conflict, audit rollback, persistent responsibility after stock changes, revoked actor/target, retained deletion history, 20-entry history pages and a manager roster over 50 users.
- Full fresh 40-migration bootstrap, normalized hash/order checks, typecheck, lint, isolated build and whitespace checks passed. After reason-validation/layout cleanup, 37 affected tests and four browser cases passed again. The screenshot was reviewed; final evidence is in the task's work-output folder.
- Browser auth/backend responses were synthetic fixtures; all database checks used disposable loopback PostgreSQL clusters which were stopped/removed. The isolated synthetic build must not be deployed. No hosted SQL, feature activation, commit, push, merge or deployment occurred.

Remaining: assignment-aware global filters / "my alerts", monitoring and notification policy, real-size performance and real Supabase Auth/PostgREST acceptance, hosted CI/advisors and coordinated rollout approval. Other open inventory/ERP work remains separate. Inventory and Phase 5 remain In progress. Notion synchronization of this checkpoint is pending because its connector became unavailable before the final update.


## Later local checkpoint: assignment-aware queue

See [phase5-inventory-assignment-queue.md](phase5-inventory-assignment-queue.md). Mine, unassigned and inactive-assignee filters now combine with shortage/follow-up filters before pagination. Mine is bound to the verified actor; inactive and unassigned stay distinct. Delayed assignment-checkpoint Notion sync was restored and read back. Evidence: 1,387 tests / 84 files, 58 offline browser scenarios, 36 new SQL assertions and all previous inventory checks, fresh 41-migration replay, type/lint/build/bootstrap/diff checks passed. No hosted action/activation/commit/push/merge/deploy. Monitoring/notification policy, real-service acceptance and coordinated rollout remain; Phase 5 is not Done.
