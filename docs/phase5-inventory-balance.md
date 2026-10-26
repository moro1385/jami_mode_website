# Phase 5 inventory balance report — local checkpoint, 2026-10-24

The admin inventory screen now offers an explicit read-only report per variant. It does not refresh, expire, release, settle or change any stock/order. A separate default-off server flag `JAMI_INVENTORY_REPORTS_ENABLED` gates `/api/admin/inventory/balance`; reading does not require adjustment activation, browser journal access or Web Locks. Both existing stock-write gates and the new actual report flag remain unchanged/off in real environments. No deployment, hosted migration, commit, push or merge occurred.

## Quantity definitions

| Report field | Definition and limit |
| --- | --- |
| available | Current nonnegative variant stock_quantity, or null when invalid. The trusted v2 checkout already deducted reservations from this number, so do not subtract reserved again. This is not a physical count; product publication/out-of-stock flags still restrict sale. |
| reserved | Positive item quantities for matching product/variant on checkout v2, pending_payment/pending orders with an existing unreleased reservation. |
| overdue | Subset of reserved whose deadline passed. Deadline alone never proves nonpayment or eligibility for release. Started payment attempts can remain held; this report does not run expiry. |
| paid | Positive quantities on matching v2 orders with payment_state paid. This is a count recorded on paid orders, not shipped quantity, net sales, net returns or physical stock. |
| released | Positive quantities on matching v2 cancelled/pending-payment orders with released_at set, matching the existing expiry result. This is historical release quantity, not an additional pool to add to current stock. Inconsistent paid-and-released records are flagged for review and excluded here. |
| legacy | Positive matching quantities on orders outside v2. Their stock effect is not inferred from these records. |
| reviewLines | Item rows with wrong/missing product identity, invalid quantity, missing v2 reservation, or unrecognized v2 reservation/payment/status combination. No physical or all-time net inventory can be reconstructed from this report. |

Counters are exact decimal strings, not JavaScript floating-point numbers; rendering uses BigInt. There is deliberately no available+reserved+paid total. Non-variant products, pre-protection deletions, imported opening balances, privileged stock writes and return/refund inventory reconciliation remain outside this report.

## Authorization and consistency

The server validates bearer identity with getUser, checks the current admin role, allowlists the two UUID query fields, binds the actor itself and strips unexpected result data. The database service-role-only SECURITY INVOKER function rechecks the admin role and uses an empty search_path. No new SECURITY DEFINER, browser RPC grant, private reservation exposure or broader RLS policy is introduced. Responses use no-store and bounded HTTP deadlines. A new partial variant_id index on order_items supports the per-variant read.

Stock, orders, reservation state and all counters are evaluated in one SQL SELECT snapshot, timestamped by the statement. Concurrent uncommitted updates are not mixed with old reservation values. There are no read locks that modify state. The approach follows [PostgreSQL read committed snapshots](https://www.postgresql.org/docs/17/transaction-iso.html) and [Supabase function permissions](https://supabase.com/docs/guides/database/functions).

CLI generated the local migration `20261024191318_phase5_inventory_balance_report.sql`; its exact bootstrap copy and normalized hashes bring the synthetic replay to 35 migrations. Index creation is ordinary transactional creation, so review hosted table size/lock impact before any separately approved staging/production migration. Setting a function-local timeout is defense in depth; the existing HTTP deadline does not establish cancellation of every already dispatched database statement.

## Verification

- 1195 unit/integration tests in 76 files passed. The 29 new tests cover report authorization/default-off gating/selection/result validation, exact large counters, matching owner token, late responses, no fabricated zeros, retry, and a UI that shows 8 available and 2 reserved without rendering 6.
- 42 offline browser scenarios passed, including two new report-ready/report-disabled paths from the actual inventory page. All browser backend calls are intercepted synthetic fixtures.
- 33 new real disposable SQL/HTTP assertions and one concurrent-session observation passed. Actual trusted checkout deducts stock; an overdue started payment stays reserved; synthetic claim/attach/settle moves units into the paid column without a second stock decrement; actual unstarted expiry restores stock once. A report during uncommitted stock/payment changes sees only the old coherent snapshot, and a report after commit sees the new one. Legacy/missing-reservation/inconsistent paid-release rows are classified and a real loopback HTTP route reads the actual SQL function. Provider values and server identity are synthetic; no real gateway/Auth call occurs.
- The preceding 39 boundary assertions and 99 adjustment assertions/five races were rerun and passed. Fresh complete 35-migration synthetic bootstrap replay passed. The disposable runner stopped and removed its own cluster. TypeScript, lint, isolated build, bootstrap parity and diff checks passed. The existing main chunk warning around 877 kB remains; the synthetic dist is not deployable. Hosted CI/real Supabase Auth/PostgREST compatibility checks remain unperformed.

A new missing-reservation test fixture initially violated the existing trusted_order_money constraint because it inherited legacy defaults; the fixture was corrected with explicit pending/gateway/shipping values. No production constraint was weakened or test skipped. Release counting was narrowed during review so paid/released inconsistencies appear as review items rather than apparent valid releases.

## Remaining work

Durable per-SKU low-stock thresholds/notifications, complete movement history/physical stock/net returns, global SKU reconciliation, cross-device recovery, variant archival and reviewed rollout remain open. This report is one tested local slice, not completion of the inventory task or Phase 5. The wider order/refund, customer/support, image cleanup, reports/profit and Audit Trail/export tasks also remain open.


## Persistent low-stock policy continuation — 2026-10-24

Per-variant central thresholds and panel alerts are locally implemented with reasoned preview/confirmation, revision conflict protection and private append-only receipts. Zero and disabled null are distinct. The temporary page filter remains independent; saved alerts are evaluated in the variant policy dialog on read, not by a global scheduler or notification inbox. No stock/order is edited. Both real policy gates remain closed and the CLI-created migration ran only in disposable PostgreSQL. See [policy implementation, evidence and limits](phase5-inventory-low-stock-policy.md). Latest checks: 1230 tests/78 files, 45 offline browser scenarios, 45 new SQL assertions/one race plus preceding inventory checks and fresh 36-migration bootstrap passed. Hosted rollout, global warning list/delivery/acknowledgment and complete movement accounting remain open; Phase 5 is still in progress.


## Global saved alert queue continuation — 2026-10-24

The inventory page now lazily opens a server-paginated queue of all enabled saved policies currently low/zero/invalid/missing, independently of product-page filters/caps. Stable UUID cursors, owner scoping and allowlisted results protect pagination; live pages can change and should be restarted for new warnings. Existing policy/adjustment/reservation dialogs are reachable from each valid entity; missing references are read-only and visible for review. Viewing never acknowledges or suppresses a warning. See [queue scope, evidence and remaining handling work](phase5-inventory-alert-queue.md). 1263 tests/80 files, 47 synthetic browser scenarios, 32 new SQL checks plus all previous inventory checks and fresh 37-migration bootstrap passed. No hosted migration/activation/deployment/commit/push occurred; persistent handling/delivery and whole Phase 5 remain open.
