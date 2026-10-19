# Isolated test bootstrap remediation

Implemented on `security/first-containment`. Existing uncommitted work and all 22 original migrations were preserved. No remote SQL/migration, remote Auth user creation, production/project access, real provider request, credential change, commit, push, merge or deployment was performed.

## Review and execution instructions

The [bootstrap README](../supabase/test-bootstrap/README.md) contains the exact 22-file order, connection/TLS checks, approval-only psql command, clean Auth/data seed command and localhost launch instructions. [manifest.json](../supabase/test-bootstrap/manifest.json) pins source/copy hashes and scoped-fix hashes. This psql bootstrap deliberately does not write Supabase CLI migration history; automatic replay of the original migration directory is not safe afterward.

## Changed/added files in this remediation

- `supabase/test-bootstrap/manifest.json`, `bootstrap.psql`, `preflight.sql`, `fixes.sql`, `README.md`, `test.env.example`.
- `supabase/test-bootstrap/migrations/`: copies of every original migration, with the profile-policy argument correction confined to its copy. Exact filenames are in the manifest/README.
- `supabase/test-bootstrap/fixtures/checkout.js`: synthetic Auth descriptions and catalog/ownership/negative fixtures.
- `supabase/test-bootstrap/validation/platform.sql`, `assertions.sql`: local-only platform stub and real PostgreSQL validation; excluded from the hosted bootstrap.
- `config/supabase-public.js`, `config/supabase-public.d.ts`: public configuration, exact test-ref checks and storage namespaces.
- `src/integrations/supabase/client.ts`, `src/stores/authStore.ts`, `cartStore.ts`, `checkoutStore.ts`: environment configuration and test-only session/cart/checkout isolation; existing production defaults/storage names retained.
- `vite.config.ts`: local-test env-loading isolation, loopback binding, proxy, sensitive-file denylist, production preconnect removal in test mode.
- `server/test-harness/config.js`, `fake-provider.js`, `app.js`, `start.js`: server-only allowlisted clients, process/client fetch guard, injected fake/current and blocked legacy providers, loopback/Host/Origin gate and explicit fake approval/cancellation page.
- `scripts/local-test.mjs`, `seed-local-test.mjs`, `check-test-bootstrap.mjs`, `test-bootstrap-db.mjs`, `build-local-test-offline.mjs`: sanitized launch, one-shot empty-project seed, manifest verification, disposable DB and bundle isolation checks.
- `scripts/build-isolated.mjs`: synthetic public configuration for offline compilation; root environment and sitemap remain excluded.
- `src/test/localTestIsolation.test.ts`, `fakeCheckoutHarness.test.ts`: 15 focused new tests. `src/test/setup.ts` now also supports Node test files.
- `package.json`: test/bootstrap/isolated test-build commands. `.gitignore`: isolated test build output.

The existing real payment provider/router and original SQL were not modified by this remediation. The normal build's production sitemap step remains unchanged and must not be used for isolated testing.

## Validation performed

| Command/check | Result |
| --- | --- |
| `npm.cmd test` | 208 passed, 10 files; includes real loopback HTTP with injected synthetic Auth/RPCs. No provider network. |
| `npm.cmd run test:bootstrap` | All 22 source/copy hashes, coverage, dependencies, order and fix/preflight hashes passed. |
| `npm.cmd run test:bootstrap:db` | Passed on a new temporary PostgreSQL 17 cluster, loopback only; all 22 migrations, scoped fixes, anonymous catalog read, ACL isolation, stock, settlement replay, direct relationships and admin fulfillment. Cluster stopped and its own temp directory removed. |
| `npm.cmd run typecheck` | Passed, no diagnostics. |
| `npm.cmd run lint` | Passed, 0 errors; 14 existing warnings. |
| `npm.cmd run build:isolated` | Passed. Existing bundle-size and Browserslist-age warnings. No sitemap/provider/project request. |
| `npm.cmd run build:local-test:offline` | Passed using synthetic values; production preconnect removed and backend-secret sentinel absent from emitted browser files. |
| `git diff --check` and JS entrypoint syntax checks | Passed. Original migration hashes also verified against untouched source files. |

Windows sandbox restrictions initially blocked esbuild/config traversal and PostgreSQL restricted-token startup. These local-only checks passed after automatic tool approval for execution outside that sandbox. No remote access was needed.

## Remaining approval gates and limits

- Hosted test Auth/PostgREST behavior, exposed-schema settings and actual role/default-privilege graphs have not been verified. Local platform stubs cannot prove them.
- Remote bootstrap/seed need separately approved test-only database connection/certificate and test publishable/server secret keys; actual values were not read or printed. The credential file must stay outside the web workspace.
- Confirm phone/password login in the test project; no real SMS hook or provider is used or configured. Synthetic users are created confirmed only when the approved seed command runs.
- The bootstrap is for an empty project. Failure recovery, migration-history adoption and any remote reset require review; no automatic reset/retry is supplied.
- Fake sessions are process-local and lost on restart. The harness is not provider reconciliation. Wallet spending and new top-ups remain disabled.
- No production release or real gateway/financial operation is included or authorized.
