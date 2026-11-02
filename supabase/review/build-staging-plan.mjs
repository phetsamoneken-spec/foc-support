/** Offline review staging planner. Never writes SQL, calls a network API or selects a backend.
 * Real inputs and outputs are private. No candidate is approved for live import by this tool.
 */
import {annualPeriods} from '../../src/services/annualBudgets.js';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
export function selectedRows(parts,table){
 const rows=new Map();
 for(const part of parts.filter(p=>p.sheet===table)){
  const m=/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(part.range);if(!m)throw Error('Unbounded source range');
  const decode=s=>[...s].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)-1;
  const col=decode(m[1]),end=decode(m[3]);if(!Array.isArray(part.values)||+m[4]<+m[2]||end<col||part.values.length>+m[4]-+m[2]+1||part.values.some(r=>!Array.isArray(r)||r.length>end-col+1))throw Error('Source values exceed declared range');
  part.values.forEach((values,i)=>{const row=rows.get(+m[2]+i)||[];values.forEach((v,j)=>row[col+j]=v);rows.set(+m[2]+i,row);});
 }
 const ids=new Set();return [...rows].filter(([,r])=>r[0]!==undefined&&r[0]!==null&&String(r[0]).trim()!=='').map(([row,cells])=>{const id=String(cells[0]).trim();if(ids.has(id))throw Error('Duplicate source ID in '+table);ids.add(id);return {row,cells,id};});
}
const text=v=>String(v??'').trim();
function calendar(value){
 const s=text(value);if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||Number.isNaN(Date.parse(s))||new Date(s).toISOString().slice(0,10)!==s)throw Error('Invalid source calendar date');return s;
}
function sheetDate(value){if(typeof value==='number'&&Number.isInteger(value)&&value>=61)return new Date(Date.UTC(1899,11,30)+value*86400000).toISOString().slice(0,10);return calendar(value);}
export function buildStagingPlan({workbookRows,originalParts,copyParts,seedTransactionIds,ownerConfirmedNoSeedExpenseEdits=false,sourceMetadata={}}){
 if(!Array.isArray(workbookRows)||!Array.isArray(originalParts)||!Array.isArray(copyParts))throw Error('Missing private source inputs');
 const originalCustomers=selectedRows(originalParts,'CUSTOMERS'),copyCustomers=selectedRows(copyParts,'CUSTOMERS'),deleted=selectedRows(copyParts,'DELETED_CUSTOMERS');
 const originalByCode=new Map(originalCustomers.map(r=>[r.id,r])),copyByCode=new Map(copyCustomers.map(r=>[r.id,r])),deletedByCode=new Map(deleted.map(r=>[r.id,r]));
 const originalContracts=selectedRows(originalParts,'CONTRACTS'),copyContracts=selectedRows(copyParts,'CONTRACTS');
 const originalBudgets=selectedRows(originalParts,'BUDGETS'),copyBudgets=selectedRows(copyParts,'BUDGETS');
 const conflicts=[],customers=[],conditions=[],contracts=[],budgets=[],codes=new Set();
 const fingerprint=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
 for(const r of workbookRows){
  const code=text(r.code);if(!code||codes.has(code))throw Error('Missing/duplicate workbook code');codes.add(code);
  const team=text(r.team);if(!/^B[1-7]$/.test(team))throw Error('Invalid workbook team');
  const start=calendar(r.commencingOn),end=calendar(r.expiringOn);if(start>end)throw Error('Reversed workbook contract dates');
  if(typeof r.conditionQuantity!=='number'||!Number.isFinite(r.conditionQuantity)||r.conditionQuantity<0)throw Error('Invalid workbook condition quantity');
  const live=copyByCode.get(code),tombstone=deletedByCode.get(code),old=originalByCode.get(code);
  const state=tombstone?'DELETED':live?'CURRENT_COPY_CANDIDATE':'SOURCE_REVIEW_REQUIRED';
  if(live&&tombstone)conflicts.push({kind:'TOMBSTONE_AND_CURRENT_PARENT',customerCode:code});
  if(!live&&!tombstone)conflicts.push({kind:'WORKBOOK_PARENT_NOT_IN_COPY_OR_TOMBSTONE',customerCode:code});
  if(live&&text(live.cells[2])!==team)conflicts.push({kind:'WORKBOOK_COPY_TEAM_DISAGREEMENT',customerCode:code});
  customers.push({code,workbookName:text(r.name),workbookTeam:team,workbookMde:text(r.mde),candidateState:state,sourceRows:{workbook:r.row,original:old?.row??null,copy:live?.row??null,tombstone:tombstone?.row??null},approved:false,requiresLatestFullCustomerRecord:true});
  conditions.push({customerCode:code,conditionQuantity:r.conditionQuantity,conditionUOM:text(r.conditionUOM),conditionProductDescription:text(r.conditionProductDescription),unitPrice:null,approved:false,sourceWorkbookRow:r.row});
  const candidates=[];
  for(const [source,list] of [['copy',copyContracts],['original',originalContracts]])for(const c of list){if(text(c.cells[1])!==code)continue;let a,b;try{a=sheetDate(c.cells[4]);b=sheetDate(c.cells[5]);}catch{conflicts.push({kind:'INVALID_SOURCE_CONTRACT_DATE',source,row:c.row});continue;}if(a===start&&b===end)candidates.push({source,...c});}
  const chosen=candidates.find(c=>c.source==='copy')||candidates[0];
  const candidateIds=[...new Set(candidates.map(c=>c.id))];
  if(candidateIds.length!==1)conflicts.push({kind:candidateIds.length?'AMBIGUOUS_SOURCE_CONTRACT':'MISSING_SOURCE_CONTRACT',customerCode:code,candidateIds});
  const teamMatches=chosen&&text(chosen.cells[3])===team;
  if(chosen&&!teamMatches)conflicts.push({kind:'CONTRACT_TEAM_DISAGREEMENT',customerCode:code,source:chosen.source,row:chosen.row});
  const contract={id:candidateIds.length===1?candidateIds[0]:null,customerCode:code,team,commencingOn:start,expiringOn:end,cycleNumber:chosen?chosen.cells[6]:null,candidateState:state,sourceMatches:candidates.map(c=>({source:c.source,row:c.row,id:c.id})),approved:false};contracts.push(contract);
  // Period dates come from the existing shared rule; no financial amount is inferred.
  for(const period of annualPeriods(contract)){
   const refs=[];for(const [source,list] of [['copy',copyBudgets],['original',originalBudgets]])for(const b of list)if(contract.id&&text(b.cells[1])===contract.id&&text(b.cells[2])===code&&Number(b.cells[12])===period.periodNumber)refs.push({source,row:b.row,id:b.id});
   budgets.push({contractId:contract.id,customerCode:code,team,...period,sourceBudgetRefs:refs,annualAmount:null,legacyUndatedUsed:null,approvalState:'PENDING_MONETARY_EVIDENCE',approved:false,candidateState:state});
  }
 }
 const seedIds=new Set(seedTransactionIds||[]),txById=new Map(),excluded=[],expenses=[];
 for(const [source,parts] of [['original',originalParts],['copy',copyParts]])for(const r of selectedRows(parts,'BUDGET_TRANSACTIONS')){
  const prior=txById.get(r.id);const selected={id:r.id,date:r.cells[1],customerCode:text(r.cells[2]),team:text(r.cells[4]),contractId:text(r.cells[5]),budgetId:text(r.cells[6]),category:r.cells[7],amount:r.cells[9],status:r.cells[13]};
  if(prior){if(JSON.stringify(prior.record)!==JSON.stringify(selected))conflicts.push({kind:'TRANSACTION_SOURCE_COPY_CONFLICT',transactionId:r.id});prior.locations.push({source,row:r.row});prior.sourceVersions.push({source,row:r.row,record:selected});}
  else txById.set(r.id,{record:selected,locations:[{source,row:r.row}],sourceVersions:[{source,row:r.row,record:selected}]});
 }
 for(const {record,locations,sourceVersions} of txById.values()){
  if(ownerConfirmedNoSeedExpenseEdits&&seedIds.has(record.id)){excluded.push({transactionId:record.id,classification:'EXCLUDED_SEED_FROM_PROPOSED_REAL_SPENDING',locations,sourceVersions});continue;}
  const problems=[];if(!codes.has(record.customerCode))problems.push('NOT_IN_WORKBOOK_CUSTOMERS');if(deletedByCode.has(record.customerCode))problems.push('CUSTOMER_HAS_TOMBSTONE');
  if(codes.has(record.customerCode)){const c=customers.find(c=>c.code===record.customerCode);if(c.workbookTeam!==record.team)problems.push('TEAM_DISAGREEMENT');}
  const contract=contracts.find(c=>c.customerCode===record.customerCode&&c.id===record.contractId);
  if(!contract)problems.push('CONTRACT_NOT_SELECTED_FROM_WORKBOOK');
  const period=budgets.find(b=>b.customerCode===record.customerCode&&b.contractId===record.contractId&&b.sourceBudgetRefs.some(r=>r.id===record.budgetId));
  if(!period)problems.push('BUDGET_NOT_SELECTED_FROM_WORKBOOK');
  let expenseDate;try{expenseDate=sheetDate(record.date);}catch{problems.push('INVALID_TRANSACTION_DATE');}
  if(period&&expenseDate&&(expenseDate<period.periodStart||expenseDate>period.periodEnd))problems.push('TRANSACTION_OUTSIDE_SELECTED_PERIOD');

  expenses.push({...record,locations,sourceVersions,seedIdCandidate:seedIds.has(record.id),reviewDecision:'PENDING',evidenceReference:'',reviewer:'',reviewedAt:null,issues:problems,approved:false});
 }
 const legacyParents=originalCustomers.filter(c=>!codes.has(c.id)).map(c=>({customerCode:c.id,sourceRow:c.row,classification:'OUTSIDE_WORKBOOK_RETAIN_FOR_PRIVATE_REVIEW',approved:false}));
 const blockers=['SOURCE_AUTHORITY_UNRESOLVED','FULL_CUSTOMER_FIELDS_NOT_CAPTURED','MONETARY_BUDGETS_NOT_APPROVED','LEGACY_USAGE_NOT_APPROVED','NON_SEED_EXPENSE_EVIDENCE_PENDING','BROWSER_OUTBOX_RECONCILIATION_PENDING','LIVE_IMPORT_NOT_AUTHORIZED'];
 if(!ownerConfirmedNoSeedExpenseEdits)blockers.push('SEED_CLASSIFICATION_OWNER_CONFIRMATION_REQUIRED');
 if(conflicts.length)blockers.push('STRUCTURAL_SOURCE_CONFLICTS');
 return {manifest:{version:1,reviewOnly:true,readyForLiveImport:false,acceptedFinancialRows:0,sourceSnapshot:sourceMetadata,sourceFingerprints:{workbook:fingerprint(workbookRows),originalSelectedFields:fingerprint(originalParts),copySelectedFields:fingerprint(copyParts)},policy:{noDatabaseWrites:true,noDeletion:true,noQuantityPriceInference:true,noSeedUsageCarryover:true,noUnknownAmountAsZero:true,noSeedIdOnlyCustomerExclusion:true},counts:{workbookCustomers:customers.length,currentCopyCustomers:customers.filter(c=>c.candidateState==='CURRENT_COPY_CANDIDATE').length,deletedWorkbookCustomers:customers.filter(c=>c.candidateState==='DELETED').length,conditionCandidates:conditions.length,contractCandidates:contracts.length,budgetPeriodCandidates:budgets.length,excludedSeedTransactions:excluded.length,unverifiedExpenses:expenses.length,outsideWorkbookHistoricalParents:legacyParents.length,structuralConflicts:conflicts.length},blockers},customers,conditions,contracts,budgets,excludedSeedTransactions:excluded,expenseReview:expenses,legacyParentReview:legacyParents,conflicts};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(!process.argv[2]||!process.argv[3])throw Error('Pass private normalized input JSON and private output directory');
 const plan=buildStagingPlan(JSON.parse(await readFile(process.argv[2],'utf8')));await mkdir(process.argv[3],{recursive:true,mode:0o700});
 for(const [name,value] of Object.entries(plan))await writeFile(new URL(name+'.json',pathToFileURL(process.argv[3].replace(/\/?$/,'/'))),JSON.stringify(value,null,2),{mode:0o600});
 console.log(JSON.stringify({reviewOnly:true,readyForLiveImport:false,counts:plan.manifest.counts}));
}
