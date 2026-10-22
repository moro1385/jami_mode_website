# Wallet ledger and atomic purchase

Prepared implementation; not permission to deploy or enable wallets.

## Accounting and trust

All money uses integer IRR with a safe-integer cap. Private RLS tables hold an observed opening balance, current balance, immutable opening-review attestation, immutable credit/debit entries, and durable events. An opening snapshot preserves the existing profile balance without resetting it or replaying historical top-ups. It is an observation, not proof of legitimate funds. `trusted_wallet_review_opening` requires the exact opening, SHA256 of independently reviewed evidence, case reference and operator label before spending. The operator label is asserted by trusted server tooling, not an authenticated browser administrator. A hash identifies bytes; it does not authenticate evidence.

No profiles are backfilled by installation. Accounts are observed lazily under the profile lock during an old verified top-up or explicit opening review. Historical credits before observation are contained in the opening and are never credited again. Invalid historical money stops the operation for review. Opening mismatches cannot silently rewrite money. The non-mutating operational `trusted_wallet_reconcile(user)` returns managed/reviewed/consistent and compares opening plus all deltas with both account and profile balances. It takes the profile row lock for a coherent comparison and must run in a regular transaction, not BEGIN READ ONLY. It never repairs a mismatch or invents credit.

## Credit and debit

The existing trusted legacy settlement remains the only top-up credit source. A trigger on its one-time private `wallet_credits` insert records the ledger credit and event inside that same transaction. Its subsequent profile update must match the journal. A failure rolls back the legacy credit, ledger, balance, attempt and outbox together. Previously settled top-ups retain their existing no-credit replay behavior. There is no generic positive-credit HTTP endpoint.

`trusted_wallet_checkout` reuses the reviewed server-price, owner-address, quote, stock, reservation and idempotency checkout. Quote requests do not create orders. Final checkout creates the order and debits it in one transaction; insufficient funds or a later failure leaves no new order/stock allocation from that call. `trusted_wallet_pay` locks order then profile, checks reviewed reconciled funds, an unexpired unreleased reservation, and the absence of any gateway attempt/reference. Amount comes from the frozen order, never a browser amount. A successful purchase atomically inserts one unique debit, updates both balances, marks payment paid/fulfillment confirmed, and creates one wallet event. Identical retries return committed success; changed key/order binding and overdraft reject. Gateway claim and expiry share the parent order lock, preventing both payment methods from winning. Other pending orders contend on the profile lock and cannot overspend.

Wallet receipts require a matching private debit for the exact owner/order/amount. A profile number, paid URL, browser callback or forged order status alone is insufficient. Immutable events are durable outbox records, not notifications; delivery workers are out of scope.

## Permissions and activation

All financial RPCs use SECURITY INVOKER and empty search_path, with EXECUTE only for service_role. Private tables have RLS and no browser grants. Journal/reviews/events deny UPDATE, DELETE and TRUNCATE to service_role and have append-only UPDATE/DELETE guards. Opening balance cannot be edited by service_role. Trusted service_role is still a privileged backend identity, not an untrusted user sandbox.

Two independent spend gates default closed: `JAMI_WALLET_SPENDING_ENABLED` in Express and `checkout_private.wallet_control.spending_enabled` in SQL. service_role cannot update the SQL control. The existing wallet UI and new top-up initiation stay disabled. Installation alone enables neither. Existing legacy verification is preserved. Any later activation requires separate owner approval, reviewed historical balances, hosted Auth/PostgREST acceptance, and a coordinated UI/server/database release.

The prepared `/api/wallet/checkout/quote` and `/api/wallet/checkout` routes verify identity via auth.getUser, accept only selection/key/quote, enforce no-store and existing rate limiting, and call one financial RPC. No opening-review, manual adjustment, refund, transfer or cash-out route exists. No generic SQL command is provided to activate production by accident.

## Verification and rollout

Run `npm test`, `npm run typecheck`, `npm run lint`, `npm run test:phase0:db`, and `npm run test:bootstrap:db`. Tests use fresh loopback-only PostgreSQL and synthetic identities; no `.env`, linked database, SMS or provider is used. SQL covers credit replay, permission boundaries, opening attestation, exact debit, receipt ownership, conflicts, insufficient balance, expiry, gateway conflict and rollback. Two real sessions demonstrate serialized competing purchases and gateway/wallet races.

Forward migration: `20261022085357_phase1_wallet_ledger.sql`; read-only postflight: `ops/validate-wallet-ledger.sql`. Before hosted installation, inspect grants/triggers and compare aggregate financial state, install on test first, then validate. Production installation, publication and enablement each need the owner's applicable approval. Do not use migration history repair or replay all migrations against an existing project. A failed rollout is corrected with a reviewed forward migration; do not delete financial journal records.
