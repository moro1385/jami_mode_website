# Phase 5 inventory write boundary — local checkpoint, 2026-10-24

The actual saved-product form now mounts ProductVariantsManager alongside images. The component existed but previously had no production caller; prior component tests alone did not establish that it was reachable. A new full browser scenario opens the actual product form, creates a variant at zero and opens the closed adjustment capability. The edit/add controls now have accessible names. Variant stock edits continue through the already implemented reason/preview/receipt/history path.

## Permanent deletion policy

Physical product/variant deletion is intentionally closed for browser administration, including empty variants. Product deletion originally used foreign keys that set order item identities to NULL and cascaded variants. A browser read-then-delete check would race with checkout or another stock writer, so it is not used as a protection. Use the existing draft status to stop product display/sale while retaining identities. Variant-specific archival and reviewed server-side deletion of unused records remain future work; this checkpoint does not invent either workflow. Service and repository deletion methods refuse before sending any request; delete buttons are removed and explanatory text is visible.

## Database boundary prepared locally

Supabase CLI 2.117.0 generated `20261024143147_phase5_inventory_write_boundary.sql`. Only its local file and disposable PostgreSQL tests were used. Hosted staging/production migration, activation, release, commit, push and merge remain unperformed.

The transaction revokes browser-role DELETE/TRUNCATE on products/variants and table-level INSERT/UPDATE on variants. It clears prior column grants before granting only INSERT(product_id,size,color,sku,price) and UPDATE(size,color,sku,price) to authenticated. Existing RLS still requires admin for these writes. Stock, variant identity, parent reassignment, creation time and import identity cannot be changed through this browser table path. The adapter explicitly omits stock_quantity on insertion, relying on the existing zero default; the migration refuses a different default. Authenticated inserts that explicitly supply even zero stock are denied, so old clients must be released in coordination with this migration.

Inherited remaining grants or missing RLS abort the migration transaction. No RLS policy is broadened, new privileged routine or trigger added, data deleted, stock rewritten, or history erased. The service_role/table owner retain their existing trusted capabilities; privileged scripts/SQL are outside this browser boundary. The manual ledger still does not contain every reservation, expiry or privileged movement. The two real adjustment gates remain unchanged/off. The boundary migration itself takes effect when applied, independently of those gates, so staged compatibility review is essential.

The grants design follows [PostgreSQL column privileges](https://www.postgresql.org/docs/17/sql-grant.html) and [Supabase column level security](https://supabase.com/docs/guides/database/postgres/column-level-security).

## Verification

- 1166 unit/integration tests in 74 files passed, with bounded two-worker execution. Four new assertions cover deletion refusal in service/repository without a network call; existing transport tests now require stock to be omitted from insert. An initial complete run had STACK_TRACE_ERROR failures during tool scheduling disruption; the successful rerun did not skip tests or increase timeouts.
- 40 offline browser scenarios passed, including the new actual saved-product editor/zero-stock creation/closed adjustment flow. These requests are intercepted synthetic fixtures, not live Supabase Auth/PostgREST acceptance.
- 39 new real disposable SQL assertions passed: admin/customer denied stock writes, forbidden parent moves, zero default, allowed admin metadata, customer RLS, product draft without identity deletion, historical column grant cleanup, inherited privilege rejection and service-role compatibility.
- All 99 existing adjustment SQL/HTTP assertions and five actual concurrent-session races were rerun after the new boundary and passed, including checkout/expiry/replay behavior. The temporary runner stopped and removed its own cluster.
- All 34 migration bootstrap copies/hashes/order matched; full fresh synthetic bootstrap replay passed. TypeScript, lint and isolated build passed; the existing main chunk warning around 877 kB remains. The built synthetic dist must not be deployed. Hosted CI and actual hosted Auth/PostgREST acceptance remain pending.

The disposable SQL helper initially interpreted psql's INSERT tag as a UUID; fixed by querying the persisted ID separately. An anonymous draft read encountered the already documented baseline has_role policy issue (corrected only by existing test-bootstrap/fixes.sql); this boundary test now tests the intended authenticated customer RLS without changing or broadening that unrelated production policy.

## Remaining

This completes the prepared browser stock-write boundary and closes browser hard deletion; it does not complete Phase 5. Available/reserved/sold definitions, durable low-stock policy, global SKU reconciliation, full movement audit, cross-device recovery and variant archival/deletion workflow remain. Real staging compatibility and coordinated server/client/migration release require separate approval. Phase 5 order/refund, customer/support RBAC, reports, image cleanup and global Audit Trail/exports remain open.


## Read-only reservation balance continuation — 2026-10-24

The inventory page now offers per-variant current stock, open/overdue reservations, recorded paid quantities, released history, legacy quantities and review counts from a coherent server/SQL snapshot. Trusted v2 reservations are already deducted from stock; no second subtraction occurs. This is not physical inventory, net returns or a full stock ledger. The independently gated report remains off in real environments and no hosted migration/release occurred. See [quantity definitions, verification and limits](phase5-inventory-balance.md). Latest evidence: 1195 tests/76 files, 42 offline browser scenarios, 33 balance SQL/HTTP assertions with one concurrent observation plus all preceding 39 boundary and 99 adjustment/five-race checks, and full fresh 35-migration bootstrap passed. Durable low-stock policy, complete movement definitions and reviewed rollout remain open.


## Persistent low-stock policy continuation — 2026-10-24

Per-variant central thresholds and panel alerts are locally implemented with reasoned preview/confirmation, revision conflict protection and private append-only receipts. Zero and disabled null are distinct. The temporary page filter remains independent; saved alerts are evaluated in the variant policy dialog on read, not by a global scheduler or notification inbox. No stock/order is edited. Both real policy gates remain closed and the CLI-created migration ran only in disposable PostgreSQL. See [policy implementation, evidence and limits](phase5-inventory-low-stock-policy.md). Latest checks: 1230 tests/78 files, 45 offline browser scenarios, 45 new SQL assertions/one race plus preceding inventory checks and fresh 36-migration bootstrap passed. Hosted rollout, global warning list/delivery/acknowledgment and complete movement accounting remain open; Phase 5 is still in progress.


## Global saved alert queue continuation — 2026-10-24

The inventory page now lazily opens a server-paginated queue of all enabled saved policies currently low/zero/invalid/missing, independently of product-page filters/caps. Stable UUID cursors, owner scoping and allowlisted results protect pagination; live pages can change and should be restarted for new warnings. Existing policy/adjustment/reservation dialogs are reachable from each valid entity; missing references are read-only and visible for review. Viewing never acknowledges or suppresses a warning. See [queue scope, evidence and remaining handling work](phase5-inventory-alert-queue.md). 1263 tests/80 files, 47 synthetic browser scenarios, 32 new SQL checks plus all previous inventory checks and fresh 37-migration bootstrap passed. No hosted migration/activation/deployment/commit/push occurred; persistent handling/delivery and whole Phase 5 remain open.
