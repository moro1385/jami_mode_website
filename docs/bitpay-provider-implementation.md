# Runtime activation update — 2026-10-18

At the owner's explicit request to deploy this branch with gateway checkout enabled, the hard-coded runtime switch was replaced with an operator opt-in: BITPAY_NEW_PAYMENTS_ENABLED=true. The default remains disabled. Opt-in validates the exact production Supabase URL, existing server-key presence, a 52-character non-sandbox BitPay key, a non-test stable merchant namespace and the exact callback origin https://jamimode.ir. Invalid opt-in configuration stops startup with a sanitized error. No provider request is made during startup or configuration.

Add BITPAY_MERCHANT_ACCOUNT=jamimode-main as the stable internal namespace for this existing merchant API key and BITPAY_CALLBACK_ORIGIN=https://jamimode.ir. The namespace is an application identifier, not a new provider credential; keep it stable after payment attempts exist. Existing secrets are retained and never copied into source. Production database functions and permissions must be installed in a coordinated cutover before serving this code. A deployment has not occurred merely because this local source changed.

The owner requested skipping further test runs for this release preparation. Only JavaScript syntax and diff whitespace checks are performed for this activation change. Earlier test results predate it. Real BitPay integration, uncertain provider outcomes, status-11 recovery and inventory-release policies remain limitations; enabling the operator switch does not establish that they are solved. No key values were inspected, no gateway request was made, and no production SQL was executed by this source edit. Historical records below describe the earlier disabled implementation.

---

# Official BitPay v2.2 contract integration - 2026-10-18

This section supersedes the historical implementation record below. Both supplied PDFs were read locally in full: [gateway-help-v2.2.pdf](gateway-help-v2.2.pdf) (5 pages; revision 1404/07/21) and [api-test-V2.pdf](api-test-V2.pdf) (1 page). They are directly under `docs/`, not `docs/bitpay-reference/`. No provider documentation or gateway endpoint was contacted during this task.

**Production remains NO-GO.** Runtime `newPaymentsEnabled: false` is hard-coded; no environment flag can enable v2 checkout/init/verification. All test calls use injected transports and synthetic keys. Existing legacy return verification remains available with the documented status/amount/identifier checks.

## Contract comparison and corrections

| Contract | Implementation |
| --- | --- |
| Production send, redirect, verify (main PDF pp. 3-5) | POST `/payment/gateway-send`; redirect `/payment/gateway-{id_get}-get`; POST `/payment/gateway-result-second`, all on `https://bitpay.ir`. |
| Test endpoints (test PDF p. 1) | All three use `/payment-test/`, selected together by a fixed constructor environment. No custom URL override or fallback to production. |
| Creation fields (main PDF pp. 3-4) | `api`, integer `amount` in rial, minimum 5000; `redirect` encoded by form serialization exactly once. Persisted order ID is separately encoded inside the callback query. No rounding or toman conversion. |
| API key (main PDF pp. 4-5) | Require the documented 52-character string. Errors never include the key/body. |
| Optional factorId (main PDF pp. 3-5) | Only a persisted optional `attempt.factorId`, canonical ASCII nonnegative safe integer, is sent; compare exact documented string echo on verification if used. Current RPC schema supplies no factorId, so runtime omits it. No UUID is sent as factorId. |
| Other optional creation fields | `name`, `email`, `description`, `mobileNum`, `cardNum` are deliberately omitted; none is required for this checkout. |
| Creation result (main PDF p. 4) | Positive integer text is retained as a string, without numeric precision loss. Recognize rejection codes -1 through -5. Malformed replies/timeouts stay ambiguous, with no automatic create retry. |
| Return parameters (main PDF pp. 4-5) | `trans_id` and `id_get` remain untrusted. Require positive ASCII integer identifiers for provider verification, including legacy requests. Look up the stored attempt and recheck callback/reference/merchant/previous transaction bindings before provider access. |
| Verification request (main PDF p. 5) | POST only `api`, candidate `trans_id`, persisted `id_get`, `json=1` with redirects forbidden. |
| Verification result (main PDF p. 5) | Require JSON object with integer `status`. Only status 1 and exact matching integral rial amount authorize a settlement call. Status 11 throws `PAYMENT_ALREADY_VERIFIED`; -1 through -4 are explicit provider rejections. Other/malformed statuses never authorize settlement. |
| Response binding | The documented response has `status`, `amount`, `cardNum`, `factorId`; it does not promise merchant/currency/trans_id/id_get echoes. Remove the placeholder `bindingVerifier`. Binding derives from the authenticated API-key-scoped verification request, persisted reference, candidate transaction and matching response amount. If optional identifier echoes are supplied, reject contradictions. |
| Card number | `cardNum` is not payment authority and is not logged, persisted or returned to the browser by the adapter. |
| Settlement and duplicates | Existing atomic settle RPC persists reference/transaction and enforces uniqueness. A settled duplicate succeeds only with its exact stored transaction and reference, without another provider request. Missing/cancelled/different transaction callbacks never report duplicate success. |

