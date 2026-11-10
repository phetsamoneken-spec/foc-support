import type {User} from '../types';
import type {BusinessSnapshot} from './businessData';
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,isSupabaseBackend,isBackendEndpoint,backendMessage} from '../config/supabase';
export interface AccountResponse {success:boolean;message?:string;error?:string;user?:User;users?:User[];token?:string;refreshToken?:string;expiresAt?:string;dataVersion?:number;deletionVersion?:number;scope?:string;snapshot?:BusinessSnapshot;spreadsheetId?:string;backupId?:string;recoveryVersion?:number;recoveryId?:string;migratedFromSpreadsheetId?:string;writeVersion?:number;retryable?:boolean;mutationId?:string;customerCodes?:string[];patch?:BusinessSnapshot;entityId?:string;businessRevision?:string;settingsVersion?:number;settings?:unknown;syncVersion?:number;annualBudgetVersion?:number;}
interface RemoteSession {endpoint:string;token:string;expiresAt:string;refreshToken?:string;sessionId:string;}
let memory:RemoteSession|null=null;
const refreshFlights=new Map<string,Promise<RemoteSession>>();
const key=(endpoint:string)=>'mkt-sheet-session:'+endpoint;
function saveSession(session:RemoteSession){memory=session;try{sessionStorage.setItem(key(session.endpoint),JSON.stringify(session));}catch{}}
export function remoteSession(endpoint:string):RemoteSession|null {
 try{const value=sessionStorage.getItem(key(endpoint));if(value){const cached=JSON.parse(value);memory={endpoint,...cached,sessionId:cached.sessionId||cached.token};}}catch{}
 return memory?.endpoint===endpoint&&(Date.parse(memory.expiresAt)>Date.now()||isSupabaseBackend(endpoint)&&Boolean(memory.refreshToken))?memory:null;
}
// Stable for one login, including automatic native access-token refreshes.
export function remoteSessionId(endpoint:string){return remoteSession(endpoint)?.sessionId;}
export function clearRemoteSession(endpoint:string){if(memory?.endpoint===endpoint)memory=null;try{sessionStorage.removeItem(key(endpoint));}catch{}}
/** Storage uses the same refreshed user session as the existing business API. */
export async function authenticatedStorageRequest(endpoint:string,path:string,init:RequestInit={}):Promise<Response>{
 if(!isSupabaseBackend(endpoint)||!path.startsWith('/object/'))throw Error('Photo storage requires a Supabase session.');
 let session=await refreshed(endpoint);
 if(!session)throw Error('Session expired. Sign in again.');
 const loginId=session.sessionId;
 for(let attempt=0;attempt<2;attempt++){
  const response=await fetch(SUPABASE_URL+'/storage/v1'+path,{...init,headers:{...Object.fromEntries(new Headers(init.headers)),apikey:SUPABASE_PUBLISHABLE_KEY,Authorization:'Bearer '+session.token},cache:'no-store'});
  if(remoteSessionId(endpoint)!==loginId)throw Error('Session changed. Sign in again.');
  if(response.status===401&&attempt===0&&session.refreshToken){session=await refreshed(endpoint,true);if(!session||session.sessionId!==loginId)throw Error('Session changed. Sign in again.');continue;}
  return response;
 }
 throw Error('Session expired. Sign in again.');
}
async function refreshed(endpoint:string,force=false):Promise<RemoteSession|null>{
 const current=remoteSession(endpoint);
 if(!current||!isSupabaseBackend(endpoint)||!current.refreshToken||!force&&Date.parse(current.expiresAt)>Date.now()+60000)return current;
 if(refreshFlights.has(endpoint))return refreshFlights.get(endpoint)!;
 const pending=(async()=>{
  const response=await fetch(SUPABASE_URL+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:current.refreshToken})});
  const result=await response.json();
  if(!response.ok||!result.access_token){clearRemoteSession(endpoint);throw Error('Session expired. Sign in again.');}
  if(remoteSession(endpoint)?.sessionId!==current.sessionId)throw Error('Session changed. Sign in again.');
  const next={...current,token:result.access_token,refreshToken:result.refresh_token,expiresAt:new Date(Date.now()+result.expires_in*1000).toISOString()};saveSession(next);return next;
 })().finally(()=>refreshFlights.delete(endpoint));
 refreshFlights.set(endpoint,pending);return pending;
}
export async function accountRequest(endpoint:string,action:string,payload:Record<string,unknown>={}):Promise<AccountResponse>{
 if(!isBackendEndpoint(endpoint))return {success:false,message:'The shared database endpoint is not configured.'};
 try{
  const native=isSupabaseBackend(endpoint);let session=action==='AUTH_LOGIN'?null:await refreshed(endpoint);
  for(let attempt=0;attempt<2;attempt++){
   const headers:Record<string,string>=native?{'Content-Type':'application/json',apikey:SUPABASE_PUBLISHABLE_KEY,...(session?{Authorization:'Bearer '+session.token}:{})}:{'Content-Type':'text/plain;charset=utf-8'};
   const response=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify({action,payload,...(!native?{authToken:session?.token}:{})})});
   const result=await response.json() as AccountResponse;
   if(native&&session?.refreshToken&&attempt===0&&(response.status===401||/Session expired/i.test(result.message||result.error||''))){session=await refreshed(endpoint,true);continue;}
   if(!response.ok)throw Error(result.message||result.error||'HTTP '+response.status);
   if(result.success!==true){const message=result.message||result.error||'Account operation failed';if(/Session expired|Sign in to the Sheets backend first/i.test(message))clearRemoteSession(endpoint);return {...result,success:false,message};}
   if(result.token&&result.expiresAt)saveSession({endpoint,token:result.token,expiresAt:result.expiresAt,refreshToken:result.refreshToken,sessionId:action==='AUTH_LOGIN'?result.token:session?.sessionId||result.token});
   return native&&result.message?{...result,message:backendMessage(result.message,endpoint)}:result;
  }
  return {success:false,message:'Session expired. Sign in again.'};
 }catch(error){return {success:false,message:error instanceof Error?error.message:String(error)};}
}
