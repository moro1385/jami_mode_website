# Phase 5 — product administration, first slice

Phase 4 is deferred by the owner. Phase 5 is in progress. These product-status, price, category, existing-image and fresh-file upload slices are local on `feature/phase5-admin-products`, based on merged Phase 3 commit `54f3efc73000a64536be1e39d54af77637df0c4b`. It is not committed, pushed or deployed.

## Existing capabilities retained

Product create/edit/copy/delete, inline price editing, variant and image managers, admin order/return views, customer list and support screens already exist. This slice does not claim to implement them anew. Existing signed-in browser client and RLS are retained; no backend or migration changes are made.

## New product-management behavior

- Name, slug, brand and category search with Persian/Arabic letter normalization, plus active/draft filtering. Search operates on the loaded records; this is not server pagination or the Phase 4 large-catalog search.
- Explicit row selection and select-visible capped at 50 records. Changing a filter clears selection so hidden products cannot be changed accidentally.
- Group active/draft status changes require a preview listing the exact chosen products, target status and number of actual changes. Cancelling sends no write. Draft products are absent from the storefront's active-only catalog.
- Batches run sequentially. Each write changes only `is_active`, is filtered by product ID and previewed previous state, and requires the returned ID and desired state. Missing/permission/zero-row/mismatched responses cannot count as success. The network request has a ten-second abort deadline; abort does not prove backend cancellation.
- An unconfirmed request stops later dispatches. The result distinguishes confirmed, already-unchanged, unconfirmed and unattempted products. Confirmed earlier changes are not automatically reversed. The list is reread; retry is an explicit new preview rather than blind replay. The result shown in this UI is not a durable Audit Trail.
- Synchronous batch lock prevents duplicate submissions and competing individual mutations in the same screen. Owner/form lifetime is checked before every queued dispatch; obsolete completion cannot announce success or refresh another account. Already-dispatched writes can complete. Cross-admin transactions and atomic whole-batch rollback are not claimed.
- Successful writes invalidate the existing public catalog cache. The status path writes only is_active; the price continuation below writes only product base price. Stock, image, financial gate, Auth provider and payment state are unchanged.

## Price-management continuation

The selected-products toolbar now previews fixed base prices or percentage increases/decreases. Persian and Arabic digits are accepted. Fixed prices must be positive integer rials up to 99,999,999 (inside the existing numeric(10,2) column); percentages are 0–100 with at most two decimals. Decimal stored base prices, zero results and overflow are refused, not silently coerced. Percentage arithmetic uses integer basis points and rounds half up to a whole rial. The exact old/new price for each product is frozen in the preview; confirming does not recalculate the percentage against a later value.

Only product base prices change. Explicit variant prices and historical orders are not updated. The UI explains this distinction. Each write includes ID and expected old price predicates and confirms the returned ID/new price. Concurrent modifications, missing rows and denied writes stop the remaining queue; partial results are reported and reread, with no automatic rollback or retry. Already-dispatched writes can finish after timeout; this is not a whole-batch transaction or cross-admin lock. The status/price paths share one sequential application executor and the same immediate UI lock, preventing competing status, price and individual operations in the same screen. Server checkout pricing and RLS remain authoritative.

## Category-management continuation

The current storefront has independent classifications: `department` and `category` drive filters, while `category_id` selects the catalog category relation. The batch editor exposes each separately with keep, explicit new value or explicit clearing. It never guesses department/type from a category slug or rewrites legacy classification silently. The available department/type choices match the current product form. Brand, type/pattern attributes and variants remain unchanged; the UI tells the operator to review their suitability after moving a product.

Category choices are loaded lazily when the editor is expanded, with owner-scoped loading/error/retry. Denied or malformed reads do not become an empty success. Preview freezes the exact old/new values for all three classifications. A selected non-null catalog category is rechecked against a fresh category list before the first write. A removed category or denied list read dispatches no product writes. The existing foreign key still handles deletion after that read; this is not a transaction locking the category table.

Only explicitly selected classification fields are written. The adapter compares ID and all three old category values, using `IS NULL` for empty values, and requires the returned ID plus all expected final values. Concurrent edits, missing rows, permission errors or unconfirmed responses stop subsequent rows. The existing sequential executor, partial-result report, lifetime guard and shared operation lock also cover category batches. Successful writes invalidate the catalog cache. A compact department/type column reflects the reloaded saved values. Price, stock, images and financial state are outside this write path.

## Existing-image management continuation

Selected products now have independent image drafts for cover promotion, previous/next ordering, explicit reference removal and reset. A frozen before/after preview is required before any write. Only existing references of that same product are eligible; duplicate occurrences are accounted for separately. No new URLs, upload, file copy or Storage deletion are introduced by this path. Removing from display preserves the stored object, which may be shared elsewhere.