## Environment isolation and runtime configuration

Constructors require explicit matching `environment` and `credentialEnvironment` (`production` or `test`), and default to disabled new payments. Tests explicitly enable their candidate adapters. Runtime selects production endpoints with the switch off, without evaluating credential resolvers on disabled v2 calls. Lazy production configuration retains `BITPAY_API_KEY`, `BITPAY_MERCHANT_ACCOUNT`, `BITPAY_CALLBACK_ORIGIN`; no values were read for this work.

Test adapters require a `test:` merchant namespace; production rejects that namespace. This uses the existing durable merchant column, so test references cannot be reused as production attempts. The published sandbox key's SHA-256 fingerprint is rejected in production; its value is not embedded in source or used in any test request. Credentials must carry the same declared environment as the endpoints, with no implicit mode/default or generic sandbox-to-production fallback. Before any separately authorized integration, credential provenance, key/account pairing, test namespace, callback domain and separate disposable database must still be reviewed. A local tag alone cannot prove ownership of an arbitrary API key.

## Errors, retries and reconciliation

Creation errors: -1 invalid API format; -2 invalid/below-minimum amount; -3 missing redirect; -4 missing/pending gateway or API/domain mismatch; -5 gateway connection failure. Verification errors: -1 invalid API format; -2 invalid trans_id; -3 invalid id_get; -4 unsuccessful/missing transaction or incorrect API. These never produce paid success. HTTP errors, network failures, invalid JSON and complete request/body timeouts also remain unresolved. Error codes are sanitized.

Creation is never retried automatically: claim precedes the request, and a timeout or attachment failure leaves a durable `creating` attempt requiring reconciliation. A ready attempt reuses its stored reference. Verification can be requested again, but only a fresh status 1 with matching terms can authorize settlement; status 11 alone never can. If verification succeeded and local settlement failed, a subsequent 11 stays `verification_pending`. The PDFs do not document an authenticated reconciliation/status lookup or recovery procedure that can safely close this gap. Browser status/amount/factor fields cannot close it either. Committed duplicate callbacks are resolved from durable state.

## Changed files and validation

- `server/bitpay-provider.js`: documented wire contract, explicit environment/credential separation, test data namespaces, format/minimum checks, real response binding and status handling, disabled runtime switch.
- `server/bitpay-routes.js`: explicit opt-in adapter gate, persisted callback-binding checks and stricter committed-duplicate handling; prior transactional architecture preserved.
- `src/test/bitpayProvider.test.ts` and `src/test/bitpayRoutes.test.ts`: expanded mocked contract, transport, retries, environment, factor, mismatch, failed commit and duplicate/concurrent callback regressions; removed obsolete invented echo-verifier fixtures.
- `docs/bitpay-provider-implementation.md`: this current evidence and release record; previous report retained below for history.

Final validation:

- `npm.cmd test -- --reporter=dot`: **193 tests passed across 8 files**, including concurrent status-1/status-11 callbacks and failed-commit retries.
- `npm.cmd run typecheck`: passed, zero diagnostics.
- `npm.cmd run lint`: passed, zero errors and 14 existing warnings in unrelated UI files.
- `npm.cmd run build:isolated`: passed; existing stale Browserslist data and large-chunk warnings.
- `node --check` for both server modules and `git diff --check`: passed.

 All checks are local; database access, migrations, real/test payment initiation, production access, commits, pushes, merges and deployment remain unperformed. The isolated build excludes root `.env`, inherited app credentials and live sitemap generation. Windows esbuild config loading required tool-approved execution outside the restricted sandbox.

## Remaining release gates

