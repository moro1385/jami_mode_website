# First security containment PR

Local branch: `security/first-containment`. This is a forward-only containment
change, not a secure checkout or settlement implementation. No production
connection or production migration execution occurred. No deployment, push or
merge is part of this work; SQL was exercised only in fresh local test databases.

## Pre-deployment recommendation

**NO-GO: this containment PR is blocked.** The item-freeze race is now reproduced
with two real local PostgreSQL connections. Server verification is retained, but
concurrent/crash-safe idempotent settlement is not established. Resolving these
requires a separate transactional checkout/settlement PR; no partial freeze or
settlement rewrite has been added. A real disposable Supabase Auth/PostgREST run,
deployment-target/schema inventory and admin relationship compatibility remain
outstanding. TypeScript also fails on 15 pre-existing diagnostics.

This does not recommend leaving the confirmed production authorization defects
unaddressed. The current containment PR remains blocked until the transactional
issues are resolved in separate work and its compatibility/target gates below
are satisfied. Keep wallet spending
and new top-ups suspended. Recommend pausing **new gateway initiation** until
trusted pricing/settlement is implemented; that additional operational change is
not silently introduced by this PR. Existing verification/reconciliation must
remain available through a controlled, monitored recovery path.

The separate [trusted checkout proposal](trusted-checkout-proposal.md) describes
the architecture, additive migration sequence, cutover and acceptance evidence.
It contains no implemented checkout rewrite or executable migrations.

## Continuation review: 2026-10-17

**GO for local review of the focused compatibility/authorization changes below;
NO-GO for deploying or approving the containment PR as complete.** Work stopped
at the transactional boundary. No production connection, gateway request, live
catalog access, commit, push, merge, deployment or new branch was performed.
The existing branch and earlier uncommitted work were preserved.

### Admin payment versus fulfillment boundary

The checked-in baseline grants authenticated SELECT/INSERT on orders and defines
`Admins update orders` with `has_role` in USING/WITH CHECK. It has no UPDATE grant;
the reviewed drift fixture supplies the ambient UPDATE grant. The earlier
containment restrictive UPDATE policy checks admin identity, but permits any
OLD/NEW state pair for that admin. Actual local ACL/RLS tests confirmed the need
for a transition guard; UI filtering alone would not protect direct REST writes.
No production policy inventory was requested or accessed.

The existing, still-unapplied forward containment migration now includes an
invoker BEFORE UPDATE trigger with a pinned empty search_path. It checks OLD/NEW
values and grants no table privileges or privileged RPC. Client admins can change
only status/updated_at; identity, amounts, shipping and payment fields cannot be
modified through this generic update path. Existing superuser/BYPASSRLS server
identities retain settlement authority; the existing preflight excludes such
client identities. Trigger EXECUTE is revoked from PUBLIC/anon/authenticated
(PostgreSQL invokes the attached trigger without granting clients an RPC).

| Existing status | Generic admin transitions |
| --- | --- |
| confirmed | processing, shipped, delivered, cancelled |
| processing, shipped, delivered | processing, shipped, delivered, cancelled (same-state writes are harmless) |
| pending_payment, payment_failed, legacy pending, cancelled, unknown | Read-only in UI; DB rejects a different status |

This preserves the existing fulfillment correction, delivery and cancellation
controls for established fulfillment states, including historical wallet orders.
It never offers confirmed as a new target. Historical statuses are not proof of
payment and are not reclassified by this patch. Legacy pending/unknown orders,
reopening cancelled orders and refunds need reconciliation outside this control;
verify any deployment-specific offline/manual workflow before rollout.

AdminOrders renders pending_payment and payment_failed with explicit Persian
labels, preserves unknown statuses, filters options, validates the handler and
adds `eq('status', previousStatus)` to its update. A stale/denied/zero-row update
cannot report success. Existing missing UPDATE/SELECT grants are not broadened.
The embedded profiles relationship still needs a schema/PostgREST inventory:
the checked-in orders FK targets auth.users, not profiles. These component tests
prove status rendering after loading, not successful live relation loading.

### Logged-out callbacks and verification boundary

