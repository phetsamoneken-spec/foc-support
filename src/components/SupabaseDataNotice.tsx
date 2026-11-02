import React, {useEffect,useState} from 'react';
import {storage} from '../services/storage';
export function SupabaseDataNotice(){
  const [,render]=useState(0);
  useEffect(()=>storage.subscribe(()=>render(n=>n+1)),[]);
  const state=storage.getSheetDataState(),write=storage.getBusinessWriteState();
  return <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950" aria-live="polite">
    <p>{state.message}</p>
    {state.status==='error'&&<p>ຂໍ້ມູນທີ່ສະແດງອາດບໍ່ແມ່ນລ່າສຸດ; ກະລຸນາໂຫຼດໃໝ່ກ່ອນບັນທຶກ.</p>}
    {write.message&&<p role={write.status==='error'?'alert':'status'}>{write.message}</p>}
    <div className="mt-2 flex gap-3">
      <button className="rounded-lg border px-3 py-1 disabled:opacity-50" disabled={state.status==='loading'||write.status==='saving'} onClick={()=>void storage.loadBusinessFromSheets()}>ໂຫຼດຂໍ້ມູນໃໝ່</button>
      {write.pending&&<button className="rounded-lg border px-3 py-1 disabled:opacity-50" disabled={write.status==='saving'} onClick={()=>void storage.retryPendingBusinessWrite()}>ລອງບັນທຶກຊ້ຳ</button>}
    </div>
  </div>;
}
