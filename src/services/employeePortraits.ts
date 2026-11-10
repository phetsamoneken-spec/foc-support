import {authenticatedStorageRequest,remoteSessionId} from './remoteAccounts';

export const PORTRAIT_BUCKET='employee-portraits';
export const PORTRAIT_CHANGED='mkt-employee-portrait-changed';
const cached=new Map<string,{url:string|null;expires:number}>(),flights=new Map<string,Promise<string|null>>();
const generations=new Map<string,number>();
let activeScope='';
export const portraitScope=(endpoint:string)=>endpoint+':'+(remoteSessionId(endpoint)||'signed-out');
function prepareScope(endpoint:string){
 const scope=portraitScope(endpoint);
 if(activeScope!==scope){for(const item of cached.values())if(item.url)URL.revokeObjectURL(item.url);cached.clear();flights.clear();generations.clear();activeScope=scope;}
 return scope;
}
export function portraitObjectPath(id:string){
 if(!/^[a-zA-Z0-9_-]{1,100}$/.test(id))throw Error('Invalid employee identifier.');
 return encodeURIComponent(id)+'/profile.jpg';
}
export async function loadPortrait(endpoint:string,id:string,force=false):Promise<string|null>{
 const scope=prepareScope(endpoint),key=scope+':'+id,old=cached.get(key);
 if(old&&!force&&old.expires>Date.now())return old.url;
 if(flights.has(key))return flights.get(key)!;
 const version=generations.get(key)||0;
 const request=(async()=>{
  const response=await authenticatedStorageRequest(endpoint,'/object/'+PORTRAIT_BUCKET+'/'+portraitObjectPath(id));
  // Missing pictures are normal for existing employees; other failures remain retryable.
  let url:string|null=null;
  if(response.ok){const blob=await response.blob();if(blob.type.split(';')[0]!=='image/jpeg'||blob.size>262144)throw Error('Invalid employee photo.');url=URL.createObjectURL(blob);}
  else if(response.status!==404&&response.status!==400)throw Error('Could not load the employee photo.');
  if(activeScope!==scope||portraitScope(endpoint)!==scope){if(url)URL.revokeObjectURL(url);return null;}
  if((generations.get(key)||0)!==version){if(url)URL.revokeObjectURL(url);return cached.get(key)?.url||null;}
  // Retain the previous URL until subscribers have switched to the replacement.
  cached.set(key,{url,expires:Date.now()+60000});if(old?.url&&old.url!==url)setTimeout(()=>URL.revokeObjectURL(old.url!),1000);
  return url;
 })().finally(()=>{if(flights.get(key)===request)flights.delete(key);});
 flights.set(key,request);return request;
}
async function checked(response:Response){
 if(response.ok)return;
 const result=await response.json().catch(()=>({}));
 if(/bucket/i.test(result.message||result.error||''))throw Error('ບ່ອນເກັບຮູບຍັງບໍ່ພ້ອມ. ກະລຸນາແຈ້ງ Admin.');
 throw Error('ບັນທຶກຮູບບໍ່ສຳເລັດ. ກວດສັນຍານ ແລະສິດບັນຊີ ແລ້ວລອງໃໝ່.');
}
export async function savePortrait(endpoint:string,id:string,photo:Blob){
 if(photo.type!=='image/jpeg'||photo.size>262144)throw Error('Use a JPEG photo smaller than 256 KB.');
 await checked(await authenticatedStorageRequest(endpoint,'/object/'+PORTRAIT_BUCKET+'/'+portraitObjectPath(id),{method:'POST',headers:{'Content-Type':'image/jpeg','x-upsert':'true','cache-control':'max-age=0'},body:photo}));
 publishPortrait(endpoint,id,photo);
}
export async function deletePortrait(endpoint:string,id:string){
 await checked(await authenticatedStorageRequest(endpoint,'/object/'+PORTRAIT_BUCKET,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefixes:[decodeURIComponent(portraitObjectPath(id))]})}));
 publishPortrait(endpoint,id,null);
}
function publishPortrait(endpoint:string,id:string,photo:Blob|null){
 const key=prepareScope(endpoint)+':'+id,old=cached.get(key);
 generations.set(key,(generations.get(key)||0)+1);
 cached.set(key,{url:photo?URL.createObjectURL(photo):null,expires:Date.now()+60000});
 if(old?.url)setTimeout(()=>URL.revokeObjectURL(old.url!),1000);
 window.dispatchEvent(new CustomEvent(PORTRAIT_CHANGED,{detail:{id}}));
}