The storefront prefers a nonempty products.images list and otherwise falls back to legacy product_images. The batch path therefore refuses removing the final main-list reference. An initially empty main list is a no-op; this does not enumerate or modify the legacy fallback gallery. Existing lists with unsupported URLs, malformed data or over 50 references require individual review. A changed backing list requires an explicit draft reset rather than silent rebasing.

Writes include the product ID and exact equality of the complete previous text array, including order and duplicate counts, and confirm the returned ID and next order. The adapter escapes quoted array values and bounds the encoded comparison to 6000 characters before dispatch. Parameter behavior was checked against the installed SDK with an intercepted fetch. Array quoting and stale-order rejection were also checked in a disposable loopback-only PostgreSQL cluster. Supabase's [filter documentation](https://supabase.com/docs/reference/javascript/filter) requires raw PostgREST-compatible values; [PostgreSQL's array syntax](https://www.postgresql.org/docs/current/arrays.html#ARRAYS-IO) documents the quoted array representation used here.

The shared batch executor and immediate screen lock cover image/status/price/category operations. Failures stop later rows and preserve partial-result reporting, without automatic rollback, blind retry or file cleanup. Catalog invalidation occurs only after confirmed updates. This protects the new batch write against a stale previous array; it does not retrofit every legacy writer with CAS or prevent an older already-dispatched individual-editor write from completing later. A timeout is not proof of server cancellation. RLS and the existing authenticated browser client remain authoritative; no service-role client, grant, policy, schema or backend route changed.

`npm run test:admin:images:db` runs the reusable PostgreSQL test with no connection URL, inherited libpq credentials or linked-project configuration. It binds only to loopback on a fresh port and verifies/stops/removes only its own temporary cluster. Twelve assertions cover special-character roundtrips and ordered conditional updates. The prepared PR workflow runs this after its PostgreSQL tools setup; hosted CI for Phase 5 has not run.

## Fresh-file image upload continuation

Each selected product has its own multiple-file picker and local thumbnail previews. There is no filename-based product guessing or implicit application of one gallery to every selected row. Products without selected files are omitted. Changing the selection clears drafts and invalidates pending preview work; closing/unmounting previews releases object URLs. The upload requires an explicit frozen confirmation, and cancelling it dispatches no upload.

The complete queue is checked before any network operation: JPEG/PNG/WebP MIME allowlist with matching file headers, nonempty files up to 5 MiB, 1–5 files per product, at most 20 files/40 MiB per batch and 50 final image references per product. Filenames never determine object paths or extensions. Unique UUID object paths include the product UUID, and the signed-in browser client uploads to the existing product-images bucket with upsert:false and explicit contentType. These client checks detect ordinary file mistakes; they are not a decoder, malware scan or substitute for server bucket constraints/RLS. Existing repository migrations restrict product-image inserts to admins; deployed policies were not inspected or changed by this slice.

Existing main-list image order and cover are preserved, with fresh images appended in selected order. If the main list is empty, the operator must explicitly acknowledge that fresh images will replace any legacy fallback in the storefront and the first file becomes the cover. Legacy objects/rows are retained. This path does not enumerate, migrate, reconcile or lock legacy product_images rows. The exact main array is verified before uploading each product and checked again atomically in its metadata update; it does not retrofit CAS into the legacy single-product editor.

Files/products run sequentially under the same owner lifetime and immediate screen lock as status/price/category/image edits. Owner expiry prevents later dispatch, including metadata after a completed upload. Any read, upload or metadata failure stops subsequent products. Only a confirmed returned product ID and final image array count as success. A response lost after an upload or write is treated as unconfirmed, never proof of rollback. No file deletion, automatic retry or compensating overwrite is performed. Attempt paths and upload/link states appear in a local report, and submitted file drafts are cleared to avoid replaying an uncertain batch. The recovery continuation below now persists uncertain paths in this browser before side effects, so navigation/reload no longer loses the only path record. Browser data deletion, another device or another origin still has no shared record; central orphan reconciliation and Audit Trail remain unfinished. In-flight uploads may still settle after logout and may leave unlinked objects.

Implementation follows the current [Supabase upload API](https://supabase.com/docs/reference/javascript/storage-from-upload). No service-role key, schema, bucket setting, grant, policy or backend route changes are introduced. The existing product editor, return-image uploads and payment/Auth flows are retained.

## Local upload recovery and legacy-gallery inspection

Before each storage upload the application persists the exact generated object path with upload-unconfirmed; before each metadata update it persists link-unconfirmed. Responses advance the stored state. Only a confirmed metadata update closes that product's local entries. Failure to persist before a remote effect prevents that effect. Failure to remove a note after a confirmed metadata response keeps a recovery warning; the successful database write is not mislabeled as failed or rolled back.

Journal keys are scoped to the configured client's actual project endpoint, browser origin and signed-in owner UUID. Each path has its own key so distinct object paths from separate tabs do not overwrite a shared JSON array. Only product UUID, object path, stage, version and timestamp are allowlisted; file bodies, original filenames, tokens, customer details and arbitrary properties are not saved. Invalid existing data is preserved and blocks new writes. At 200 unresolved entries, new paths are refused without evicting earlier uncertainty. A larger bounded read allowance lets the operator close notes if concurrent tabs exceeded the write cap. No automatic storage deletion or blind upload replay is added.

The recovery panel lazily lists notes for the current account, offers a copyable JSON report and a read-only check against the named product's current main and legacy arrays. Finding no reference is explicitly not proof of an orphan or proof that deletion is safe: object existence, references from other products and in-flight writers are not established. An explicit close action removes only that browser note. Rechecking never deletes storage objects or changes product metadata. Reload-persistence, pre-upload journal state and absence of storage DELETE were tested in the actual browser with intercepted synthetic HTTP requests.

Selected products can also lazily inspect both main and legacy galleries. A bounded authenticated relationship read requires the exact product ID, validates stored URLs and sorts legacy records by sort_order, matching storefront fallback precedence. Read failure is distinct from an empty gallery; malformed or unsupported data fails closed. This is inspection, not migration: the gallery is not adopted into products.images, and old records/objects are not rewritten or deleted. Existing explicit legacy-replacement confirmation in the upload form is retained. The read uses the current [Supabase select API](https://supabase.com/docs/reference/javascript/select).

This is browser-local recovery, not durable server Audit Trail or cross-device recovery. Clearing browser data can remove notes. A browser or disk crash can still exceed localStorage durability guarantees. Local records are editable by the local user and do not establish authorization or historical truth. RLS remains authoritative. No production/schema/storage-policy changes were made; all new network checks were intercepted in tests.

## Validation

1148 unit/integration tests in 72 files passed (84 new manual-adjustment server/UI checks, retaining the 35 inventory, 27 recovery/gallery, 30 fresh-upload and 24 existing-image checks). TypeScript and lint passed with zero errors/warnings. The isolated build and all 39 synthetic browser scenarios passed, including file-to-product mapping, preview cancellation, append-only galleries and an uncertain metadata response stopping later uploads without file deletion. The upload browser paths now also prove pre-upload journaling, reload-persistence of an uncertain result, read-only reinspection and local-only note closure; a new legacy-gallery browser scenario verifies actual fallback order without metadata writes. Earlier cover/order/reference and stale-image-array browser scenarios remain green. Twelve disposable PostgreSQL assertions passed and the cluster was stopped and removed. The earlier price/status/category/Phase 3 scenarios still pass. Browser APIs are intercepted; no production mutation, payment, message, upload or Storage deletion is used. The synthetic dist must not be deployed. Existing ~877 kB main chunk warning remains. Hosted CI for these uncommitted slices has not run.

## Remaining Phase 5 scope

Selected fresh-file mapping/upload and existing-image ordering/cover/reference editing are locally implemented. Central orphan reconciliation, safe object cleanup and adopting/reconciling legacy gallery references remain unfinished; local path recovery and read-only legacy enumeration are implemented above. Their absence is explicit in the upload report and legacy-replacement confirmation; the whole product-management task is not marked done. Inventory per SKU, adjustment history/low-stock alerts, order/shipping/return/refund workflow, customer/support permissions, meaningful sales/profit/inventory reporting, durable admin Audit Trail and CSV/Excel exports are not completed by this slice. Some depend on unfinished Phase 1/2 backend contracts. Whole Phase 5 remains incomplete; Phase 4 remains deferred.

## Tracking checkpoint

The Notion product-management task was updated to In progress with the implementation/validation note and the content status. Both property and content were reread and confirmed. Async updates returned 503; the documented synchronous fallback succeeded. Whole Phase 5 remains in progress, and nothing in this branch has been committed, pushed or deployed.

The recovery checkpoint was also appended to the Notion task using the working synchronous update, with In progress retained and the saved note reread. Phase 5 remains incomplete.

## Inventory continuation

A separate read/review inventory screen is locally implemented under the second Phase 5 Notion task; see [inventory checkpoint](phase5-inventory.md). It exposes per-variant registered quantity, page-local low/zero/invalid/missing/duplicate SKU review and bounded owner-scoped pagination. The new manual adjustment/history path is now locally implemented and tested separately. Complete legacy-writer/reservation coverage and hosted rollout remain open; this does not complete the inventory task or enforce all database stock writers. Both product and inventory tasks remain In progress in Notion, with implementation notes reread after saving.

Manual inventory correction and private history are now locally implemented, with frozen delta/reason preview, guarded server RPCs, exact-key pending recovery and 99 disposable SQL/HTTP checks including five real races. Both actual activation gates remain off and no hosted migration ran. See [manual adjustment checkpoint](phase5-inventory-adjustments.md); the whole inventory task remains incomplete.


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
