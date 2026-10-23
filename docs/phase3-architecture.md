# Phase 3 architecture refactor

## Current checkpoint — 2026-10-23

Work is on `refactor/phase3-architecture`. After local implementation and validation, the owner explicitly authorized committing and pushing this branch on 2026-10-23. Phase 3 remains in progress for hosted acceptance. Sections below describe incremental checkpoints; their old “remaining” lists are historical, not the current checklist.

- Gateway creation, owned address/shipping reconciliation and dashboard now have separate domain/application/repository/presentation responsibilities.
- Shared display money and cart-to-checkout selection exclude display price and synthetic legacy variant IDs from inventory/payment authority. The actual SKU/stock model belongs to Phase 2.
- Public React Query keys, sixty-second freshness, successful-mutation invalidation and bounded read retry are explicit. Permission/invalid-record errors do not automatically retry. Financial writes never use automatic React Query retries.
- Owner-private reads are scoped to identity/order and hide stale data. Dashboard, account orders/details/messages and admin users distinguish loading/error/empty and offer explicit retry. Admin lists and forms now use the same owner-scoped lifecycle and explicit retry pattern.
- Account forms/wallet and callbacks guard unmount/account/selection lifetimes. A -> B -> A does not revive old work. Callback StrictMode replay shares the same in-flight verification; navigation and financial receipt confirmation remain separate.
- Auth hydration cannot replace locally completed name/address edits with an older read. Financial fields still come from server reads. Stale no-session bootstrap cannot clear a newer account. Failed SDK signout is surfaced, without restoring an account that the SDK already removed locally. Cart-flush failure is reported but does not prevent attempting Auth signout. The logout lifetime is checked before dispatch and cleanup so an old logout cannot clear a newly signed-in account.
- Updated same-origin tabs coordinate cart staging and network operations under owner-specific browser locks. Separate revision acknowledgements cannot overwrite newer local drafts; pending offline snapshots, including an empty cart, survive reopening. Other devices and old app versions are outside this browser contract.
- Lint warnings were corrected rather than suppressed: private component helpers, stable derived arrays and effect dependencies. No dependency versions or lint rules were relaxed for this checkpoint.
- Offline browser acceptance is reproducible via `npm run test:e2e:offline`. It creates a synthetic build, serves localhost only, intercepts API calls and blocks other outbound requests. There is no real Supabase/Auth/SMS/payment request. `dist` from this command must not be deployed.
- PR workflow includes the browser suite. It is prepared locally, not executed on GitHub: no commit/push/PR was made.

### Admin list/form continuation — 2026-10-23

The remaining admin lists now consume owner-scoped read/action hooks with explicit error/retry. Per-row locks are synchronous; obsolete account/form results cannot report success or refresh a new screen. Order financial-status restrictions and previous-status persistence predicates remain unchanged. Product and message drafts reset only for their own successful submission; closing/reopening the product dialog creates a new lifetime.

Variant keystrokes preserve optimistic typing while actual writes run FIFO. Add/delete cannot race that queue; a rejected edit reloads stored values after draining. Closed-form queued edits are not dispatched. Image metadata operations are serialized within the form; stale uploads stop before the next file/metadata continuation, and stale metadata deletion does not start storage cleanup under a new form. Already dispatched requests can complete. Partially uploaded orphan files retain the existing Phase 2 cleanup policy, not an invented rollback.

Return-request order loading also uses the shared error/retry pattern and verifies that the selected order is in the current owner's loaded list before submission.

### Shared cart, offline recovery and local review — 2026-10-23

Cart synchronization now has an injected coordinator, owner-scoped durable snapshots, short storage locks and separate network locks shared by updated same-origin tabs. Local edits remain possible while a network request runs. Acknowledgement is a separate revision key and never rewrites a newer snapshot. Pending local edits, including empty carts, take precedence over an older remote cart after reconnect or reopening. A fresh SDK session owner is checked before remote operations; UI lifetime and matching unexpired-session checks remain in place. Storage ownership is not an authorization boundary: database RLS remains authoritative.

