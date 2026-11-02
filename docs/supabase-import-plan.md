# Private import, reconciliation and rollback plan — NOT EXECUTED

## Source inspection gate

The requested `MKT TEAM B(2).xlsx` was located and structurally audited during the 2026-11-02 follow-up: 578 rows / 578 unique customer codes, complete required fields and valid team/date/quantity checks. See `docs/supabase-workbook-audit.md`. There is no monetary budget/price column. A read-only selected-field comparison of the discovered original/copy Sheets is now complete privately, but source authority, financial/relationship exceptions and browser outboxes remain unresolved. The preliminary SQL review remains unverified. This is a migration procedure, not approval to import.

For each workbook sheet record: name, used range, exact header row, blank/footer/merged rows, formula vs cached value, workbook 1900/1904 date system, field types, unique customer codes, duplicate codes, distinct team labels, missing values and rejected row numbers. Expected columns (must verify): MDE, Customer Code, Customer Name, Condition Quantity, Condition UOM, Condition Product Code Description, Commencing On, Expiring On. Do not log names/phone/address/full rows in CI or PRs. Publish aggregate counts only.

## Parsing and matching

- Read customer codes as trimmed **text**, preserving meaningful leading zeros and original source text in private provenance. Never parse codes as floating-point numbers. Agree normalization/case rules with the owner; do not merge distinct source codes on a guess.
- Team inference may accept exact `MDE-B1`…`MDE-B7` after trim and case normalization; unmapped labels are rejected for manual review. No B1 fallback.
- Dates are calendar dates in Asia/Vientiane; no local timezone Date conversion of Excel serials. Read workbook epoch. For the 1900 system: days 1..59 use 1899-12-31 + serial; day 60 is the fake 1900-02-29 and must be rejected; days >=61 use 1899-12-30 + serial. For the 1904 system: 1904-01-01 + serial. Reject unexpected fractional/time values or agree explicit truncation first. Parse strings only with an approved unambiguous format; reject 03/04 ambiguity. Enforce start<=expiry and <100 contract years.
- Match customer by validated code; match contract by customer + commencement + expiry and verified cycle; match conditions by source ID or explicit stable (customer,UOM,product) identity with duplicate handling. Multiple condition lines are not duplicate customers to silently overwrite. Repeated cycles stay separate.
- Detect duplicate customer codes both within each sheet and across workbook/Sheets. Identical repeated lines may be consolidated only with a recorded rule; conflicting names/team/periods/quantity require an exception queue. Never sum repeated quantities without verifying meaning.
- Do not infer monetary budget from quantity alone. Existing frontend defaults and a global crate price do not prove a historical source price. Carry annual amounts only from approved Sheets budgets or explicit owner input with provenance; leave unmapped amounts in staging, not guessed zero/default balances. Zero is valid only when confirmed as a real zero.
- Use numeric decimals and exact source money rounding rules. Reject >2 decimal places until approved; never silently round imported financial discrepancies.

## Reconcile every browser before authoritative export

Inventory each user/device's browser-only snapshots, `foc-pending-write-v1:<actor>:<endpoint>`, pending full publication (`sheetPublish.ts`), `mkt_sheet_business_baseline_v1` revision/fingerprint, pending shared settings and browser recovery state. Protect private exports; do not collect credentials/sessionStorage. Quiesce active writes only in an approved window.

Retry pending writes against their **original** account/backend/operation IDs and settle APP_WRITES recoveries in GAS. Never replay old snapshots over a newer revision. Compare browser vs current Sheet IDs, endpoint, tombstones and record timestamps; keep conflicting versions in a private review queue. Never delete a local outbox merely because the Supabase import ran. Obtain per-device reconciliation acknowledgement, archive both original and accepted states, and ensure all journals are DONE before final export. If a device cannot be reconciled, block cutover or explicitly accept an owner-documented exception.

## Backups and staging

1. Export all seven sync tables plus USERS metadata, CATEGORIES, MKT_MASTER, DELETED_CUSTOMERS and auxiliary journals/history/backups/recovery. Keep original encrypted exports with checksum/access controls outside Git/PR/console. Existing backups may contain hashes; never publish them to a public-schema JSON archive. Do not copy SESSIONS credentials to Supabase.
2. Restore-test a private GAS/Sheet backup before continuing. Store record counts, source checksums, export time, accepted revision and schema version in a private manifest.
3. Stage with a restricted non-exposed loader. The phase1 migration does not implement this loader; no live import should be attempted with this draft alone.
4. Validate all FKs and ownership before import. Missing budgets/contracts, orphan expenses, nonfinite amounts, mixed teams, overlapping cycles, invalid period dates and deleted-code resurrection must fail staging with row-level private diagnostics.
5. Map new Auth UUIDs to verified legacy IDs/usernames. Preserve legacy creator/canceller strings where mapping is missing; do not fabricate identities. Approve invite/password-reset separately. Auth users and privileged active profiles must be provisioned independently; no GAS hash import in public tables.
6. Import in dependency order: profiles (after Auth approval), customers (including deleted historical parents), conditions, contracts, budgets, transactions, tombstones, catalog/settings, sanitized logs/archives and import manifests. New IDs remain text; no real rows in committed test fixtures.

## Financial validation

Project anniversary periods from the original commencement, capping each inclusive end at expiry. Verify Feb 29 with the same clamping as annualBudgets.js. Do not reset spending at January 1. Keep one unique budget per contract/year and explicit historical amounts; do not replace previous years with today's budget amount.

Per original budget, compare stored totalUsed with its ACTIVE dated transactions. If unallocatedUsed is explicitly present, preserve it after validation; otherwise review residual `totalUsed - active dated transactions`. The existing JS clamps negatives but an import must flag negative residuals/ambiguous mismatches rather than hide them. Cancellations contribute zero spending and remain in history. Match backdated transactions to the correct original annual period. Preserve invoices and exception reasons. Historical budgets outside a shortened contract go to the exception queue for an approved historical-model solution, not silent deletion.

Prove for each contract/year/customer/team and globally:

`new total_used = approved undated usage + sum(active imported amounts)`

`remaining = annual_amount - total_used`

Compare original total used, cancelled count, transaction count, annual amount, remainder and utilization. Exact decimal reconciliation is required; zero tolerance for missing expenses. Reconcile source derived totals separately; they are evidence, not imported writable columns. Aggregate group totals must add to the same grand total. Preserve source rows privately until the owner signs off.

## Rehearsal, cutover and rollback

Run schema, synthetic SQL suite, multi-session conflict tests and actual Auth/PostgREST calls only in separately approved disposable staging. Verify Admin + every B1–B7 can log in; own-team budget creation/edit succeeds; cross-team calls fail. Verify first fresh browser, cached PWA upgrade, offline queue retry, signout, profile disable and session revocation. Compare frontend reports to both sources before any cutover.

Before cutover require explicit approval of workbook report, financial manifest, enrolled users, adapter parity, backups, admin management paths, test report and maintenance/rollback window. Phase1 does not grant this approval.

Before any Supabase writes after cutover, frontend can revert to GAS using the deployment-approved adapter while preserving recovery snapshots. After Supabase accepts new writes, freeze both sides, export its delta and reconcile it back to GAS using stable operation IDs before rollback; blindly switching back loses work. Retain GAS read access/backups until reconciliation retention is approved. No automatic dual writing.

`supabase/review/rollback-empty.sql` removes only an **empty** draft schema and refuses populated tables. It is not a data rollback. For populated staging restore its verified pre-migration snapshot; for a live system use the signed reconciliation plan. Do not use CASCADE or drop auth.users. No rollback command was run on a hosted project.
