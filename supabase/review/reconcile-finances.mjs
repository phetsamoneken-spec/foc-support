/** Pure read-only reconciliation of selected Sheet fields. Input/report are private, never commit them. */
import { readFile,writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
export function reconcile(parts,{today=new Date(Date.now()+7*3600000).toISOString().slice(0,10),workbookCodes=[]}={}){
 const blank=v=>v===undefined||v===null||v==='';
 const text=v=>blank(v)?'':String(v).trim();
 const grid={};
 for(const p of parts){
  const m=/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(p.range);if(!m)throw Error('Expected bounded source ranges');
  const col=s=>[...s].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)-1;
  const start=col(m[1]),r0=Number(m[2]);grid[p.sheet]??=new Map();
  p.values.forEach((row,i)=>{const target=grid[p.sheet].get(r0+i)||[];row.forEach((v,j)=>{target[start+j]=v;});grid[p.sheet].set(r0+i,target);});
 }
 const records=(name)=>[...(grid[name]||new Map())].filter(([,r])=>!blank(r[0])).map(([row,cells])=>({row,cells}));
 const issues=[];
 function issue(type,table,row){issues.push({type,table,row});}
 function money(v,table,row){
  if(blank(v)){issue('MISSING_MONEY',table,row);return null;}
  const s=String(v),m=/^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if(!m){issue('INVALID_MONEY',table,row);return null;}
  return (m[1]?-1n:1n)*(BigInt(m[2])*100n+BigInt((m[3]||'').padEnd(2,'0')));
 }
 const amountString=n=>n===null?null:(n<0n?'-':'')+((n<0n?-n:n)/100n)+'.'+String((n<0n?-n:n)%100n).padStart(2,'0');
 function date(v){
  if(typeof v==='number'&&Number.isInteger(v)&&v>=61)return new Date(Date.UTC(1899,11,30)+v*86400000).toISOString().slice(0,10);
  const s=text(v);if(/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s)return s;
  return null;
 }
 function index(name){const map=new Map();for(const r of records(name)){const id=text(r.cells[0]);if(map.has(id))issue('DUPLICATE_ID',name,r.row);else map.set(id,r);}return map;}
 const customers=index('CUSTOMERS'),contracts=index('CONTRACTS'),budgets=index('BUDGETS'),transactions=index('BUDGET_TRANSACTIONS'),deleted=index('DELETED_CUSTOMERS');
 const teamCounts={},budgetPeriods=new Set(),activeByBudget=new Map(),contractCycles=new Set();
 for(const r of customers.values()){
  const c=r.cells,t=text(c[2]);teamCounts[t]=(teamCounts[t]||0)+1;
  if(!/^B[1-7]$/.test(t))issue('INVALID_TEAM','CUSTOMERS',r.row);
  if(deleted.has(text(c[0])))issue('TOMBSTONED_CUSTOMER_PRESENT','CUSTOMERS',r.row);
 }
 let transactionActive=0n,transactionCancelled=0n;const transactionStatuses={};
 for(const r of transactions.values()){
  const t=r.cells,customer=customers.get(text(t[2])),contract=contracts.get(text(t[5])),budget=budgets.get(text(t[6])),status=text(t[13])||'ACTIVE';
  transactionStatuses[status]=(transactionStatuses[status]||0)+1;
  const value=money(t[9],'BUDGET_TRANSACTIONS',r.row);
  if(value!==null&&value<=0n)issue('NONPOSITIVE_TRANSACTION','BUDGET_TRANSACTIONS',r.row);
  if(!customer)issue('ORPHAN_CUSTOMER','BUDGET_TRANSACTIONS',r.row);
  if(!contract)issue('ORPHAN_CONTRACT','BUDGET_TRANSACTIONS',r.row);
  if(!budget)issue('ORPHAN_BUDGET','BUDGET_TRANSACTIONS',r.row);
  if(customer&&text(t[4])!==text(customer.cells[2]))issue('TEAM_MISMATCH','BUDGET_TRANSACTIONS',r.row);
  if(contract&&(text(t[2])!==text(contract.cells[1])||text(t[4])!==text(contract.cells[3])))issue('CONTRACT_MISMATCH','BUDGET_TRANSACTIONS',r.row);
  if(budget&&(text(t[5])!==text(budget.cells[1])||text(t[2])!==text(budget.cells[2])||text(t[4])!==text(budget.cells[3])))issue('BUDGET_MISMATCH','BUDGET_TRANSACTIONS',r.row);
  const d=date(t[1]);
  if(!d)issue('INVALID_DATE','BUDGET_TRANSACTIONS',r.row);
  else if(budget&&date(budget.cells[13])&&date(budget.cells[14])&&(d<date(budget.cells[13])||d>date(budget.cells[14])))issue('TRANSACTION_OUTSIDE_PERIOD','BUDGET_TRANSACTIONS',r.row);
  if(value!==null){if(status==='ACTIVE'){transactionActive+=value;activeByBudget.set(text(t[6]),(activeByBudget.get(text(t[6]))||0n)+value);}else if(status==='CANCELLED')transactionCancelled+=value;else issue('INVALID_STATUS','BUDGET_TRANSACTIONS',r.row);}
 }
 const contractsByCustomer=new Map();
 for(const r of contracts.values()){
  const c=r.cells,parent=customers.get(text(c[1])),start=date(c[4]),end=date(c[5]),cycle=Number(c[6]);
  if(!parent)issue('ORPHAN_CUSTOMER','CONTRACTS',r.row);
  else if(text(parent.cells[2])!==text(c[3]))issue('TEAM_MISMATCH','CONTRACTS',r.row);
  if(!start||!end||start>end)issue('INVALID_DATES','CONTRACTS',r.row);
  const key=JSON.stringify([text(c[1]),cycle]);if(contractCycles.has(key))issue('DUPLICATE_CYCLE','CONTRACTS',r.row);contractCycles.add(key);
  if(!Number.isInteger(cycle)||cycle<1)issue('INVALID_CYCLE','CONTRACTS',r.row);
  const list=contractsByCustomer.get(text(c[1]))||[];list.push(r);contractsByCustomer.set(text(c[1]),list);
 }
 for(const list of contractsByCustomer.values()){
  const sorted=[...list].sort((a,b)=>(date(a.cells[4])||'').localeCompare(date(b.cells[4])||''));
  let latestEnd=null;for(const c of sorted){const start=date(c.cells[4]),end=date(c.cells[5]);if(start&&latestEnd&&start<=latestEnd)issue('OVERLAPPING_CONTRACT','CONTRACTS',c.row);if(end&&(!latestEnd||end>latestEnd))latestEnd=end;}
 }
 let annual=0n,used=0n,legacy=0n,remaining=0n,currentAnnual=0n,currentUsed=0n;let currentPeriods=0;
 const mismatches=[];
 for(const r of budgets.values()){
  const b=r.cells,parent=customers.get(text(b[2])),ct=contracts.get(text(b[1]));
  if(!parent)issue('ORPHAN_CUSTOMER','BUDGETS',r.row);
  if(!ct)issue('ORPHAN_CONTRACT','BUDGETS',r.row);
  if(parent&&text(b[3])!==text(parent.cells[2]))issue('TEAM_MISMATCH','BUDGETS',r.row);
  if(ct&&(text(b[2])!==text(ct.cells[1])||text(b[3])!==text(ct.cells[3])))issue('CONTRACT_MISMATCH','BUDGETS',r.row);
  const n=Number(b[12]),start=date(b[13]),end=date(b[14]);
  const key=JSON.stringify([text(b[1]),n]);if(budgetPeriods.has(key))issue('DUPLICATE_CONTRACT_YEAR','BUDGETS',r.row);budgetPeriods.add(key);
  if(!Number.isInteger(n)||n<1||n>100)issue('INVALID_PERIOD_NUMBER','BUDGETS',r.row);
  if(!start||!end||start>end)issue('INVALID_PERIOD_DATES','BUDGETS',r.row);
  if(ct&&start&&end&&Number.isInteger(n)&&n>=1&&n<=100&&date(ct.cells[4])&&date(ct.cells[5])){
   const commence=date(ct.cells[4]);const anniversary=offset=>{const year=Number(commence.slice(0,4))+offset,month=Number(commence.slice(5,7)),day=Math.min(Number(commence.slice(8,10)),new Date(Date.UTC(year,month,0)).getUTCDate());return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;};
   const expectedStart=anniversary(n-1),next=anniversary(n),expectedEnd=[date(ct.cells[5]),new Date(Date.parse(next)-86400000).toISOString().slice(0,10)].sort()[0];
   if(start!==expectedStart||end!==expectedEnd||start>date(ct.cells[5]))issue('PERIOD_BOUNDARY_MISMATCH','BUDGETS',r.row);
  }
  const a=money(b[4],'BUDGETS',r.row),u=money(b[5],'BUDGETS',r.row),rem=money(b[6],'BUDGETS',r.row);
  const unallocated=blank(b[15])?null:money(b[15],'BUDGETS',r.row),recorded=activeByBudget.get(text(b[0]))||0n;
  if(a!==null&&a<0n||u!==null&&u<0n||unallocated!==null&&unallocated<0n)issue('NEGATIVE_MONEY','BUDGETS',r.row);
  if(a!==null)annual+=a;if(u!==null)used+=u;if(rem!==null)remaining+=rem;if(unallocated!==null)legacy+=unallocated;
  const missingLegacy=unallocated===null&&u!==null?u-recorded:null;
  if(unallocated===null&&u!==null&&u!==recorded)issue('UNVERIFIED_LEGACY_RESIDUAL','BUDGETS',r.row);
  if(u!==null&&unallocated!==null&&u!==unallocated+recorded){issue('USAGE_MISMATCH','BUDGETS',r.row);mismatches.push({row:r.row,storedUsed:amountString(u),activeDated:amountString(recorded),undated:amountString(unallocated),difference:amountString(u-unallocated-recorded)});}
  if(a!==null&&u!==null&&rem!==null&&rem!==a-u)issue('REMAINING_MISMATCH','BUDGETS',r.row);
  if(a!==null&&u!==null){const rate=a>0n?Math.round(Number(u)*1000/Number(a))/10:0;const sourceRate=Number(b[7]);if(!Number.isFinite(sourceRate)||Math.abs(sourceRate-rate)>0.000001)issue('UTILIZATION_MISMATCH','BUDGETS',r.row);const status=u>a?'EXCEEDED':rate>=100?'CRITICAL_100':rate>=80?'WARNING_80':'NORMAL';if(text(b[8])!==status)issue('BUDGET_STATUS_MISMATCH','BUDGETS',r.row);}
  if(start&&end&&today>=start&&today<=end){currentPeriods++;if(a!==null)currentAnnual+=a;if(u!==null)currentUsed+=u;}
 }
 const counts={customerRows:records('CUSTOMERS').length,uniqueCustomers:customers.size,contracts:contracts.size,budgets:budgets.size,transactions:transactions.size,deletedCustomers:deleted.size,transactionStatuses,teamCounts,currentPeriods};
 const diagnostics={};for(const i of issues)diagnostics[i.type]=(diagnostics[i.type]||0)+1;
 const sourceSet=new Set(workbookCodes.map(text));let sourceComparison=null;
 if(sourceSet.size)sourceComparison={workbookCodes:sourceSet.size,currentAndTombstonedUnion:new Set([...customers.keys(),...deleted.keys()]).size,workbookMissingFromBoth:[...sourceSet].filter(c=>!customers.has(c)&&!deleted.has(c)).length,currentNotInWorkbook:[...customers.keys()].filter(c=>!sourceSet.has(c)).length,tombstoneNotInWorkbook:[...deleted.keys()].filter(c=>!sourceSet.has(c)).length};
 return {readOnly:true,asOfBusinessDate:today,counts,sourceComparison,diagnostics,issues,mismatches,
 totals:{scope:'All stored contract periods, including past and future; never label as current annual budget',annualAmount:amountString(annual),storedUsed:amountString(used),legacyUndated:amountString(legacy),activeDatedTransactions:amountString(transactionActive),cancelledTransactionsExcluded:amountString(transactionCancelled),storedRemaining:amountString(remaining),usageDifference:amountString(used-legacy-transactionActive),currentDatePeriods:{annualAmount:amountString(currentAnnual),storedUsed:amountString(currentUsed)}},
 readyForImport:false,limits:['Read-only live-sheet observation, not an atomic export or approval of its authority.','Pending browser-only writes and journal state must be reconciled before cutover.','Historical contract overlaps, period exceptions, monetary discrepancies and identity mapping require review.']};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(!process.argv[2]||!process.argv[3])throw Error('Pass private selected-field JSON and private output JSON paths.');
 const input=JSON.parse(await readFile(process.argv[2],'utf8'));const report=reconcile(input);
 await writeFile(process.argv[3],JSON.stringify(report,null,2),{mode:0o600});
 console.log(JSON.stringify({readOnly:true,counts:report.counts,diagnostics:report.diagnostics,readyForImport:false}));
}
