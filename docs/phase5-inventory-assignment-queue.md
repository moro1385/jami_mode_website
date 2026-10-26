# Assignment-aware inventory alert queue — local checkpoint 2026-10-25

The global saved-alert queue now supports **هشدارهای من**, **بدون مسئول** and **مسئول غیرفعال**, alongside all assignments. These combine with shortage type and follow-up status. All filtering occurs before the 50-row keyset page limit, not on the client’s current page. Changing any filter restarts pagination. Each page is its own current snapshot; refresh from the beginning to discover newly matching earlier keys.

Mine uses the authenticated server-derived actor, not an arbitrary assignee UUID supplied in the query. The server rejects actor/assignee overrides, fixes the page size, authenticates the session and explicit admin role, and validates every returned row against the selected assignment filter. SQL checks the current actor role again. The browser also checks mine against the session owner and ignores expired scopes. Unassigned means the assignee is null (including an explicit clearing). Inactive means a non-null recorded assignee no longer has the admin role. The two cases never collapse into each other.

The list displays current assignment and an inactive marker. It includes UUID/revision/active status only; assignment reasons, private events, email and phone are not exposed in queue rows. Missing product/variant references retain their assignment and warning identity and remain visible under matching filters; their detail UI permits history but not new assignments. Assignment transfer immediately changes matching results; neither queue reads nor assignment filtering changes stock or follow-up state.

## SQL and staged access

Local migration `20261025123628_phase5_inventory_assignment_queue.sql` creates `trusted_inventory_alerts_assigned` as an invoker-only RPC with empty search_path and service_role-only EXECUTE. It joins policies, variants, products, follow-ups and assignment rows, checking assignee admin-role existence in the same statement snapshot. Existing composite keys/indexes are reused; no new tables, stock mutation or notification worker are introduced. A large-real-data query-plan/latency review remains necessary; small synthetic fixtures are not performance proof.

The existing policy application gate still protects the queue. If the assignment server gate is false, assignment-specific subsets return an explicit disabled response before service access, and existing unfiltered all-assignment callers use the prior RPC path. When the assignment gate is true, all queue reads use the new RPC and require assignment and follow-up metadata; missing migration/data fails closed, without silently falling back or reporting an empty list. Non-all follow-up filters still require the independent follow-up server gate; displaying metadata in all-status assignment reads does not enable follow-up writes. The database assignment write flag may stay closed while this authorized read-only queue operates. All gates remain unchanged/closed in hosted environments.

## Evidence and limits

- 1,387 unit/integration tests across 84 files, 58 offline browser scenarios, typecheck, zero-error/zero-warning lint, isolated build and whitespace checks passed.
- 36 new real disposable SQL assertions passed, plus all previous inventory suites. Fixtures tested 70 alerts across 50/20 pages, 55 mine across 50/5 pages, five unassigned and five inactive rows, missing references, AND filters, quantity ABA review invalidation and immediate transfer behavior.
- Genuine SQL output passed the API queue validator. Read-only transactions left stock/events unchanged; a closed DB write flag still permitted authorized reads. Browser roles and a revoked actor were denied.
- Fresh replay of 41 synthetic bootstrap migrations and normalized hash/order checks passed. Disposable clusters stopped/removed their own temporary folders. Browser auth/backend responses were offline fixtures. The synthetic build must not be deployed.
- No hosted migration, activation, commit, push, merge or deployment occurred. Real Supabase Auth/PostgREST, hosted CI/advisors, actual schema/history compatibility and actual-size performance remain unverified.

The prior assignment checkpoint’s delayed Notion update was restored this turn. Inventory and Phase 5 remain In progress. Monitoring/notification policy, coordinated rollout and other open inventory/ERP work remain; these filters are not scheduled alerts or external delivery.
