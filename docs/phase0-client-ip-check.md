# Phase 0: verify the client IP after release

The owner confirmed `JAMI_TRUST_PROXY_HOPS=1` and `Scale=1` for `jami-mode`.
Local forwarding tests passed, but those facts alone do not establish how
Liara rewrites incoming headers. Keep the existing configuration until a live
observation justifies a change.

## Prepared change

`GET /api/health/client-ip` returns only `{ "ip": "the caller's observed IP" }`.
It uses Express `req.ip`, the existing application trust-proxy setting and the
existing `/api/health` rate limiter. It does not return raw forwarding headers,
other clients' addresses, tokens, environment values or database records. It
does not log or persist the address. Responses use `Cache-Control: no-store`;
an invalid observed IP returns the fixed 503 response `{ "status": "unavailable" }`.
This is a public read-only observation endpoint, not an admin or payment API.

## After the source is published and deployed

Run from the local checkout on the operator's computer, not the app container:

```text
node scripts/check-client-ip.mjs
```

This explicit operator command makes four HTTPS GET requests: one to
`https://www.cloudflare.com/cdn-cgi/trace` for an independent observation of
the operator's egress IP and three to the fixed `jamimode.ir` observation
endpoint. The latter include a baseline and two spoofed forwarding-header
combinations. It does not load `.env`, use credentials, access Supabase, invoke
payment handlers, change rate limits or perform load testing. TLS remains
verified and redirects are rejected. The script prints booleans and fixed
result codes, never the actual IP, headers or raw network errors.

Expected:

```json
{"result":"passed","referenceMatches":true,"forwardedHeadersIgnored":true}
```

`needs_review` means the site's observed IP differed from the reference or a
forged header changed the observed IP. Different per-domain VPN/proxy egress
can also cause a reference mismatch; do not blindly alter hop count.
`unavailable` identifies a fixed stage (`reference`, `site` or
`forwarded-headers`), optionally with HTTP status. A site 404 usually means
the new route is not deployed; this is not a successful verification.

Do not treat checking only the public route in a browser as the complete
acceptance test: the reference comparison and spoofing checks matter. Even a
passed result covers the observed network path, not every possible ingress,
future multi-replica configuration or persistence across application restarts.

## Release boundary

No database migration, new key, environment change or plan upgrade is needed.
The code is prepared locally; publication and deployment require the owner's
separate approval. Existing unrelated files are excluded from this change.
To remove this observation later, revert its route and the operator tool in a
normal source release. It does not require data cleanup.