RequireAuth preserves pathname, query and hash as an encoded returnTo login
query. Password login, switching to OTP, OTP request/verification, signup links
and the already-authenticated redirect retain it. The query survives auth-page
reload; no shared localStorage callback is applied to another tab/account.
Only the exact `/checkout/verify` and `/account/wallet/verify` paths can resume;
external, protocol-relative, backslash, unrelated and traversal destinations
fall back to /account. The callback query is passed unchanged to verification.

No URL success/payment claim establishes payment. Verification pages still POST
references to the server, and tests confirm a URL success flag cannot override
a failed server result. Server tests cover mismatched stored references,
provider amount mismatch, legacy top-up settlement and settled callback replay.
Provider transport is mocked. There is no new browser payment write.

**Idempotency remains a blocker, not a new guarantee.** A completed callback
with an existing transaction marker returns success without another provider
request/write; the order replay test also preserves shipped status. However:

- Order verification reads then updates without a transaction/CAS and ignores
  update errors. Concurrent success/failure/cancellation can overwrite status;
  concurrent init can replace the stored payment reference. Callback endpoints
  do not authenticate/authorize the caller; their current boundary is possession
  of a matching stored reference plus provider verification for settlement.
- Wallet verification marks the top-up before writing the balance, in separate
  requests. A crash/denied balance write after the marker leaves a retry returning
  success without the credit. Concurrent verifications/top-ups can lose balance
  updates; retries are not an atomic exactly-once credit. This cannot safely be
  repaired with a browser flag, in-process mutex, or CAS on the marker alone.

New top-ups remain denied in the UI, `/wallet-init` (503 before any DB/provider
work), and restrictive INSERT RLS. Existing top-ups remain readable/verifiable
through the service-role path. Reachability is preserved; safe automatic credit
under races/crashes requires the separate settlement work and reconciliation.

### Exact order_items boundary and reproduced blocker

Customer INSERT requires ownership and an unpaid gateway parent with null
payment_ref/payment_trans_id. Sequential append after a committed initialization
or payment is rejected. Customer UPDATE/DELETE are denied. Browser admins have
the same INSERT restrictions, but ambient grants/permissive policies can still
allow admin item UPDATE/DELETE after initiation/payment: current restrictive
guards require admin identity only. Service-role writes bypass RLS. Product and
variant FKs also use ON DELETE SET NULL, so privileged catalog deletion can change
references in historical item rows. This is not an immutable paid-item snapshot.

The DB runner now deterministically reproduces the INSERT race at READ COMMITTED:
connection A starts a customer item INSERT and pauses in a test-only BEFORE INSERT
trigger using an advisory lock; connection B commits payment_ref as service_role;
then B releases the lock. A's RLS parent read still uses its statement snapshot
and the INSERT commits after initiation. Test-only objects are removed, and the
disposable cluster is stopped/removed. No production locking behavior was added.

There is also an unguarded interval during `/init`'s provider request, before
payment_ref is stored. A parent-lock trigger on items alone would not freeze
that interval, price the order, or coordinate concurrent/retried provider init.
Safe freezing requires initiation to atomically establish a durable frozen
attempt with all item writers participating, plus retry/recovery semantics.
That crosses into the separate Trusted Checkout architecture. **Containment PR
BLOCKED; no risky partial item-freeze patch was implemented.**

### Continuation verification results

| Command/check | Exact output/result |
| --- | --- |
| `npm.cmd test -- --reporter=dot` | Exit 0; `Test Files 7 passed (7)`, `Tests 73 passed (73)`; duration 2.74s |
| `npm.cmd run typecheck` | Exit 1; same 15 existing TS diagnostics listed below; none in continuation files |
| `npm.cmd run test:security:db` with JAMI_TEST_PG_BIN set | Exit 0; `Permission assertions: 73 passed.`; `Migration refusal/rollback scenarios: 11 passed.`; existing-email/data-preservation case passed |
| Two-connection diagnostic in DB runner | `BLOCKER reproduced: concurrent item INSERT commits after initiation (READ COMMITTED stale parent snapshot).` This is evidence of an unresolved gap, not a passing safety acceptance test. |
| `node scripts/build-isolated.mjs production` | Exit 0; `2193 modules transformed.`, `built in 20.93s` |
| `node scripts/build-isolated.mjs development` | Exit 0; `2193 modules transformed.`, `built in 8.17s` |
| Targeted ESLint on all continuation TS/TSX and JS runner/helper files | Exit 0; no output |
| Node syntax checks; `git diff --check` | Exit 0; no output |

