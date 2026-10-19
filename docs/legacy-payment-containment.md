# Phase 0.1: contain the legacy Supabase payment endpoints

Release update — 2026-10-18: the owner separately approved deployment and all four replacements are now ACTIVE version 2 in production with verify_jwt=true. Downloaded entrypoints/shared source match the prepared code. Eight hosted boundary smoke checks pass (four missing-auth rejections, two retired-init responses, two malformed-verification rejections). send-sms remains version 9 with its prior bundle hash. No database migration, real payment, SMS, commit, push or merge was performed. The preparation/release instructions below are retained as context. Valid callback forwarding and full legacy payment completion have not been demonstrated by the empty-input smoke tests; keep that integration check open in Notion.

## Problem and change

The four existing production Edge Functions still use their old financial implementation even though the storefront has switched to Express trusted checkout. Their service-role writes bypass client containment. In particular, the old wallet verification performs separate top-up and profile updates.

This patch keeps the existing endpoint names for compatibility, but retires both initiation endpoints and sends both verification endpoints through the existing trusted Express implementation. It does not duplicate the provider adapter, hold payment credentials, update financial tables or require a database migration.

| Existing endpoint | Replacement |
| --- | --- |
| bitpay-init | HTTP 410, LEGACY_PAYMENT_INIT_DISABLED; customers use current checkout |
| bitpay-wallet-init | HTTP 410, WALLET_TOPUPS_DISABLED |
| bitpay-verify | Fixed HTTPS POST to https://jamimode.ir/api/bitpay/verify |
| bitpay-wallet-verify | Fixed HTTPS POST to https://jamimode.ir/api/bitpay/wallet-verify |

The bridge validates UUIDs, numeric callback identifiers and allowed fields. Cancellation remains advisory and is passed to the authoritative route. Request/response bodies are bounded, the full upstream request/body read has a deadline, redirects and retries are disabled, and incoming Authorization/apikey headers are never forwarded. Only the success boolean and allowlisted failure reasons are returned. Failure is never promoted to success. No callback data or credentials are logged. Responses are not cached; CORS permits the production storefront.

The implementation explicitly checks the runtime SUPABASE_URL against the production project. Deploying this production compatibility bridge to the test project would fail closed before contacting the production site. Network in the unit tests is injected; the test project is not used to forward callbacks into production.

## Financial compatibility

Express trusted_payment_lookup binds the stored order/top-up reference and merchant, adopts existing version-1 references, and recognizes settled historical records without crediting again. Provider verification and trusted_payment_settle remain in Express. New version-2 requests arriving through an old verification endpoint also reach the same version-aware lookup/settlement logic. The bridge never changes a payment reference.

Existing verify_jwt=true settings are retained explicitly for all four functions. This patch does not make endpoints public, change Auth providers or change send-sms. Every release command MUST use the explicit production --project-ref below; do not treat a local project identifier or implicit linking as confirmation of the production target, and do not bulk-deploy.

## Validation performed

- 37 new offline tests cover retirement, request and response validation, fixed destinations, credential stripping, wrong-project refusal, upstream failure, timeout, and legacy order/wallet compatibility with the actual Express route using injected database/provider fakes.
- The route composition tests verify one settlement/provider call across repeated identical callbacks, even when new-payment initiation is disabled.
- Entire current local suite: 245 tests across 11 files pass.
- Application TypeScript passes; ESLint has zero errors and the same 14 existing warnings. Application typecheck does not typecheck the Deno entrypoints.
- The official Deno runtime was acquired through the npm execution cache without adding project dependencies. Deno check passes for all four entrypoints after correcting the shared handler's option type annotation. A direct Deno runtime smoke test passes for order/wallet handlers with network and environment permissions explicitly denied. Authenticated hosted invocation and production smoke verification remain release checks. No new real payment, SMS or database mutation was performed by these tests.
- A read-only connectivity preflight attempted POST with an empty JSON body to both trusted verification routes (the inspected routes reject this before any database/provider access). Both attempts timed out from this Windows session. This does not prove the storefront is down, but its reachability and the deployed bridge destination remain unverified and must be resolved before deployment.
- The owner confirmed the storefront opens in their browser. Automated reachability from this session remains unverified. The initial runtime download was slow but completed; the subsequent checks and runtime smoke above ran successfully. No project dependency or lockfile was changed.

## Release, only after the owner separately approves these four replacements

No deployment, commit, push or merge is included in preparation of this patch. Keep Notion 0.1 unchecked until deployment and verification are done.

1. Re-fetch function versions/source to detect intervening changes and preserve the current source outside the repository. The audit already has a historical snapshot; refresh it at release time.
2. Confirm the installed Express trusted checkout is still deployed at jamimode.ir, its existing merchant namespace remains stable, and pending version-1 payment verification is retained. Do not print payment keys or customer callback identifiers.
3. Discover deploy flags from the installed CLI's help before executing. Replace only the following functions in project klfmscuogsocfjxqkuib, preserving JWT checks. Stop on failure; never bulk-deploy send-sms or change secrets as part of this release.

```powershell
supabase functions deploy bitpay-init --project-ref klfmscuogsocfjxqkuib --use-api
supabase functions deploy bitpay-wallet-init --project-ref klfmscuogsocfjxqkuib --use-api
supabase functions deploy bitpay-verify --project-ref klfmscuogsocfjxqkuib --use-api
supabase functions deploy bitpay-wallet-verify --project-ref klfmscuogsocfjxqkuib --use-api
```

4. Read back deployed versions, verify_jwt flags and source. Confirm the two retired endpoints return their disabled response and malformed verification is rejected without reaching a financial lookup/provider. Any authenticated invocation needs a token kept outside chat and logs. Do not use an actual customer's callback as a smoke test.
5. An independently authorized controlled payment test may then verify completion, cancellation and duplicate callback behavior. This patch does not authorize that transaction. Record evidence before checking the Notion item.

The four deployments are not atomic. Retire initiation first, then replace verification. Requests already executing the old code are not killed by a deployment; cutover must account for that short overlap. Do not automatically roll back to non-atomic wallet writes. If the bridge cannot reach the trusted server, keep initiation retired, leave the payment unresolved and investigate/forward-fix the trusted route.

## Remaining work

Status-11 recovery, ambiguous initiation, stock expiry/release, SMS hook security and the remaining Phase 0 checklist are unchanged by this patch. This change also introduces a deliberate dependency on the storefront's trusted verification service being available; outage returns verification_pending and does not settle or credit by itself.

Official runtime/organization guidance: https://supabase.com/docs/guides/functions/development-tips
