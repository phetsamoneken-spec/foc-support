// A request-local table model. PostgreSQL commits the recorded changes atomically.
import {createHash} from 'node:crypto';
const encode=value=>value instanceof Date?{$date:value.toISOString()}:Array.isArray(value)?value.map(encode):value;
const decode=value=>value&&typeof value==='object'&&!Array.isArray(value)&&value.$date?new Date(value.$date):Array.isArray(value)?value.map(decode):value;
const hash=value=>[...createHash('sha256').update(String(value)).digest()];
const dateFormat=(value,zone,format)=>{
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(value);
 const fields=Object.fromEntries(parts.map(p=>[p.type,p.value]));const day=`${fields.year}-${fields.month}-${fields.day}`;
 return format==='yyyy-MM-dd'?day:`${day}T${fields.hour}:${fields.minute}:${fields.second}+07:00`;
};
export function createAdapter(snapshot){
 const sheets=new Map(),changed=new Map(),deleted=new Map(),created=new Set();let held=false;
 const key=(name,id)=>name+':'+id;
 class Sheet{
  constructor(name,records=[]){this.name=name;this.records=records.map(row=>({...row,values:decode(row.values),formulas:row.formulas||[]}));}
  getName(){return this.name;}
  getLastRow(){return this.records.length;}
  getMaxRows(){return Math.max(this.records.length,1000000);}
  getMaxColumns(){return 1000;}
  getDataRange(){return this.getRange(1,1,this.records.length,Math.max(1,...this.records.map(row=>row.values.length)));}
  ensure(index){while(this.records.length<=index){const last=this.records.at(-1);this.records.push({id:crypto.randomUUID(),position:(last?.position||0)+1,values:[],formulas:[]});}return this.records[index];}
  touch(row){changed.set(key(this.name,row.id),{table:this.name,id:row.id,position:row.position,values:encode(row.values),formulas:row.formulas});}
  getRange(row,col,height=1,width=1){
   const sheet=this;
   const range={
    getValues(){return Array.from({length:height},(_,i)=>Array.from({length:width},(_,j)=>sheet.records[row-1+i]?.values[col-1+j]??''));},
    getFormulas(){return Array.from({length:height},(_,i)=>Array.from({length:width},(_,j)=>sheet.records[row-1+i]?.formulas[col-1+j]||''));},
    setValues(values){values.forEach((line,i)=>{const record=sheet.ensure(row-1+i);let touched=false;line.forEach((value,j)=>{const index=col-1+j,formula=typeof value==='string'&&value.startsWith('=')?value:'';if(formula&&record.formulas[index]===formula)return;const next=decode(value);if(JSON.stringify(encode(record.values[index]??''))!==JSON.stringify(encode(next))||(record.formulas[index]||'')!==formula){record.values[index]=next;record.formulas[index]=formula;touched=true;}});if(touched)sheet.touch(record);});return range;},
    setValue(value){return range.setValues([[value]]);},setBackground(){return range;},setFontColor(){return range;},setFontWeight(){return range;}
   };return range;
  }
  appendRow(values){this.getRange(this.records.length+1,1,1,values.length).setValues([values]);}
  deleteRow(row){this.deleteRows(row,1);}
  deleteRows(row,count){for(const record of this.records.splice(row-1,count)){deleted.set(key(this.name,record.id),{table:this.name,id:record.id});changed.delete(key(this.name,record.id));}}
  insertRowsAfter(){}insertColumnsAfter(){}setFrozenRows(){}
  setName(){throw Error('Database routing is managed by Supabase.');}
  copyTo(){throw Error('Database routing is managed by Supabase.');}
 }
 for(const table of snapshot.tables)sheets.set(table.name,new Sheet(table.name,table.rows));
 const spreadsheet={getId:()=>snapshot.sourceId,getSpreadsheetTimeZone:()=> 'Asia/Bangkok',getSheetByName:name=>sheets.get(name),getSheets:()=>[...sheets.values()],insertSheet(name){if(sheets.has(name))throw Error('Duplicate table');const sheet=new Sheet(name);sheets.set(name,sheet);created.add(name);return sheet;}};
 return {spreadsheet,sheets,changes:()=>({tables:[...created],upserts:[...changed.values()],deletes:[...deleted.values()]}),
 SpreadsheetApp:{openById(id){if(id!==snapshot.sourceId)throw Error('Unexpected database identifier');return spreadsheet;},getActiveSpreadsheet:()=>spreadsheet,flush(){}},
 PropertiesService:{getScriptProperties:()=>({getProperty:key=>key==='SPREADSHEET_ID'?snapshot.sourceId:null})},
 LockService:{getScriptLock:()=>({waitLock(){if(held)throw Error('Nested lock');held=true;},hasLock:()=>held,releaseLock(){held=false;}})},
 ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({setMimeType:()=>JSON.parse(text)})},
 Utilities:{getUuid:()=>crypto.randomUUID(),DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,value)=>hash(value),formatDate:dateFormat},
 CacheService:{getScriptCache:()=>({get:()=>null,put(){},remove(){}})},Logger:{log(){}}
 };
}
