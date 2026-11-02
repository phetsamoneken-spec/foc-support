# Private review staging planner — no loader and no live writes

`supabase/review/build-staging-plan.mjs` builds offline review candidates from normalized workbook rows and previously captured selected-field original/copy snapshots. It neither fetches data nor generates executable SQL. Real input/output packages stay private; only generic code and synthetic tests belong in this repository.

The owner clarified that seed/demo expense entries were not edited into actual expenses. With that explicit option set, seed transaction IDs are excluded from the **proposed real-spending** set while source versions and original records are preserved. Without confirmation, the planner excludes nothing and adds a blocker. Non-seed IDs are not automatically approved as actual spending.

Workbook customer codes remain the candidate identity set, including deletion tombstones. A customer is never removed just because its code also appears in the seed generator. Original-only historical parents outside the workbook go to a separate review list; no source record is deleted or restored automatically.

Contracts are matched by exact customer code and calendar start/end, preserving text IDs. Missing or conflicting candidate IDs produce explicit conflicts instead of invented IDs. Period dates use the existing shared anniversary rule, including Feb 29. Customer names/conditions from the workbook are provenance candidates, not authority to overwrite latest full customer records or contact fields.

Every annual amount and legacy undated usage is **null/unapproved**, not zero. The tool does not infer approved money from quantity, default price or a seed-derived total. It preserves source budget references for later evidence review. Each non-seed expense retains source locations and selected versions, an evidence/reviewer decision placeholder, relationship checks and approved:false. Different data under the same transaction ID becomes a conflict, preserving both versions.

The manifest always returns `readyForLiveImport:false` and `acceptedFinancialRows:0`. Completing a review JSON is not live-import authorization; there is no loader. Remaining gates include source authority, latest full records, approved monetary amounts, expense evidence, browser outbox reconciliation and a separately reviewed cutover.

## Input and output

Input shape: `workbookRows`, `originalParts`, `copyParts`, `seedTransactionIds`, `ownerConfirmedNoSeedExpenseEdits`, and optional `sourceMetadata`. Range parts must be bounded, with values inside declared dimensions; duplicate IDs are rejected. Keep normalized inputs private.

```bash
node supabase/review/build-staging-plan.mjs /absolute/private/input.json /absolute/private/output-directory
```

Outputs: manifest, customer/condition/contract/annual-period candidates, excluded seed transaction versions, pending expense reviews, outside-workbook historical-parent reviews and conflicts. These are local JSON files containing private source data; never commit/upload them to the public repository or public CI artifacts.

## Verification

`node supabase/tests/staging-plan.test.mjs` covers twelve synthetic scenarios: preserving real workbook identity while excluding seed expenses, refusing seed money carryover, shared leap-date bounds and original IDs, tombstone retention, required owner clarification, duplicate IDs, invalid teams/dates, conflicting source versions, ambiguous contracts, explicit parent/team blockers and transaction relationship/period exceptions and range-bound violations.

The private package is a review artifact based on a dated observation, not a fresh/atomic source export and not a production-ready migration dataset.
