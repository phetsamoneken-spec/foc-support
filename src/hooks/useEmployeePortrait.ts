import {useEffect,useState} from 'react';
import {storage} from '../services/storage';
import {isSupabaseBackend} from '../config/supabase';
import {loadPortrait,portraitScope,PORTRAIT_CHANGED} from '../services/employeePortraits';

export function useEmployeePortrait(id?:string){
 const endpoint=storage.getSettings().appsScriptUrl,scope=portraitScope(endpoint);
 const [image,setImage]=useState<{scope:string;id:string;url:string|null}|null>(null);
 useEffect(()=>{
  if(!id||!storage.hasRemoteUserSession()||!isSupabaseBackend(endpoint))return;
  let live=true;
  const update=(force=false)=>{loadPortrait(endpoint,id,force).then(url=>{if(live)setImage({scope,id,url});}).catch(()=>{});};
  const changed=(event:Event)=>{if((event as CustomEvent).detail?.id===id)update();};
  const visible=()=>{if(document.visibilityState==='visible')update();};
  update();window.addEventListener(PORTRAIT_CHANGED,changed);window.addEventListener('focus',visible);document.addEventListener('visibilitychange',visible);
  return()=>{live=false;window.removeEventListener(PORTRAIT_CHANGED,changed);window.removeEventListener('focus',visible);document.removeEventListener('visibilitychange',visible);};
 },[id,endpoint,scope]);
 return image?.scope===scope&&image.id===id?image.url:null;
}
