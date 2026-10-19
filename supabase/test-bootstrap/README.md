## Follow-up preparation — 2026-10-19
The manifest now contains 25 files, including three locally prepared Phase 0 follow-ups. Hash format v2 normalizes UTF-8 CRLF to LF in SQL text before hashing; other content changes still fail. The original 22 migration files are unchanged. Do not apply the hosted test bootstrap or these new migrations without separate approval. Private return images require a coordinated frontend/database release; payment recovery stays off until its migration and legacy callback compatibility are reviewed. The historical baseline description below refers to the original 22 files.

# Fresh jamimode-test bootstrap ? prepared, not remotely executed

Only target: `cifhcrlmjnsxpkhyloen` (`jamimode-test`). Production `klfmscuogsocfjxqkuib` is off-limits.
All original files in `supabase/migrations` remain unchanged. This directory is a separate psql bootstrap, NOT a Supabase CLI migration directory. Do not use the repository's linked CLI state, `db push`, `db reset --linked`, or normal build/seed scripts for this procedure.

## What is included

`manifest.json` pins all 22 original/copy SHA-256 hashes, order, and the one source correction; it also pins preflight/fix hashes. `bootstrap.psql` uses that order, stops on errors, wraps the first 20 baseline files in one transaction, and then runs each security migration and the fixes in their own transactions. It does not populate or repair Supabase CLI migration history. Keep this distinction when planning future migrations; do not follow it with an automatic replay of the original directory.

`preflight.sql` requires a fresh application schema plus hosted Auth/Storage. The `target_project` variable is an assertion, not proof of the connected server's identity. The connection must be independently pinned and reviewed before execution.

`fixes.sql` supplies:

- Anonymous active-product SELECT without calling the authenticated-only role helper; authenticated admin catalog policies remain.
- Explicit grants on the replacement carts and later tables, independent of hosted defaults; RLS stays enabled.
- Column-scoped fulfillment UPDATE with the existing admin policies and containment trigger retained.
- Column-scoped support/return/message updates and customer inserts that exclude status/admin-note fields.
- Direct orders/profile and messages/profile relationships for PostgREST, retaining Auth foreign keys.
- The missing public product-images bucket; no production images are copied.

The role helper signature, UUID generation and functions come from the baseline and PostgreSQL. No extra application extension is needed on a modern hosted Supabase database. Keep `checkout_private` outside the exposed API schemas.

## Exact migration source order

01. `20260817121647_cb255752-e179-4ab4-8fd9-fa53002fe795.sql`
02. `20240101000000_add_product_flags_and_images.sql`
03. `20240101000001_fix_profiles_rls.sql` ? corrected argument order in this copy only.
04. `20260817121702_1fe1a749-b749-4285-a54f-8c8a6d547e42.sql`
05. `20260817121723_ea2e2174-8295-43d6-bdb8-1b04e1a89bc0.sql`
06. `20260817121800_add_shopify_variant_id.sql`
07. `20260817122000_add_tags_to_products.sql`
08. `20260817122100_add_product_details.sql`
09. `20260817122200_add_product_colors.sql`
10. `20260901000000_checkout_schema.sql`
11. `20260901000001_checkout_schema_fix.sql`
12. `20260902000000_fix_orders_rls_and_address.sql`
13. `20260903000000_create_tickets_table.sql`
14. `20260904000000_change_brand_to_array.sql`
15. `20260911000000_create_return_requests.sql`
16. `20260912000000_create_user_messages_table.sql`
17. `20260920154818_replace_carts_schema.sql`
18. `20260921000000_add_out_of_stock.sql`
19. `20260921122000_add_bitpay_columns.sql`
20. `20260922000000_create_wallet_topups.sql`
21. `20261017143036_first_security_containment.sql`
22. `20261017180000_trusted_checkout.sql`

After file 22, execute `fixes.sql`; the entrypoint then requests a PostgREST schema-cache reload. Product flags must follow table creation, address/order/item schema changes precede security policies, and containment precedes trusted checkout. The source profile-policy file has reversed `has_role` arguments; only its isolated copy is corrected.

## Offline validation ? safe to run now

From repository root:

```powershell
npm.cmd run test:bootstrap
npm.cmd run test:bootstrap:db
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build:isolated
npm.cmd run build:local-test:offline
```

The database validation creates a new temporary loopback PostgreSQL cluster, strips libpq connection settings, never loads `.env`/`.temp`, runs every copied migration plus fixes, and checks catalog/ACLs, stock, synthetic settlement/idempotency and admin fulfillment. PostgreSQL 17 tools must be on PATH (or set `JAMI_TEST_PG_BIN` to their directory). `validation/platform.sql` is a local synthetic platform stub: NEVER run it on hosted Supabase. It is not part of `bootstrap.psql` and is not a seed fixture.

The offline local-test build uses synthetic keys, verifies removal of the production preconnect and exclusion of a server-secret sentinel. It never starts the app or contacts a project. These checks do not prove hosted Auth/PostgREST compatibility.

## Remote bootstrap ? requires separate approval; NOT executed

1. Independently confirm the dashboard project name/ref, emptiness of its application schema, database hostname, database password and TLS certificate. Do not copy a production connection string. Obtain the certificate for the test connection and use an absolute local path.
2. Run the manifest check above. Review `fixes.sql` and the isolated corrected policy.
3. In a dedicated PowerShell terminal, remove inherited `PG*` connection overrides before the approved connection. The following commands are instructions only:

