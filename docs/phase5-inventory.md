# Phase 5 — inventory review and manual adjustments, locally prepared

The second Notion task, inventory per SKU with adjustments/history, is In progress. The initial checkpoint implemented an admin inventory read/review view at /admin/inventory, linked from both desktop and mobile admin navigation and protected by the existing RequireAdmin route. The feature is separate from catalog CRUD, with domain parsing/filtering, application service, Supabase read adapter, composition and owner-scoped presentation. It is local on feature/phase5-admin-products, based on 54f3efc73000a64536be1e39d54af77637df0c4b; no commit/push/merge/deploy occurred.

## Implemented behavior

Each product's variants display size, color, SKU and registered stock quantity. Main-product active/out-of-stock flags remain distinct from variant quantities. Products without variants explicitly lack a numeric variant inventory; no missing value or read error is silently coerced to zero. Negative, noninteger, string, null or out-of-int32 quantities are flagged as invalid. The page states that registered quantities are not a computed post-reservation available-to-sell balance.

Search normalizes Persian/Arabic letters and digits across product name, size, color and SKU. Filters distinguish positive low stock, zero, invalid quantity, missing SKU, repeated normalized SKU on this page and products without variants. Duplicate checks are review hints, not a global uniqueness guarantee or an automatic rewrite of SKU identities. A 0–100000 integer low-stock threshold belongs only to the current review; it does not alter an alert policy or any stored setting. Invalid thresholds hide computed counts until corrected.

All summaries, duplicate checks, sums and searches are explicitly limited to this page. The known-unit sum excludes invalid and missing quantities, with separate issue counts. There is no global stock valuation, financial report or cross-page stock total. Manual adjustment controls are now added by the continuation below; no payment action or fabricated historical stock movements are introduced.

## Query boundaries and failure handling

The signed-in existing client performs one ordered products GET, requesting id/name/active/out-of-stock plus the variant relation's id/product_id/SKU/size/color/stock_quantity. Products are ordered by name and UUID and read in pages of 50 with exact count; child variants are ordered by UUID and independently limited to 201. At 201 returned children, 200 are shown with an explicit incomplete-product warning. This bounds the result without pretending the summary is complete. Larger child payloads, malformed relations, duplicate IDs or a variant bound to another product fail validation.

The adapter has a ten-second abort deadline. Missing count, malformed count or a short parent result inconsistent with exact count fails the read rather than silently skipping products. A parent offset beyond the current end can be empty; the previous-page button remains available. Pagination is a live ordered read, not a cross-page snapshot: simultaneous catalog changes can shift offsets, so the user can refresh. The current owner's visible product count is not a claim about records hidden by RLS.

Owner/page identity is part of the read lifetime. A page or account change hides previous rows immediately and ignores late completion. Read errors offer explicit retry and never appear as empty successful inventory. Pagination resets page-local search/filter. The screen uses the existing RLS and role guard; the read/review path does not alter policies, grants, schema or server configuration. The new adjustment continuation adds a locally tested migration and guarded API, without executing or configuring either on hosted environments; deployed RLS was not re-audited here.

