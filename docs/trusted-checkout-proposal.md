# Proposed trusted checkout: separate follow-up work

This is an architecture and rollout proposal, not implemented checkout code or
executable migrations. The containment PR does not make gateway checkout safe.

## Current unresolved risks and evidence

| Area | Repository evidence | Required behavior |
| --- | --- | --- |
| Price and shipping | `src/pages/checkout/CheckoutPayment.tsx` computes subtotal/shipping and writes total and item prices; `server/bitpay-routes.js` charges the stored total | Reprice from authoritative catalog and shipping rules inside trusted checkout |
| Item identity | Cart uses productId plus free-text size/color; checkout stores null variant_id and customer-controlled snapshots | Validate real catalog selection and product/variant relationship; derive all display snapshots |
| Item/order agreement | Orders and items are inserted separately; no total-vs-lines invariant | One transaction creates the complete immutable order and its totals |
| Stock | `src/services/products.ts` fabricates one variant and uses a boolean availability flag; no trusted reservation/decrement path | One documented product/variant inventory model with atomic reservations |
| Initialization | Repeated init overwrites a single payment_ref; no durable attempt/idempotency model | Immutable payment attempts and serialized/idempotent initiation |
| Verification | Read/check/update status races; cancellation can overwrite success; order persistence errors are ignored | Monotonic transactional settlement; success only after committed persistence |
| Wallet | Legacy credit is read-modify-write, separate from marking top-up paid | Ledger credit and balance change in one transaction, once per payment |
| Recovery | Verification depends on the returning browser; transaction IDs are unique separately in orders/topups | Provider reconciliation plus merchant-wide uniqueness and durable retry |

The restrictive item INSERT policy blocks ordinary post-init appends but is not a
transactional freeze: a concurrent INSERT can read the pre-init snapshot while
initialization proceeds. Nothing here prevents an underpriced, negative-quantity,
incomplete or stale-catalog order from reaching the remaining gateway path.

## Proposed trust boundaries

The browser sends only product/variant selection, positive integer quantities,
an owned address identifier, a shipping option identifier and an idempotency key.
It cannot choose status, price, discount, shipping charge, payment identifiers,
wallet debit, inventory mutation or trusted snapshot text.

Express/Edge middleware verifies the current user via Auth before sensitive
operations. A private checkout transaction accepts the server-authenticated user
identity; its EXECUTE privilege is granted only to the dedicated trusted server
role. Revoke default PUBLIC/anon/authenticated execution on new privileged
functions. Use fully qualified names, an empty pinned search_path, and a reviewed
non-superuser owner with the minimum required privileges. Do not expose a generic
"create order for user_id" SECURITY DEFINER RPC to customer roles.

Read-only customer access remains ownership-scoped through RLS. Service-role
secrets remain server-only. Fulfillment admins may advance allowed fulfillment
states after payment/stock checks; they cannot set payment status through generic
table updates. Manual payment/refund overrides require a separate audited action.

## Proposed schema and transaction model

1. **Catalog and money.** Decide the inventory unit first: actual variants for
   size/color selections, or an explicitly supported product-only model. Enforce
   variant-to-product relationships and valid combinations with foreign keys and
   unique keys. Store rial amounts as bounded integers (bigint or exact integral
   numeric), never round a mismatched gateway amount into acceptance. Decide
   whether free products are supported; require positive payment totals.
2. **Checkout/idempotency.** Add a checkout request table keyed by
   `(user_id, idempotency_key)` with a canonical request fingerprint. Same key +
   same request returns the same order; different content returns a conflict.
   Reprice active selections, validate the owned address, apply server shipping
   rules, and create order + item/address/price snapshots in one transaction.
   Reject changed prices or return an explicit quote requiring customer approval.
3. **Inventory reservations.** Lock inventory rows in deterministic order and
   atomically check available stock before reserving. Keep durable reservation
   rows keyed by order/variant with positive quantities and an expiry. Releasing
   or consuming a reservation is idempotent. Do not hold DB locks during network
   calls. A late payment after reservation expiry needs reallocation or a refund
   workflow; it must never silently trigger an unfulfillable shipment.
4. **Payment attempts.** Add attempts with order/top-up association, immutable
   expected amount/currency, merchant/provider namespace, unique provider
   reference, timestamps and a constrained lifecycle. A merchant payment registry
   enforces unique `(provider, merchant_account, transaction_id)` across purchase
   and top-up flows. Repeated initiation reuses/serializes a current attempt. If
   the provider has no create idempotency, persist ambiguous outcomes for
   reconciliation instead of blindly creating another charge session.
