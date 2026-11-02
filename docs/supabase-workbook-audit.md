# Source workbook audit — read-only, no import

Follow-up on 2026-11-02: the exact file `MKT TEAM B(2).xlsx` was located and read privately. This replaces the initial Phase 1 statement that the workbook had not been supplied to the scratch workspace. No source workbook or customer row is included in this repository.

| Check | Actual result |
|---|---|
| Sheet | Sheet1 |
| Used range / header | A1:H579 / row 1 |
| Nonblank data rows | 578 |
| Unique trimmed customer codes | 578 |
| Duplicate codes / identical full rows | 0 / 0 |
| Blank data rows | 0 |
| Missing cells in the eight required columns | 0 |
| Unmapped MDE team labels | 0 |
| Customer code type | Text in all 578 rows |
| Quantity type / validation | Numeric in all 578 rows; no negative/nonfinite values |
| Date cells | Numeric Excel serials in all 578 commencement and expiry cells |
| Date system | 1900; no fractional/invalid/phantom-day date serials found |
| Commencement after expiry | 0 rows |
| Formulas in required data cells | 0 |
| Budget/amount/unit-price/currency columns | None |

| Team | Customer rows |
|---|---:|
| B1 | 75 |
| B2 | 96 |
| B3 | 66 |
| B4 | 77 |
| B5 | 85 |
| B6 | 98 |
| B7 | 81 |
| Total | 578 |

Actual headers after trimming are MDE, Customer Code, Customer Name, Condition Quantity, Condition UOM, Condition Product Code Description, Commencing On, Expiring On. Three condition headers contain leading spaces in the original; normalize header whitespace only, not the meaning of values. Each row represents one source customer/condition/contract line; reconciliation with current Sheets is still needed to establish whether this workbook is a historical or current authoritative snapshot.

## Reproduce without exposing customer rows

With locked application dependencies installed:

```bash
node supabase/review/audit-workbook.mjs /absolute/private/path/source.xlsx
```

The read-only script emits only structural metadata, aggregate counts, value types and offending row numbers. It neither edits the workbook nor sends it anywhere. Do not commit a private source workbook or raw source export. No customer names, codes, descriptions or contact details were copied into this report.

## Import gates still open

The 578-row count is now verified, rather than the earlier estimate. Structural validation does **not** establish monetary budgets: there is no annual amount or price column. Obtain approved current budgets and active/cancelled transactions from the correct GAS/Sheets source, reconcile by customer/contract/year, and resolve pending browser writes. Never calculate a new monetary budget from quantity alone. Supabase Auth identity mapping, a reviewed privileged importer and separate staging/cutover approval remain necessary. No live import occurred.
