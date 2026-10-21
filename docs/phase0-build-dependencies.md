# Phase 0 build dependency remediation — 2026-10-20

Prepared on security/phase0-build-dependencies from main 71c7d612a8b571a8f75f94116534eff1283f62fe. The owner approved commit/push/PR/merge after green CI. Publication is tracked by the accompanying PR; Liara deployment remains a separate owner action. No database, hosted account, payment, SMS or notification configuration was changed.

## Problem and change

A fresh full npm audit reported eight affected packages: six high and two moderate. These propagated through Tailwind3's braces/micromatch/chokidar/fast-glob chain and the unused typography plugin's selector parser. The published latest braces remained 3.0.3, within the affected range. No patched braces release was fabricated, no audit suppression or forced downgrade was used, and no vulnerable package override was introduced.

- Move to exact tailwindcss4.3.3 and @tailwindcss/postcss4.3.3 using the supported v4 PostCSS entry point. Retain the existing theme/animation configuration through @config, explicit source discovery and class-based dark mode.
- Move tailwind-merge to exact3.7.0 for v4 class-conflict semantics.
- Remove @tailwindcss/typography, which was neither registered nor used by the application.
- Remove lovable-tagger and its development-only component annotation hook; it would otherwise reintroduce Tailwind3. Development annotation metadata is no longer emitted. Application behavior remains under the existing React/Vite plugins.
- Remove the obsolete separate autoprefixer plugin; v4 handles prefixing in its documented build pipeline.
- Translate renamed shadows, outlines, blur/radius utilities, deprecated flex names and CSS-variable utility syntax. Preserve the original centered container, control cursors, placeholders, measured contact-form spacing and responsive typography defaults.

The npm lockfile is authoritative for release and CI. Historical Bun locks are outside the Liara package and have not been represented as refreshed. Dependency versions unrelated to this remediation were not broadly upgraded.

## Verification

- Fresh full audit after lockfile resolution: zero vulnerabilities at all severities. This is an audit-database observation, not proof that no vulnerabilities exist.
- All414 unit tests in22files passed, including four focused v4 merge regressions for consumer padding, shadow color/size, keyboard-focus rings and CSS variable dimensions.
- TypeScript passed; ESLint zero errors with14 existing warnings. Isolated production build and offline local-test secret-sentinel build passed. Existing large-bundle warning remains.
- Before/after headless Chrome comparison:34 page/viewport states at1440x1000 and390x844, including public home/shop/login/OTP/cart/FAQ/contact, synthetic product/populated cart/checkout/payment/account/admin, expanded FAQ, mobile menu and mobile filter sheet. All measured heading/input rectangles and document dimensions matched; no new horizontal overflow or page exceptions. Pixel differences above a grayscale threshold8 affected at most0.381% of pixels in these screenshots; this is scoped visual evidence, not a pixel-identical or exhaustive site guarantee.
- All browser data was synthetic. Requests outside the loopback asset server were fulfilled with mocks or blocked; no actual Auth, payment, database or external-image service was contacted. Expanded authenticated/admin pages validate rendering only, not real permission grants or backend acceptance.
- A source-only209-file Liara-compatible candidate excludes environment files, keys, tests, SQL and archives. Its clean frozen installation and actual production Vite config build both passed. Full and runtime audits repeated in that clean candidate both reported zero vulnerabilities.

## Compatibility and release boundary

Tailwind4 requires Safari16.4+, Chrome111+ and Firefox128+. Modern Chrome was exercised locally; Safari/Firefox and older customer devices were not tested. This is a material browser-support change and must be included in release review. Do not claim older browser compatibility from these tests.

No new database migration or runtime environment variable is required. The candidate's generated dist uses placeholder test public configuration and is not a production deploy artifact. Publish the reviewed source through normal CI and rebuild on Liara with its existing public configuration. Verify mobile/desktop pages after owner deployment. The owner has separately approved commit/push/merge after green CI. Do not bypass CI or treat a source merge as a Liara deployment.

Phase0 notification delivery, real paid-flow/recovery acceptance and backup/restore remain deferred by the owner; this remediation does not resume them or declare the entire security phase complete.

Sources: https://tailwindcss.com/docs/upgrade-guide ; https://github.com/advisories/GHSA-vfj7-8cjw-p6xm ; https://github.com/postcss/postcss-selector-parser/security/advisories/GHSA-rj75-hqrm-r3gf ; https://github.com/dcastil/tailwind-merge . Exact package metadata and audit responses were also read from the npm registry during this change.

## Publication follow-up — 2026-10-21

PR106 merged the Tailwind remediation as efaffc4c616cd421fd8a6f8aa6f2ff8ac637d35c after required PR CI passed; its post-merge main CI also passed. A fresh publication-time audit then reported a newly published high finding in Vite6.4.3, aggregating three launch-editor advisories (GHSA-698v-4r3x-3vcv, GHSA-r825-w8mm-5pxw and GHSA-587h-7wmj-h5pm). The prior zero-audit statement records the earlier registry snapshot, not a permanent exemption.

The focused follow-up pins Vite6.4.5 within the same major version and updates the npm lock. It adds a full lockfile audit to normal Phase0 CI so new build-tool advisories block publication instead of relying solely on a local snapshot. Existing build/unit/type/lint checks and the fresh full/runtime audits are rerun before publication. No application, payment, database or CSS source change is part of this follow-up. Modern-browser and owner-deferred acceptance limits above remain.

Upstream patch release: https://github.com/vitejs/vite/releases/tag/v6.4.5 . Publication and deployment are separate; the owner still performs Liara deployment.
