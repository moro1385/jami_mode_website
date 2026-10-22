# Payment recovery and reviewed resolution

Prepared locally on `security/phase1-payment-review`. No hosted migration,
production financial action, provider request, commit, push or deployment is
implied by this document. The new operator tool requires the accompanying
`20261022072115_phase1_payment_review.sql` migration before use.

## Choose the correct recovery path

| Persisted situation | Action |
| --- | --- |
| `verified` evidence exists but settlement is incomplete | Use existing bounded `maintenance reconcile`. It replays committed evidence and never calls the provider. |
| `verifying` or no verification evidence, attempt is `ready`, reference is known | Independently review the exact payment in the provider portal or obtain an authoritative provider-support response. Use the operator tool below only after that review establishes payment. |
| Initiation is `creating`, reference is missing, or an identity conflicts | Keep the case unresolved and investigate with provider support. This tool refuses to invent a reference, replace an existing verification identity, retry initiation, release stock or infer nonpayment. |
| Attempt is settled with the same transaction | Read the existing result. Repeated identical reviews do not settle again or create another audit/event. |

The owner's existing abandoned unpaid test attempts must not be used as paid
acceptance fixtures. Wallet activation, refunds, customer notifications and
legacy wallet recovery are outside this change.

## Provider limitation

The supplied official `gateway-help-v2.2.pdf`, pages 4–5, documents
`gateway-result-second` and status 11 (previously verified). It does not specify
a separate repeatable, read-only transaction inquiry contract. Neither a
callback, status 11 nor a network error proves a payment to this application.
No undocumented provider endpoint or automatic second verification is added.
The gap between external verification and committing local evidence cannot be
made atomic across these two systems by a database transaction.

## Operator review

This is a trusted-server operation using an existing server credential. It is
not an admin-browser action or a customer-facing paid-status override. Only
`service_role` can execute the invoker RPC. Ordinary authenticated users,
including a browser administrator, have no EXECUTE permission or audit access.

The operator must independently establish all of these facts from the
provider's authenticated portal/export or an authoritative support case:

- payment belongs to this merchant and provider reference;
- transaction number and successful/paid outcome;
- exact amount in **IRR**, matching the stored attempt and frozen order;
- reference already belongs to that v2 gateway order;
- any previously pinned verification transaction agrees.

A customer screenshot, age of an attempt, status 11, or a reviewer flag alone
does not supply these facts. The tool validates bindings and an artifact hash;
it **does not authenticate the artifact's origin or independently contact the
provider**. `reviewer` is the trusted operator's asserted label, not a verified
Auth identity. This manual trust boundary is explicit in the immutable audit.

Store the artifact and manifest outside the repository/web root, in an
access-restricted directory. Do not include bank-card details, customer PII,
API keys, JWTs or provider response bodies in the manifest or command line.
The artifact itself can be sensitive; its contents are not uploaded by this
tool. Only its SHA-256 digest and narrow decision metadata reach the database.
Use an OS-protected server directory; do not rely on Unix mode bits on Windows.

Example manifest structure (replace every sample with reviewed facts; the
timestamp must be the actual UTC review time):

```json
{
  "version": 1,
  "projectRef": "cifhcrlmjnsxpkhyloen",
  "attemptId": "31000000-0000-4000-8000-000000000001",
  "amount": 20000,
  "merchant": "test:review-example",
  "providerReference": "123",
  "transaction": "456",
  "evidenceSha256": "<64 lowercase hexadecimal characters>",
  "source": "provider_support",
  "caseReference": "ticket-123",
  "reviewer": "operator-1",
  "reviewedAt": "<actual UTC ISO timestamp ending in Z>",
  "providerOutcome": "paid"
}
```

`source` is `provider_support` or `provider_portal`. The artifact is required,
nonempty and at most 2 MiB; the manifest is at most 16 KiB. The server requires
a review no older than 24 hours, no more than five minutes in the future and
not before creation of the attempt. Exact retries of an already committed
decision remain idempotent after that window.

## Plan, review, then apply a specifically authorized case

The tool does not load `.env` or repository credential files. The existing
trusted server environment must supply `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY`; the explicit project must match exactly. The
network allowlist permits only that project's single review RPC, rejects
redirects and uses a 15-second request deadline. No retry is automatic.

```text
node scripts/payment-review.mjs --help
node scripts/payment-review.mjs plan --project-ref cifhcrlmjnsxpkhyloen --manifest /private/review.json --evidence /private/provider-export.pdf
node scripts/payment-review.mjs apply --project-ref cifhcrlmjnsxpkhyloen --manifest /private/review.json --evidence /private/provider-export.pdf --execute --confirm-provider-review
```

These are test-project examples, not permission to settle any case. Production
requires the production ref, independent authorization for that exact financial
case and migration/release approval. `plan` performs no data writes. `apply`
requires both explicit flags and rechecks bindings while holding the same
parent → attempt → verification lock order as callbacks.

Outcomes:

- `eligible`: plan only, no data written; human review is still the operator's responsibility.
- `durable_evidence_available`: no manual audit or settlement performed; use the existing reviewed reconciliation path.
- `settled`: operator audit, durable verification and one settlement/outbox committed atomically.
- `already_settled`: same transaction was already settled; no second financial effect.

The printed result contains only project, task, outcome and applied. On timeout
or error the transaction may have committed; inspect the case or repeat the
same non-mutating plan before considering any financial action. Never issue a
fresh provider verification or modify the original decision to force success.

## Audit and deployment boundaries

`checkout_private.payment_reviews` is RLS-enabled, service-readable/insertable
and protected by an append-only trigger, including against owner UPDATE/DELETE.
It records the artifact hash, source, support/portal case reference, reviewer
label, review time and exact payment identity. Amount, merchant, reference,
currency and transaction must agree with the existing attempt/order.

The RPC uses the existing verification claim/record/settlement functions. Audit,
evidence, order/attempt changes and outbox are in one transaction. An audit or
settlement failure rolls back all of them. A conflicting prior review, foreign
transaction, wallet/legacy attempt, cancelled/inconsistent order or unknown
reference fails closed. Existing verification rows are not deleted or rewritten
to substitute another transaction.

Apply the named migration only after reviewing its source and independently
authorizing the target. The bootstrap copy and manifest include it for fresh
test deployments. Existing migrations and browser/Auth/checkout UI are not
modified. This package does not enable any Cron job or introduce an HTTP route.
If application rollback is needed, keep the additive migration and immutable
audit, and stop using the operator tool; do not drop financial evidence.
