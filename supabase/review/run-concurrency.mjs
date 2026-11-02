/** True multi-connection PostgreSQL tests. Creates its own loopback-only disposable server.
 * Run as a non-root OS user. Never accepts a DB URL or hosted credentials.
 */
import assert from 'node:assert/strict';
import { readFile, readdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
if(process.getuid?.()===0)throw Error('Use an existing non-root OS account; this test does not create system users.');
const { default: EmbeddedPostgres }=await import(process.env.EMBEDDED_POSTGRES_MODULE || 'embedded-postgres');
const { Client }=await import(process.env.PG_MODULE || 'pg');
const port=await new Promise((resolve,reject)=>{const server=createServer();server.on('error',reject);server.listen(0,'127.0.0.1',()=>{const p=server.address().port;server.close(()=>resolve(p));});});
const dir=await mkdtemp(join(tmpdir(),'foc-pg-concurrency-'));
const password=randomBytes(32).toString('hex');
const server=new EmbeddedPostgres({databaseDir:join(dir,'db'),user:'postgres',password,port,persistent:false,createPostgresUser:false,autoRehydrateSymlinks:true,postgresFlags:['-h','127.0.0.1','-k',dir],onLog:()=>{},onError:()=>{}});
const clients=[];let started=false;let passed=0;
const base=new URL('../',import.meta.url);
function uid(i){return `00000000-0000-4000-8000-${String(i).padStart(12,'0')}`;}
async function connection(){const c=new Client({host:'127.0.0.1',port,user:'postgres',password,database:'postgres',statement_timeout:10000,connectionTimeoutMillis:10000});await c.connect();clients.push(c);return c;}
async function actor(c,i=1){await c.query('begin');await c.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:uid(i),session_id:uid(i+100),user_metadata:{role:'ADMIN',team:'ALL'}})]);await c.query('set local role authenticated');}
const query=(c,kind,data,op,version)=>c.query('select public.mkt_mutate($1::text,$2::jsonb,$3::uuid,$4::bigint) as result',[kind,JSON.stringify(data),op,version]);
async function expectCode(promise,code){try{await promise;}catch(e){assert.equal(e.code,code);return;}throw Error('Expected SQLSTATE '+code);}
async function waitForLock(owner,pid){
 const until=Date.now()+5000;
 while(Date.now()<until){const r=await owner.query('select wait_event_type from pg_stat_activity where pid=$1',[pid]);if(r.rows[0]?.wait_event_type==='Lock')return;await new Promise(r=>setTimeout(r,20));}
 throw Error('Competing connection did not wait on a database lock');
}
function pass(name){passed++;console.log('PASS '+name);}
try{
 await server.initialise();await server.start();started=true;
 const owner=await connection(),a=await connection(),b=await connection();
 const pidB=(await b.query('select pg_backend_pid() as pid')).rows[0].pid;
 console.log('PostgreSQL '+(await owner.query('show server_version')).rows[0].server_version);
 await owner.query(`create role anon;create role authenticated;create schema auth;
 create table auth.users(id uuid primary key,is_anonymous boolean default false);
 create table auth.sessions(id uuid primary key,user_id uuid references auth.users);
 create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 grant usage on schema auth to anon,authenticated;grant execute on function auth.uid(),auth.jwt() to anon,authenticated;`);
 const files=(await readdir(new URL('migrations/',base))).filter(p=>p.endsWith('_foc_phase1_schema.sql'));
 assert.equal(files.length,1);
 const migration=await readFile(new URL('migrations/'+files[0],base),'utf8');
 await owner.query(migration);await owner.query(migration);pass('schema apply and replay on native PostgreSQL');
 await owner.query(await readFile(new URL('tests/phase1-regression.sql',base),'utf8'));
 await owner.query(await readFile(new URL('tests/phase1-workflows.sql',base),'utf8'));pass('163 SQL regression/workflow assertions on native PostgreSQL');
 // Fresh fixture identities: no real passwords, emails or customer data.
 for(const i of [0,1,2]){
  await owner.query('insert into auth.users(id) values($1)',[uid(i)]);
  await owner.query('insert into auth.sessions(id,user_id) values($1,$2)',[uid(i+100),uid(i)]);
  await owner.query('insert into public.mkt_profiles(id,username,role,team,is_active) values($1,$2,$3,$4,true)',[uid(i),'synthetic-'+i,i===0?'ADMIN':'TEAM_USER',i===0?'ALL':'B'+i]);
 }
 async function seed(name,amount=100){
  const code='SYN-'+name,contract=name+'-CT',id=name+'-BD';
  await owner.query("insert into public.mkt_customers(code,name,team,mde) values($1,'Synthetic customer','B1','MDE-B1')",[code]);
  await owner.query("insert into public.mkt_contracts(id,customer_code,team,commencing_on,expiring_on,cycle_number) values($1,$2,'B1','2024-02-29','2025-02-27',1)",[contract,code]);
  await owner.query("insert into public.mkt_budgets(id,contract_id,customer_code,team,annual_amount,period_number,period_start,period_end) values($1,$2,$3,'B1',$4,1,'2024-02-29','2025-02-27')",[id,contract,code,amount]);
  return {id,customer_code:code,contract_id:contract,period_number:1};
 }
 // Version conflicts must reflect the row read AFTER waiting for the parent lock.
 const edit=await seed('edit');
 await actor(a);await actor(b);
 await query(a,'SAVE_BUDGET',{...edit,annual_amount:110},randomUUID(),1);
 const loser=expectCode(query(b,'SAVE_BUDGET',{...edit,annual_amount:120},randomUUID(),1),'PT409');
 await waitForLock(owner,pidB);await a.query('commit');await loser;await b.query('rollback');
 assert.equal((await owner.query('select annual_amount::text,version::text from public.mkt_budgets where id=$1',[edit.id])).rows[0].annual_amount,'110.00');
 pass('competing budget edits block then reject stale version');
 const spend=await seed('spend');
 const expense={id:'spend-A',budget_id:spend.id,date:'2024-03-01',category:'Other',description:'Synthetic',amount:60};
 await actor(a);await actor(b);await query(a,'ADD_TRANSACTION',expense,randomUUID(),1);
 const over=expectCode(query(b,'ADD_TRANSACTION',{...expense,id:'spend-B'},randomUUID(),1),'PT409');
 await waitForLock(owner,pidB);await a.query('commit');await over;await b.query('rollback');
 await actor(b);await expectCode(query(b,'ADD_TRANSACTION',{...expense,id:'spend-B'},randomUUID(),2),'P0001');await b.query('rollback');
 assert.equal((await owner.query('select total_used::text from public.mkt_budget_totals where id=$1',[spend.id])).rows[0].total_used,'60.00');
 pass('competing expenses cannot overspend after conflict retry');
 const retry=await seed('retry'),operation=randomUUID();
 const receiptData={...expense,id:'retry-TX',budget_id:retry.id,amount:30};
 await actor(a);await actor(b);const first=await query(a,'ADD_TRANSACTION',receiptData,operation,1);
 const repeated=query(b,'ADD_TRANSACTION',receiptData,operation,1);await waitForLock(owner,pidB);await a.query('commit');
 assert.deepEqual((await repeated).rows[0].result,first.rows[0].result);await b.query('commit');
 assert.equal((await owner.query('select count(*)::int as n from public.mkt_activity_logs where operation_id=$1',[operation])).rows[0].n,1);
 assert.equal((await owner.query('select count(*)::int as n from public.mkt_transactions where id=$1',['retry-TX'])).rows[0].n,1);
 pass('simultaneous identical operation creates one transaction and audit');
 await actor(b,2);await expectCode(query(b,'ADD_TRANSACTION',receiptData,operation,1),'22023');await b.query('rollback');
 await actor(b);await expectCode(query(b,'ADD_TRANSACTION',{...receiptData,amount:31},operation,1),'22023');await b.query('rollback');
 pass('receipt replay rejects changed actor or payload');
 await actor(a);await actor(b);const cancelData={id:'retry-TX',reason:'Synthetic cancellation'};
 await query(a,'CANCEL_TRANSACTION',cancelData,randomUUID(),2);
 const cancelLoser=expectCode(query(b,'CANCEL_TRANSACTION',cancelData,randomUUID(),2),'PT409');
 await waitForLock(owner,pidB);await a.query('commit');await cancelLoser;await b.query('rollback');
 await actor(b);await expectCode(query(b,'CANCEL_TRANSACTION',cancelData,randomUUID(),3),'P0001');await b.query('rollback');
 assert.equal((await owner.query('select total_used::text from public.mkt_budget_totals where id=$1',[retry.id])).rows[0].total_used,'0.00');
 pass('concurrent cancellation removes spending exactly once');
 // Disabling the profile waits for a write already holding its share lock;
 // subsequent calls with unchanged claims are rejected.
 const disabled=await seed('disable');await actor(a);
 await query(a,'SAVE_BUDGET',{...disabled,annual_amount:90},randomUUID(),1);
 const disablePid=(await owner.query('select pg_backend_pid() as pid')).rows[0].pid;
 const disabler=owner.query('update public.mkt_profiles set is_active=false where id=$1',[uid(1)]);
 await waitForLock(b,disablePid);await a.query('commit');await disabler;
 await actor(a);await expectCode(query(a,'SAVE_BUDGET',{...disabled,annual_amount:80},randomUUID(),2),'42501');await a.query('rollback');
 pass('profile disable waits for in-flight write then blocks unchanged JWT claims');
 await owner.query('update public.mkt_profiles set is_active=true where id=$1',[uid(1)]);
 await owner.query('delete from auth.sessions where user_id=$1',[uid(1)]);
 await actor(a);await expectCode(query(a,'SAVE_BUDGET',{...disabled,annual_amount:80},randomUUID(),2),'42501');await a.query('rollback');
 pass('deleted session blocks subsequent write with unchanged claims');
 console.log(`PASS ${passed} native PostgreSQL checks. Auth tables/JWT still stubbed; hosted Auth/PostgREST NOT RUN.`);
}finally{
 for(const c of clients)await c.end().catch(()=>{});
 if(started)await server.stop();
 await rm(dir,{recursive:true,force:true});
}
