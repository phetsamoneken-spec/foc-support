import assert from 'node:assert/strict';
import {reconcile} from '../review/reconcile-finances.mjs';
const fixture=()=>[
 {sheet:'CUSTOMERS',range:'A2:H2',values:[['SYN-1','','B1','MDE-B1','','','','ACTIVE']]},
 {sheet:'CONTRACTS',range:'A2:H2',values:[['CT-1','SYN-1','','B1','2026-01-01','2026-12-31',1,'ACTIVE']]},
 {sheet:'BUDGETS',range:'A2:P2',values:[['BD-1','CT-1','SYN-1','B1','100.00','40.01','59.99',40,'NORMAL',false,'','',1,'2026-01-01','2026-12-31','10.01']]},
 {sheet:'BUDGET_TRANSACTIONS',range:'A2:N3',values:[['TX-1','2026-02-01','SYN-1','','B1','CT-1','BD-1','Other','','30.00','','','','ACTIVE'],['TX-C','2026-02-01','SYN-1','','B1','CT-1','BD-1','Other','','20.00','','','','CANCELLED']]},
 {sheet:'DELETED_CUSTOMERS',range:'A2:A2',values:[['SYN-2']]}
];
let checks=0;const pass=name=>{checks++;console.log('PASS '+name);};
{
 const r=reconcile(fixture(),{workbookCodes:['SYN-1','SYN-2']});assert.deepEqual(r.diagnostics,{});assert.equal(r.totals.usageDifference,'0.00');assert.equal(r.totals.storedRemaining,'59.99');assert.equal(r.totals.cancelledTransactionsExcluded,'20.00');assert.equal(r.totals.activeDatedTransactions,'30.00');assert.equal(r.sourceComparison.workbookMissingFromBoth,0);assert.equal(r.readyForImport,false);pass('exact cents, cancelled exclusion and workbook/tombstone identity union');
}
{
 const f=fixture();f[2].values[0][5]='40.02';const r=reconcile(f);assert.equal(r.diagnostics.USAGE_MISMATCH,1);assert.equal(r.diagnostics.REMAINING_MISMATCH,1);assert.equal(r.mismatches[0].difference,'0.01');pass('one-cent discrepancy remains visible');
}
{
 const f=fixture();f[0].values[0][0]='SYN-OTHER';const r=reconcile(f);assert.equal(r.diagnostics.ORPHAN_CUSTOMER,4);pass('orphan customer links detected across contracts, budgets and both transactions');
}
{
 const f=fixture();f[3].values[0][4]='B2';const r=reconcile(f);assert.equal(r.diagnostics.TEAM_MISMATCH,1);assert.equal(r.diagnostics.CONTRACT_MISMATCH,1);assert.equal(r.diagnostics.BUDGET_MISMATCH,1);pass('cross-table team mismatch detected');
}
{
 const f=fixture();f[2].values[0][12]=0;const r=reconcile(f);assert.equal(r.diagnostics.INVALID_PERIOD_NUMBER,1);pass('invalid annual period reported without crashing');
}
{
 const f=fixture();f[2].values[0][15]='';const r=reconcile(f);assert.equal(r.diagnostics.UNVERIFIED_LEGACY_RESIDUAL,1);assert.equal(r.totals.legacyUndated,'0.00');pass('missing undated spending requires review, never silently fabricated');
}
{
 const f=fixture();f[2].values[0][4]='100.001';const r=reconcile(f);assert.equal(r.diagnostics.INVALID_MONEY,1);pass('excess financial precision rejected');
}
{
 const f=fixture();f[3].values[0][1]='2027-01-01';assert.equal(reconcile(f).diagnostics.TRANSACTION_OUTSIDE_PERIOD,1);pass('backdated/out-of-period transaction detection');
}
{
 const f=fixture();f[1].range='A2:H4';f[1].values.push(['CT-2','SYN-1','','B1','2026-02-01','2026-03-01',2,'ACTIVE'],['CT-3','SYN-1','','B1','2026-04-01','2026-05-01',3,'ACTIVE']);assert.equal(reconcile(f).diagnostics.OVERLAPPING_CONTRACT,2);pass('nested contract overlaps counted against longest earlier end');
}
{
 const f=fixture();f[0].range='A2:H3';f[0].values.push([...f[0].values[0]]);const r=reconcile(f);assert.equal(r.diagnostics.DUPLICATE_ID,1);assert.equal(r.counts.customerRows,2);assert.equal(r.counts.uniqueCustomers,1);pass('duplicate source rows distinguished from unique identity counts');
}
console.log('PASS '+checks+' synthetic reconciliation scenarios; no private data used.');