5. **Settlement.** Verify with the provider outside the DB transaction. Validate
   exact expected amount/currency, reference/transaction binding and merchant
   identity using the provider's documented contract. Then lock/claim the attempt
   and settle once in a DB transaction, updating payment state, reservations and
   ledger records together. A duplicate successful callback returns the committed
   result. Untrusted browser cancellation is advisory and cannot downgrade a paid
   attempt. A DB error cannot produce a success response.
6. **Wallet ledger.** Use append-only credits/debits with unique operation IDs,
   order/top-up references and actor/audit metadata. Maintain a locked balance
   cache or compute from the ledger; insufficient funds rejects the whole wallet
   purchase transaction. New top-up settlement inserts its ledger credit and
   updates the balance/attempt together. Define opening balances through reviewed
   reconciliation: historical profiles/orders are not proof of legitimate funds.
7. **Outbox/reconciliation.** Write fulfillment/notification events into an outbox
   in the settlement transaction. Consumers tolerate duplicate delivery. A trusted
   reconciliation worker finds pending/ambiguous attempts, verifies provider
   state, and retries the same settlement operation when browsers never return.
   Do not assume undocumented Bitpay retry/status behavior; verify it separately
   without making payments during this PR.

Separate payment state (`pending`, `paid`, `failed`, `refund_pending`, `refunded`)
from fulfillment state (`unallocated`, `reserved`, `processing`, `shipped`, etc.).
Define and test the allowed transition table before implementing it.

## Proposed forward migration and rollout sequence

1. **Keep containment and suspension.** Resolve the target/schema drift and all
   exposed function/view paths. Pause new gateway initiation if its known pricing
   exposure cannot be explicitly accepted while follow-up work proceeds. Retain
   controlled verification/reconciliation of already initiated payments.
2. **Additive schema only.** Introduce attempts/registry/idempotency/reservation/
   ledger/outbox tables in private schemas where practical, RLS/grants and
   constraints. Add new money/state/version columns without treating historical
   rows as validated. Use an explicit legacy version marker. Build necessary
   unique indexes using an appropriately reviewed deployment strategy; do not
   introduce blocking constraints over unreviewed historical rows.
3. **Trusted routines and tests.** Install tightly scoped service-only transaction
   functions. Add concurrency, crash/retry, ownership and state-machine tests on
   disposable Supabase. Verify catalog and shipping fixtures; generate types only
   from the reviewed disposable schema.
4. **Introduce versioned endpoints.** Add trusted create/init/verify/reconcile
   endpoints with test-provider adapters. Shadow comparison may evaluate prices
   without initiating payment, reserving stock twice, or marking anything paid.
   Avoid dual writes to old/new settlement systems.
5. **Cut over creation.** Stop new legacy creation first. Route the new client to
   trusted checkout; revoke direct customer INSERT on orders/order_items and
   restrict admin payment-field updates. Cached clients must fail closed and
   refresh rather than continue the old pricing path.
6. **Drain old attempts.** Dispatch verification by a trusted stored version, not
   a caller-selected mode. Reconcile existing payments through a reviewed legacy
   adapter. Keep the old return URLs reachable; do not replay ledger credits or
   auto-confirm ambiguous historical orders.
7. **Restore wallet only after proof.** Reconcile opening balances and legacy
   credits; prove exactly-once ledger settlement and concurrent debit safety.
   Re-enable spending/top-up creation deliberately with monitoring and a kill
   switch. UI flags cannot grant database financial permissions.
8. **Retire legacy paths.** Remove old write endpoints/functions only after all
   in-flight payment attempts are resolved and retention/audit requirements met.

## Required test and acceptance evidence

- Cross-user/anonymous calls and direct REST/RPC/table writes fail under actual
  anon/authenticated roles, including FOR ALL policies and inherited grants.
- Two buyers racing for the last unit cannot both reserve it; duplicate retries
  cannot reserve/debit twice. Expiry and payment completion races conserve stock.
- Forged prices, shipping, selections, quantities and negative/overflow values
  cannot change the charged amount or order snapshots.
- Parallel/reordered callbacks, init retries, timeouts, provider-already-verified
  responses, process crashes and DB failures produce one durable settlement.
- Wallet balance equals reconciled opening funds + ledger credits - debits;
  concurrent checkout/top-up/refund does not lose or manufacture funds.
- No paid transition depends on the client success URL. Fulfillment consumes only
  committed paid/allocated orders; duplicate outbox messages are safe.
- Legacy return URLs work during cutover. Provider transport is mocked for local
  tests; live provider contract/sandbox validation needs its own authorization.

## Forward-fix rollback

Suspend new initiation while preserving reconciliation and existing callback URLs.
Keep additive schema, financial permission revocations and committed ledger facts.
Fix the new routines/endpoints forward; never re-enable client-authored amounts or
wallet updates as a rollback. Correct mistaken financial entries through audited
compensating ledger operations, not historical record deletion or silent edits.
