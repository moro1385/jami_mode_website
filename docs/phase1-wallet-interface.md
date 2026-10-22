# Phase 1 wallet interface

Current continuation: `phase1-wallet-readiness.md` adds the prospective zero policy and independent v2 topup review to the same unpublished package. Its installation/activation notes supersede the earlier remaining-work statements below. All hosted gates remain unchanged.


Local follow-up to `phase1-wallet-topups.md`, on the same unpublished branch. No production/database activation, Auth/signup change or provider/payment request has been performed.

## Customer behavior

- `/account/wallet` reads a fresh owned server view instead of trusting the cached profile's wallet/empty transactions array. A failed read shows unavailable, never an invented zero/empty history. The label is registered balance, not necessarily spendable funds.
- The form accepts integer IRR, including Persian/Arabic digits, between 5,000 and 99,999,999. The authenticated view must allow topups before it appears. A per-user key is saved in sessionStorage before initiation; reload/retry/double clicks do not manufacture a new operation after ambiguity. A definite SQL business refusal, distinguished from network failure and idempotency conflict, may clear the uncreated operation and permit editing. Corrupt saved requests block new initiation. Redirects are restricted to the documented HTTPS bitpay.ir production gateway path.
- The server-owned topup status is checked after return, independently of both URL success hints and callback response. Unknown outcomes are pending, not declared failed/refunded. Only a matching paid receipt clears that saved topup. Pending topups remain visible as unconfirmed rather than being inserted into paid history. Existing legacy browser callbacks remain reachable.
- `/api/wallet/summary` authenticates the user, binds the identity on the server, returns only balance, capabilities, bounded pending topups and private-ledger history, and uses no-store. The browser cannot call its underlying service-only RPC or pass a user identity. Timestamp/id cursors preserve precision and stable order across transactions with equal timestamps; 20 rows per page, maximum RPC limit 50.
- Wallet checkout first checks server eligibility, then fetches a server quote, then requires explicit confirmation of total/shipping before calling the existing atomic wallet checkout. It preserves the same per-user checkout key/snapshot used by the independently checked order receipt screen. A navigation or ambiguous failure does not clear the cart. The existing gateway checkout path is preserved.

## Installation and remaining activation work

Review and publish the whole local wallet package together. The original topup migration `20261022205522_phase1_wallet_topups.sql` must precede `20261022211146_phase1_wallet_interface.sql`; the Ledger/recovery migrations are prerequisites. Hosted migration history needs the same explicit mapping as earlier packages; do not blindly replay it. Install the required migrations before exposing the UI. Missing RPCs fail closed with an unavailable screen.

The read-only view does not create an account, attest its opening, or set a gate. Both database and server topup gates still control form capability; both spending gates plus a reviewed, consistent account control debit capability. This release must not enable them on its own. A reviewed zero-opening policy for new accounts, coordinated activation and hosted/end-to-end acceptance remain the next Phase 1 item. Real payments/recovery remain deferred by the owner. The existing independent operator attestation tool is still limited to gateway orders, so operator handling of ambiguous new wallet topups must be covered before enabling topups.

## Validation

The final report in the workspace records exact counts and normalized checksums. Tests include UI failure/receipt states, lost replies, double clicks, corrupt storage, server/DB flags, quote/confirm/receipt behavior, RPC identity/cursor handling and an actual disposable PostgreSQL installation of all 31 migrations. Real SQL checks verify history pagination at identical timestamps, account isolation and read-only behavior. A disposable headless browser previews the actual wallet component with synthetic account/API responses, blocks off-machine requests, and checks desktop/mobile/disabled layouts without using the owner's browser profile. These previews are not production or provider acceptance.
