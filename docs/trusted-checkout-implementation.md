# Trusted checkout implementation — local changes, 2026-10-17

**Decision: NO-GO for production release.** The implementation and local database tests described below are complete. New gateway order creation/initiation and all new wallet operations remain disabled in the default Express router. A reviewed provider adapter and real disposable Supabase integration evidence are required before enabling checkout.

Work stayed on `security/first-containment`. No branch switch, stash, reset, commit, push, merge, deployment, production database access, provider request, or live catalog request was performed. Existing containment/auth/admin work and the review archive were preserved. The existing payment routes and their tests were updated to use transactions instead of preserving the unsafe financial writes they previously contained. Historical migrations were not edited.

## Exact files changed in this implementation

Paths are relative to the repository root. Files already dirty before this task remain dirty; this list distinguishes this task's changes from the earlier containment work.

| File | Change |
| --- | --- |
| `package.json` | Adds `test:checkout:db` and `build:isolated`; preserves previous scripts. |
| `server/bitpay-routes.js` | Authenticated quote/create endpoints; durable initiation; stored-version callback dispatch; exact verification bindings; transactional settlement; default gateway suspension. |
| `src/pages/checkout/CheckoutPayment.tsx` | Removes direct order/item writes; requests and confirms server quote; persists checkout retry key. |
| `src/pages/checkout/CheckoutVerify.tsx` | Clears purchase retry key only after server-confirmed success. |
| `src/components/admin/ProductFormDialog.tsx` | Required insert name and safe error narrowing. |
| `src/components/admin/ProductImagesManager.tsx` | Safe error narrowing. |
| `src/components/admin/ProductVariantsManager.tsx` | Safe error narrowing and typed editable-field update payload. |
| `src/pages/admin/AdminProducts.tsx` | Safe error narrowing, including removal of unsafe Error assertions. |
| `src/components/CartSync.tsx` | Validates persisted cart JSON instead of asserting it is a CartItem array. |
| `src/lib/cartSync.ts` | Runtime cart validation and JSON-compatible cart serialization. |
| `src/lib/errors.ts` | Error-message extraction from unknown errors, including plain PostgREST errors. |
| `src/integrations/supabase/types.ts` | Aligns cart/product types to existing replacement-cart and out-of-stock migrations. No production type generation. |
| `src/test/bitpayRoutes.test.ts` | Updates old handler tests to the transactional API; tests auth, default suspension, provider bindings, ambiguous retries, commit errors, and legacy dispatch. |
| `src/test/financialContainment.test.tsx` | Updates checkout tests for server quote confirmation, stable keys, no direct financial writes, and cart retention. |
| `supabase/migrations/20261017180000_trusted_checkout.sql` | New forward migration with transactional checkout/settlement, private records, locks, grants, guards and constraints. |
| `supabase/tests/trusted_checkout.sql` | Actual PostgreSQL validation, ACL, settlement, rollback, ledger and compatibility assertions. |
| `scripts/test-trusted-checkout-db.mjs` | Fresh loopback-only temporary PostgreSQL cluster; never accepts a connection URL or loads application secrets. |
| `scripts/trusted-checkout-races.mjs` | Independent-process PostgreSQL races for item freezing, callbacks, last-unit allocation and payment claims. |
| `docs/trusted-checkout-implementation.md` | This implementation record and release gates. |

The pre-existing `scripts/build-isolated.mjs`, `scripts/test-security-db.mjs`, containment migration, auth-return work, auth/profile tests, admin containment tests, wallet UI suspension, and proposal were retained. The old containment runner deliberately reproduces its old item race; the new runner demonstrates that the forward migration closes it.

## Implemented trust boundary

The browser submits an address ID, shipping-option ID, product/variant selections, quantities, idempotency key, and the server quote fingerprint on confirmation. It submits no prices, shipping amounts, discounts, titles, status, or wallet mutations. Extra financial fields are rejected. Express resolves the user with `auth.getUser`; the database RPC accepts that server-resolved identity and is executable only by `service_role`. All new routines use invoker security and an empty pinned search path; no customer-callable definer routine was introduced.

`trusted_checkout` validates owned address, active catalog, valid options, positive integral quantities (1–100), variant/product membership, exact size/color matching, and stock. Products without variant rows use an explicit product-only availability model; configured sizes/colors must still match. Products with variant rows require exactly one matching variant. Ambiguous/missing variants fail closed. Product-only rows have no quantitative inventory model, so no claim of last-unit stock protection applies to them.