Tests are 17 profile-write, 13 auth-store, 17 server-route, 6 customer-financial,
8 admin-status, 11 payment-return and 1 existing placeholder tests. Expected
denial/provider-mismatch logs and React Router future warnings remain.
Builds emit existing large-chunk and outdated Browserslist warnings; no dependency
download/update was run. The helper strips inherited application env variables,
uses vitest.config.ts's isolated envDir and bypasses sitemap generation.
Full normal build and Supabase HTTP/Auth integration were not run.

PowerShell initially blocked npm.ps1, so npm.cmd was used. The Windows sandbox
blocked esbuild parent-directory resolution and initdb's restricted token; those
local checks succeeded outside that sandbox through automatic approval review.
An initial inline build command had a shell-quoting SyntaxError before running
Vite; the checked-in helper replaces it and both final builds passed.

### Exact files changed in this continuation

Earlier containment files remain in the full manifest at the end. This turn
changed only these 17 files (including new files):

| File | Continuation change |
| --- | --- |
| `docs/security-containment.md` | Current audit, boundaries, blockers, outputs and manifest |
| `supabase/migrations/20261017143036_first_security_containment.sql` | Admin financial/transition trigger in existing unapplied migration |
| `supabase/tests/security_containment.sql` | Direct admin payment-manufacture denial and fulfillment assertions |
| `scripts/test-security-db.mjs` | Deterministic two-connection READ COMMITTED race diagnostic |
| `scripts/build-isolated.mjs` | Reproducible local bundle helper without production env/catalog |
| `src/lib/orderFulfillment.ts` | Fulfillment options with payment states excluded |
| `src/pages/admin/AdminOrders.tsx` | Pending labels, constrained options/handler, prior-status condition |
| `src/test/adminOrderContainment.test.tsx` | Read-only payment states and persisted/conditional update tests |
| `src/lib/authReturn.ts` | Callback-only return validation and auth URL construction |
| `src/components/auth/RequireAuth.tsx` | Preserve complete callback on login redirect |
| `src/components/auth/RedirectIfAuthenticated.tsx` | Resume validated return after session hydration |
| `src/pages/SignIn.tsx` | Password completion and auth links preserve return |
| `src/pages/SignUp.tsx` | Signup/OTP navigation preserves return |
| `src/pages/OtpRequest.tsx` | OTP request/switch navigation preserves return |
| `src/pages/OtpVerify.tsx` | OTP completion/fallback preserves return |
| `src/test/paymentReturn.test.tsx` | Logged-out order/wallet callback, OTP, reload and destination tests |
| `src/test/bitpayRoutes.test.ts` | Reference/amount rejection and settled replay regressions |

## Problem and resulting behavior

Customers previously had effective write access to `profiles.wallet_balance`,
could insert ownership-valid orders with arbitrary payment states, and could
insert items into other customers' orders through a permissive `WITH CHECK (true)`
policy. The UI also performed wallet deductions from stale client balances.

The new migration:

- Revokes profile table-wide INSERT/UPDATE/DELETE and all explicit INSERT/UPDATE
  column grants from PUBLIC, anon and authenticated; restores only the reviewed
  profile column allowlists. Customers cannot supply a balance, even zero.
- Allows profile INSERT of id/name/phone/avatar and UPDATE of name/phone/avatar.
  Supplies a missing nullable contact-email column and grants safe email writes,
  because the existing form always sends it. Normalizes the new-profile balance
  default to zero without changing stored balances. Identity and timestamps are
  not client-updatable. SELECT grants/policies remain unchanged.
- Keeps owner policies and adds restrictive ownership policies, so another
  permissive profile policy cannot widen customer write access.
- Restrictive guards apply TO PUBLIC, covering anon and inherited client roles,
  even in the presence of permissive FOR ALL policies. Direct TRUNCATE is revoked
  because it is outside RLS. Profile deletion is denied; item/order mutation and
  deletion require existing admin authorization; top-up UPDATE/DELETE are server
  only. No new admin UPDATE/DELETE grants or permissive mutation policies are added.
