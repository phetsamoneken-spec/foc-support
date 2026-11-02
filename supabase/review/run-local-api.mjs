/** Real GoTrue + PostgREST integration on an isolated local Docker stack only.
 * Captures CLI output privately; never prints API keys, JWTs, passwords or status JSON.
 * Does not accept project refs, hosted URLs, external DB URLs or owner credentials.
 */
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,copyFile,readFile,readdir,rm,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { randomBytes,randomUUID } from 'node:crypto';
const exec=promisify(execFile),base=new URL('../',import.meta.url);
const cli=resolve(process.env.SUPABASE_CLI || 'supabase/review/test-tools/node_modules/.bin/supabase');
const { Client }=await import(process.env.PG_MODULE || 'pg');
const dir=await mkdtemp(join(tmpdir(),'foc-local-auth-api-'));let owner;let attempted=false;let checks=0;
const exclude='realtime,storage-api,imgproxy,postgres-meta,studio,edge-runtime,logflare,vector,supavisor,mailpit';
const pass=name=>{checks++;console.log('PASS '+name);};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function localURL(value,protocols){const u=new URL(value);if(!['127.0.0.1','localhost','[::1]'].includes(u.hostname)||!protocols.includes(u.protocol))throw Error('Refuse non-loopback test endpoint');return u;}
async function command(args,timeout=600000){try{return await exec(cli,args,{cwd:dir,timeout,maxBuffer:20*1024*1024,env:{...process.env,SUPABASE_TELEMETRY_DISABLED:'true'}});}catch{throw Error('Disposable local CLI command failed: '+args.slice(0,2).join(' '));}}
try{
 await mkdir(join(dir,'supabase','migrations'),{recursive:true});
 let config=await readFile(new URL('review/local-api/config.toml',base),'utf8');
 const localId='foc-review-local-'+process.pid;
 config=config.replace('foc-review-local-api',localId);
 await writeFile(join(dir,'supabase','config.toml'),config);
 const files=(await readdir(new URL('migrations/',base))).filter(f=>f.endsWith('_foc_phase1_schema.sql'));assert.equal(files.length,1);
 await copyFile(new URL('migrations/'+files[0],base),join(dir,'supabase','migrations',files[0]));
 // All CLI operations are explicitly local, in a fresh unlinked temporary directory.
 attempted=true;await command(['start','--exclude',exclude]);pass('disposable local Supabase stack started');
 await command(['db','reset','--local','--no-seed']);pass('review migration applied only to disposable local stack');
 const status=JSON.parse((await command(['status','--output','json'],60000)).stdout);
 const url=localURL(status.API_URL,['http:']),db=localURL(status.DB_URL,['postgresql:','postgres:']);
 if(!status.ANON_KEY||!status.SERVICE_ROLE_KEY)throw Error('Local status omitted required test keys');
 owner=new Client({connectionString:db.href,connectionTimeoutMillis:10000,statement_timeout:10000});await owner.connect();
 const api=url.href.replace(/\/$/,'');
 async function request(path,{method='GET',body,token,key=status.ANON_KEY}={}){
  const response=await fetch(api+path,{method,headers:{apikey:key,...(token?{Authorization:'Bearer '+token}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{})},body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(15000)});
  const text=await response.text();let data;try{data=JSON.parse(text);}catch{data=null;}
  return {status:response.status,data};
 }
 const identities=[];
 for(let i=0;i<9;i++){
  const email=`review-${i}@example.test`,password='Review-'+randomBytes(24).toString('hex')+'!';
  const created=await request('/auth/v1/admin/users',{method:'POST',key:status.SERVICE_ROLE_KEY,token:status.SERVICE_ROLE_KEY,body:{email,password,email_confirm:true,user_metadata:i===1?{role:'ADMIN',team:'ALL'}:{}}});
  assert.equal(created.status,200,'Synthetic local Auth user creation failed');
  const id=created.data.id||created.data.user?.id;if(!id)throw Error('Local Auth user ID missing');
  await owner.query('insert into public.mkt_profiles(id,username,role,team,is_active) values($1,$2,$3,$4,$5)',[id,'review-'+i,i===0?'ADMIN':'TEAM_USER',i===0?'ALL':'B'+Math.min(i,7),i!==8]);
  const login=await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}});
  assert.equal(login.status,200,'Synthetic local Auth login failed; code='+String(login.data?.error_code||login.data?.error||'unknown'));assert.ok(login.data.access_token&&login.data.refresh_token,'Local Auth tokens absent');
  identities.push({id,email,password,token:login.data.access_token,refresh:login.data.refresh_token});
 }
 pass('actual Auth creates and signs in Admin, B1-B7 and inactive-profile fixture');
 const signup=await request('/auth/v1/signup',{method:'POST',body:{email:'forbidden@example.test',password:'Review-'+randomBytes(24).toString('hex')+'!'}});
 assert.ok(signup.status>=400&&signup.status<500,'Public signup must remain disabled');
 assert.equal((await owner.query("select count(*)::int as n from auth.users where email='forbidden@example.test'")).rows[0].n,0);
 pass('public signup disabled while Admin-created users can sign in');

 const bad=await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email:identities[1].email,password:'Invalid-'+randomBytes(16).toString('hex')}});assert.equal(bad.status,400);pass('incorrect password rejected by actual Auth');
 for(let i=1;i<=7;i++){
  await owner.query("insert into public.mkt_customers(code,name,team,mde) values($1,'Synthetic local API customer',$2,$3)",['API-C'+i,'B'+i,'MDE-B'+i]);
  await owner.query("insert into public.mkt_contracts(id,customer_code,team,commencing_on,expiring_on,cycle_number) values($1,$2,$3,'2026-01-01','2027-12-31',1)",['API-CT'+i,'API-C'+i,'B'+i]);
 }
 await owner.query("insert into public.mkt_legacy_archives(id,source_table,checksum,redacted_payload) values('API-ARCHIVE','SYNTHETIC','fixture','{}')");
 const rpc=(who,kind,data,operation=randomUUID(),expected=null)=>request('/rest/v1/rpc/mkt_mutate',{method:'POST',token:who.token,body:{p_kind:kind,p_data:data,p_operation:operation,p_expected:expected}});
 for(let i=1;i<=7;i++){
  const who=identities[i];const own=await request('/rest/v1/mkt_customers?select=code,team',{token:who.token});assert.equal(own.status,200);assert.equal(own.data.length,1);assert.equal(own.data[0].team,'B'+i);
  const data={id:'API-BD'+i,customer_code:'API-C'+i,contract_id:'API-CT'+i,period_number:1,annual_amount:100};
  const denied=await rpc(who,'SAVE_BUDGET',data);assert.equal(denied.status,403,'Team must not initialize a budget');assert.equal(denied.data.code,'42501');
  const created=await rpc(identities[0],'SAVE_BUDGET',data);assert.equal(created.status,200,'Admin initial budget create failed');
  const edited=await rpc(who,'SAVE_BUDGET',{...data,annual_amount:120},randomUUID(),1);assert.equal(edited.status,200,'Own-team API budget edit failed');
  const totals=await request('/rest/v1/mkt_budget_totals?select=id,annual_amount',{token:who.token});assert.equal(totals.status,200);assert.equal(totals.data.length,1);assert.equal(Number(totals.data[0].annual_amount),120);
  pass('B'+i+' actual JWT scoped reads, Admin-only initialization and own-budget edit');
 }
 const admin=identities[0],b1=identities[1];
 const badJwt=b1.token.split('.');badJwt[2]=(badJwt[2][0]==='A'?'B':'A')+badJwt[2].slice(1);
 const tampered=await request('/rest/v1/mkt_customers?select=code',{token:badJwt.join('.')});assert.equal(tampered.status,401);pass('tampered JWT signature denied by actual REST gateway');

 const all=await request('/rest/v1/mkt_customers?select=code',{token:admin.token});assert.equal(all.status,200);assert.equal(all.data.length,7);pass('Admin actual JWT sees all teams');
 const anon=await request('/rest/v1/mkt_customers?select=code');assert.ok([401,403].includes(anon.status));pass('anonymous REST read denied');
 const cross=await request('/rest/v1/mkt_customers?select=code&code=eq.API-C2',{token:b1.token});assert.equal(cross.status,200);assert.deepEqual(cross.data,[]);
 const crossWrite=await rpc(b1,'SAVE_BUDGET',{id:'API-BD2',customer_code:'API-C2',contract_id:'API-CT2',period_number:1,annual_amount:500},randomUUID(),2);assert.equal(crossWrite.status,403);assert.equal(crossWrite.data.code,'42501');pass('cross-team read is empty and budget RPC denied');
 const direct=await request('/rest/v1/mkt_budgets?id=eq.API-BD1',{method:'PATCH',token:b1.token,body:{team:'B2'}});assert.equal(direct.status,403);
 const elevate=await request('/rest/v1/mkt_profiles?id=eq.'+b1.id,{method:'PATCH',token:b1.token,body:{role:'ADMIN',team:'ALL'}});assert.equal(elevate.status,403);pass('direct team reassignment and role elevation denied');
 const archive=await request('/rest/v1/mkt_legacy_archives?select=id',{token:b1.token});assert.equal(archive.status,200);assert.deepEqual(archive.data,[]);pass('archive content hidden from team JWT');
 const op=randomUUID(),budget={id:'API-BD1',customer_code:'API-C1',contract_id:'API-CT1',period_number:1,annual_amount:130};
 const first=await rpc(b1,'SAVE_BUDGET',budget,op,2),second=await rpc(b1,'SAVE_BUDGET',budget,op,2);assert.equal(first.status,200);assert.deepEqual(second.data,first.data);
 const collision=await rpc(b1,'SAVE_BUDGET',{...budget,annual_amount:131},op,2);assert.equal(collision.status,400);assert.equal(collision.data.code,'22023');pass('HTTP retries preserve idempotency and reject changed request');
 const stale=await rpc(b1,'SAVE_BUDGET',budget,randomUUID(),2);assert.equal(stale.status,409);assert.equal(stale.data.code,'PT409');pass('PostgREST maps stale version to HTTP conflict');
 const inactive=await request('/rest/v1/mkt_customers?select=code',{token:identities[8].token});assert.equal(inactive.status,200);assert.deepEqual(inactive.data,[]);
 const inactiveWrite=await rpc(identities[8],'SAVE_BUDGET',budget,randomUUID(),3);assert.equal(inactiveWrite.status,403);pass('inactive profile denied despite valid Auth JWT');
 await owner.query('update public.mkt_profiles set is_active=false where id=$1',[b1.id]);
 const disabled=await rpc(b1,'SAVE_BUDGET',budget,randomUUID(),3);assert.equal(disabled.status,403);pass('profile disable blocks existing JWT without refresh');
 await owner.query('update public.mkt_profiles set is_active=true where id=$1',[b1.id]);
 const logout=await request('/auth/v1/logout?scope=global',{method:'POST',token:b1.token});assert.equal(logout.status,204);
 let revoked;for(let i=0;i<20;i++){revoked=await rpc(b1,'SAVE_BUDGET',budget,randomUUID(),3);if([401,403].includes(revoked.status))break;await pause(100);}
 assert.ok([401,403].includes(revoked.status),'Logged-out token must not allow sensitive writes');
 const refresh=await request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:b1.refresh}});assert.equal(refresh.status,400);pass('real Auth logout revokes refresh token and sensitive RPC access');
 console.log('PASS '+checks+' real local Auth/PostgREST checks. Hosted owner project and production data were never used.');
}catch(error){console.error('FAIL local Auth/PostgREST:',error.message);process.exitCode=1;}
finally{
 if(owner)await owner.end().catch(()=>{});
 if(attempted){try{await command(['stop','--no-backup'],120000);}catch{console.error('Local stack cleanup failed; runner teardown must remove disposable containers.');process.exitCode=1;}}
 await rm(dir,{recursive:true,force:true});
}