Catalog money is accepted only if positive, integral and bounded. Arithmetic uses bigint rials. Shipping is read from private server rules (`express`: 2,000,000 rials; `tipax`: zero prepaid shipping, carrier collects later), matching the existing shipping choices. Discounts and free-product checkout are unsupported. Total must be 5,000–99,999,999 rials, within both the existing numeric schema and this version's supported range. These business limits require review before release; decimal catalog prices are rejected, never rounded.

Quote confirmation recalculates current authoritative snapshots and compares the fingerprint. Changed price, address, shipping, unavailable stock, inactive products or invalid selections cannot silently charge a stale quote. Creation writes order, item/title/option/address/price snapshots, inventory deductions, retry record and freeze in one transaction. The same user/key/request returns the original result; changed request content conflicts. Quote retries after creation return the original persisted quote.

Customer direct order INSERT and item INSERT/UPDATE/DELETE are revoked and blocked with restrictive policies, even in the presence of permissive policies. Every item mutation also locks its parent order and checks the latest freeze/payment references. This includes privileged/concurrent inserts and FK-driven changes; catalog deletion that would alter frozen references is intentionally refused. Admin payment-field changes remain blocked by the earlier containment guard; fulfillment remains compatible.

Variant inventory is deducted at checkout, under deterministic product locks. This is durable allocation without automatic expiry/release. There is no automatic stock release or refund workflow in this version. Abandoned checkout allocations need reviewed reconciliation; do not enable new checkout until that operational policy is approved.

## Payment and wallet behavior

An attempt stores expected amount/currency, merchant namespace, provider reference, transaction reference, version and constrained state. Unique keys prevent duplicate attempts per order/topup and reuse of provider references/transactions in the merchant namespace. An update guard prevents modifying payment terms and downgrading settled attempts. Historical transaction IDs in the old tables are also checked before new settlement.

Initiation commits `creating` before calling the injected adapter. Only the claimant may call provider create. Ready retries reuse the same reference; `creating` retries return `PAYMENT_AMBIGUOUS` without issuing another request. A timeout/crash/attachment-write failure leaves durable evidence for reconciliation, not permission to create another session. No DB lock is held over provider HTTP calls. All financial routines lock parent → attempt → wallet profile consistently.

Verification runs outside the settlement transaction. V2 evidence must match exact amount, merchant, provider reference and transaction. Settlement then locks and checks the persisted attempt and commits order/topup state, wallet credit/balance, attempt state and outbox together. Duplicate settlement returns committed success. A database failure returns no payment success. Browser cancellation is advisory and never downgrades the database state.

Legacy return URLs remain present. The database selects version 1 only for existing orders/references or old topups, and will not adopt a new v2 order as legacy. Previously settled topups are adopted as already settled without crediting again. A new verified legacy credit is recorded exactly once in an append-only table and increments the existing locked balance atomically. Historical balances are never reset or invented. Pre-existing partial legacy writes and underpriced historical orders still require reconciliation; this migration cannot retroactively establish trusted pricing or prove historical wallet funds.

The compatibility adapter retains the existing Bitpay status/amount protocol, now with exact integral amounts and atomic database writes. Its API-key-scoped request binds the submitted references, but the repository does not establish a documented merchant/reference echo or already-verified response contract. It deliberately does not treat undocumented responses as success. That limitation remains isolated to version 1 and requires external verification. A stable server-side `BITPAY_MERCHANT_ACCOUNT` namespace must be configured for legacy lookup; `BITPAY_API_KEY` must correspond to that account. No account identifiers or actual keys were used locally.

The exported `createPaymentRouter` accepts a tested provider adapter interface (`create`, `verify`, `redirect`). The default router passes no v2 adapter, so `/checkout` and `/init` return 503 before allocating stock/claiming an attempt. `/checkout/quote` remains available. No environment flag can enable an unreviewed v2 adapter. A complete full-wallet ledger/debit/opening-balance reconciliation is not implemented, so wallet spending and new topups remain disabled at the UI/API/database boundaries.

## Validation evidence

