import assert from 'node:assert/strict';
import {SUPABASE_FUNCTION_URL,SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from '../src/config/supabase';
import {accountRequest,remoteSession,remoteSessionId,clearRemoteSession} from '../src/services/remoteAccounts';
const sessions=new Map<string,string>();
Object.assign(globalThis,{sessionStorage:{getItem:(k:string)=>sessions.get(k)??null,setItem:(k:string,v:string)=>sessions.set(k,v),removeItem:(k:string)=>sessions.delete(k)}});
let refreshes=0,calls=0,denyRefresh=false;
globalThis.fetch=async(url,init)=>{
 const h=init!.headers as Record<string,string>;
 assert.equal(h.apikey,SUPABASE_PUBLISHABLE_KEY);
 const body=JSON.parse(String(init!.body));
 if(String(url).startsWith(SUPABASE_URL+'/auth/v1/token')){
  refreshes++;assert.equal(body.refresh_token,'test-refresh');
  await new Promise(r=>setTimeout(r,5));
  return new Response(JSON.stringify(denyRefresh?{error:'revoked'}:{access_token:'refreshed-access',refresh_token:'rotated-refresh',expires_in:3600}),{status:denyRefresh?400:200});
 }
 assert.equal(url,SUPABASE_FUNCTION_URL);assert.equal(body.authToken,undefined,'native credentials are sent only in the authorization header');
 if(body.action==='AUTH_LOGIN')return new Response(JSON.stringify({success:true,token:'test-access',refreshToken:'test-refresh',expiresAt:new Date(Date.now()+1000).toISOString()}));
 calls++;assert.equal(h.Authorization,'Bearer refreshed-access');
 return new Response(JSON.stringify({success:true,settingsVersion:1}));
};
assert.equal((await accountRequest(SUPABASE_FUNCTION_URL,'AUTH_LOGIN',{username:'test',password:'Test-only-password!'})).success,true);
const stable=remoteSessionId(SUPABASE_FUNCTION_URL);
const reads=await Promise.all([accountRequest(SUPABASE_FUNCTION_URL,'AUTH_ME'),accountRequest(SUPABASE_FUNCTION_URL,'GET_SHARED_SETTINGS')]);
assert.ok(reads.every(r=>r.success));assert.equal(refreshes,1,'concurrent reads share one native refresh');assert.equal(calls,2);
assert.equal(remoteSessionId(SUPABASE_FUNCTION_URL),stable,'refresh preserves in-flight account identity');
assert.equal(remoteSession(SUPABASE_FUNCTION_URL)?.token,'refreshed-access');
assert.ok(!JSON.stringify([...sessions]).includes('Test-only-password!'));
clearRemoteSession(SUPABASE_FUNCTION_URL);
await accountRequest(SUPABASE_FUNCTION_URL,'AUTH_LOGIN');denyRefresh=true;
assert.equal((await accountRequest(SUPABASE_FUNCTION_URL,'AUTH_ME')).success,false);
assert.equal(remoteSession(SUPABASE_FUNCTION_URL),null,'revoked refresh clears local credentials');
console.log('PASS: Supabase public-key transport, native Authorization, single-flight refresh, stable account identity and revoked-session cleanup.');
