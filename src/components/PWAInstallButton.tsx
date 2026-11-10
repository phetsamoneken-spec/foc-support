import React,{useEffect,useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Download,CheckCircle,Smartphone,X,Copy,LoaderCircle} from 'lucide-react';
import {usePWAInstall} from '../hooks/usePWAInstall';

interface Props {language?:'lo'|'en';onOpenGuide?:()=>void;}
export const PWAInstallButton:React.FC<Props>=({language='lo',onOpenGuide})=>{
  const {isInstallable,isInstalled,isIOS,isAndroid,isInstalling,installFailed,install}=usePWAInstall();
  const lo=language==='lo',titleId=useId();
  const [showGuide,setShowGuide]=useState(false),[copyMessage,setCopyMessage]=useState('');
  const guideRef=useRef<HTMLDivElement>(null);
  const appUrl=typeof window==='undefined'?'':window.location.origin+window.location.pathname;
  useEffect(()=>{
    if(isInstalled){if(showGuide)setShowGuide(false);return;}
    if(!showGuide)return;
    let previousOverflow:string|undefined,previousFocus:HTMLElement|null=null;
    const frame=requestAnimationFrame(()=>{
      previousOverflow=document.body.style.overflow;previousFocus=document.activeElement as HTMLElement|null;
      document.body.style.overflow='hidden';guideRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    });
    const onKeyDown=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();setShowGuide(false);}
      if(event.key!=='Tab')return;
      const buttons=guideRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');if(!buttons?.length)return;
      const first=buttons[0],last=buttons[buttons.length-1];
      if(event.shiftKey&&(document.activeElement===first||!guideRef.current?.contains(document.activeElement))){event.preventDefault();event.stopImmediatePropagation();last.focus();}
      else if(!event.shiftKey&&(document.activeElement===last||!guideRef.current?.contains(document.activeElement))){event.preventDefault();event.stopImmediatePropagation();first.focus();}
    };
    document.addEventListener('keydown',onKeyDown,true);
    return()=>{cancelAnimationFrame(frame);document.removeEventListener('keydown',onKeyDown,true);if(previousOverflow!==undefined)document.body.style.overflow=previousOverflow;if(previousFocus?.isConnected&&!previousFocus.closest('[inert]'))previousFocus.focus();};
  },[showGuide,isInstalled]);
  if(isInstalled)return <div className="pwa-installed-status flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs font-medium text-emerald-800"><CheckCircle className="h-4 w-4 shrink-0"/><span>{lo?'ຕິດຕັ້ງແລ້ວ':'PWA Installed'}</span></div>;
  const title=isIOS?(lo?'ວິທີຕິດຕັ້ງແອັບເທິງ iPhone / iPad':'Install on iPhone / iPad'):isAndroid?(lo?'ວິທີຕິດຕັ້ງແອັບເທິງ Android':'Install on Android'):(lo?'ວິທີຕິດຕັ້ງແອັບ':'Install the app');
  const steps=isIOS?[
    lo?'ເປີດລິ້ງແອັບນີ້ໃນ Safari. ຖ້າເປີດຜ່ານແອັບອື່ນ ໃຫ້ເລືອກ “Open in Safari” ກ່ອນ.':'Open this app in Safari. If opened inside another app, choose “Open in Safari” first.',
    lo?'ກົດ Share (ແບ່ງປັນ) ແລ້ວເລືອກ “Add to Home Screen”.':'Tap Share, then choose “Add to Home Screen”.',
    lo?'ກົດ “Add” ເພື່ອເພີ່ມແອັບໃສ່ໜ້າຈໍຫຼັກ.':'Tap “Add” to place the app on your home screen.'
  ]:isAndroid?[
    lo?'ເປີດລິ້ງແອັບນີ້ໃນ Chrome. ຖ້າເປີດຜ່ານແອັບອື່ນ ໃຫ້ກົດ ⋮ ແລ້ວເລືອກ “Open in Chrome” ຫຼື “Open in browser”.':'Open this app in Chrome. If opened inside another app, tap ⋮ and choose “Open in Chrome” or “Open in browser”.',
    lo?'ໃນ Chrome ກົດເມນູ ⋮ ແລ້ວເລືອກ “Install app” ຫຼື “Add to Home screen”.':'In Chrome, tap ⋮ and choose “Install app” or “Add to Home screen”.',
    lo?'ກົດ “Install” ຫຼື “Add” ແລ້ວເປີດຈາກໄອຄອນ MKT Budget ໃນໜ້າຈໍຫຼັກ. Android / Chrome ທີ່ຮອງຮັບຈະເປີດແອັບເຕັມຈໍໂດຍບໍ່ຕ້ອງກົດປຸ່ມເຕັມຈໍ.':'Tap “Install” or “Add”, then launch the MKT Budget icon from your home screen. Supported Android / Chrome installations open fullscreen without an extra button.'
  ]:[
    lo?'ເປີດແອັບນີ້ໃນ Chrome ຫຼື Microsoft Edge.':'Open this app in Chrome or Microsoft Edge.',
    lo?'ກົດໄອຄອນຕິດຕັ້ງທີ່ແຖບທີ່ຢູ່ ຫຼືເປີດເມນູ ⋮ ແລ້ວເລືອກ “Install app”.':'Use the install icon in the address bar, or open ⋮ and choose the app installation option.',
    lo?'ຖ້າບໍ່ມີຕົວເລືອກຕິດຕັ້ງ ທ່ານຍັງໃຊ້ແອັບຜ່ານ browser ນີ້ໄດ້.':'If installation is unavailable, you can continue using the app in this browser.'
  ];
  return <div className="pwa-install-control w-full">
    <button type="button" disabled={isInstalling} aria-busy={isInstalling} onClick={()=>{if(isInstallable){void install();}else{setCopyMessage('');setShowGuide(true);onOpenGuide?.();}}} className="pwa-install-trigger flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-700 bg-emerald-700 px-3 py-3 text-sm font-bold text-white shadow-sm hover:bg-emerald-800 disabled:cursor-progress">
      {isInstalling?<LoaderCircle className="h-4 w-4 shrink-0 animate-spin"/>:isIOS?<Smartphone className="h-4 w-4 shrink-0"/>:<Download className="h-4 w-4 shrink-0"/>}
      <span>{isInstalling?(lo?'ກຳລັງຕິດຕັ້ງ…':'Installing…'):isIOS&&!isInstallable?(lo?'ຕິດຕັ້ງເທິງ iPhone':'Install on iOS'):(lo?'ຕິດຕັ້ງແອັບ':'Install App')}</span>
    </button>
    {installFailed&&<p role="alert" className="mt-2 text-xs text-red-700">{lo?'browser ບໍ່ສາມາດເປີດການຕິດຕັ້ງໄດ້. ກົດປຸ່ມອີກຄັ້ງເພື່ອເບິ່ງວິທີຕິດຕັ້ງ.':'Your browser could not open installation. Press the button again for instructions.'}</p>}
    {showGuide&&createPortal(<div className="pwa-guide-overlay fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4">
      <div ref={guideRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="pwa-guide-panel max-h-[calc(100dvh_-_2rem)] w-full max-w-sm overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 text-slate-800 shadow-2xl">
        <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3"><h3 id={titleId} className="pt-2 text-base font-bold text-slate-900">{title}</h3><button type="button" aria-label={lo?'ປິດຄຳແນະນຳ':'Close installation guide'} onClick={()=>setShowGuide(false)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700"><X size={20}/></button></div>
        <ol className="mt-4 space-y-4 text-sm leading-relaxed">{steps.map((step,index)=><li key={index} className="flex items-start gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-900">{index+1}</span><p>{step}</p></li>)}</ol>
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="break-all text-xs select-all">{appUrl}</p><button type="button" className="mt-2 flex min-h-11 items-center gap-2 text-xs font-bold text-emerald-800" onClick={async()=>{try{await navigator.clipboard.writeText(appUrl);setCopyMessage(lo?'ຄັດລອກລິ້ງແລ້ວ':'App link copied');}catch{setCopyMessage(lo?'ກົດຄ້າງລິ້ງດ້ານເທິງເພື່ອຄັດລອກ':'Press and hold the link above to copy it');}}}><Copy size={16}/>{lo?'ຄັດລອກລິ້ງແອັບ':'Copy app link'}</button><p role="status" aria-live="polite" className="text-xs text-slate-600">{copyMessage}</p></div>
        <button type="button" onClick={()=>setShowGuide(false)} className="mt-5 min-h-11 w-full rounded-xl bg-emerald-700 px-3 py-3 text-sm font-bold text-white">{lo?'ເຂົ້າໃຈແລ້ວ':'Got it'}</button>
      </div>
    </div>,document.body)}
  </div>;
};
