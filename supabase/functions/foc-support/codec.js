const stamp=value=>value?new Date(value).toISOString():'';
const day=value=>value?new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value)):'';
export const definitions=[
 ['CUSTOMERS','mkt_customers','customers',['Customer Code','Customer Name','Team','MDE','Phone','Address','Province','Status','Created At','Contact Person','Updated At','Deleted At'],['code','name','team','mde','phone','address','province','status','created_at','contact_person','updated_at','deleted_at']],
 ['CUSTOMER_CONDITIONS','mkt_customer_conditions','conditions',['ID','Customer Code','Condition Quantity','Condition UOM','Product Description','Updated At','Price per Unit'],['id','customer_code','condition_quantity','condition_uom','condition_product_description','updated_at','price_per_unit']],
 ['CONTRACTS','mkt_contracts','contracts',['Contract ID','Customer Code','Customer Name','Team','Commencing On','Expiring On','Cycle Number','Status','Notes','Created At','Updated At'],['id','customer_code','legacy_customer_name','team','commencing_on','expiring_on','cycle_number','legacy_status','notes','created_at','updated_at']],
 ['BUDGETS','mkt_budgets','budgets',['Budget ID','Contract ID','Customer Code','Team','Annual Amount','Total Used','Remaining Amount','Utilization (%)','Status','Allow Exception','Exception Reason','Updated At','Budget Year','Period Start','Period End','Legacy Undated Used'],['id','contract_id','customer_code','team','annual_amount','total_used','remaining_amount','utilization_percentage','status','allow_exception','exception_reason','updated_at','period_number','period_start','period_end','unallocated_used']],
 ['BUDGET_TRANSACTIONS','mkt_transactions','transactions',['Transaction ID','Date','Customer Code','Customer Name','Team','Contract ID','Budget ID','Category','Description','Amount','Invoice Ref','Created By','Created At','Status','Cancellation Reason','Cancelled By','Cancelled At'],['id','date','customer_code','legacy_customer_name','team','contract_id','budget_id','category','description','amount','invoice_ref','legacy_created_by','created_at','status','cancellation_reason','legacy_cancelled_by','cancelled_at']],
 ['USERS','mkt_profiles','profiles',['User ID','Username','Password Hash','Full Name','Email','Role','Assigned Team','Is Active','Created At','Last Login','Status','Updated At','Deleted At'],['legacy_id','username','$native','full_name','email','role','team','is_active','created_at','last_login','status','updated_at','deleted_at']],
 ['CATEGORIES','mkt_categories','categories',['Category ID','Name (Lao)','Name (English)','Code','Description'],['id','name_lao','name_english','code','description']],
 ['ACTIVITY_LOG','mkt_activity_logs','logs',['Log ID','Timestamp','User','Role','Team','Action','Details'],['id','timestamp','legacy_user','role','team','action','details']],
 ['SETTINGS','mkt_settings','settings',['Setting Key','Setting Value','Description','Updated At'],['key','value','description','updated_at']],
 ['DELETED_CUSTOMERS','mkt_deleted_customers','deletedCustomers',['Customer Code','Deleted At','Deleted By','Operation ID','Backup ID'],['customer_code','deleted_at','legacy_deleted_by','operation_id','backup_id']]
];
const numeric=new Set(['condition_quantity','price_per_unit','cycle_number','annual_amount','total_used','remaining_amount','utilization_percentage','period_number','unallocated_used','amount']);
const timestamps=new Set(['created_at','updated_at','deleted_at','last_login','cancelled_at','timestamp']);
export function toAdapterSnapshot(snapshot){
 const tables=definitions.map(([name,,source,headers,fields])=>({name,rows:[{id:'__header__',position:1,values:headers},...(snapshot[source]||[]).map((record,index)=>({id:String(name==='USERS'?record.legacy_id:name==='DELETED_CUSTOMERS'?record.customer_code:record[fields[0]]),position:index+2,values:fields.map(field=>field==='$native'?'native:'+record.id:field==='created_at'&&name==='CUSTOMERS'?day(record[field]):timestamps.has(field)?stamp(record[field]):record[field]??'')}))]}));
 for(const table of snapshot.runtime||[])tables.push({name:table.name,rows:table.rows});
 return {sourceId:snapshot.sourceId,tables};
}
export function encodeChanges(changes,snapshot,adapter){
 const defs=new Map(definitions.map(def=>[def[0],def])),profileByLegacy=new Map((snapshot.profiles||[]).map(p=>[p.legacy_id,p])),profileByName=new Map((snapshot.profiles||[]).map(p=>[p.username,p]));
 const customers=new Map((snapshot.customers||[]).map(c=>[c.code,c.team]));const current=adapter.spreadsheet.getSheetByName('CUSTOMERS');if(current)current.records.slice(1).forEach(r=>customers.set(String(r.values[0]),String(r.values[2])));
 const upserts=[],deletes=[];
 for(const change of changes.upserts){
  if(change.table==='SESSIONS'||change.id==='__header__')continue;
  const definition=defs.get(change.table);
  if(!definition){upserts.push({...change,kind:'runtime'});continue;}
  const [,table,,headers,fields]=definition,data={};fields.forEach((field,i)=>{if(field[0]==='$')return;let value=change.values[i];if(value&&typeof value==='object'&&value.$date)value=value.$date;if(numeric.has(field))value=value===''||value===undefined?null:Number(value);else if(timestamps.has(field))value=value?stamp(value):null;else if(value===undefined||value==='')value=null;data[field]=value;});
  if(table==='mkt_profiles'){data.id=profileByLegacy.get(String(data.legacy_id))?.id;if(!data.id)throw Error('Native account link missing');data.full_name=data.full_name||'';data.status=data.status||(data.is_active?'ACTIVE':'INACTIVE');}
  if(table==='mkt_customers'){data.mde='MDE-'+data.team;data.created_at=data.created_at||new Date().toISOString();}
  if(table==='mkt_customer_conditions'){data.team=customers.get(String(data.customer_code));data.condition_product_description=data.condition_product_description||'';data.condition_uom=data.condition_uom||'CAS';}
  if(table==='mkt_budgets'){for(const field of ['total_used','remaining_amount','utilization_percentage','status'])delete data[field];data.unallocated_used=data.unallocated_used??0;data.allow_exception=Boolean(data.allow_exception);}
  if(table==='mkt_transactions'){data.created_by=profileByName.get(data.legacy_created_by)?.id||null;data.cancelled_by=profileByName.get(data.legacy_cancelled_by)?.id||null;data.description=data.description||'';if(data.status==='ACTIVE'){data.cancelled_by=null;data.cancelled_at=null;data.cancellation_reason=null;}}
  if(table==='mkt_activity_logs'){data.actor_id=profileByName.get(data.legacy_user)?.id||null;data.details=data.details||'';data.operation_id=null;}
  if(table==='mkt_deleted_customers'){data.team=customers.get(String(data.customer_code))||(snapshot.deletedCustomers||[]).find(c=>c.customer_code===data.customer_code)?.team;data.deleted_by=profileByName.get(data.legacy_deleted_by)?.id||null;}
  if(table==='mkt_settings'){data.value=change.values[1]??'';}
  for(const field of ['updated_at','created_at'])if(fields.includes(field))data[field]=data[field]||new Date().toISOString();
  upserts.push({kind:'core',table,id:change.id,data});
 }
 for(const change of changes.deletes){if(change.table==='SESSIONS'||change.id==='__header__')continue;const definition=defs.get(change.table);deletes.push(definition?{kind:'core',table:definition[1],id:change.id}:{...change,kind:'runtime'});}
 return {upserts,deletes};
}