Remote cart parsing is strict: malformed remote data is an error, never an empty cart eligible for overwrite. Quota/corrupt/foreign snapshots and unavailable shared locking fail closed for automatic synchronization while preserving the current local view. Unsupported browsers show an actionable notice; there is no uncoordinated remote-write fallback. Errors remain pending and require explicit retry or reconnect, without an unbounded retry loop. Editing after a failed initial read keeps the retry notice visible. Owned persisted carts are hidden from mismatched cached identities; legacy guest carts retain their compatibility path.

Logout flush reads the latest shared snapshot rather than a stale tab's items. A flush failure does not block attempting Auth signout. Account epochs prevent an older logout from clearing a newly signed-in account. Logout from one tab clears the other tab's account/cart view without uploading an empty cart as an accidental replacement.

The network adapter has a ten-second abort deadline; waiting for a browser lock is bounded. An abort or lost response cannot prove a dispatched database request was cancelled. This is not backend compare-and-swap, device-wide conflict resolution, a guarantee against late server commits, or synchronization with old deployed app versions. Browser storage clearing or refusal can lose drafts. Backend row-version conflict control, atomic default-address changes, real SKU/stock contracts and product-image orphan handling remain separate backend/Phase 2 work.

Consolidated local review checked migrated UI/client boundaries, pure domain/application dependencies, shared display-money/selection contracts, owner/lifetime guards, payment idempotency and independent paid-receipt behavior, cross-tab write ordering, isolated test routing and the prepared PR workflow. Server code, migrations, generated database types/client and the dependency lockfile are unchanged. No financial gate, provider or production data was changed. These checks do not constitute a new production security audit.

### Current acceptance and remaining gate

The planned local architecture, shared models, state/error/retry and synthetic browser implementation is complete for review. Local acceptance passed: 874 unit/integration tests in 63 files; 22 browser scenarios; TypeScript; isolated build; ESLint zero errors/zero warnings; git diff check. The ~877 kB main JS chunk warning remains, with no threshold raised to hide it.

Phase 3 remains In progress for the unexecuted hosted PR/CI and deployed compatibility acceptance. The PR workflow is prepared locally; it has not run on GitHub. The owner subsequently authorized committing and pushing the validated branch. Merge, deploy and live API/database/payment/message/upload operations are outside that authorization. Local completion is not deployed acceptance or a claim that Phases 1/2 or production security are complete. The synthetic dist is not deployable.

## Earlier implementation checkpoints


Phases 1, 2 and 3 remain incomplete. The current focus is Phase 3: improve boundaries while retaining the deployed behavior. Deferred payment/restore acceptance and Phase 2 catalog/inventory work are not silently completed by rearranging code.

## Module direction

Start with catalog, then migrate other features incrementally:

```
pages/components -> presentation hooks -> application use cases -> repository port
                                               ^                      ^
                                               |                      |
                         composition root wires the Supabase adapter --+
```

- `src/features/catalog/domain/`: current public catalog types and pure legacy-query parsing. No React, Supabase, storage or network dependencies.
- `application/`: catalog read and product-management use cases with repository/storage interfaces. Search behavior depends on a port, not a Supabase client.
- `infrastructure/`: existing catalog reads and signed-in admin product/variant/image persistence, plus conversion of stored records into the current storefront shape. No new access privileges or service-role clients.
- `presentation/`: React Query hooks and display helpers. Query keys, stale times, enabling conditions and hook return shapes are preserved.
- `catalog.ts` and `admin.ts`: composition roots selecting the existing configured browser client for storefront reads and product management respectively.
- `index.ts`: feature public API. `src/services/products.ts` and `src/hooks/useProducts.ts` remain compatibility entrypoints for callers outside the feature. New callers can use the feature entrypoints; do not perform unrelated mass import rewrites.

ESLint prevents the new domain/application layers from importing UI, stores or Supabase infrastructure. Existing features migrate individually; introducing an empty folder tree for every future feature does not constitute a refactor.