Query construction was checked with the installed SDK and intercepted fetch: ordered root range, exact count, independent child limit/order, GET-only behavior and denied-read propagation. Browser fixtures expose Content-Range for cross-origin reads, matching the count contract; the first fixture omission was fixed without relaxing application validation. See the official [range](https://supabase.com/docs/reference/javascript/range) and [limit](https://supabase.com/docs/reference/javascript/limit) APIs.

## Manual adjustment continuation

Frozen delta/reason confirmation, server-validated admin identity, transactional private manual-history receipts, idempotent recovery and a bounded history dialog are implemented locally. Both real activation gates remain closed and the migration was executed only in temporary local clusters with explicit owner permission. See [full design, tests and rollout limits](phase5-inventory-adjustments.md). This is manual-path history, not a ledger of all reservations, sales and legacy edits.

## Validation

1148 unit/integration tests in 72 files, all 39 synthetic browser scenarios, 99 real disposable SQL/HTTP checks with five concurrent-session races, TypeScript, lint (zero errors/warnings), isolated build, bootstrap parity and fresh bootstrap replay passed. No production/hosted-test migration, deploy, commit, push or live business mutation occurred. The synthetic dist is not deployable. The existing main-chunk warning remains and hosted CI has not run.

## Still required to finish the inventory task

- Reviewed hosted rollout of the locally implemented manual adjustment path, integration with actual Auth/PostgREST/RLS and complete legacy-writer/history coverage. Local concurrency with checkout and expiry is tested; production verification remains open.
- Meaningful available/reserved/sold quantity definitions consistent with unfinished Phase 1/2 contracts, including products without variants.
- Durable per-SKU low-stock policy/notifications, global SKU uniqueness/mapping decisions and complete navigation for products exceeding the child cap.
- Real staging integration/RLS checks and reviewed deployment; the locally prepared read/review/manual-adjustment work does not complete the whole Notion inventory task or all Phase 5.

The ProductVariantsManager stock editor now uses the manual adjustment path; full database enforcement and other writer coverage remain open. Image central recovery/orphan reconciliation, order/refund state machine, customer/support RBAC, reports and Audit Trail/exports also remain open in their respective tasks. Phase 4 remains deferred by the owner.


## Legacy variant editor integration — 2026-10-24

The product variant editor now opens the same guarded adjustment/history dialog instead of writing stock per keystroke. Its captured quantity/SKU/size/color cannot be edited behind the dialog; opening waits for queued identity writes. The dialog survives a variant-list refresh so confirmed receipts remain visible. New variants start at zero; initial stock is added as a separate reasoned adjustment. Service and browser repository reject direct stock patches and nonzero initial stock before network access. Confirmed adjustment receipts publish the existing catalog-change event; rejected/unconfirmed attempts do not invalidate as confirmed mutations.

This is application coverage, not a database permission change. Existing direct table grants/RLS, older deployed clients, administrative SQL, variant/product deletion, reservation/expiry and other inventory writers are not retroactively captured in the manual ledger. Enforcement across those paths and deletion policy remain open. In particular, this must be released together with the approved migration/server and explicit gate activation; with gates closed the editor intentionally offers no stock-write fallback. No hosted migration, activation, deployment, commit or push has occurred.


## Browser inventory boundary continuation — 2026-10-24

The actual saved-product form now mounts the variant manager. Browser hard deletion is closed in UI/service/repository; use product draft status. A separately CLI-generated local migration restricts variant writes to zero-default insertion and allowed metadata columns, with browser DELETE/TRUNCATE revoked on products/variants and inherited privilege checks. No hosted migration or activation occurred. See [write boundary evidence and rollout limits](phase5-inventory-write-boundary.md). Current verification: 1166 tests/74 files, 40 synthetic browser scenarios, 39 new disposable SQL assertions plus all 99 adjustment assertions/five races, and fresh 34-migration bootstrap passed. Owner/service-role writes and complete movement history remain outside this boundary. The whole inventory and Phase 5 tasks remain in progress.


## Read-only reservation balance continuation — 2026-10-24

The inventory page now offers per-variant current stock, open/overdue reservations, recorded paid quantities, released history, legacy quantities and review counts from a coherent server/SQL snapshot. Trusted v2 reservations are already deducted from stock; no second subtraction occurs. This is not physical inventory, net returns or a full stock ledger. The independently gated report remains off in real environments and no hosted migration/release occurred. See [quantity definitions, verification and limits](phase5-inventory-balance.md). Latest evidence: 1195 tests/76 files, 42 offline browser scenarios, 33 balance SQL/HTTP assertions with one concurrent observation plus all preceding 39 boundary and 99 adjustment/five-race checks, and full fresh 35-migration bootstrap passed. Durable low-stock policy, complete movement definitions and reviewed rollout remain open.


## Persistent low-stock policy continuation — 2026-10-24

Per-variant central thresholds and panel alerts are locally implemented with reasoned preview/confirmation, revision conflict protection and private append-only receipts. Zero and disabled null are distinct. The temporary page filter remains independent; saved alerts are evaluated in the variant policy dialog on read, not by a global scheduler or notification inbox. No stock/order is edited. Both real policy gates remain closed and the CLI-created migration ran only in disposable PostgreSQL. See [policy implementation, evidence and limits](phase5-inventory-low-stock-policy.md). Latest checks: 1230 tests/78 files, 45 offline browser scenarios, 45 new SQL assertions/one race plus preceding inventory checks and fresh 36-migration bootstrap passed. Hosted rollout, global warning list/delivery/acknowledgment and complete movement accounting remain open; Phase 5 is still in progress.


## Global saved alert queue continuation — 2026-10-24

The inventory page now lazily opens a server-paginated queue of all enabled saved policies currently low/zero/invalid/missing, independently of product-page filters/caps. Stable UUID cursors, owner scoping and allowlisted results protect pagination; live pages can change and should be restarted for new warnings. Existing policy/adjustment/reservation dialogs are reachable from each valid entity; missing references are read-only and visible for review. Viewing never acknowledges or suppresses a warning. See [queue scope, evidence and remaining handling work](phase5-inventory-alert-queue.md). 1263 tests/80 files, 47 synthetic browser scenarios, 32 new SQL checks plus all previous inventory checks and fresh 37-migration bootstrap passed. No hosted migration/activation/deployment/commit/push occurred; persistent handling/delivery and whole Phase 5 remain open.


## Later local checkpoint: persistent follow-up

See [phase5-inventory-alert-followup.md](phase5-inventory-alert-followup.md). Context-specific open/in-progress/reviewed state and retained history are now locally prepared. A stock/policy revision invalidates an old review; recording a follow-up never hides a shortage. The actor is recorded but explicit assignee/delegation and external notifications remain open. Independent follow-up gates default false. No hosted migration, activation or commit/push/deploy occurred. Local checkpoint: 1,315 tests / 82 files, 50 synthetic browser scenarios, 82 new disposable PostgreSQL/HTTP assertions and one admin race; fresh 38-migration replay. After layout changes, 69 affected tests and three browser scenarios passed again. Complete inventory ledger/count/returns and coordinated rollout remain separate work; Phase 5 is not Done.


## Later local checkpoint: follow-up queue filtering

See [phase5-inventory-followup-queue.md](phase5-inventory-followup-queue.md). Effective follow-up state and server-side open/in-progress/reviewed/needs-re-review filtering are now locally prepared. Both filters apply before keyset pagination; old un-enriched reads remain supported only for all-status access with follow-ups off and never imply a state. No hosted action/activation/commit/push/deploy. Evidence: 1,333 tests in 82 files, 52 synthetic browser scenarios, 40 new SQL assertions plus previous inventory checks, fresh 39-migration replay. Assignment/delegation, monitoring/notification policy and coordinated rollout remain open; the whole inventory task and Phase 5 are not Done.


## Later local checkpoint: assignment and delegation

See [phase5-inventory-alert-assignments.md](phase5-inventory-alert-assignments.md). Assigning, transferring and clearing a current administrator is locally prepared, independently of stock review, with reason/preview/confirmation, separate revisions and retained append-only history. Former-admin assignments remain visible as inactive. Both new gates default false. Evidence: 1,370 tests / 84 files, 56 synthetic browser scenarios, 70 new SQL assertions and one race, fresh 40-migration replay; final 37 affected tests and four browser cases also passed. No hosted action/activation/commit/push/merge/deploy. Global assignment filters, monitoring/notification policy and coordinated rollout remain open; Phase 5 is not Done. This checkpoint's Notion sync is pending because its connector became unavailable.


## Later local checkpoint: assignment-aware queue

See [phase5-inventory-assignment-queue.md](phase5-inventory-assignment-queue.md). Mine, unassigned and inactive-assignee filters now combine with shortage/follow-up filters before pagination. Mine is bound to the verified actor; inactive and unassigned stay distinct. Delayed assignment-checkpoint Notion sync was restored and read back. Evidence: 1,387 tests / 84 files, 58 offline browser scenarios, 36 new SQL assertions and all previous inventory checks, fresh 41-migration replay, type/lint/build/bootstrap/diff checks passed. No hosted action/activation/commit/push/merge/deploy. Monitoring/notification policy, real-service acceptance and coordinated rollout remain; Phase 5 is not Done.