| Check | Result |
| --- | --- |
| `npm.cmd test` | 83 tests passed, 7 files. Includes auth/signup helpers, admin compatibility and logged-out return/password/OTP flows. Network/provider clients are mocked. |
| `npm.cmd run typecheck` | Passed; **0 diagnostics**, down from the 15 initial diagnostics. No `any`, ts-ignore or unsafe casts were introduced to fix them. |
| `npm.cmd run lint` | Passed; 0 errors, 14 existing hook/refresh warnings. |
| `node scripts/build-isolated.mjs production` | Passed. Root `.env` and inherited application credentials excluded; sitemap generator not run. Existing chunk-size and Browserslist-age warnings remain. |
| `npm.cmd run test:security:db` | Preserved containment suite passed: 73 permission assertions, 11 migration refusal/rollback scenarios. Its old race reproduction is expected and is labeled as a blocker for containment alone. |
| `node scripts/test-trusted-checkout-db.mjs` | Passed on fresh PostgreSQL 17 with synthetic Auth roles/schema, including forged values, invalid quantities, wrong variants, foreign addresses, stale catalog, frozen item writes, idempotency, exact binding, failure injection, rollback, wallet double-credit, signup/admin compatibility and four independent-process races. |
| JavaScript syntax / `git diff --check` | Passed. |

The Windows sandbox blocked esbuild directory traversal and PostgreSQL restricted-token creation. The test/bundle commands succeeded outside that sandbox after tool approval. The scripts still used only synthetic clients or new temporary loopback databases. Docker was unavailable; a full disposable Supabase stack was not run. PostgreSQL fixtures do **not** prove Supabase Auth/PostgREST behavior.

## Migration dependencies and manual release gates

1. Review the actual target schema and permissions **offline or in disposable staging first**. The migration depends on the earlier containment migration, original order/address/Bitpay/topup tables, and catalog detail/colors/out-of-stock migrations. It has an explicit catalog preflight and rejects inherited customer EXECUTE grants. The repository's historical migration ordering is inconsistent (some product ALTER migrations predate table creation); tests use a named dependency-correct subset. This is not proof that all historical migrations replay from empty. No historical migration was changed to hide this issue.
2. Apply the additive migration to a real disposable Supabase instance and verify Auth/signup, service RPC execution, private-schema isolation, PostgREST permissions, actual schema types, admin fulfillment, old/new clients, and browser return flows. Regenerate/compare client types from that reviewed disposable schema. Docker/Supabase integration and advisors remain unrun release gates.
3. Obtain the provider's documented sandbox contract without using production credentials. Verify create idempotency (or deliberate ambiguity handling), merchant/account/reference binding, exact rial units, duplicate/already-verified results, timeouts and reconciliation/status lookup. Implement the v2 adapter and callback URL construction against that contract; the default runtime intentionally has none. This work requires separate authorization before any provider activity.
4. Implement/validate an operational reconciliation worker and outbox delivery. The implementation persists ambiguous attempts and outbox events; it does not deliver notifications or automatically recover unknown provider outcomes. Test crash recovery with the reviewed provider adapter before enabling new payments.
5. Review shipping/rial limits and catalog variant/product-only semantics. Decide the allocation expiry/release/refund policy and validate it, including late payments, before enabling checkout. Validate legacy orders separately for fulfillment; they retain version 1 and may contain historical client-authored prices.
6. Reconcile existing wallet balances and pre-existing partially settled topups before implementing a full debit/credit ledger and enabling wallet operations. The new legacy-credit delta table is not a reconstruction of historical balances.
7. Roll out server and migration as a coordinated cutover with old initiation stopped. Do not run old nontransactional settlement code alongside the new routines. Forward rollback is suspension of new creation/initiation while preserving the additive schema, financial permission restrictions, committed ledger facts and return/reconciliation paths. No rollback should restore client financial writes.

The database runner's exact prerequisite subset is `20260817121647_cb255752-e179-4ab4-8fd9-fa53002fe795.sql`, `20260817121702_1fe1a749-b749-4285-a54f-8c8a6d547e42.sql`, `20260901000000_checkout_schema.sql`, `20260901000001_checkout_schema_fix.sql`, `20260902000000_fix_orders_rls_and_address.sql`, `20260921122000_add_bitpay_columns.sql`, `20260922000000_create_wallet_topups.sql`, `20260817122100_add_product_details.sql`, `20260817122200_add_product_colors.sql`, and `20260921000000_add_out_of_stock.sql`, followed by `20261017143036_first_security_containment.sql` and the new migration. The cart TypeScript correction additionally reflects `20260920154818_replace_carts_schema.sql`; it does not authorize replaying that destructive historical migration against existing data.

The Supabase CLI could not create a migration because it attempted a denied telemetry write outside the workspace (also failed with telemetry-disable configuration). The forward file was created directly as an explicit tooling exception. This does not authorize applying it anywhere. Production remains **NO-GO** until the above gates have real integration evidence and a separately approved release.