- Aborts atomically on inherited financial/TRUNCATE privileges, client owner-role
  or privileged-role membership (including NOINHERIT) or superuser/BYPASSRLS
  attributes, missing prerequisites, an invalid
  has_role signature/return type/EXECUTE grant/RPC argument names, named RPC
  overload ambiguity, or lack of trusted service_role BYPASSRLS. The enum cast in
  new policies prevents a text overload from changing SQL resolution. It does
  not silently modify role memberships or privilege-grant chains.
- Allows authenticated order INSERT only for the current user's unpaid gateway
  intent: status `pending_payment`, method `gateway`, null reference/transaction.
  This also applies to browser admins. Restrictive INSERT policy defeats other
  permissive INSERT policies. Restrictive UPDATE policy preserves admin-only
  updates without adding an UPDATE grant.
- Drops `Users can insert order items` and replaces `Users create own order items`.
  Both a permissive policy and a restrictive guard require the parent to be the
  caller's unpaid gateway order, with null payment reference and transaction.
  Appending after initialization or confirmation fails, including for browser
  admins. This is authorization containment, not inventory/pricing validation.
- Adds a restrictive false top-up INSERT policy to block old tabs/direct REST
  clients. Privileged server verification remains permitted for prior payments.

No existing orders, items, profiles, balances or top-ups are rewritten. Existing
confirmed orders do not become proven payments merely because this migration is
applied. The transaction has a five-second lock timeout and should fail atomically
rather than leave partial protection. Do not edit old migrations or rerun this
forward migration as an idempotent maintenance script.

## Application compatibility

- `src/lib/profileWrites.ts`: explicit safe payloads; update an existing profile,
  insert only when missing, retry a narrow update for a duplicate-key race.
  No profile upsert or UPDATE of id. Denied and zero-row writes fail explicitly.
- `src/stores/authStore.ts`: stores phone-bound pending names before signup can
  emit SIGNED_IN. Clears them only after a matching account's successful save;
  failed saves can retry on token refresh/bootstrap. Unbound legacy pending data
  is not applied to another account. Profile edits merge into local state only
  after persistence, and injected wallet properties are not merged. Auth event
  hydration is deferred outside the synchronous auth callback to avoid session
  lock deadlock; stale queued hydration/bootstrap cannot undo signout. Malformed
  pending JSON is ignored, transport failures clear their pending signup, and an
  immediate new-account session does not inherit another account's balance/data.
- `src/pages/checkout/CheckoutPayment.tsx`: wallet action disabled, no client
  balance deduction or confirmed-order branch. Gateway intent remains unpaid.
  Corrects missing `variantId` access to use the cart's productId for product_id,
  null actual variant reference, and the cart id for React keys. Payment/item
  failures keep cart/address data; an already-created unpaid orphan order can
  still remain after an item failure (existing transactionality limitation).
- `src/pages/account/Wallet.tsx`: balance/activity remain visible; new top-up
  action removed; copy no longer promises automatic wallet spending.
- `server/bitpay-routes.js`: `/wallet-init` returns 503/WALLET_TOPUPS_DISABLED
  before constructing any database client or making any provider request.
  `/init` requires gateway method as well as pending state and ownership.
  `/wallet-verify` and `/verify` are retained, including their existing risks.
  A narrow input-shape guard rejects null/empty/non-string references before any
  database/provider call. Settlement logic is otherwise unchanged.
- `src/pages/admin/AdminOrders.tsx`: requires a returned row from conditional status
  UPDATE; only existing fulfillment states offer fulfillment options. Payment
  states/unknown states render read-only, with explicit pending_payment copy.
  The migration also enforces the OLD/NEW transition boundary in an invoker trigger.

The email addition is contact data, not a change to verified Auth identity. If an
existing email column has incompatible type/constraints, stop and resolve that
schema mismatch before rollout; ADD COLUMN IF NOT EXISTS does not repair it.

## Semantics review and compatibility findings

