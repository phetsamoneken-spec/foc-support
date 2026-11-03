import assert from 'node:assert/strict';
import {createBackend,createHandler} from '../supabase/functions/foc-support/index.js';
const ids={admin:crypto.randomUUID(),b1:crypto.randomUUID(),b2:crypto.randomUUID()},sids=Object.fromEntries(Object.keys(ids).map(k=>[k,crypto.randomUUID()]));
const encode=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
const tokens=Object.fromEntries(Object.keys(ids).map(k=>[k,encode({alg:'test'})+'.'+encode({sub:ids[k],session_id:sids[k]})+'.test']));
const now=new Date().toISOString(),today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),year=Number(today.slice(0,4));
const profiles=Object.keys(ids).map(k=>({id:ids[k],legacy_id:'USR-'+k,username:k,full_name:k,email:null,role:k==='admin'?'ADMIN':'TEAM_USER',team:k==='admin'?'ALL':k.toUpperCase(),is_active:true,status:'ACTIVE',created_at:now,last_login:null,updated_at:now,deleted_at:null}));
const data={profiles,customers:[],conditions:[],contracts:[],budgets:[],transactions:[],logs:[],settings:[{key:'pricePerCrate',value:240000,updated_at:now}],categories:[],deletedCustomers:[]},runtime=new Map();
const sources={mkt_profiles:'profiles',mkt_customers:'customers',mkt_customer_conditions:'conditions',mkt_contracts:'contracts',mkt_budgets:'budgets',mkt_transactions:'transactions',mkt_activity_logs:'logs',mkt_settings:'settings',mkt_categories:'categories',mkt_deleted_customers:'deletedCustomers'};
const primary=t=>t==='mkt_customers'?'code':t==='mkt_settings'?'key':t==='mkt_deleted_customers'?'customer_code':'id';
let revision=0,conflictNext=false,commits=0;
function snapshot(uid){
 const actor=profiles.find(p=>p.id===uid&&p.is_active&&p.status==='ACTIVE');if(!actor)return null;
 const copy=structuredClone(data);
 copy.budgets=copy.budgets.map(b=>{const used=b.unallocated_used+copy.transactions.filter(t=>t.budget_id===b.id&&t.status==='ACTIVE').reduce((n,t)=>n+t.amount,0);return {...b,total_used:used,remaining_amount:b.annual_amount-used,utilization_percentage:b.annual_amount?used/b.annual_amount*100:0,status:used>b.annual_amount?'EXCEEDED':'NORMAL'};});
 if(actor.role!=='ADMIN')for(const k of ['customers','conditions','contracts','budgets','transactions','logs','deletedCustomers'])copy[k]=copy[k].filter(r=>r.team===actor.team);
 if(actor.role!=='ADMIN')copy.profiles=copy.profiles.filter(p=>p.id===uid);
 return {...copy,actor,sourceId:'TEST_DATABASE_SOURCE_1234567890',revision,acceptWrites:true,runtime:[...runtime].map(([name,rows])=>({name,rows:structuredClone(rows)}))};
}
const answer=(value,status=200)=>new Response(JSON.stringify(value),{status});
const backend=createBackend({url:'https://test.supabase.co',key:'server-test-key',fetch:async(url,options)=>{
 const path=new URL(url).pathname,p=options.body?JSON.parse(options.body):{};
 if(path==='/auth/v1/user'){const token=options.headers.Authorization.replace('Bearer ',''),key=Object.keys(tokens).find(k=>tokens[k]===token);return key?answer({id:ids[key],is_anonymous:false}):answer({message:'Invalid token'},401);}
 if(path==='/auth/v1/token'){const key=p.email?.split('@')[0];return tokens[key]&&p.password==='Test-only-password!'?answer({access_token:tokens[key],refresh_token:'refresh-'+key,expires_in:3600}):answer({message:'Wrong password'},400);}
 const name=path.split('mkt_edge_')[1];
 if(name==='login')return answer(ids[p.p_username]?p.p_username+'@example.invalid':null);
 if(name==='login_success')return answer(null);
 if(name==='load')return answer(snapshot(p.p_uid));
 if(name==='revoke_sessions')return answer(null);
 if(name==='bootstrap_queue')return answer([]);
 if(name==='health')return answer({success:true,ready:true,provider:'supabase'});
 if(name==='commit'){
  if(conflictNext){conflictNext=false;revision++;return answer({code:'40001',message:'Concurrent revision'},409);}
  assert.equal(p.p_revision,revision);
  for(const c of p.p_changes.deletes){if(c.kind==='runtime'){runtime.set(c.table,(runtime.get(c.table)||[]).filter(r=>r.id!==c.id));continue;}data[sources[c.table]]=data[sources[c.table]].filter(r=>r[primary(c.table)]!==c.id);}
  for(const c of p.p_changes.upserts){if(c.kind==='runtime'){const rows=runtime.get(c.table)||[],i=rows.findIndex(r=>r.id===c.id),r={id:c.id,position:c.position,values:c.values,formulas:c.formulas};if(i<0)rows.push(r);else rows[i]=r;runtime.set(c.table,rows);continue;}
   const rows=data[sources[c.table]],key=primary(c.table),i=rows.findIndex(r=>r[key]===c.data[key]);if(i<0)rows.push(c.data);else rows[i]=c.data;
  }
  revision++;commits++;return answer(revision);
 }
 throw Error('Unexpected test API '+path);
}});
const run=(actor,kind,payload)=>backend.perform(kind,payload,tokens[actor]);
const mutation=(actor,id,kind,data)=>run(actor,'MUTATE_BUSINESS',{id:'OP-'+id,kind,data});
const store=(code,team)=>({code,name:'Shared store '+code,team,conditionQty:10,conditionUOM:'CAS',conditionProductDescription:'Product',commencingOn:`${year}-01-01`,expiringOn:`${year+2}-12-31`,annualBudget:1000});
assert.equal((await backend.perform('AUTH_LOGIN',{username:'admin',password:'Test-only-password!'})).success,true);
assert.equal((await mutation('admin','add-admin-12345','ADD_CUSTOMER',store('STORE-A','B1'))).success,true);
assert.equal(data.budgets.length,3,'each contract anniversary has a separate annual allowance');
conflictNext=true;
const add=await mutation('b1','add-team-12345','ADD_CUSTOMER',store('STORE-B','B1'));assert.equal(add.success,true,add.error||add.message);
assert.equal(data.customers.length,2,'CAS conflict reruns the original operation once');
assert.ok(data.budgets.filter(b=>b.customer_code==='STORE-B').every(b=>b.annual_amount===2400000),'Team allowance is derived from the Admin price');
const expense={customerCode:'STORE-A',date:today,category:'EVENT',description:'A valid expense',amount:75};
assert.equal((await mutation('b1','expense-12345','ADD_TRANSACTION',expense)).success,true);
assert.equal((await mutation('b1','expense-12345','ADD_TRANSACTION',expense)).success,true);
assert.equal(data.transactions.length,1,'lost-response retry cannot duplicate an expense');
const read=await run('b1','GET_BUSINESS_DATA',{});assert.equal(read.scope,'B1');assert.equal(read.snapshot.transactions.length,1);assert.equal(read.snapshot.budgets.find(b=>b.periodNumber===1&&b.customerCode==='STORE-A').totalUsed,75);
assert.equal((await run('b2','GET_BUSINESS_DATA',{})).snapshot.customers.length,0);
assert.equal((await mutation('b2','denied-12345','DELETE_CUSTOMER',{customerCode:'STORE-A'})).success,false);
assert.equal((await run('b1','SAVE_SHARED_SETTINGS',{settings:{pricePerCrate:1}})).success,false);
assert.equal((await run('b1','SYNC_BULK_DATA',{})).success,false);
assert.equal((await mutation('b1','reprice-12345','UPDATE_BUDGET',{budgetId:data.budgets[0].id,newAmount:1})).success,false);
assert.equal((await mutation('b1','delete-12345','DELETE_CUSTOMER',{customerCode:'STORE-A'})).success,true);
for(const name of ['customers','conditions','contracts','budgets','transactions'])assert.ok(data[name].every(r=>(r.code||r.customer_code)!=='STORE-A'),'physical deletion removes '+name);
assert.ok(runtime.get('DATABASE_BACKUPS').some(r=>String(r.values[8]).includes('A valid expense')),'deleted expenses remain in the archive');
assert.equal(data.deletedCustomers[0].customer_code,'STORE-A');
const handler=createHandler(backend);
const health=await handler(new Request('https://test.supabase.co'));
assert.equal((await health.json()).provider,'supabase','public health is read-only');
const forged=await handler(new Request('https://test.supabase.co/functions/v1/foc-support',{method:'POST',headers:{Authorization:'Bearer forged-token','Content-Type':'application/json'},body:JSON.stringify({action:'GET_BUSINESS_DATA',authToken:tokens.admin})}));assert.equal((await forged.json()).success,false,'body tokens cannot bypass native verification');
assert.equal((await handler(new Request('https://test.supabase.co',{headers:{Origin:'https://untrusted.invalid'}}))).status,403);
assert.equal((await handler(new Request('https://test.supabase.co',{method:'OPTIONS',headers:{Origin:'https://phetsamoneken-spec.github.io'}}))).status,204);
console.log('PASS: native Auth boundary, annual budgets, scoped data, Team spending, CAS retry, idempotent expense, physical deletion with backup, reserved IDs, Admin-only imports/settings and CORS. Commits:',commits);
