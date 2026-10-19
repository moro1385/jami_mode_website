# Phase 0 follow-up — prepared locally, 2026-10-19

Base: security/first-containment at 4960b6f. These changes are UNCOMMITTED and NOT DEPLOYED. No remote migration, real provider request, Auth setting change, push or merge was performed. The earlier Liara ZIP represents the prior release, not this work. Do not upload this entire working tree without the coordinated database review below.

## Implemented behavior

- Receipt URL is no longer proof of payment. GET /api/bitpay/orders/:id/status authenticates the caller, filters the owned order, returns minimal paid status and disables caching. Missing/foreign/error states never report payment success. The receipt clears only a matching user/order/cart snapshot, once; a later cart and old receipt remain separate. A paid legacy row with payment_state=legacy is deliberately not inferred paid from fulfillment status; historical receipt compatibility needs review.
- The checkout key now retains its order id until the authoritative receipt consumes it. Ambiguous returns retain the cart and direct the customer to order tracking. CHECKOUT_EXPIRED rotates the old key only after the server reports expiry; pending-order limits do not create another order.
- Orders cached in Auth state survive only for the same account. Auth identity changes clear the previous account/cart/checkout state synchronously; stale address completions and an older password login cannot replace a later account.
- Basic headers: nosniff, DENY framing, strict-origin-when-cross-origin referrer policy, disabled camera/microphone/geolocation, HSTS max-age on HTTPS clients. X-Powered-By disabled. API JSON/urlencoded bodies capped at 32 KiB, generic JSON errors, unknown API routes return JSON 404. No strict CSP was imposed without catalog/third-party/browser validation.
- Payment API abuse containment: bounded process-local IP windows, 120 requests/minute/key, at most 10,000 keys, expired-key cleanup, controlled 429/503 and Retry-After. It is not a distributed limiter or WAF. JAMI_TRUST_PROXY_HOPS defaults to false; only explicit 1/2 hops are accepted. Verify Liara topology before setting it. Without that review, the reverse proxy can be one shared key and affect aggregate throughput. Never trust arbitrary X-Forwarded-For or all proxies.

## Local-only database migrations

1. 20261019075415_phase0_payment_recovery.sql
   - Private immutable verification journal; service-only invoker RPCs. A v2 attempt's caller must authenticate and own its order before acquiring the durable provider-verification claim.
   - A prior verifying/in-flight/unknown claim is not repeated automatically. Only a validated successful adapter result becomes verified evidence, persisted in a separate committed RPC before settlement.
   - A later callback reuses verified evidence and retries atomic settlement without another provider verification. trusted_reconcile_verified processes bounded batches of this evidence only, without network/provider calls.
   - PAYMENT_RECOVERY_ENABLED defaults OFF. Install/review the migration first, then separately approve flag activation. The recovery path is restricted to version 2: existing version-1 legacy order/wallet callbacks retain their existing transport and settlement path, even without Authorization. Their ambiguity recovery remains unresolved.
   - A crash after the provider consumes verification but before evidence commits remains an operator-reconciliation case. Status 11 alone is not proof. A forged or invalid authenticated callback that leaves a verifying claim needs operator review; the code never retries a potentially consumed verification blindly. Ambiguous initiation/creating also needs provider evidence and manual follow-up. No fabricated transaction/reference, forced success, automatic refund or stock release is provided.

2. 20261019075416_phase0_private_return_images.sql
   - Makes only return-request-images private; limits MIME types to JPEG/PNG/WebP and size to 5 MiB. Restrictive guards isolate it even from broad unrelated permissive Storage policies. Explicit enum has_role overload prevents accidental text-overload resolution.
   - Owner/admin read; exact owned upload folder; no client overwrite; referenced return evidence cannot be deleted by its customer. Admin delete retained. Return inserts require owned order, pending status, no admin note, <=5 images and bounded description/owned paths.
   - Frontend stores paths, uses 60-second signed URLs refreshed while mounted, and converts same-project legacy public URLs to private paths. Arbitrary external/unsafe references are rejected. Failed uploads receive best-effort orphan cleanup; ambiguous writes must not erase referenced evidence. Public exposure that happened before privatization cannot be retroactively undone.
   - Coordinate the database/frontend cutover, account for old browser tabs and short-lived cached links, and validate Storage HTTP with real owner/other/admin sessions in the separate approved environment. Synthetic SQL Storage tests do not test the actual service.

