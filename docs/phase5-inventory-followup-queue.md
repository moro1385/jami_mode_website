# Inventory follow-up queue filters — local checkpoint 2026-10-25

The global saved-alert list now shows the effective follow-up status and revision. Managers can combine shortage type with open / in progress / reviewed / needs re-review. A reviewed shortage remains an active shortage row. Needs re-review is a subset of open: a previous follow-up exists and either its inventory token or policy revision no longer matches current context. Never-followed rows are open, not needs re-review. Missing entities with an old review are open and can require re-review; their history remains available but writes remain prohibited.

## Read path and compatibility

Local migration `20261024211002_phase5_inventory_followup_queue.sql` adds `trusted_inventory_alerts_followup` as an invoker RPC with an empty search path. It joins policies, products, variants and current follow-ups in one statement/snapshot. It does not call one RPC per row, write follow-up events, adjust stock, release reservations or send notifications. Role authorization is checked afresh; EXECUTE is granted only to service_role and browser inherited grants are asserted absent.

Both shortage and follow-up filters apply before the limit. Keyset pagination uses the existing unique product/variant pair, at most 50 rows plus one for continuation. The partial enabled-policy index and follow-up composite primary key are reused. Large-data performance is not established by synthetic fixtures; an actual-size plan/latency review remains a rollout prerequisite. Each page is a current snapshot, not a frozen multi-page report. Changing either filter resets the cursor; refresh from the start to discover newly matching earlier rows.

The existing policy server gate still guards the list. With `JAMI_INVENTORY_FOLLOWUPS_ENABLED` false, an unfiltered all-status request uses the existing alerts RPC. Selecting a follow-up subset returns an explicit disabled error before service access. The UI labels unavailable follow-up data as unavailable, never as open/reviewed. With that server gate true, all queue requests use the new RPC and require coherent follow-up metadata. A missing migration/read failure produces an error, not silent fallback or an empty success. The separate database follow-up write gate does not prevent these authorized read-only queries; it continues to prevent new follow-up writes.

The API accepts only documented filters and paired UUID cursors. It fixes the page size, supplies the authenticated actor, checks no-store responses and validates status/context/revision/filter consistency. Responses include effective status/revision/context-changed only; actor, reason and private event payloads are not part of the queue. Detail history remains on its existing guarded endpoint.

## Evidence

- 1,333 unit/integration tests across 82 files passed; full 52 offline browser scenarios passed.
- 40 new real disposable PostgreSQL assertions passed, including 66 alerts split 50/16, 58 open alerts split 50/8, AND filters, quantity ABA and same-threshold policy revision invalidation, missing entities, read-only transaction, closed write gate, role revocation and direct browser denial.
- Previous inventory boundary/adjustment/balance/policy/queue/follow-up assertions also passed in the disposable runner. Own temporary PostgreSQL clusters were stopped and removed.
- Fresh replay of 39 synthetic bootstrap migrations and normalized hash/order checks passed. Typecheck, lint (zero warnings/errors), isolated build and diff whitespace checks passed. Two new browser cases were rerun for visual inspection; the tiny final test typing correction received typecheck and affected-test verification.
- Browser Auth/backend responses are synthetic offline fixtures; PostgreSQL tests are loopback disposable, not hosted Supabase. The synthetic build is not deployable. Real Auth/PostgREST, hosted CI/advisors, schema/history/grants compatibility and production-sized query performance remain unverified.

No hosted migration, activation, commit, push, merge or deploy occurred. Explicit assignment/delegation, external notification/monitoring policy, coordinated rollout and other open ERP tasks remain unfinished. Inventory and Phase 5 remain In progress.


## Later local checkpoint: assignment and delegation

See [phase5-inventory-alert-assignments.md](phase5-inventory-alert-assignments.md). Assigning, transferring and clearing a current administrator is locally prepared, independently of stock review, with reason/preview/confirmation, separate revisions and retained append-only history. Former-admin assignments remain visible as inactive. Both new gates default false. Evidence: 1,370 tests / 84 files, 56 synthetic browser scenarios, 70 new SQL assertions and one race, fresh 40-migration replay; final 37 affected tests and four browser cases also passed. No hosted action/activation/commit/push/merge/deploy. Global assignment filters, monitoring/notification policy and coordinated rollout remain open; Phase 5 is not Done. This checkpoint's Notion sync is pending because its connector became unavailable.


## Later local checkpoint: assignment-aware queue

See [phase5-inventory-assignment-queue.md](phase5-inventory-assignment-queue.md). Mine, unassigned and inactive-assignee filters now combine with shortage/follow-up filters before pagination. Mine is bound to the verified actor; inactive and unassigned stay distinct. Delayed assignment-checkpoint Notion sync was restored and read back. Evidence: 1,387 tests / 84 files, 58 offline browser scenarios, 36 new SQL assertions and all previous inventory checks, fresh 41-migration replay, type/lint/build/bootstrap/diff checks passed. No hosted action/activation/commit/push/merge/deploy. Monitoring/notification policy, real-service acceptance and coordinated rollout remain; Phase 5 is not Done.
