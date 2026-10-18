# Signed Supabase Auth SMS hook

Release update — 2026-10-19: the owner separately approved replacing send-sms in production. Version 11 is ACTIVE with the prior verify_jwt=false setting; downloaded entrypoint/shared source match the prepared files. Four hosted negative boundary checks pass without a real SMS. Payment function versions/hashes are unchanged. On 2026-10-19 the owner confirmed real SMS delivery and successful login from localhost against production; Notion item 0.2 is complete. This does not complete the remaining Phase 0 work. The setup/release guidance below also applies to future changes; do not reconfigure secrets or redeploy without the relevant authorization.

This function sends Supabase Auth OTPs through the existing MeliPayamak pattern 537763. It accepts only signed Auth webhook POST requests, verifies the exact raw body with `standardwebhooks@1.0.0`, and then validates the user id, Iranian mobile number and a 6–10 digit OTP. The documented `sms.otp` and signed legacy `sms.code` are supported; conflicting values are rejected. The function never logs payloads, phone numbers, OTPs, credentials, signatures or provider response bodies, and returns `{}` on success.

## Required existing configuration

- Keep the current Auth Phone provider and SMS Hook configuration. Do not enable the test project's Phone provider, introduce dummy Twilio credentials or generate/rotate an Auth hook signing key as part of this patch.
- `MELIPAYAMAK_USERNAME` and `MELIPAYAMAK_PASSWORD`: reuse the existing Edge Function secrets. Do not paste them into source, a shell command, chat or logs.
- `SEND_SMS_HOOK_SECRETS`: add the signing secret of this project's **existing Send SMS HTTP hook** as an Edge Function secret. The expected dashboard format is `v1,whsec_<base64-secret>`; `whsec_...` and the canonical base64 portion are also accepted. Two configured signing keys can be separated by `|` for a separately planned rotation. Never invent a new Edge-only key: it must match the key Auth actually uses to sign this hook.

In the production Supabase dashboard, open **Authentication → Hooks → the existing Send SMS hook**, then copy its signing secret directly to **Edge Functions → Secrets**, under `SEND_SMS_HOOK_SECRETS`. The owner should perform this credential entry themselves. Do not send the secret through chat. Do not deploy this code until the matching secret is configured: missing configuration fails closed and would prevent OTP delivery.

`verify_jwt=false` is deliberately preserved because Auth calls this hook before a user JWT is issued. The Standard Webhooks signature is the authentication control; an anon key or bearer token does not replace it. The callback URL and template remain unchanged. No payment setting, database table or migration is involved.

## Limits, duplicate handling and failures

- Request body: at most 20 KiB, with UTF-8 and JSON validation; signature metadata is bounded. Timestamp validation uses the official library's five-minute tolerance.
- Deadline: four seconds for body processing, provider request and response consumption, within the documented five-second HTTP Auth Hook budget. Redirects and automatic provider retries are disabled.
- Successful/failed/in-flight event outcomes are deduplicated by signed event id plus raw-body digest in the current worker for the entire accepted signature window. Reusing an event id with another signed body is rejected. An ambiguous send returns a generic failure rather than falsely reporting delivery or immediately retrying.
- A new event for the same phone is limited to one attempt per 30 seconds **in that worker**. Both caches are bounded to 1024 entries and expire. These are best-effort controls, not distributed exactly-once delivery or a global rate limiter. Independent workers/restarts can see the same signed event. Keep Supabase Auth's configured project/user rate limits and any existing CAPTCHA active. Shared durable deduplication would require a separate reviewed design/migration; this patch does not silently introduce one.
- Provider error details are discarded. A network timeout may occur after the provider accepted a message; neither this function nor the provider contract proves global exactly-once SMS delivery.

## Local verification

`src/test/smsHook.test.ts` uses actual Standard Webhooks signatures and synthetic data with an injected SMS transport. It checks tampering, wrong keys, timestamp expiry, key formats/rotation, validation, redaction, bounded bodies, concurrent duplicates, throttle/capacity and provider/network failures. No Auth OTP request or real SMS is sent by these tests.

Before release, run the test suite, application TypeScript, lint and `deno check supabase/functions/send-sms/index.ts`. A separate Deno runtime smoke uses the real library and injected transport with network/environment permissions denied.

## Release scope and approval

Local implementation is not deployment approval. After the matching signing secret is securely installed and the owner separately approves, replace **only send-sms** in production project `klfmscuogsocfjxqkuib`, using explicit `--project-ref`. Preserve its existing `verify_jwt=false`; do not bulk-deploy the payment functions, change Auth settings or print any secrets.

After deployment, read back source/version/config and confirm an unsigned request is rejected before any provider call. Successful delivery to a real phone, or a real Auth OTP request, needs an independently authorized controlled test. Keep Notion 0.2 open until its release and integration evidence is recorded.

Official references:
- https://supabase.com/docs/guides/auth/auth-hooks
- https://supabase.com/docs/guides/auth/auth-hooks/send-sms-hook