| Finding | Status and evidence |
| --- | --- |
| Table grants override a column-only revoke; privileges also accumulate through PUBLIC and role membership | Both grant levels are reset; effective privileges checked for anon/authenticated. Inherited unsafe grants abort. Tested on PostgreSQL 17. |
| Owners/superusers/BYPASSRLS are outside normal RLS | Client owner/privileged-role membership and role attributes now block migration, including NOINHERIT membership; trusted server bypass is required for old settlement. MEMBER is a deliberately conservative role-graph gate, not a claim that membership automatically confers USAGE/SET on PostgreSQL 16+. No FORCE RLS change to signup/settlement owners. |
| PERMISSIVE policies OR together, including FOR ALL; RESTRICTIVE policies AND together but require a permissive allow | Hostile PUBLIC FOR ALL policies are included in fixtures; the new guards preserve own unpaid insertion while denying financial mutation and cross-user items. Existing restrictive SELECT policies can still cause RETURNING/admin failures and need inventory. |
| PostgREST uses named RPC arguments; SQL untyped literals may resolve to another overload | Exact enum signature, boolean result, EXECUTE grant and `_user_id`/`_role` names checked. New policy calls explicitly cast app_role. Missing/ambiguous RPC scenarios abort. Function body, owner and pinned search_path still need schema-only review. |
| Existing form always sends email, even when only editing names | Previously optional grant could leave every save broken on the initial schema. Migration now adds the missing column; both missing/existing-column branches are tested. |
| Signup trigger must work as Auth's database identity, not just as a superuser test | Fixture uses a non-owner/non-BYPASSRLS Auth writer invoking the historical SECURITY DEFINER trigger. This passes locally but does not replace real Supabase Auth integration. |
| Restrictive UPDATE can silently affect zero rows | Profile writes already require returned identity; admin order status now also requires a returned row before success. Missing admin table privilege is intentionally not fixed by broadening grants. |
| Legacy verification could match null stored/submitted references | Input guard now rejects malformed/uninitialized references before DB/provider work. Valid string-reference verification is covered by mocked provider tests. |
| Logged-out payment returns can be lost | Fixed locally in the continuation: callback-only returnTo URLs survive password/OTP/signup navigation and reloaded auth routes. Focused mocked router tests pass. Real Auth/PostgREST callback integration remains a gate; concurrent/crash-safe settlement remains blocked as documented above. |
| Admin order/profile relation may differ from the checked-in schema | AdminOrders.tsx:45-59 embeds profiles, but the baseline order FK points to auth.users. Verify the live PostgREST relationship and admin SELECT policy instead of assuming the mocked admin test proves list loading. |
| Historical dependencies are not reproducible | 202401 migrations predate their tables and one reverses has_role arguments. New preflight detects required relations/functions, but does not repair or validate the whole history. Apply this migration only to the reviewed matching baseline. |