## Behavior retained

Preserve product IDs, the single Default display variant, base price, size/color options, current stock flag, image precedence/sort order, Persian formatting and placeholders. Changing these contracts or inventing stock/SKU values belongs to Phase 2.

Preserve active-only reads, category slug resolution, filters, ordering, limits, errors and client-side term filtering after the query limit. Do not disguise an outage as an empty catalog. Keep the original generated database types behind the adapter; the application does not import them.

The service and adapter can be tested with injected repositories/clients; tests must not import the production browser client to exercise pure catalog behavior. This package changes no routes, backend payment logic, Auth/signup, secrets, database schema, wallet switches or local storage names.

## Remaining Phase 3 work

- Migrate direct data access and business rules in admin, account/support, Auth and checkout feature by feature. Keep security-critical flows covered by regression tests; no new browser access to financial RPCs.
- Align shared cart/product/checkout types without conflating that work with the Phase 2 inventory redesign. The compatibility catalog shape is not the final domain model.
- Standardize query keys, invalidation and loading/error/retry behavior after each feature is separated. Current catalog cache behavior is intentionally unchanged in this first package.
- Decompose large pages/components where it removes an actual responsibility, not only to reduce line counts.
- Complete reproducible browser E2E coverage and resolve the pre-existing lint warnings in scoped changes. Existing TypeScript/build and PR checks are reused.

The first catalog module is a completed refactor slice, not completion of Phase 3. Publication, hosted acceptance and migrations remain separate operations.

## Product management migration

`AdminProducts`, `ProductFormDialog`, `ProductVariantsManager` and `ProductImagesManager` now call the catalog administration API. They no longer import the Supabase client or generated database types. ESLint protects that boundary. Types are owned by the feature and are checked structurally against the generated database types in the adapters.

The application layer prepares copy/form payloads and variant form numbers. It preserves identity exclusion, image clearing on copy, slug normalization, null optional fields and existing numeric coercion. Product validation/stock rules are not redesigned here. UI retains confirmation, feedback, optimistic edits and persisted-value reload on failure.

Image use cases preserve sequential uploads and one metadata replacement after all uploads, image ordering, and separate best-effort file cleanup after successful metadata removal. The unused duplicate single-file upload handler was removed; the visible multi-file path remains. Existing upload validation/orphan policy remains Phase 2 work rather than being changed silently in an architecture refactor. No image cleanup or real upload is executed during validation.

This completes the product-management data/service separation slice; other admin areas, account/support, Auth and checkout still need migration. Financial state, database permissions and production configuration are unchanged.

## Customer and support migration

The customer module owns the shared admin profile summaries and display-name fallback. The support module separates admin message/ticket operations, public contact submission and the signed-in owner's inbox/count behind distinct ports and composition roots. All use the existing configured client and database RLS. No admin or contact method is added to the account-message API.

`AdminUsers`, `AdminMessages`, `AdminTickets`, account `Messages`, `Contact` and `Header` no longer import Supabase directly. Message trim rules, contact-field mapping, ticket transitions, list ordering and UI feedback remain. Contact submission now uses try/catch/finally so a rejected transport restores the form's enabled state and retains the draft for retry.

Message presentation hooks are scoped to owner identity. They hide previous-owner rows/counts immediately, ignore stale loads and old-account write completions, and revert a failed read mark only in the current scope. The unread hook preserves sixty-second polling and now consumes the existing messages_read_updated event after successful persistence; timers/listeners are cleaned up. These are deliberate account-isolation fixes discovered during extraction, not a claim that every Auth/session or state-management path is complete.

The financial checkout/wallet, other admin areas, return requests, remaining account data and Auth still need incremental migration. The current slices do not complete phases 1, 2 or 3.


## Orders and returns migration