3. 20261019075417_phase0_reservation_expiry.sql
   - Wraps the reviewed checkout in checkout_private; public service-only entrypoint remains unchanged. Per-user advisory serialization caps new unpaid v2 orders at 5.
   - New reservations expire after 30 minutes ONLY when no payment attempt has ever been claimed and no payment reference/transaction exists. Product/variant stock restoration and cancellation occur atomically once. Parent row locking serializes expiry against initiation; locked orders are skipped in bounded batches.
   - Creating/ready/settled or otherwise ambiguous attempts NEVER expire by age. Existing unregistered orders are not backfilled. Products without variants still lack a reviewed quantitative inventory source; quantities are not invented.
   - trusted_expire_unstarted can run as a separately approved service-role maintenance task. No cron/scheduler is installed. Checkout invokes owner-scoped cleanup opportunistically; malformed/stale requests can roll back that transaction, so scheduled maintenance is still needed for unattended expiry. Cleanup returns structured expiry/limit outcomes instead of rolling back those successful cleanup decisions.

Apply none of these automatically to production or the test project. The security invariants require the database changes and frontend/server release to be reviewed together. No table is newly exposed to the Data API; checkout_private stays inaccessible to client roles. All new public RPC privileges are revoked from PUBLIC/anon/authenticated and granted only to service_role. Avoid automatic rollback to insecure old SMS or non-atomic wallet implementations.

## Reproducibility and tools

- Bootstrap manifest v2 covers 25 migrations. UTF-8 SQL hashes normalize CRLF to LF; actual content drift still fails. The original 22 source migrations are unchanged. The single documented profile-policy correction remains confined to its test-bootstrap copy. No migration history was repaired or replayed remotely.
- npm package-lock.json remains the Liara authority; old Bun locks are retained but not the release authority. No automatic audit fix --force was used.
- Compatible lock updates plus deliberate Vite 6.4.3 / Vitest 4.1.11 upgrade were tested. Local runtime is Node 24.16.0. Vitest 4 requires a supported Node 20/22/24+ environment; verify the actual CI/host Node version before release. Vite 6 and the existing SWC plugin peer ranges are compatible.
- npm audit: initially 29 affected packages (21 high, 2 critical, 6 moderate); final 13 (8 high, 0 critical, 5 moderate). Remaining chains include Tailwind 3, its parser/glob/watch dependencies, lovable-tagger and moderate router advisories. Counts are package/advisory graph results, not 13 demonstrated production exploits. No claim that all dependency advisories are fixed. Tailwind 4 would need a separate CSS/browser migration and visual QA; it was not forced during this security patch.
- Vite dev host is loopback in every mode. This is containment, not a substitute for dependency remediation.

## Evidence

- 352 unit/component tests across 17 files pass, including authoritative receipt, cross-account races, signed-image boundaries and durable recovery orchestration.
- A fresh separate folder with no .env, .git, node_modules or linked-project metadata installed 662 packages with npm ci --offline --ignore-scripts; tests, TypeScript and Vite 6 build pass. Windows-only; not an actual Git clone or Linux build.
- ESLint: 0 errors, 14 existing warnings. Production build retains the large-chunk warning.
- Fresh disposable PostgreSQL 17 validates the original checkout, rollback/ledger protection, 25-file bootstrap, new verification journal, replay after injected settlement failure, expiry, pending cap and synthetic Storage RLS.
- Actual separate PostgreSQL sessions test one verification claim, expiry vs initiation, one-time concurrent stock restoration, and the earlier last-stock/duplicate-wallet/initial-claim races.
- Real local HTTP server without credentials/provider access passes generic 404, authenticated status rejection, 400 malformed JSON, 413 oversized body, headers/no X-Powered-By and rate limiting despite spoofed forwarding headers. Its child process was stopped after checking.
- Auth/PostgREST/Storage HTTP against hosted test, real successful payment, provider status-11 recovery, Liara headers/topology and live source identity are NOT proven by those local tests.

