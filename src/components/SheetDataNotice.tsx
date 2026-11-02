import {SupabaseDataNotice} from './SupabaseDataNotice';
import React, {useEffect,useState} from 'react';
import {RefreshCw} from 'lucide-react';
import {storage} from '../services/storage';
import {GasService} from '../services/gasService';

export function SheetDataNotice(){
  const [state,setState]=useState(storage.getSheetDataState());
  const [backupError,setBackupError]=useState('');
  const [write,setWrite]=useState(storage.getBusinessWriteState());
  const [publication,setPublication]=useState(storage.getSheetPublishState());
  useEffect(()=>storage.subscribe(()=>{setState({...storage.getSheetDataState()});setWrite(storage.getBusinessWriteState());setPublication(storage.getSheetPublishState());}),[]);
  if(storage.usesSupabase)return <SupabaseDataNotice />;
  if(!storage.getSettings().appsScriptUrl)return null;
  const lang=storage.getSettings().language;
  const load=async()=>{
    setBackupError('');
    const dirty=storage.hasUnsyncedBusinessData();
    if(dirty){
      if(!window.confirm(lang==='lo'?'ໂຫຼດຂໍ້ມູນຈາກ Sheet ແທນຂໍ້ມູນໃນ browser ນີ້ບໍ່? ແອັບຈະດາວໂຫຼດໄຟລ໌ສຳຮອງ JSON ຂອງຂໍ້ມູນເດີມກ່ອນ.':'Replace this browser’s business data with the Sheet data? A JSON backup of the current data will download first.'))return;
      try{
        const url=URL.createObjectURL(new Blob([JSON.stringify(storage.exportBusinessBackup(),null,2)],{type:'application/json'}));
        const link=document.createElement('a');link.href=url;link.download=`FOC-business-backup-${Date.now()}.json`;
        document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
      }catch{setBackupError('Could not create the backup. Existing data was kept.');return;}
    }
    await storage.loadBusinessFromSheets(dirty);
  };
  return <>
    {publication.pending&&<div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
      <p role="status" className="min-w-0 flex-1">{publication.message||(lang==='lo'?'ມີຂໍ້ມູນລໍສົ່ງໄປ Sheet. ແອັບເກັບໄວ້ແລ້ວ.':'Sheet publication pending. Uploaded data has been retained.')} {publication.pending.fileName}</p>
      <button type="button" disabled={publication.saving} onClick={()=>void GasService.syncAllToGoogleSheets()} className="rounded-lg border px-3 py-2 font-semibold disabled:opacity-50">{lang==='lo'?'ລອງສົ່ງໄປ Sheet ອີກຄັ້ງ':'Retry publishing to Sheet'}</button>
      <button type="button" onClick={()=>{const pending=storage.getPendingSheetPublish();if(!pending)return;const url=URL.createObjectURL(new Blob([JSON.stringify(pending,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`FOC-pending-upload-${Date.now()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}} className="rounded-lg border px-3 py-2 font-semibold">{lang==='lo'?'ດາວໂຫຼດສຳຮອງ':'Download backup'}</button>
      <button type="button" disabled={publication.saving} onClick={()=>{if(window.confirm(lang==='lo'?'ຍົກເລີກການສົ່ງນີ້ບໍ່? ແອັບຈະເກັບສຳຮອງໃນ browser ໄວ້.':'Cancel this pending publication? A backup will be retained in this browser.')){if(!storage.discardPendingSheetPublish())setBackupError('Could not retain a backup. Pending upload kept.');}}} className="rounded-lg border px-3 py-2 font-semibold disabled:opacity-50">{lang==='lo'?'ຍົກເລີກການສົ່ງ':'Cancel pending publication'}</button>
    </div>}
    {write.status!=='idle'&&<div className={`mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 text-xs ${write.status==='error'?'border-amber-200 bg-amber-50 text-amber-900':write.status==='saved'?'border-emerald-200 bg-emerald-50 text-emerald-800':'border-blue-200 bg-blue-50 text-blue-800'}`}>
      <p role={write.status==='error'?'alert':'status'} className="flex-1">{write.message}</p>
      {write.pending&&write.status!=='saving'&&<button type="button" onClick={()=>void storage.retryPendingBusinessWrite()} className="rounded-lg border px-3 py-2 font-semibold">{lang==='lo'?'ລອງບັນທຶກຊ້ຳ':'Retry save'}</button>}
      {write.status==='error'&&storage.getCurrentUser()?.role==='ADMIN'&&<a href="https://raw.githubusercontent.com/phetsamoneken-spec/foc-support/main/gas/Code.gs" target="_blank" rel="noreferrer" className="text-blue-700 underline">Code.gs</a>}
    </div>}
    {storage.getLocalRecoveryBackup()&&<button type="button" className="mb-3 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold" onClick={()=>{
      const data=storage.getLocalRecoveryBackup();if(!data)return;
      const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`FOC-recovery-${data.id}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }}>{lang==='lo'?'ດາວໂຫຼດສຳຮອງຂໍ້ມູນເກົ່າ':'Download old data backup'}</button>}
    <div className={`mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 text-xs ${state.status==='error'||state.status==='local'?'border-amber-200 bg-amber-50 text-amber-900':'border-slate-200 bg-white text-slate-600'}`}>
    <p role={state.status==='error'?'alert':'status'} className="min-w-0 flex-1">{backupError || state.message || (lang==='lo'?'ຂໍ້ມູນລູກຄ້າຈາກ Google Sheet':'Customer data from Google Sheets')}</p>
    <button type="button" onClick={load} disabled={!!publication.pending||state.status==='loading'||write.status==='saving'||write.pending&&!storage.hasUnsyncedBusinessData()} className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 font-semibold disabled:opacity-50">
      <RefreshCw className={`h-4 w-4 ${state.status==='loading'?'animate-spin':''}`} />{lang==='lo'?'ໂຫຼດຈາກ Sheet':'Load from Sheet'}
    </button>
    {state.status==='error'&&storage.getCurrentUser()?.role==='ADMIN'&&<a href="https://raw.githubusercontent.com/phetsamoneken-spec/foc-support/main/gas/Code.gs" target="_blank" rel="noreferrer" className="font-semibold text-blue-700 underline">Code.gs</a>}
  </div></>;
}