Primary references checked for this review:
[PostgreSQL CREATE POLICY](https://www.postgresql.org/docs/17/sql-createpolicy.html),
[RLS and owner/bypass semantics](https://www.postgresql.org/docs/17/ddl-rowsecurity.html),
[privilege semantics](https://www.postgresql.org/docs/17/ddl-priv.html),
[Supabase Auth event callbacks](https://supabase.com/docs/reference/javascript/auth-onauthstatechange),
[Supabase signup trigger guidance](https://supabase.com/docs/guides/auth/managing-user-data).

The continuation also checked [PostgreSQL trigger behavior](https://www.postgresql.org/docs/17/trigger-definition.html)
and [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Local verification

Run unit/component/route tests with `npm test`. `vitest.config.ts` points envDir
at `src/test` so root .env files are not loaded. Every security test replaces
the Supabase client/provider fetch with synthetic mocks. Route tests invoke
Express handlers directly: they do not listen on a socket or contact Bitpay.

Run TypeScript with `npm run typecheck`. Run database tests with:

```powershell
$env:JAMI_TEST_PG_BIN = 'C:/Program Files/PostgreSQL/17/bin'
npm run test:security:db
```

On other systems, put initdb/pg_ctl/psql on PATH or set JAMI_TEST_PG_BIN to their
directory. Use an ordinary OS account that can run initdb. The runner accepts no
database URL, creates a fresh temporary cluster, chooses an ephemeral port, binds
only 127.0.0.1, uses explicit local connection arguments, clears inherited PG
variables and redirects password/service-file lookups to nonexistent files in
its temporary directory. It stops the server before removing its verified temp
directory. It never reads root .env or linked Supabase configuration.

The SQL suite uses actual PostgreSQL ACLs and RLS under anon, authenticated,
admin-user and service-role contexts. It tests explicit and inherited grants,
mixed wallet writes/upserts, zero-balance signup defaults, trigger compatibility,
paid-state/reference injection, cross-user item insertion, another permissive
true item policy, post-init/post-confirmation appends, old top-up readability,
trusted legacy settlement, anonymous grants/FOR ALL policies and denial. Eleven
refusal scenarios exercise inherited wallet/TRUNCATE access, ownership, privileged
role membership, function permissions/signatures/RPC overloads, service-role
bypass, missing relations and incompatible email columns.
A second fresh database tests an existing email column and historical data.

### Baseline limitation and remaining integration gate

Docker is unavailable in the current environment. The executed SQL suite uses
PostgreSQL 17 with a minimal synthetic auth.users/auth.uid contract, the explicit
dependency-correct subset of historical migrations listed in the runner, and a
reviewed drift fixture representing the confirmed live findings. It is NOT a
full Supabase Auth/PostgREST integration run or a clean full-history replay.

Historical 202401 migrations alter products/profiles before their checked-in
creation; one profile policy also reverses has_role arguments. They are unchanged.
Do not apply this test fixture to production or use it to reset migration history.

Before rollout, repeat the permission scenarios in a disposable **Supabase**
project with a reviewed schema-only baseline and its real Auth and PostgREST:

1. Use synthetic users and disposable keys only; verify the API URL is the test
   project's before any request. Do not link to the production project.
2. Create users through local/test Auth with outbound SMS disabled/test OTPs;
   test password login, OTP completion, trigger profile creation and signout.
3. With each actual access token, issue HTTP profile PATCH and POST requests,
   including the precise narrow app payloads and merge-duplicate upserts. Assert
   rejected financial payloads and unchanged balance, not just an HTTP code.
4. Test `.update(...).select('id').maybeSingle()` through PostgREST, missing-profile
   INSERT, duplicate race, failure retry, and email edits when that column exists.
5. POST paid/pending orders, cross-user/items and new top-ups directly. Assert
   rejected writes, correct ownership, and no historical-row changes.
6. Mock the gateway transport and exercise existing order/top-up callbacks.
   Include old sessions, refresh/reload and delayed callbacks. No test payments.

## Earlier first-pass results (superseded by continuation results above)

Final hardening results (2026-10-17):

| Command/check | Exact result |
| --- | --- |
| `npm test` | Exit 0: 6 files, 52 tests passed (profile writes 17, auth store 13, server routes 12, customer financial UI 6, admin status UI 3, existing placeholder 1) |
| `npm run typecheck` | Exit 1: 15 pre-existing diagnostics; none in changed implementation/tests |
| `npm run test:security:db` | Exit 0: 64 SQL permission assertions, 11 precondition-refusal/rollback scenarios, 1 existing-email/data-preservation case passed |
| Targeted ESLint | Exit 0 on changed application/test TS/TSX files |
| Node syntax + `git diff --check` | Exit 0 |
| Isolated production-mode Vite bundle | Exit 0: 2,191 modules transformed, built in 26.11s; root env and live sitemap generation bypassed |
| Full normal `npm run build` | Not run: live catalog network operation |
| Full disposable Supabase Auth/PostgREST | Not run: Docker unavailable; deployment blocker |

Unit tests emit expected denied-write logs and React Router future-flag warnings.
Database tests stop and remove the temporary cluster and its two test databases.
They do not reuse any existing server or connect to a remote host.
Node syntax checks for the changed server route and DB runner passed, as did
targeted ESLint on all changed/new application and test TS/TSX files and
`git diff --check`. Verification received only input-shape guards; provider
transport is mocked in tests. No payment request or production operation was run.

`npm run build` is deliberately NOT executed: scripts/generate-sitemap.mjs queries
the hardcoded live Supabase catalog before bundling. Instead, a production-mode
Vite bundle was built using `vitest.config.ts` (same production React plugin and
@ alias, isolated envDir), with a minimal child environment omitting credentials
and VITE_* variables. It bypasses sitemap generation and root .env loading. This
is a transpilation/bundling check, not the full normal release pipeline, browser
end-to-end validation or proof of payment safety. It passes with existing large
chunk and outdated Browserslist-data warnings; no update/download was performed.

The isolated bundling check used the local Vite binary with arguments
`build --mode production --config vitest.config.ts` in a child process whose
environment contained only PATH/SystemRoot/ComSpec/TEMP/TMP/PATHEXT/APPDATA/
LOCALAPPDATA/USERPROFILE. No VITE_* values or production credentials were passed.
Its ignored `dist/` output is local validation output, not a deployment artifact
approved by this review.

Full Supabase HTTP/Auth integration is **not run** (Docker unavailable), and is a
deployment gate. TypeScript exits 1 with 15 pre-existing diagnostics and no new
diagnostics in the changed implementation/tests. Initial pre-change
TypeScript had 22 diagnostics. Wallet removal and cart identity correction remove
7 of them; the remaining 15 are pre-existing:

- ProductFormDialog.tsx:304,378,386 (stale product types/form insert shape).
- ProductImagesManager.tsx:46,154,194 (unknown error.message).
- ProductVariantsManager.tsx:46,79,94,105 (unknown errors/update payload types).
- CartSync.tsx:43 (two diagnostics for stale carts.items types).
- lib/cartSync.ts:8,9 (stale cart upsert types).
- AdminProducts.tsx:143 (unknown error.message).

These are not suppressed, regenerated against production, or silently fixed in
this containment PR. Existing build scripts transpile with Vite without a type
gate; a successful Vite build would not establish type safety.

## Required production checks before any rollout

No live checks have been performed by this PR. Obtain a reviewed schema-only
inventory without secrets or customer records:

- Resolve frontend project URL vs supabase/config.toml project mismatch; confirm
  the Express server, migration target and intended production environment agree.
- Inspect all table/column/inherited grants, role memberships, owner/BYPASSRLS
  attributes and permissive/restrictive policies, including FOR ALL policies.
  Verify no callable privileged RPC or writable view bypasses containment.
- Check real defaults, NOT NULL rules and profile triggers; verify Auth's trigger
  owner can still insert profiles and service_role can settle prior transactions.
- Review all SELECT/ALL/RESTRICTIVE policies needed by profile RETURNING and
  parent-order subqueries, API table exposure/grants, function bodies, executable
  RPC overloads and any BEFORE/AFTER triggers with additional financial writes.
- Verify payment-state columns and policy names, actual email column, no new
  financial columns that also require protection, and exposed API schemas.
- Identify browser admin workflows relying on full-profile upserts, direct balance
  editing or appending initialized orders. Those actions intentionally stop.
  Confirm effective admin order UPDATE privilege; this PR does not grant it.
- Identify already initiated gateway/top-up callbacks and any old pending wallet
  orders; preserve verification endpoints. Do not auto-confirm/cancel/backfill.
- Resolve logged-out return recovery and confirm actual callback method/parameters,
  amount units, repeat-verification and already-verified provider behavior using
  an authorized separate contract/sandbox review. This PR made no gateway calls.
- Assess remaining gateway exposure and explicitly decide whether to suspend new
  gateway initiation separately. This PR must not be used as a safety approval.

## Deployment sequence (instructions only; nothing deployed)

1. Pass disposable Supabase HTTP/Auth checks, resolve target/schema questions and
   review remaining gateway exposure. Prepare matching app/server artifacts.
2. First deploy the server suspension of new wallet initiation, leaving legacy
   verification active. This closes the charge-creation boundary as early as
   possible. Old wallet checkout remains unsafe until the SQL step completes;
   keep this window tightly coordinated or use a brief checkout maintenance gate.
3. Apply only the reviewed forward migration atomically using the established
   production migration process. Do not replay/reorder/reset the historic schema.
   If preconditions or lock timeout fail, stop; do not bypass the guard.
4. Immediately deploy the compatible signup/profile and checkout UI. Old clients
   fail closed at the database; full-profile upserts and wallet attempts may show
   errors until refresh. Publish a clear wallet suspension notice.
5. Verify effective wallet privileges, direct financial-write rejection and
   cross-user item rejection; inspect permission errors and callback failures.
   Smoke-test permitted auth/profile actions without payments. Recheck historical
   rows using an approved process, and monitor legacy payment reconciliation.

## Forward-fix rollback

Keep the wallet suspension and database protections in place. A failed migration
rolls back atomically; resolve the specific precondition/lock issue and retry via
the normal migration process. After success, compatibility failures require a
new forward migration/app fix: allow only a demonstrated safe profile field,
correct the narrow signup payload, or temporarily suspend new gateway initiation
while preserving old verification. Roll back presentation only to a compatible
version. Never restore broad profile writes, unconditional item inserts, paid
customer order inserts, or wallet initiation. No balance-data rollback is required
because historical financial data is not changed by the migration.

## Remaining security risks

Gateway totals/prices/shipping still originate in client data; quantity, stock,
catalog selection and amount consistency are not authoritative. Item insertion
and initiation are not one transaction; concurrent insert/init can still race.
Order creation failures/retries can leave unpaid duplicates/orphans. Settlement
still has state races, ignored order-update errors, reference overwrites, separate
transaction uniqueness domains, and non-atomic top-up crediting. Old payment
verification remains available for customer recovery, not because it is repaired.
SMS-hook authentication/OTP logging and other audit findings remain separate work.

Next PRs should implement trusted atomic checkout, immutable payment attempts,
ledger-based wallet settlement and reconciliation before restoring wallet flows.
See [the separate architecture and migration proposal](trusted-checkout-proposal.md).

## Complete local PR file manifest

All files remain local/uncommitted; the branch was retained. Historical migrations
are unchanged. The pre-existing untracked `jami-security-review.zip` is untouched
and is not part of this PR's change manifest.

| File | Purpose |
| --- | --- |
| `supabase/migrations/20261017143036_first_security_containment.sql` | Reviewed, unapplied forward containment migration and preconditions |
| `src/lib/profileWrites.ts` | Narrow, failure-aware profile/signup writes and optional email normalization |
| `src/stores/authStore.ts` | Pending-signup, persistence and stale-auth compatibility |
| `src/pages/admin/AdminOrders.tsx` | Constrained fulfillment options, payment labels, conditional persisted status updates |
| `server/bitpay-routes.js` | Wallet-init suspension, gateway method check, verification input guard |
| `src/lib/profileWrites.test.ts` | Profile/signup regression tests |
| `src/stores/authStore.test.ts` | Authentication/state regression tests |
| `src/test/bitpayRoutes.test.ts` | Mocked initialization/verification regressions |
| `src/test/adminOrderContainment.test.tsx` | Admin zero-row/denied/success regressions |
| `supabase/tests/security_containment.sql` | Real PostgreSQL ACL/RLS/trigger assertions |
| `supabase/tests/fixtures/auth.sql` | Minimal Auth contract and non-bypass Auth writer |
| `supabase/tests/fixtures/containment-before.sql` | Hostile grant/FOR ALL/overload and schema-drift fixtures |
| `scripts/test-security-db.mjs` | Isolated two-database runner, refusal scenarios and two-connection item-race diagnostic |
| `docs/security-containment.md` | Review, blockers, results, deployment and forward-fix rollback |
| `docs/trusted-checkout-proposal.md` | Separate proposed trusted-checkout architecture/migration sequence |
| `src/pages/checkout/CheckoutPayment.tsx` | Retained first-pass wallet suspension and unpaid gateway intents |
| `src/pages/account/Wallet.tsx` | Retained first-pass top-up UI suspension |
| `src/test/financialContainment.test.tsx` | Retained customer financial UI/legacy verification coverage |
| `package.json` | Retained TypeScript/database test commands |
| `vitest.config.ts` | Retained isolated test environment configuration |
| `scripts/build-isolated.mjs` | Minimal-env production/development bundle checks |
| `src/lib/orderFulfillment.ts` | Payment-safe fulfillment option boundary |
| `src/lib/authReturn.ts` | Callback-only auth return validation |
| `src/components/auth/RequireAuth.tsx` | Preserve callback pathname/query/hash |
| `src/components/auth/RedirectIfAuthenticated.tsx` | Resume validated return after login |
| `src/pages/SignIn.tsx` | Password login/auth links preserve return |
| `src/pages/SignUp.tsx` | Signup/OTP links preserve return |
| `src/pages/OtpRequest.tsx` | OTP navigation preserves return |
| `src/pages/OtpVerify.tsx` | OTP completion/fallback preserves return |
| `src/test/paymentReturn.test.tsx` | Logged-out order/wallet callback regressions |
