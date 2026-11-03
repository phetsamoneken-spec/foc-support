# FOC Support Supabase backend

The frontend uses `src/config/supabase.ts`. Only the publishable API key belongs in that file. The service key is read from the Edge Function environment and must never be added to the website or repository.

## Deployment

1. Apply the versioned migrations to the dedicated FOC Support project. Existing `mkt_*` tables are reused; the runtime migration adds only private authentication links, operation journals and backups.
2. Generate the server domain with `node scripts/build-supabase-domain.mjs`. Deploy all four files from `supabase/functions/foc-support` as the `foc-support` function, with gateway JWT verification disabled. The function itself validates each protected request with Supabase Auth and checks its native session against PostgreSQL before reading or writing. A publishable API key is not a user identity.
3. Import the source data privately. Preserve legacy IDs, timestamps, contract anniversaries, transaction amounts and undated spending. Normalize current team assignments from the parent customer/contract. Keep orphaned source rows in the legacy archive instead of inventing financial relationships. Exclude legacy `SESSIONS` entirely and redact credentials from archives and change history.
4. Import existing accounts into native Supabase Auth only with the owner’s explicit authorization for the credential transfer. Keep bcrypt material out of Git, browser storage, logs and backups. Native Auth assigns account UUIDs; `mkt_profiles.legacy_id` preserves application IDs. The server-only import queue clears a password hash as soon as its Auth account is linked.
5. Verify counts, checksums, financial totals, scoped access and native login before enabling `runtime_meta.accept_writes` and publishing the frontend. Refresh the source snapshot at cutover. Until then, the existing website must keep using its working backend.

The old Google Sheet is a backup from before migration. Supabase changes do not automatically write to that Sheet. Do not run both as independently writable sources for the production app.

## Behavior and permissions

- Native Auth validates passwords and rotates refresh tokens. The browser uses a single refresh request for simultaneous calls. A stable login identifier prevents refreshes from invalidating in-flight writes.
- Authorization reads the active profile from PostgreSQL on every request. User-editable Auth metadata is never used for role or team decisions. Disabled profiles and revoked native sessions lose access immediately.
- Admin controls Excel imports, shared settings, contract renewals, prices and annual allowances. Team users can manage their own stores and expenses. PostgreSQL RLS independently restricts direct reads.
- Server-only RPCs are granted exclusively to `service_role`. Old incomplete mutator RPCs are revoked from public clients. Browser clients cannot write tables directly.
- A short PostgreSQL transaction locks the shared revision, validates changes, and commits working rows, history, archive chunks and operation receipts together. Conflicts reload the current snapshot and retry the same operation. Completed operation IDs prevent duplicate expenses or store creation after a lost response.
- Customer deletions create a recoverable archive before removing customers, conditions, contracts, budgets and transactions. Deleted codes remain reserved. Annual budgets reset on each contract anniversary; previous periods and spending remain separate.
- Public health responses contain only readiness and account counts. Neither the migration queue nor a privileged setup route is exposed to callers.

## Verification

```sh
node scripts/build-supabase-domain.mjs
node tests/supabase-domain.test.mjs
node --import tsx tests/supabase-transport.test.ts
npm run lint
npm run build
```

`supabase/tests-runtime.sql` exercises native session checks, team RLS, server RPC grants, atomic parent/child creation, financial permissions, stale revision rejection and disabled accounts against PostgreSQL. It wraps synthetic fixtures in a transaction and rolls them back. Run it with the owner SQL connection, not with a browser key.

The private tables intentionally have RLS enabled with no client policies. Service-role access is required. Security advisors may report this as informational; granting client policies would expose migration credentials or private archives. Unused indexes on a new project are expected until production traffic starts.
