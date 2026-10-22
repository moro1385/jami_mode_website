# Phase 1: new wallet top-ups (backend package)

Current continuation: `phase1-wallet-readiness.md` adds the prospective zero policy and independent v2 topup review to the same unpublished package. Its installation/activation notes supersede the earlier remaining-work statements below. All hosted gates remain unchanged.


Prepared locally; not deployed or enabled. This document covers the original backend scope. The same branch now also contains the interface follow-up documented in `phase1-wallet-interface.md`. No Auth/signup, historical balance backfill, provider payment or production data changes.

## Contract

`POST /api/bitpay/wallet-init` requires a validated bearer login and only `{idempotencyKey: UUID, amount: integer IRR}`. Amount is 5,000–99,999,999 IRR; no toman conversion. Identity, merchant, currency, persisted topup and callback origin come from the server/database. A fresh durable claim precedes the provider call; retries reuse its reference. A timeout or crash in creating state never authorizes another provider create. Check the authenticated `GET /api/bitpay/wallet-topups/:id/status`; unresolved attempts need an independently evidenced operator decision. No automatic retry or fabricated provider inquiry is introduced.

The persisted topup/attempt is version 2. The documented bitpay.ir gateway-send callback is fixed to `/account/wallet/verify?topup_id=<persisted id>`. Existing order callbacks and v1 wallet returns retain their transport. V2 wallet callbacks always require the owner and durable verification, even if the order recovery flag is off. Cancellation is advisory. Provider status 11, amount mismatch and network errors never authorize credit. Durable verified evidence permits database-only recovery after a failed settlement, with no repeated provider verify.

Settlement atomically creates one wallet credit, one Ledger entry, the corresponding profile balance and confirmed topup/attempt, and one outbox event. Receipts require matching credit and Ledger evidence. Row locks and unique keys serialize retries. New requests reserve numeric(10,2) profile capacity for pending topups, with at most five unresolved requests per user. The conservative integer cap is 99,999,999 IRR including balance and pending amounts; bank/provider limits may be lower and are not invented here. Pending creation/verification is retained rather than expired when money could still arrive.

## Activation and scope

1. Review and publish this package, then install migration `20261022205522_phase1_wallet_topups.sql` in a coordinated release. Preserve historical migration mapping; do not blindly replay remote history.
2. Installation leaves database `checkout_private.wallet_control.topups_enabled=false`; the server additionally requires `JAMI_WALLET_TOPUPS_ENABLED=true` and the already reviewed gateway configuration. Service-role credentials cannot flip the database gate. Closing either new-initiation gate does not disable status or verified settlement/recovery of existing attempts. The separate provider switch affects provider verification as before; do not disable it to pause only new topups.
3. Do not enable yet. The following Phase 1 items remain separate: topup/history/checkout UI integration; a reviewed zero-opening policy for new accounts and spending activation; hosted acceptance and owner-authorized real payment/recovery acceptance. A new credit may create an observed unreviewed Ledger account; it does not manufacture an opening review or permission to spend.
4. Roll back initiation by closing both topup gates. Retain migration and financial evidence for in-flight returns; do not delete requests, credits or confirmed topups. No destructive down migration is provided.

## Verification

`ops/validate-wallet-topups.sql` is read-only. Disposable local PostgreSQL tests cover gate, exact amount/key/namespace/owner, atomic failure and recovery, quota/headroom, immutable evidence, browser denial, and simultaneous real sessions for duplicate initiation and settlement. HTTP/provider tests use synthetic identities and mocked provider responses; they are not evidence of a real payment or hosted deployment. The existing legacy checkout/Ledger suites continue to run unchanged.
