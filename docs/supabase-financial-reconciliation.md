# Financial reconciliation — private source data, review-only tooling

The current read-only data source was located in connected Drive. Headers and bounded selected business fields were inspected: customer code/team/status, contract relationships/dates, annual period amounts/usage, transaction amount/status/relationships and deletion IDs. No USERS, SESSIONS, password hashes, recovery JSON, raw write plans or backups containing credentials were read. A journal state-only check does not prove that every browser outbox is settled.

`supabase/review/reconcile-finances.mjs` consumes a **private local JSON** of selected range responses and produces a private report. It does not contact or modify Sheets/Supabase. Monetary values are parsed into integer cents; invalid precision is rejected. It checks unique IDs, customer/contract/budget/team consistency, anniversary bounds, dates, overlapping cycles, active-vs-cancelled spending, explicit legacy undated usage, remaining balances and derived status/rates. It separates source row counts from unique record counts and compares current/tombstoned customer codes to the source workbook when supplied.

`supabase/tests/reconcile-finances.test.mjs` uses only synthetic fixtures. Ten scenarios verify exact-cent discrepancies, cancellation exclusion, missing parents, team mismatches, invalid annual periods, unverified legacy residuals, precision rejection, out-of-period expenses, nested contract overlaps and duplicate identities.

## Findings and privacy

The private source has unresolved relationship and usage exceptions. Exact source counts, financial totals, row coordinates and exception details are delivered privately to the owner and are **not committed**. No financial total, customer code/name/contact or source workbook is included in this public review branch. Existing historical customer IDs can be checked against historical-parent ID columns, but matching IDs alone does not authorize restoring/merging or changing their active status.

Do not solve orphan references by deleting their contracts, budgets or transactions. Establish the authoritative historical parent and retention/status rules, then stage a reviewed mapping. Do not infer identity from similar names or move expenses between teams. Current workbook customers plus deletion tombstones are a separate scope from retained financial history; do not assume they represent all historical counterparties.

For every budget use:

`expected_used = explicit approved legacy_undated_used + sum(ACTIVE dated transactions)`

`expected_remaining = annual_amount - expected_used`

Cancelled amounts remain in history and do not consume the budget. Annual amounts summed over **all stored past/future contract periods** are not a current-year budget. Monetary differences require evidence/owner review; no live balance is repaired automatically.

## Remaining gates

The observation is not an atomic export or proof of source authority. Recheck source modification state, take privately verified backups, settle browser outboxes, reconcile every exception and agree historical parent handling before import/cutover. A server journal containing only completed entries does not establish browser cleanliness. No source mutation, live import, hosted SQL, merge or deployment was performed.

## Source selection and read side effects

A Database/Backup title is not proof that it is the active application database. Read migration/routing metadata and compare original/copy IDs and selected records before choosing authority. If the GAS source route is PENDING, `resolvePrimaryDatabase_` can call `activateRoutedDatabase_` during a nominal read/Ping, copying original tables over target and retiring old access. Do not use such an endpoint as a read-only diagnostic while unresolved target-only changes exist. This follow-up inspected Sheets directly and never triggered GAS activation.

Records matching repository seed IDs or selected seed fields are provenance candidates, not proof they are disposable. Retain them for private owner review; do not import unverified demo balances as approved spending or delete altered historical records automatically.
