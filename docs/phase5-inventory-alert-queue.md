# Phase 5 global saved alert queue — local checkpoint, 2026-10-24

The inventory screen now lazily opens a global list of enabled saved low-stock policies. Its selection is independent of the current product page, page-local threshold, parent product search, the 200-child display cap and per-product grouping. Up to 50 matching rows are returned per API page, with explicit all/low/zero/invalid/missing filters. It is a current-state report, not a stored incident inbox or a scheduled notification system.

## Scope and consistency

- Only policies with a non-null threshold are included. Products without a saved policy or with a disabled threshold are outside this queue; the existing inventory diagnostics remain available separately.
- A valid positive quantity at or below the threshold is low; zero is zero; a negative/null quantity is invalid and is returned as null instead of a fabricated zero. A missing product/variant or a variant associated with a different product is surfaced as missing, with no mutation controls. IDs are visible to administrators for follow-up. The saved policy is not erased.
- Draft/out-of-stock products remain visible with their sale restriction. A stock count does not authorize selling a draft item.
- Keyset pagination uses ascending stable product/variant UUIDs, never editable names or offsets. The exact cursor comes from the last returned row; unknown query parameters, oversized client limits, partial cursors, duplicate/out-of-order rows and contradictory states fail closed. Responses are allowlisted and do not include customers, order details or tokens.
- Each request reads stock, policy revision, labels and product flags in one SQL SELECT snapshot. Pages can reflect changes between requests. New warnings appearing before a prior cursor need a restart; the UI explains this and provides a restart button. There is no immutable multi-page snapshot, global exact total or guaranteed constant-time full-catalog scan. A partial enabled-policy index supports traversal; review query plans/table size in actual staging before rollout.

## Handling actions

Existing entities link to the current reasoned policy editor, guarded inventory adjustment/history dialog and read-only reservation report. A confirmed stock adjustment refreshes this queue and the ordinary inventory view. Closing policy review reloads the queue, so a changed threshold can remove a now-resolved condition. Merely viewing/closing a warning never marks it acknowledged or suppresses it. Missing entities have references and a review message, with no blind delete/reset. Persistent assignment, acknowledgment, dismissal/reopen incident identity and notification delivery remain future work.

GET `/api/admin/inventory/alerts` uses the existing policy server gate (`JAMI_INVENTORY_POLICIES_ENABLED`, actual environment unchanged/off), server getUser/admin authorization, no-store responses, rate limiting and fixed limit 50. SQL independently rechecks admin through a service-role-only SECURITY INVOKER function with empty search_path. No new private table grant, RLS policy, privileged SECURITY DEFINER or runtime write is added. The database policy new-write gate can remain closed while this read endpoint operates after an explicitly approved server activation.

CLI created the local `20261024194520_phase5_inventory_alert_queue.sql`; its exact bootstrap copy brings the replay to 37 migrations. This file was only executed on disposable local PostgreSQL. No hosted migration, activation, external message, commit, push, merge or deployment occurred. Ordinary index creation is transactional; hosted migration lock impact and actual Auth/PostgREST compatibility still need separately approved staging review. See [PostgreSQL row comparisons](https://www.postgresql.org/docs/17/functions-comparisons.html) and [Supabase function permissions](https://supabase.com/docs/guides/database/functions).

## Verification

- 1263 unit/integration tests in 80 files passed, including 33 new API/domain/adapter/UI tests. They check verified identity/gating, fixed limits, malformed states/cursors/order, selected filters, privacy allowlists, current-owner token, stale response lifetime, pagination/filter restart, read failures, missing entities, and wiring to existing handling dialogs.
- All 47 offline browser scenarios passed, including queue-ready/closed paths. The new flow reads warnings for variants not on the product page, paginates, resets the cursor on filter change and opens the real policy review dialog with the selected IDs. No inventory write is sent. These are intercepted synthetic backends.
- Final copy clarified ordinary-table filter scope and exposed missing-entity references; afterward the affected 52 unit tests, TypeScript and the two relevant browser scenarios passed again. Their second browser run has its own JSON report; the complete 47-scenario result remains in PHASE5-ALERT-E2E-20261024.log.
- 32 real disposable SQL assertions passed, including 65 warnings across 50+15 rows without duplication/omission, enabled/disabled policies, inclusive threshold, cross-product/missing references, all filters, cursor/limit/role rejection, revoked admin, and a READ ONLY transaction. Policy audit count and stock totals remain unchanged by reading. All earlier boundary (39), adjustment (99/five races), balance (33/one observation), and policy (45/one race) tests were rerun and passed. The runner stopped and removed its own temporary cluster.
- Full fresh 37-migration synthetic bootstrap, hash/order parity, TypeScript, zero-error/zero-warning lint, isolated build and diff checks passed. The approximately 877 kB main bundle warning remains. Synthetic dist is not deployable; hosted CI and actual hosted Auth/PostgREST checks have not run.

The queue and its action links are prepared locally. The inventory task and whole Phase 5 remain In progress. Durable handling/notification workflow, full inventory movement/physical counts/net returns, SKU reconciliation, archival/cross-device recovery, and other Phase 5 order/customer/report/image/Audit Trail work remain open.


## Later local checkpoint: persistent follow-up

See [phase5-inventory-alert-followup.md](phase5-inventory-alert-followup.md). Context-specific open/in-progress/reviewed state and retained history are now locally prepared. A stock/policy revision invalidates an old review; recording a follow-up never hides a shortage. The actor is recorded but explicit assignee/delegation and external notifications remain open. Independent follow-up gates default false. No hosted migration, activation or commit/push/deploy occurred. Local checkpoint: 1,315 tests / 82 files, 50 synthetic browser scenarios, 82 new disposable PostgreSQL/HTTP assertions and one admin race; fresh 38-migration replay. After layout changes, 69 affected tests and three browser scenarios passed again. Complete inventory ledger/count/returns and coordinated rollout remain separate work; Phase 5 is not Done.


## Later local checkpoint: follow-up queue filtering

See [phase5-inventory-followup-queue.md](phase5-inventory-followup-queue.md). Effective follow-up state and server-side open/in-progress/reviewed/needs-re-review filtering are now locally prepared. Both filters apply before keyset pagination; old un-enriched reads remain supported only for all-status access with follow-ups off and never imply a state. No hosted action/activation/commit/push/deploy. Evidence: 1,333 tests in 82 files, 52 synthetic browser scenarios, 40 new SQL assertions plus previous inventory checks, fresh 39-migration replay. Assignment/delegation, monitoring/notification policy and coordinated rollout remain open; the whole inventory task and Phase 5 are not Done.
