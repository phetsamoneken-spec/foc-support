import {useSyncExternalStore} from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt:()=>Promise<void>;
  userChoice:Promise<{outcome:'accepted'|'dismissed';platform:string}>;
}
const hasWindow=typeof window!=='undefined';
const userAgent=hasWindow?navigator.userAgent.toLowerCase():'';
const isIOS=/iphone|ipad|ipod/.test(userAgent)||(hasWindow&&/macintosh/.test(userAgent)&&navigator.maxTouchPoints>1);
const displayMode=hasWindow?window.matchMedia('(display-mode: standalone)'):null;
const fullscreenMode=hasWindow?window.matchMedia('(display-mode: fullscreen)'):null;
// A native fullscreen PWA is installed; fullscreen requested by a browser tab is not.
const installedDisplay=()=>Boolean(displayMode?.matches||(fullscreenMode?.matches&&hasWindow&&!document.fullscreenElement)||(hasWindow&&(navigator as Navigator&{standalone?:boolean}).standalone));
let installationAcknowledged=installedDisplay();
let deferredPrompt:BeforeInstallPromptEvent|null=null;
let inFlight:Promise<boolean>|null=null;
let state={isInstalled:installationAcknowledged,isIOS,isAndroid:/android/.test(userAgent),isInstallable:false,isInstalling:false,installFailed:false};
const listeners=new Set<()=>void>();
const publish=(changes:Partial<typeof state>)=>{state={...state,...changes};listeners.forEach(listener=>listener());};

// The prompt belongs to the app, so signing in or changing screens cannot lose it.
if(hasWindow){
  window.addEventListener('beforeinstallprompt',(event:Event)=>{
    event.preventDefault();deferredPrompt=event as BeforeInstallPromptEvent;
    publish({isInstallable:true,installFailed:false});
  });
  window.addEventListener('appinstalled',()=>{installationAcknowledged=true;deferredPrompt=null;publish({isInstalled:true,isInstallable:false,installFailed:false});});
  const syncDisplay=()=>publish({isInstalled:installationAcknowledged||installedDisplay()});
  displayMode?.addEventListener?.('change',syncDisplay);
  fullscreenMode?.addEventListener?.('change',syncDisplay);
}
const subscribe=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};};
const getSnapshot=()=>state;
async function install(){
  if(inFlight)return inFlight;
  const prompt=deferredPrompt;if(!prompt||state.isInstalling)return false;
  deferredPrompt=null;publish({isInstalling:true,isInstallable:false,installFailed:false});
  const operation=(async()=>{
    try{
      await prompt.prompt();const {outcome}=await prompt.userChoice;
      if(outcome==='accepted'){installationAcknowledged=true;publish({isInstalled:true});return true;}
      return false;
    }catch{publish({installFailed:true});return false;}
    finally{publish({isInstalling:false});}
  })();
  inFlight=operation;
  try{return await operation;}finally{if(inFlight===operation)inFlight=null;}
}
export function usePWAInstall(){
  const snapshot=useSyncExternalStore(subscribe,getSnapshot,getSnapshot);
  return {...snapshot,install};
}
