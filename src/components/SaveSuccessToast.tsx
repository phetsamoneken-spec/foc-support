import {useEffect,useState} from 'react';
import {CheckCircle2,X} from 'lucide-react';
import {subscribeToSaveSuccess,type SaveNotification} from '../services/saveNotifications';
import type {Language} from '../locales/translations';

export function SaveSuccessToast({userId,language}:{userId:string;language:Language}){
  const [notice,setNotice]=useState<SaveNotification|null>(null);
  useEffect(()=>subscribeToSaveSuccess(event=>{
    if(event.actorId===userId)setNotice(event);
  }),[userId]);
  useEffect(()=>{
    if(!notice)return;
    const timer=window.setTimeout(()=>setNotice(current=>current?.id===notice.id?null:current),4000);
    return ()=>window.clearTimeout(timer);
  },[notice]);

  return <div role="status" aria-live="polite" aria-atomic="true" className="pointer-events-none fixed left-1/2 top-4 z-[100] w-[calc(100%_-_2rem)] max-w-sm -translate-x-1/2 sm:top-6">
    {notice?.actorId===userId&&<div data-testid="save-success-toast" className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-emerald-950 shadow-xl">
      <CheckCircle2 aria-hidden="true" className="h-7 w-7 shrink-0 text-emerald-600" />
      <p className="flex-1 text-sm font-bold">{language==='lo'?'ບັນທຶກສຳເລັດ':'Saved successfully'}</p>
      <button type="button" onClick={()=>setNotice(null)} aria-label={language==='lo'?'ປິດການແຈ້ງເຕືອນ':'Dismiss notification'} className="rounded-lg p-1.5 text-emerald-800 hover:bg-emerald-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">
        <X aria-hidden="true" className="h-4 w-4" />
      </button>
    </div>}
  </div>;
}
