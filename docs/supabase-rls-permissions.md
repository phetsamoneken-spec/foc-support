# Permissions and enforcement — REVIEW ONLY

R = scoped read; C/U = create/update via `public.mkt_mutate`; soft D = status/tombstone, never financial erasure. No business table has direct INSERT/UPDATE/DELETE/TRUNCATE grants for authenticated or anon. No UPDATE policy is needed because no direct UPDATE path exists; introducing one later requires SELECT plus USING and WITH CHECK and an immutable ownership design.

| Table / workflow | ADMIN | TEAM_USER B1–B7 | Enforcement / current limit |
|---|---|---|---|
| mkt_profiles | R all | R self | Active profile gate; no client role/team assignment; account CRUD via future trusted server |
| mkt_customers | R/C/U/soft D all | R/C/U/soft D own | CREATE_CUSTOMER / EDIT_CUSTOMER / DELETE_CUSTOMER; version required; team immutable |
| mkt_customer_conditions | R/C/U all | R own | SAVE_CONDITION Admin-only; derive team from parent |
| mkt_contracts | R/C all | R own | CREATE_CONTRACT Admin-only; no overlaps, sequential cycle under parent lock; no date update/delete RPC |
| mkt_budgets | R/C/U all | R/C/U own | SAVE_BUDGET derives period bounds, scoped parent, unique contract/year, optimistic version; cannot write usage |
| mkt_transactions | R/C/cancel all | R/C/cancel own | ADD_TRANSACTION / CANCEL_TRANSACTION; budget lock and version; date/FK validation; no amount edits or deletes |
| mkt_budget_totals view | R all | R own | security_invoker; sum ACTIVE transactions + imported undated usage |
| mkt_activity_logs | R all | R own team | Server-only append in same atomic RPC; legacy logs imported separately |
| mkt_settings | R all | none directly | Future Admin configuration backend must serve a safe validated subset to teams |
| mkt_categories | R all | R catalog | Catalog is shared; Admin writes through future trusted configuration backend |
| mkt_import_batches | R all | none | No browser import writes; future Admin importer validates every row |
| mkt_deleted_customers | R all | none | RPC writes tombstone atomically; no team reads of registry |
| mkt_legacy_archives | R sanitized only | none | Never import raw credential/recovery snapshots; no ordinary client writes |
| mkt_operation_receipts | R all | none | RPC-managed global operation UUID; actor+canonical request equality for retry |
| anon | none | none | Explicit revocation of table/view/function grants |

## Authorization and mutation boundary

`mkt_private.can_access` reads the current active, nondeleted profile and rejects anonymous Auth users. It never reads role/team from user_metadata or app_metadata. RLS on every proposed public table filters SELECT; child composite foreign keys bind the entire customer/team/contract/budget relationship. Role/team changes take effect on subsequent statements even with stale JWT claims. A disabled profile sees zero rows.

The only exposed mutation function is **SECURITY INVOKER**, `public.mkt_mutate`. It delegates to a private SECURITY DEFINER function with an empty search_path, fully qualified tables, tightly scoped EXECUTE grants and an explicit authenticated profile/session check. `mkt_private` must **not** be added to exposed API schemas. authenticated has USAGE only so its checked function can be invoked through the wrapper; no CREATE or private tables. Direct invocation of the private mutation function, if a SQL client has a suitable role, applies the same checks. Functions that perform trigger validation are not callable by API roles.

Sensitive writes require a matching `auth.sessions` row from the JWT session_id as well as a current active profile locked FOR SHARE. This is an intentional extra check, not proof that access tokens are instantly revoked by logout in every deployment. Session cleanup/revocation timing and session expiry policies require hosted integration validation. Reads check profile freshness but do not check auth.sessions; a signed-out token may read scoped data until JWT expiry unless its profile is disabled. API signature/expiry validation remains the gateway/Auth responsibility; the SQL fixture claim setter models trusted gateway claims only.

Each mutation locks its operation ID; only the same actor and identical request may replay a receipt. Mutations then lock customer → contract/budget → transaction as relevant. One committed operation yields one immutable audit entry and receipt. Failed operations roll back all changes. Versions reject lost updates; receipt checking occurs before version checking so a lost-response retry succeeds. Transaction addition/cancellation bumps budget version and recomputes totals through the view, preventing cancellation double subtraction. True competing-connection behavior still requires a separate local/staging test.

All provided monetary amounts are decimal, limited to 2 fractional digits. Budget creation needs a contract/customer/period and text ID, derives team, and never accepts imported unallocated usage. Existing budget edits require its version and matching ID. Team users cannot approve exceptions, alter derived totals, or change ownership. Budget edits affect **one** period; historical rows and usage remain intact.

## Privileged paths that are deliberately not implemented in Phase 1

Account provisioning, role/team reassignment, shared settings/category writes, bulk Excel ingestion and archive management require a separate trusted Admin backend. Do not ship service-role credentials to React. That backend must verify the caller's Auth identity, current Admin profile/session, validate allowlisted input, append audit and use idempotency; using a service key alone does not establish caller authorization. Direct authenticated writes are denied until those paths are reviewed. This matrix distinguishes the implemented business RPC from planned Admin management; this phase is not a usable production Supabase replacement.

Only source-sanitized metadata is allowed in public tables, even if Admin-only RLS protects it. Do not place password hashes, token digests, secrets or raw backup chunks in mkt_legacy_archives. Public schema exposure can change; explicit grants and RLS are both required.

## References checked 2026-11-02

- [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security): row predicates, UPDATE visibility and private authorization functions.
- [Database functions](https://supabase.com/docs/guides/database/functions): invoker preference, fixed search_path, default EXECUTE revocation.
- [Sessions](https://supabase.com/docs/guides/auth/sessions): JWT lifecycle and session_id validation.
- [Changelog index](https://supabase.com/changelog.md) and [Data API grants change](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically): explicit grants, including rollout to existing projects from October 30, 2026. Proposed grants are explicit and limited to these new objects; no existing app-table privileges are changed.
- [Postgres upgrade](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes): reviewed; no ltree/btree_gist/legacy pgcrypto/custom operators are introduced. Require PostgreSQL >=15 for invoker views and staging verification on the project's actual server version.
