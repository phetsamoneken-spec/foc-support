/** Read-only source audit. Prints aggregate counts and offending row numbers, never customer values. */
import XLSX from 'xlsx';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
export const expectedHeaders=['MDE','Customer Code','Customer Name','Condition Quantity','Condition UOM','Condition Product Code Description','Commencing On','Expiring On'];
export function auditWorkbook(bytes) {
 const book=XLSX.read(bytes,{type:'buffer',cellDates:false,cellFormula:true});
 const epoch1904=!!book.Workbook?.WBProps?.date1904;
 const report={dateSystem:epoch1904?'1904':'1900',sheets:[],moneyColumnsFound:[],sourceRows:0,uniqueCustomerCodes:0,teamCounts:{},readyForImport:false};
 const allCodes=new Set(),globalDuplicates=[];
 for(const name of book.SheetNames){
  const sheet=book.Sheets[name],rows=XLSX.utils.sheet_to_json(sheet,{header:1,raw:true,defval:null,blankrows:true});
  const headerIndex=rows.findIndex(row=>expectedHeaders.every(h=>row.some(v=>typeof v==='string'&&v.trim()===h)));
  const item={name,range:sheet['!ref'],headerRow:headerIndex<0?null:headerIndex+1,headers:[],dataRows:0,blankRows:0,uniqueCodes:0,teams:{},missingByColumn:{},typesByColumn:{},formulaCells:0,duplicateCodeRows:[],duplicateFullRows:[],invalidTeamRows:[],invalidQuantityRows:[],invalidDateRows:[],reversedDateRows:[],numericCodeRows:[],dateRange:null};
  report.sheets.push(item);
  if(headerIndex<0)continue;
  item.headers=rows[headerIndex].map(v=>String(v??'').trim());
  report.moneyColumnsFound.push(...item.headers.filter(h=>/price|budget|amount|currency|cost/i.test(h)));
  const indices=expectedHeaders.map(h=>item.headers.indexOf(h));
  const codes=new Set(),seenRows=new Set(),dates=[];
  for(const h of expectedHeaders){item.missingByColumn[h]=0;item.typesByColumn[h]={};}
  function calendar(value){
   if(typeof value==='number'){
    if(!Number.isFinite(value)||value!==Math.trunc(value)||value<0||!epoch1904&&value===60)return null;
    const d=XLSX.SSF.parse_date_code(value,{date1904:epoch1904});
    if(!d || d.y<1900 || d.y>9999)return null;
    const result=`${String(d.y).padStart(4,'0')}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
    return result;
   }
   if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value)return value;
   return null;
  }
  for(let i=headerIndex+1;i<rows.length;i++){
   const row=rows[i],r=i+1;
   if(row.every(v=>v===null||v==='')){item.blankRows++;continue;}
   item.dataRows++;report.sourceRows++;
   const values=indices.map(j=>row[j]);
   for(let j=0;j<expectedHeaders.length;j++){
    const v=values[j],h=expectedHeaders[j],type=v===null||v===undefined||typeof v==='string'&&!v.trim()?'empty':typeof v;
    item.typesByColumn[h][type]=(item.typesByColumn[h][type]||0)+1;
    if(type==='empty')item.missingByColumn[h]++;
    const cell=sheet[XLSX.utils.encode_cell({r:i,c:indices[j]})];if(cell?.f)item.formulaCells++;
   }
   const team=String(values[0]??'').trim().toUpperCase(),code=String(values[1]??'').trim();
   if(!/^MDE-B[1-7]$/.test(team))item.invalidTeamRows.push(r);
   else{const t=team.slice(4);item.teams[t]=(item.teams[t]||0)+1;report.teamCounts[t]=(report.teamCounts[t]||0)+1;}
   if(typeof values[1]==='number')item.numericCodeRows.push(r);
   if(code){if(codes.has(code))item.duplicateCodeRows.push(r);codes.add(code);if(allCodes.has(code))globalDuplicates.push({sheet:name,row:r});allCodes.add(code);}
   const signature=JSON.stringify(values);if(seenRows.has(signature))item.duplicateFullRows.push(r);seenRows.add(signature);
   if(typeof values[3]!=='number'||!Number.isFinite(values[3])||values[3]<0)item.invalidQuantityRows.push(r);
   const start=calendar(values[6]),end=calendar(values[7]);
   if(!start||!end)item.invalidDateRows.push(r);else{dates.push(start,end);if(start>end)item.reversedDateRows.push(r);}
  }
  item.uniqueCodes=codes.size;
  if(dates.length)item.dateRange={min:dates.sort()[0],max:dates.at(-1)};
 }
 report.uniqueCustomerCodes=allCodes.size;
 report.duplicateCodeRowsAcrossWorkbook=globalDuplicates;
 report.structurallyValid=report.sheets.length>0&&report.sheets.every(s=>s.headerRow!==null&&s.dataRows>0&&Object.values(s.missingByColumn).every(v=>v===0)&&['duplicateCodeRows','invalidTeamRows','invalidQuantityRows','invalidDateRows','reversedDateRows','numericCodeRows'].every(k=>s[k].length===0))&&globalDuplicates.length===0;
 report.readyForImport=false; // Monetary source/reconciliation and an approved loader are independent gates.
 report.blockers=['No approved monetary budget or unit-price source established by this structural audit.','Reconcile current GAS budgets/transactions, pending browser writes, identity mapping and historical periods before importing.','No live import or hosted mutation was performed.'];
 return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(!process.argv[2])throw Error('Pass a local workbook path. No network source is accepted.');
 console.log(JSON.stringify(auditWorkbook(await readFile(process.argv[2])),null,2));
}
