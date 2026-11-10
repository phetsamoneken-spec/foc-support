import React,{useEffect,useRef,useState} from 'react';
import {Maximize,Minimize} from 'lucide-react';
import type {Language} from '../locales/translations';

/** Fullscreen is requested only by a user gesture, never while opening the app. */
export function FullscreenButton({language,onComplete}:{language:Language;onComplete?:()=>void}){
  const [supported,setSupported]=useState(false),[active,setActive]=useState(false),[nativeMode,setNativeMode]=useState(false);
  const [pending,setPending]=useState(false),[error,setError]=useState('');
  const pendingRef=useRef(false);
  useEffect(()=>{
    const mode=window.matchMedia('(display-mode: fullscreen)');
    const sync=()=>{setSupported(Boolean(document.fullscreenEnabled&&document.documentElement.requestFullscreen));setActive(Boolean(document.fullscreenElement));setNativeMode(mode.matches&&!document.fullscreenElement);};
    sync();document.addEventListener('fullscreenchange',sync);mode.addEventListener?.('change',sync);
    return()=>{document.removeEventListener('fullscreenchange',sync);mode.removeEventListener?.('change',sync);};
  },[]);
  if(!supported||nativeMode)return null;
  const lo=language==='lo';
  return <div className="fullscreen-control no-print"><button type="button" className="fullscreen-toggle" aria-pressed={active} aria-busy={pending} disabled={pending} onClick={async()=>{
    if(pendingRef.current)return;pendingRef.current=true;setPending(true);setError('');
    try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen({navigationUI:'hide'});onComplete?.();}
    catch{setError(lo?'ບໍ່ສາມາດເປີດເຕັມຈໍໄດ້. ລອງເປີດແອັບໃນ Chrome.':'Fullscreen is unavailable here. Try opening the app in Chrome.');}
    finally{pendingRef.current=false;setPending(false);}
  }}>{active?<Minimize size={17}/>:<Maximize size={17}/>}<span>{active?(lo?'ອອກຈາກເຕັມຈໍ':'Exit fullscreen'):(lo?'ເຕັມຈໍ':'Full screen')}</span></button>{error&&<p role="alert">{error}</p>}</div>;
}