1. Separately authorized sandbox integration to confirm actual wire encoding, documented JSON types, account/domain binding, exact rial/factor behavior, and duplicate/timeout behavior using a disposable setup.
2. Review reconciliation for status 11 after an uncommitted local settlement and unknown create outcomes. The PDFs establish no create-idempotency key or safe recovery endpoint. Do not infer either.
3. Existing disposable Supabase Auth/PostgREST/RPC/advisor checks and schema/client-type validation remain unrun in this task; route mocks do not prove SQL concurrency or integration behavior.
4. Existing operational outbox delivery, allocation expiry/release/refund, late-payment and historical wallet/order reconciliation gates in `trusted-checkout-implementation.md` still apply. New wallet operations remain disabled.
5. Review and separately authorize any future code change enabling runtime v2 payments and production rollout. This task does not enable either.

---

## Historical record before the official PDFs were available

# Bitpay provider adapter — local implementation

**NO-GO for real gateway enablement.** The mockable transport/adapter and its integration are implemented and tested. The actual version-2 verification binding remains pending provider-contract verification. Work stayed on `security/first-containment`; existing uncommitted changes were preserved. No payment/API requests, production Supabase access, credential use, migrations, commits, pushes or deployments occurred. Public documentation pages were read only.

## Contract evidence

This application uses **bitpay.ir**. The similarly named bitpay.com cryptocurrency documentation does not describe this integration.