Orders and return requests now own their domain types, application ports/services and browser-client adapters. Five migrated views (admin orders/returns, account orders/return form, shared order details) no longer import the database client. ESLint protects this boundary. Fulfillment options retain the compatibility entrypoint; validation is also enforced by the application service. Updates retain both order ID and previous status predicates, zero-row failures, and persisted-value reload after rejected optimistic edits. No payment status, amount or financial RPC is exposed by this extraction.

Account order mapping uses typed immutable item snapshots, including historical title/variant/price fallbacks. Detail reads retain RLS for admin and owner callers, with matching order/item identifiers validated before display. Account list and detail hooks hide previous scopes during render, ignore late completions and clear on logout, close or order change. A failed detail load no longer leaves the previous snapshot visible.

Return adapters preserve profile merging, newest-first ordering, owner-filtered order selection and saved-status confirmation. Private image validation, upload paths, signed viewing and cleanup remain in their existing module; failed return insertion still cleans uploaded objects. Return form list loads ignore completion after unmount/account change. File-storage orchestration and complete form/session lifecycle isolation remain further work; this does not complete Phase 3 or provide production acceptance.


## Account address and form separation

The account domain owns Address, storage/form mapping and profile/address validation. The old auth type export remains compatible. Auth hydration reuses the pure mapper without changing its existing fallback/error behavior. Signup, OTP, pending-name persistence, wallet and token handling are unchanged.

Address persistence moved out of the Auth store into an injected repository and application service. Store actions retain their existing API, publish only reread persisted rows, reject unsigned/mismatched sessions and avoid applying completions after signout or owner change. Edit/delete/default targets must exist in the current owner's address list. Adapter update/delete/default predicates bind both ID and owner; returned IDs confirm the target changed. A clear-default operation may legitimately affect zero siblings, but still propagates errors.

The existing multi-request default sequence remains non-atomic; no database constraint or RPC is added. On any failed operation the store attempts to reload actual addresses before propagating the error. If reload also fails, the last known rows remain; no success is reported. Concurrent tabs and atomic default selection still need a later backend change. Address UI now catches delete/default failures and disables those buttons while busy. Form validation, phone normalization and optional line2 mapping preserve existing behavior; profile edits still allow only name/email. Full Auth extraction and form lifetime isolation remain further work.


## Auth data/service separation

The auth feature owns session/identity contracts and pure session/user mapping, normalized password/signup/OTP use cases and repository ports. Its adapter owns SDK Auth calls, profile/address reads and the existing has_role RPC; the Auth store and RequireAdmin no longer import Supabase. Existing store methods, persistence keys, phone-bound pending signup names, Auth metadata names and signed-in callback scheduling are retained. Pending signup cleanup still removes only its own value and never stores the password. The audited profileWrites module remains the completion/edit adapter via injection; it is not reimplemented.

The store retains UI state and cart/checkout coordination, event-version/signout/login race guards and the deferred hydration outside the synchronous Auth callback. Mapping preserves profile/auth/pending-name precedence, same-owner order cache and signup wallet/address reuse only for the same owner. Resolved profile/address query errors keep their previous fallbacks; thrown transports keep existing handling. Bootstrap, event hydration and password login intentionally retain their different pending-name behavior. This is separation, not an Auth-policy redesign: no new roles, OTP lifetime claim, session validation, provider settings, grant or service-role client.

RequireAdmin keeps token/owner-bound role state, stale-response cleanup and fail-closed navigation. It still relies on database RLS for actual authorization. Full Auth lifecycle redesign, refresh/signout failure policy, shared form/session lifetime and browser acceptance remain separate work, as do checkout/wallet, cart and dashboard extraction.


## Cart domain and synchronization

CartItem, legacy product/size/color identity, quantity operations, display totals, remote parsing and explicit serialization now belong to the cart domain. Existing store exports and persistence keys remain compatible; quantity/price/SKU policies are not redesigned. Cart totals are display-only and do not authorize checkout prices. The parser preserves the existing 100-row/100-quantity limits and malformed-cart fallback.