```powershell
Get-ChildItem Env:PG* | Remove-Item
$testCertificate = 'C:/path/to/reviewed-test-project-ca.crt'
psql -X -W --dbname="host=db.cifhcrlmjnsxpkhyloen.supabase.co port=5432 dbname=postgres user=postgres sslmode=verify-full sslrootcert=$testCertificate" -v ON_ERROR_STOP=1 -v target_project=cifhcrlmjnsxpkhyloen -f supabase/test-bootstrap/bootstrap.psql
```

The password is entered at the prompt, never placed in shell history. Do not substitute an unreviewed pooler URL if the direct host lacks local IPv6 reachability; stop and review a test-only connection instead. Do not wrap the entrypoint in `psql --single-transaction` because the security files own their transactions.

On failure, stop. Do not rerun, delete data, repair migration history or reset a remote project automatically. A later phase can fail after an earlier phase committed. Diagnose only the test project with approval and review a recovery plan.

4. Verify hosted exposed-schema settings, exact grants, private-schema isolation, Auth signup trigger and PostgREST relationships before proceeding. The local stub does not replace these hosted checks.

## Dedicated environment and clean seed ? requires approval; NOT executed

Create a dedicated file **outside this workspace**, for example `$env:LOCALAPPDATA/JamiModeTest/checkout.env.local`, using `test.env.example`. Fill only the test project's publishable key, server secret key (`sb_secret_...`, mapping to service_role), and a unique synthetic-user password of at least 16 characters. The harness deliberately rejects legacy privileged JWT keys to avoid confusing them with public keys. No existing keys are changed or rotated.

Do not use `.env`, put secrets in a `VITE_` variable, or reuse a production environment. The launcher rejects unexpected file variables and inherited BitPay/browser-secret variables. It passes only the URL and publishable key to Vite; server configuration never enters its process. Local-test Vite disables root env loading and denies env/local files. Configuration files inside the web workspace are rejected.

After bootstrap and separate seed approval:

```powershell
$testEnvFile = Join-Path $env:LOCALAPPDATA 'JamiModeTest/checkout.env.local'
node scripts/local-test.mjs seed $testEnvFile
```

The seed requires no Auth users and no products, creates three confirmed synthetic phone/password users through the test Admin API (no SMS), then inserts zero-balance profiles, one admin role, owned addresses, a category, clean products/variants and negative cases. It never imports old fixtures, orders, payments, wallet credits or production data. No provider is contacted. Synthetic login phones are `+12025550101`, `+12025550102`, `+12025550103`; use the unique configured test password. Auth must permit phone/password login in this test project; provider/OTP settings are not changed automatically. Do not configure the real SMS hook for this isolated checkout test.

Seeding is intentionally one-shot, not destructive or automatically retryable. If it partially fails, inspect the test project; do not blindly rerun or delete users. Creating these remote users has NOT been performed.

## Run the local fake checkout ? requires approval for test-project access

In two terminals from repository root:

```powershell
# Terminal 1
node scripts/local-test.mjs backend $testEnvFile
# Terminal 2 (set $testEnvFile in this terminal too)
node scripts/local-test.mjs frontend $testEnvFile
```

Open exactly `http://127.0.0.1:8080`. Backend binds only `127.0.0.1:3001`; Host, loopback source and POST Origin checks reject foreign callers. Vite proxies `/api/bitpay`; browser data/Auth access uses only the allowlisted test origin. Supabase Auth and persisted auth/cart/checkout state use separate local-test storage keys. Production's default configuration, storage names and real router remain unchanged outside local-test mode.

The dedicated harness injects real test Auth/RPC clients into `createPaymentRouter`, an enabled fake provider and a blocked legacy provider. Its process-wide fetch guard and client outbound allowlist permit only this project's Auth validation and the five reviewed checkout RPC endpoints; provider URLs, production, arbitrary endpoints and redirects are blocked before transport. It uses no BitPay credentials or HTTP adapter. A local fake-payment page offers explicit success/cancellation. A fake success is accepted only after approval on that page, then the normal callback path settles synthetic test rows through the trusted RPCs. Wallet spending/new top-ups remain disabled.

Fake provider sessions are in memory. Restarting the harness loses approval state; an existing ready/creating order may need review. Use new synthetic checkout selections/idempotency keys rather than treating restart as payment recovery. The harness is a local test tool, not a deployment or production reconciliation implementation.

Optional local-test bundle: `node scripts/local-test.mjs build $testEnvFile`, output `dist-local-test`. Do not use ordinary `npm run build` for this test: its sitemap script still targets production and is intentionally unchanged.

## Manual acceptance after approval

- Customer one can sign in, browse active products, save an owned address/cart, review a server quote and create an immutable order.
- Two units of the product without variants plus express shipping total 2,020,000 IRR; two 20,000-IRR variant units plus express total 2,040,000 IRR and leave zero stock.
- The localhost fake approval produces exactly one paid attempt/outbox event; duplicate callbacks do not settle twice. Cancellation does not mark paid.
- Foreign addresses, inactive/unavailable/fractional-price products, unavailable options, insufficient stock, stale quotes and direct browser financial writes are rejected.
- A browser admin can read customer details through the direct relationship and make allowed fulfillment transitions, without editing money/payment fields.
- Run real hosted Auth/PostgREST and cross-user permission checks before claiming end-to-end hosted coverage. No real gateway or financial operation is authorized by these instructions.
