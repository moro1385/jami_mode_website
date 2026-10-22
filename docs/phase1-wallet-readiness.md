# Phase 1 wallet readiness: prospective zero opening and topup review

Local continuation of the unpublished wallet backend/UI package. No production writes, gate changes, Auth/signup changes, real provider requests or actual operator financial decisions have been performed. The added `created_at` fields in the synthetic local Auth fixtures model a column already present in real Supabase Auth; they are not migrations of the hosted Auth schema.

## Prospective zero opening

Migration `20261022213205_phase1_wallet_readiness.sql` records a one-time policy cutover. A candidate must have both a real Auth row and profile created after that cutover, finite nonfuture timestamps, a zero profile balance, no previous topups/credits/ledger entries/opening attestations, and no nonzero existing opening/account balance. A currently zero historical profile is insufficient. Nothing is backfilled on installation.

The private read-only candidate function is a narrowly scoped definer because service-role RPCs must not receive general Auth-table access. It returns only the relevant timestamps for that user. The private issuer locks the profile, rechecks eligibility, writes a fixed zero account and immutable `prospective-zero-v1` provenance, and cannot add credit or replace an existing opening. Service-role cannot insert provenance or modify the policy directly. Both routines have an empty search path and no browser EXECUTE grants. No trigger is installed on Auth or profiles; registration is unchanged.

Issuance happens lazily in the trusted new-topup claim, before the first topup is created. Repeated/concurrent requests issue one origin. The existing balance reconciliation and read-only customer view accept either a genuine operator opening attestation or this separate zero provenance with an exactly zero opening. Automated provenance is not labeled as a human review or backed by a fabricated evidence hash.

Old/imported/unreviewed accounts cannot start new topups. They require the existing independently reviewed opening procedure; they are never reset or automatically approved because their current balance happens to be zero. The UI explains that support review is needed when topups are globally enabled but the account is ineligible. An existing paid or in-flight return remains readable/recoverable; disabling new initiation is not a denial of previously paid credit.

## Independently reviewed ambiguous topups

The existing service-only `trusted_review_payment` and `scripts/payment-review.mjs` now support both v2 gateway orders and v2 wallet topups. The manifest format and CLI transport remain unchanged: the immutable stored attempt binds the destination and customer, rather than accepting a caller-supplied user/topup/order destination. Existing gateway-order behavior and compatibility are retained.

For a wallet topup, the persisted amount, IRR, merchant, provider reference, version, topup parent and any pinned verification transaction must agree. An eligible attempt must be ready with its provider reference already durably attached. A creating attempt with a lost/unknown reference is not reconstructable from guesses, amount alone, browser parameters or age, and remains held for independent investigation. Legacy v1 topups keep their previous verification path and are not converted by this tool.

An authorized operator must independently establish the paid outcome from the provider's authenticated portal/export or authoritative support case. The artifact and manifest stay outside the repository/web root in a protected directory. The SHA-256 identifies reviewed bytes; it does not authenticate the artifact. A customer screenshot, callback, status 11, a reviewer flag or a guessed transaction does not supply payment evidence. No undocumented inquiry API, second verification request, refund or automatic cancellation is added.

`plan` is non-mutating (it may take locks); actual `apply` still requires a separately authorized exact financial case plus `--execute --confirm-provider-review`. Audit, verification evidence, credit, Ledger, profile balance, settled state and outbox commit or roll back together. Identical retries replay the stored decision; conflicting evidence cannot overwrite it. If valid evidence is already durable, the existing database-only reconciliation path is used instead of inventing another review.

## Coordinated publication and activation

The current local package includes, in order:

1. `20261022205522_phase1_wallet_topups.sql` (new initiation/evidence/credit binding).
2. `20261022211146_phase1_wallet_interface.sql` (owned read-only view and history).
3. `20261022213205_phase1_wallet_readiness.sql` (prospective zero provenance and topup operator review).

Ledger, payment recovery and earlier review migrations are prerequisites. Preserve explicit hosted migration-history mapping; do not blindly replay remote history. Publish these SQL/code changes as one reviewed release, install prerequisites before exposing the new interface, and validate using the read-only `ops/validate-wallet-readiness.sql`. That report prints only counts and gate states, not customer identities or credentials.

No migration or current test enables hosted wallet functionality. New topups still require the reviewed provider configuration, `JAMI_WALLET_TOPUPS_ENABLED=true`, database `wallet_control.topups_enabled=true` and an eligible/reviewed account. Wallet purchases additionally require `JAMI_WALLET_SPENDING_ENABLED=true`, database spending activation, a reviewed consistent account and sufficient funds. Activation remains a separate owner decision after the hosted release and account-state review. Keep the provider verification switch available for in-flight returns when pausing only new topups.

Rollback initiation by closing the dedicated server/database topup and spending gates. Preserve financial records, provenance and migrations so existing receipts and recovery remain available; do not delete pending/paid cases or erase history. Historical accounts need case-specific opening review before their wallet can be used. This package does not attest any real historical account.

## Validation boundaries

Unit/UI tests and fresh disposable PostgreSQL validate permissions, historical containment, fixed zero provenance, failure rollback, unique credit and quote/purchase/receipt flows. Real separate PostgreSQL sessions prove concurrent origin issuance and operator topup review each produce one result. The local HTTP acceptance uses real Express and PostgreSQL with synthetic Auth and a mocked documented provider adapter: 50,000 IRR credit, 20,000 IRR purchase, 30,000 IRR remaining; no duplicate provider create/verify, other-owner receipt rejection, retained receipts after closing gates. This is not hosted Auth/PostgREST, production-browser or real-payment acceptance. Those hosted checks and the owner's deferred real payment/recovery acceptance remain separate.