The cart repository owns the same owner-filtered read and upsert. Its service separates synchronization saves from the existing signout flush contract: the legacy facade still logs resolved database errors and propagates thrown transport errors. No financial RPC or storage key changes are introduced.

CartSync is a thin hook host. An injected application controller scopes reads, subscriptions and timers to an owner lifetime, checks current matching/unexpired session before publishing or dispatching, waits for initial loading before uploading, and serializes writes. A nonempty server cart still replaces the login cart; if the shopper edits while that read is pending, the newer local edits win. An empty server cart preserves the local cart. Successful initial loading always schedules a save, including reads longer than the debounce interval. Read failures block automatic uploading to avoid overwriting an unknown cart. Save errors stay logged/dirty and retry after a new edit; there is no unbounded retry loop.

Stopping cancels queued timers and listeners and ignores late reads; an already dispatched write cannot be cancelled and retains its captured owner and snapshot. Concurrent tabs, coordinated signout flush versus an in-flight sync write, broader retry/offline UX and browser acceptance remain further work. Database RLS remains the actual boundary; no live read/write or real order is part of local validation.


## Wallet, payment callbacks and receipt separation

The payments domain owns wallet view types, amount/redirect/response validation and receipt snapshot matching. Application ports/services separate summary requests, owned order receipts, receipt consumption and callback navigation from SDK/HTTP access. The existing walletClient and checkoutReceipt paths remain compatibility facades. The transport preserves fresh owner-matching session checks, no-store/timeout behavior for wallet/receipt reads, HTTP refusal codes and validated topup IDs. Callback verification retains its existing server endpoint; callback navigation alone cannot clear a cart or prove a wallet credit.

Wallet, WalletCheckout and CheckoutSuccess now render presentation hooks. Wallet amount limits, server activation/review gates, quote confirmation, idempotency storage, ambiguous-response handling and independent paid-receipt checks are retained. Cart/checkout cleanup still requires an authenticated matching paid order and matching stored selection, and cannot be repeated after consumption. CheckoutVerify and WalletVerify use callback services and no longer import Supabase. Return identifiers/reasons are URL-encoded in application navigation.

This slice preserves existing hook behavior rather than claiming full form/session lifetime isolation. Gateway order creation in CheckoutPayment and address/shipping selection remain to be extracted; backend ledger/verification code, grants, provider settings and activation flags are unchanged. Cross-account asynchronous form completion, callback lifecycle/StrictMode behavior and hosted browser acceptance remain explicit further work. No real payment, topup, SMS or production query is used by local validation.


## Gateway checkout, shipping and dashboard

Gateway order creation uses an injected application service and a fresh owner-matching Auth connection. The browser sends only selection/idempotency/proof; backend pricing and settlement stay authoritative. The service persists the operation before network access, quotes before checkout, verifies order identity, stores the order before initialization, and checks lifetime/storage continuity before continuing. The hook scopes quote, lock and asynchronous results to owner plus selection, suppresses stale navigation, and retains ambiguous/expired/pending-order feedback. Redirects now share the fixed HTTPS BitPay gateway validator already used for topups. A dispatched request may still settle server-side; stale client completion is not cancellation.

Checkout selection/shipping contracts are shared, and CheckoutAddress reuses account form validation/mapping. Selected addresses are reconciled to current owned records after edits/deletes/account changes; next-step requires an owned address and supported shipping method. Shipping numbers remain display suggestions; the server determines actual charges. Failed deletes now report failure.

Dashboard reads moved to repository/service/hook with owner-scoped asynchronous state and retry. SDK errors no longer produce zero-looking success. The previous all-order sum remains the same; its label now says total order amounts rather than implying settled revenue. The shared asynchronous read primitive is reused by orders through a compatibility export. Real revenue/ERP reporting and backend pagination remain separate work.

User instruction: do not commit or push while Phase 3 is incomplete. All work remains local; no deployment, backend migration, gateway configuration or real financial request is part of this refactor. Full model/state/lifecycle/React Query/E2E acceptance still needs verification before Phase 3 can be marked complete.
