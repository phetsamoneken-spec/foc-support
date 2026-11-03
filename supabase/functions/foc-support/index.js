import {createHash} from 'node:crypto';
import {createAdapter} from './adapter.js';
import {createDomain} from './domain.js';
import {toAdapterSnapshot,encodeChanges} from './codec.js';

const hash=value=>createHash('sha256').update(String(value)).digest('hex');
const accountActions=new Set(['ADD_USER','UPDATE_USER','RESET_USER_PASSWORD','DELETE_USER','UPDATE_PROFILE']);
const actions=new Set(['AUTH_LOGIN','AUTH_ME','AUTH_LOGOUT','GET_USERS','SYNC_USERS',...accountActions,'GET_BUSINESS_DATA','GET_SHARED_SETTINGS','SAVE_SHARED_SETTINGS','SYNC_BULK_DATA','MUTATE_BUSINESS','SAVE_BROWSER_RECOVERY','BACKUP_DATABASE','ADD_TRANSACTION','CANCEL_TRANSACTION','NEW_CONTRACT_CYCLE','UPDATE_BUDGET']);
const allowedOrigins=new Set(['https://phetsamoneken-spec.github.io','http://localhost:3000','http://localhost:5173']);

export function createBackend({url,key,fetch:request=fetch}){
 const serverHeaders={apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'};
 async function api(path,body,options={}){
  const response=await request(url+path,{method:body===undefined?'GET':'POST',headers:{...serverHeaders,...options.headers},...(body===undefined?{}:{body:JSON.stringify(body)}),...options});
  const result=await response.json().catch(()=>({}));
  if(!response.ok){const error=Error(result.message||result.msg||result.error_description||result.error||'Database request failed');error.code=result.code;throw error;}
  return result;
 }
 const rpc=(name,p={})=>api('/rest/v1/rpc/mkt_edge_'+name,p);
 function identity(token){const payload=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));if(!payload.sub||!payload.session_id)throw Error('Session expired. Sign in again.');return {uid:payload.sub,sid:payload.session_id};}
 async function verified(token){
  if(typeof token!=='string'||token.length>8192)throw Error('Session expired. Sign in again.');
  const user=await api('/auth/v1/user',undefined,{headers:{...serverHeaders,Authorization:'Bearer '+token}}).catch(()=>{throw Error('Session expired. Sign in again.');});
  const who=identity(token);if(user.id!==who.uid||user.is_anonymous)throw Error('Session expired. Sign in again.');return who;
 }
 function model(snapshot){
  const adapter=createAdapter(toAdapterSnapshot(snapshot)),domain=createDomain(adapter),token=crypto.randomUUID(),row=domain.findUser(adapter.spreadsheet,snapshot.actor.legacy_id);
  if(!row)throw Error('Session expired. Sign in again.');
  const sessions=adapter.spreadsheet.insertSheet('SESSIONS');sessions.appendRow(['Session ID','Username','Token','Expires At','Created At','User ID','Password Version']);
  sessions.appendRow([crypto.randomUUID(),row[1],hash(token),new Date(Date.now()+3600000).toISOString(),new Date().toISOString(),row[0],hash(row[2])]);
  return {adapter,domain,token,row};
 }
 const sessionResult=session=>({token:session.access_token,refreshToken:session.refresh_token,expiresAt:new Date(Date.now()+session.expires_in*1000).toISOString()});
 async function bootstrap(){
  const queue=await rpc('bootstrap_queue');
  for(const q of queue){
   let user;
   try{user=await api('/auth/v1/admin/users',{email:q.internal_email,password_hash:q.password_hash,email_confirm:true,app_metadata:{foc_legacy_id:q.legacy_id}});}
   catch(error){
    // A prior execution may have created Auth before its linking transaction completed.
    const listing=await api('/auth/v1/admin/users?page=1&per_page=1000');
    user=listing.users?.find(u=>u.email===q.internal_email&&u.app_metadata?.foc_legacy_id===q.legacy_id);if(!user)throw error;
   }
   user=user.user||user;await rpc('link_import',{p_legacy_id:q.legacy_id,p_auth_id:user.id});
  }
  return rpc('health');
 }
 async function load(who,operations=[]){const snapshot=await rpc('load',{p_uid:who.uid,p_sid:who.sid,p_operations:operations});if(!snapshot?.actor)throw Error('Session expired. Sign in again.');return snapshot;}
 async function commit(who,snapshot,state,action){const changes=encodeChanges(state.adapter.changes(),snapshot,state.adapter);if(!changes.upserts.length&&!changes.deletes.length)return;return rpc('commit',{p_uid:who.uid,p_sid:who.sid,p_revision:snapshot.revision,p_action:action,p_changes:changes});}
 async function nativeAccount(action,payload,who,snapshot,state){
  const {domain,adapter,row:actor}=state,ss=adapter.spreadsheet;
  if(action!=='UPDATE_PROFILE'&&actor[5]!=='ADMIN')throw Error('Admin permission required');
  const existing=action==='UPDATE_PROFILE'?actor:payload.id?domain.findUser(ss,payload.id):null;
  if(action!=='ADD_USER'&&!existing)throw Error('User not found');
  if(action==='DELETE_USER'){
   if(existing[0]===actor[0])throw Error('Cannot delete your current account');
   const row=existing.slice();row[7]=false;row[10]='DELETED';row[12]=new Date().toISOString();domain.writeUser(ss,row,actor[1],'DELETE_USER');
   const target=await rpc('account',{p_uid:who.uid,p_sid:who.sid,p_legacy_id:String(row[0])});
   // Profile status is committed first; subsequent SQL access is denied immediately.
   await commit(who,snapshot,state,action);
   if(target)await rpc('revoke_sessions',{p_uid:who.uid,p_sid:who.sid,p_target:target.auth_id,p_all:true});
   return {success:true,users:domain.userRows(ss).map(domain.publicUser)};
  }
  const password=payload.password;
  if(password!==undefined&&password!==''&&(typeof password!=='string'||password.length<8||new TextEncoder().encode(password).length>72||/^CHANGE_ME_/.test(password)))throw Error('Use a password of 8–72 UTF-8 bytes.');
  if(action==='ADD_USER'&&!password)throw Error('Set a new password for this user');
  const legacyId=existing?.[0]||'USR-NATIVE-'+hash(String(payload.username).trim().toLowerCase()).slice(0,32);
  const base=existing||[legacyId,'','native:pending','','','TEAM_USER','B1',true,new Date().toISOString(),'','ACTIVE','',''];
  const data={...payload};delete data.password;
  const row=domain.prepareUser(data,base,actor,action==='UPDATE_PROFILE');
  let link=await rpc('account',{p_uid:who.uid,p_sid:who.sid,p_legacy_id:String(legacyId)}),newSession;
  if(!link){
   const email='legacy-'+hash(legacyId).slice(0,40)+'@foc-support.invalid';
   let user;
   try{user=await api('/auth/v1/admin/users',{email,password,email_confirm:true,app_metadata:{foc_legacy_id:legacyId}});}catch(error){const list=await api('/auth/v1/admin/users?page=1&per_page=1000');user=list.users?.find(u=>u.email===email&&u.app_metadata?.foc_legacy_id===legacyId);if(!user)throw error;}
   user=user.user||user;await rpc('stage_account',{p_uid:who.uid,p_sid:who.sid,p_auth_id:user.id,p_legacy_id:legacyId,p_email:email});link={auth_id:user.id,internal_email:email};
   snapshot.profiles.push({id:user.id,legacy_id:legacyId,username:row[1]});
  }else if(password){
   await api('/auth/v1/admin/users/'+link.auth_id,{password},{method:'PUT'});
   await rpc('revoke_sessions',{p_uid:who.uid,p_sid:who.sid,p_target:link.auth_id,p_all:true});
   if(link.auth_id===who.uid){newSession=await api('/auth/v1/token?grant_type=password',{email:link.internal_email,password});Object.assign(who,identity(newSession.access_token));}
  }
  row[2]='native:'+link.auth_id;
  domain.writeUser(ss,row,actor[1],action);
  await commit(who,snapshot,state,action);
  if(row[7]!==true&&link.auth_id!==who.uid)await rpc('revoke_sessions',{p_uid:who.uid,p_sid:who.sid,p_target:link.auth_id,p_all:true});
  return {success:true,user:domain.publicUser(domain.findUser(ss,actor[0])),users:actor[5]==='ADMIN'?domain.userRows(ss).map(domain.publicUser):undefined,...(newSession?sessionResult(newSession):{}),message:'User saved to Supabase.'};
 }
 async function perform(action,payload,token){
  if(!actions.has(action))throw Error('Unsupported action');
  let who,session;
  if(action==='AUTH_LOGIN'){
   const email=await rpc('login',{p_username:String(payload.username||'').slice(0,100)});
   if(!email)throw Error('Incorrect username/password or disabled account. Try again later.');
   session=await api('/auth/v1/token?grant_type=password',{email,password:String(payload.password||'')}).catch(()=>{throw Error('Incorrect username/password or disabled account.');});
   token=session.access_token;
  }
  who=await verified(token);
  if(action==='AUTH_LOGOUT'){await rpc('revoke_sessions',{p_uid:who.uid,p_sid:who.sid,p_target:who.uid,p_all:false});return {success:true};}
  if(action==='SYNC_USERS'){
   if(!Array.isArray(payload.users))throw Error('Missing users array');
   const first=await load(who);if(first.actor.role!=='ADMIN')throw Error('Admin permission required');
   for(const data of payload.users){if(/^CHANGE_ME_/.test(String(data.password||'')))continue;const current=await load(who),p=current.profiles.find(u=>u.username.toLowerCase()===String(data.username).toLowerCase());const state=model(current);await nativeAccount(p?'UPDATE_USER':'ADD_USER',{...data,id:p?.legacy_id},who,current,state);}
   const current=await load(who),state=model(current);return {success:true,users:state.domain.userRows(state.adapter.spreadsheet).map(state.domain.publicUser)};
  }
  for(let attempt=0;attempt<4;attempt++){
   const snapshot=await load(who,payload.id?[String(payload.id)]:[]),state=model(snapshot);
   try{
    if(accountActions.has(action))return await nativeAccount(action,payload,who,snapshot,state);
    let result;
    if(action==='AUTH_LOGIN'){state.row[9]=new Date().toISOString();state.domain.writeUser(state.adapter.spreadsheet,state.row,state.row[1],'LOGIN');result={success:true,user:state.domain.publicUser(state.row),...sessionResult(session)};}
    else result=state.domain.handle({postData:{contents:JSON.stringify({action,payload,authToken:state.token})}});
    if(result.success!==true)return result;
    await commit(who,snapshot,state,action==='MUTATE_BUSINESS'?String(payload.kind):action);
    if(action==='AUTH_LOGIN')await rpc('login_success',{p_uid:who.uid,p_sid:who.sid});
    return {...result,provider:'supabase'};
   }catch(error){if(error.code==='40001'&&attempt<3)continue;throw error;}
  }
 }
 return {bootstrap,perform,health:()=>rpc('health')};
}

export function createHandler(backend){return async request=>{
 const origin=request.headers.get('Origin');
 const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin',...(allowedOrigins.has(origin)?{'Access-Control-Allow-Origin':origin}:{}),'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};
 const respond=(value,status=200)=>new Response(JSON.stringify(value),{status,headers});
 if(origin&&!allowedOrigins.has(origin))return respond({success:false,message:'Origin not allowed'},403);
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 try{
  if(request.method==='GET')return respond(await backend.health());
  if(request.method!=='POST')return respond({success:false,message:'Method not allowed'},405);
  const body=await request.text();if(body.length>12*1024*1024)return respond({success:false,message:'Upload exceeds 12 MB'},413);
  const {action,payload={}}=JSON.parse(body),token=request.headers.get('Authorization')?.replace(/^Bearer\s+/i,'');
  return respond(await backend.perform(action,payload,token));
 }catch(error){return respond({success:false,message:String(error.message||error),...(error.code==='40001'?{retryable:true,writeVersion:1}:{})});}
};}

if(typeof Deno!=='undefined'){
 const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}').default;
 if(!key)throw Error('Server database credentials are not configured');
 Deno.serve(createHandler(createBackend({url:Deno.env.get('SUPABASE_URL'),key})));
}