| Operation | Exact repository evidence | Independent documentation status |
| --- | --- | --- |
| Create | POST `https://bitpay.ir/payment/gateway-send`, form fields `api`, `amount`, `redirect`; positive numeric text response becomes the session reference | The [provider's public sample](https://charge.bitpay.ir/) corroborates the creation endpoint and positive-reference redirect pattern. |
| Redirect | `https://bitpay.ir/payment/gateway-{reference}-get` | Corroborated by the same public sample. |
| Verify | POST `https://bitpay.ir/payment/gateway-result-second`, form fields `api`, `trans_id`, `id_get`, `json=1`; legacy code accepted response `status=1` with matching `amount` | Evidenced by the repository's original `server/bitpay-routes.js` (`git show HEAD:server/bitpay-routes.js`). Full provider verification documentation could not be retrieved. |
| Currency/units | Existing checkout/attempt schema and legacy code assume integer rials / `IRR` | An authoritative unit declaration was not retrieved. No toman conversion or other currency support was inferred. |
| Merchant/reference binding | Legacy verification scopes a request by configured API key and sends the persisted session reference and callback transaction | No authoritative merchant/reference response binding contract was retrieved. The adapter does not invent echo-field names. |
| Retries / already verified | No provider-side create-idempotency or reconciliation/status contract established | No new retry parameters or success statuses were invented. In particular, unknown/non-1 verification status stays unresolved. |

The [current provider landing page](https://bitpay.ir/) exposes documentation buttons in the rendered text, without usable technical verification details in the retrieved content. Direct source-page GET attempts failed to connect, including outside the local sandbox. Only documentation GETs were attempted; no gateway-send/result requests were made. Third-party libraries and unrelated bitpay.com documentation were not used as authoritative protocol evidence.

## Changes in this task

| File | Change |
| --- | --- |
| `server/bitpay-provider.js` | New injected-transport adapter: exact rial parsing, request encoding, callback construction, validated references, fixed provider URLs, safe redirects, HTTP/body timeout handling, sanitized errors, legacy compatibility, explicit v2 binding-verifier gate. |
| `server/bitpay-routes.js` | Uses the extracted adapter, checks its enablement gate, and validates currency alongside existing amount/account/reference/transaction bindings. Keeps existing claim/attach/lookup/settle RPC architecture. |
| `src/test/bitpayProvider.test.ts` | 53 focused provider and route-composition tests using synthetic responses only. |
| `src/test/bitpayRoutes.test.ts` | Adds currency to the adapter fixtures and a currency-mismatch regression. |
| `docs/bitpay-provider-implementation.md` | This implementation/evidence record. |

No migrations, client checkout/return/auth code, wallet ledger code or database routines were changed in this task. The earlier implementation report remains a record of the previous task; this report supersedes its statement that the default router has no adapter object. The default now has an explicitly disabled candidate adapter instead.

## Integration and safety behavior

`createBitpayProvider` supplies `create`, `verify`, and `redirect` to the existing `createPaymentRouter`. Its separate `verifyLegacy` method is used only when the database returns stored version 1. New v2 creation requires a durable, claimed `creating` attempt and reads amount/account/currency/order identity exclusively from that attempt. The callback uses a server-configured HTTPS origin and URL-encoded persisted order ID. Request financial fields cannot change its terms.

The database remains responsible for application idempotency. It commits the claim before provider HTTP. The adapter never retries create, and does not pretend an undocumented provider idempotency field exists. A timeout, malformed/nonpositive create response, network error or failed reference attachment leaves the durable attempt `creating`. Retrying returns `PAYMENT_AMBIGUOUS` without another provider request. Ready attempts reuse the persisted redirect reference. Settlement remains exclusively in the existing atomic RPC, and a failed commit never returns paid success.

Provider references remain strings, including large numeric identifiers, to avoid precision loss. New references must be positive integer text consistent with the existing attach RPC. Legacy references retain opaque-string compatibility. Integral rial amounts are compared exactly; fractional amounts, exponential string representations, unsafe numeric amounts and non-IRR terms are rejected. No amount is rounded or converted.

HTTP redirects are rejected to prevent credential forwarding. The timeout covers both fetch and body consumption, and also terminates the adapter operation when an injected transport ignores AbortSignal. Errors contain local codes rather than credentials, raw provider bodies or transport messages. Provider rejection, malformed replies, unknown verification status and unavailable verification remain pending; browser cancellation never changes payment state.

The runtime `bitpayProvider` has **no `bindingVerifier`**, so `newPaymentsEnabled` is false. `/checkout` and `/init` still fail before database allocation/claim; new v2 verification is also gated. Calling the candidate's v2 methods directly fails before reading credentials or sending requests. No environment flag can supply the missing binding implementation. To enable later, a reviewed server-code implementation must normalize authenticated provider evidence into `{ amount, currency, merchant, reference, transaction }` using a documented contract; all five terms are checked before settlement. Test fixture binding verifiers are mocks, not proof of a real provider contract. The adapter's create result describes the submitted request terms and the returned reference, not provider-echoed amount/account/currency evidence.

Configuration is lazy and server-only: `BITPAY_API_KEY`, `BITPAY_MERCHANT_ACCOUNT`, and, for future new creation, `BITPAY_CALLBACK_ORIGIN`. No actual values were read or used locally. The configured merchant namespace must correspond to the API-key account; rotation/account matching requires review before enablement.

Version-1 verification keeps the previous API-key-scoped status/amount behavior, now through the extracted transport with exact amount checks and the existing transactional settlement. It does not require undocumented v2 echo semantics. Already settled attempts return committed results before reaching the adapter, so callbacks cannot replay wallet credits. Historical balances/transactions and logged-out password/OTP return recovery are preserved. This compatibility path does not retroactively establish trusted historical pricing or merchant-binding evidence.

## Validation and release gates

- `npm.cmd test`: **137 tests passed, 8 files**, including 53 adapter tests. Coverage includes exact amount/currency/binding mismatches, invalid/large references, create/verification errors, unknown status, HTTP/JSON failures, request/body timeouts, persisted-ready retries, ambiguous creation, failed attachment, failed settlement, duplicate callback reuse, and existing logged-out return recovery.
- `npm.cmd run typecheck`: passed, **0 diagnostics**.
- `npm.cmd run lint`: passed, **0 errors, 14 existing warnings**.
- `node scripts/build-isolated.mjs production`: passed with existing Browserslist/chunk-size warnings. Root `.env` and inherited application credentials excluded; no sitemap/live catalog API request.
- `node --check` for both server modules and `git diff --check`: passed.

The Windows sandbox could not run esbuild configuration loading; tests/build succeeded with tool-approved execution outside it. All gateway calls in tests used injected mocks. Route-composition tests mock the database and do not claim new SQL concurrency evidence. Database architecture/migrations were unchanged, so the prior disposable PostgreSQL results remain separate historical evidence. No real Supabase/Auth/PostgREST integration was run in this task.

Before enabling real v2 payments: obtain authoritative bitpay.ir verification/unit/account/reference and duplicate-response documentation; implement and review the binding verifier against it; validate the API-key/account pairing and callback origin; complete separately authorized sandbox integration and the existing Supabase, reconciliation/outbox, allocation release and historical-wallet gates from `trusted-checkout-implementation.md`. New wallet operations remain disabled. **Production remains NO-GO.**