## Release gates still open

Approval for test migrations and controlled hosted integration; valid legacy callbacks; provider-backed manual recovery procedure; scheduling maintenance/reconciliation; variantless stock counts and safe release after a gateway attempt; remaining dependency findings and CSP/proxy/distributed rate controls; actual Git/CI/main/Liara traceability; database backup/restore plan (backup was previously cancelled). Phase 0 remains incomplete. Do not mark preparation as deployed/Done.

Sources consulted: https://supabase.com/docs/guides/storage/security/access-control ; https://supabase.com/docs/reference/javascript/storage-from-createsignedurl ; https://v6.vite.dev/guide/migration ; https://v4.vitest.dev/guide/migration ; primary maintainer advisories and npm audit JSON retained outside the repository. React Router's GHSA-2w69-qvjg-hvjx specifically excludes Declarative BrowserRouter mode; this does not waive different router advisories or erase audit results.

## CI preparation
.github/workflows/phase0-checks.yml adds secret-free PR/push checks with pinned official checkout/setup-node v5 commit SHAs, read-only contents permission and persisted Git credentials disabled. It installs Node 24, runs frozen npm installation without lifecycle scripts, tests/typecheck/lint/offline build and disposable database suites. It does not deploy or access hosted Supabase. YAML was parsed locally; the workflow was not pushed or run on GitHub, so CI success and Linux execution remain unproven. PostgreSQL tools are installed from the ephemeral Ubuntu runner repositories.


## Verified continuation before publication
- The three follow-up migrations were explicitly approved and installed ONLY on jamimode-test. Hosted versions: 20261019083736 payment recovery, 20261019083758 private returns, 20261019083809 reservation expiry. Source SQL filenames retain their CLI-created timestamps; do not blindly db push to reconcile these histories. Production follow-up migrations remain unapplied.
- Hosted Auth/Storage HTTP: 12 positive/negative checks with three temporary email accounts passed, including owner/admin signed downloads, other/anonymous denials, public URL denial, no overwrite, owned folder, MIME and orphan cleanup. Generated users, sessions and objects were removed; independent SQL confirmed cleanup. Phone provider remained disabled.
- Test harness now exercises durable recovery and permits only pinned test-host RPCs and GET-only receipts. Actual local HTTP with doubles verified that retry after settlement failure consumes provider verification once.
- Private image display is bound to account/reference, clears on signout, rejects stale refresh results and falls back on load errors. Local browser fixture using actual components plus synthetic services verified legacy JPG conversion, account change/signout and paid/pending/forged receipts. This is not a complete hosted browser payment.
- Final local suite: 360 tests / 18 files PASS; TypeScript PASS; last changed-file lint PASS. Exact 206-file runtime source artifact, selected by installed official Liara helper, passed frozen offline npm install, production Vite6 build and server syntax. Existing large-chunk warning remains. The build deliberately skipped the live sitemap query.
- Read-only production preflight: checkout body exactly matches reviewed baseline; five financial RPCs remain service-only invokers. There are three v2 ready attempts and four pending orders (one legacy, three v2); these were not settled, expired or cancelled. No account currently hits the five-pending cap. Old attempts/orders are not auto-backfilled. The return bucket remains public with two JPG objects and zero return requests. No object content was downloaded.
- Owner reported Liara Node24.22.0 and Cloudflare grey-cloud DNS-only mode. Official Liara Express guidance proposes trust proxy1; actual local HTTP verified client separation and prefix spoof resistance for that configuration. Configure JAMI_TRUST_PROXY_HOPS=1 during a separately approved standard Liara release, subject to route verification. PAYMENT_RECOVERY_ENABLED remains OFF. These environment values were not set by this review.
- Supabase/Notion connectors were unavailable in the final continuation; official Supabase CLI SELECT-only Management API queries provided the production preflight. Liara management connection timed out, so the Node value is owner-reported. No new Notion edit is claimed for this continuation.
- User separately authorized commit, branch push and merge to main. That authorization does NOT apply these production migrations, configure the host or deploy the site. Release still requires the coordinated cutover, existing payment handling and runtime/proxy smoke checks. Backup remains cancelled and Phase0 remains incomplete.
