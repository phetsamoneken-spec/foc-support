import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, CheckCircle, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface Props {
  language?: 'lo' | 'en';
  onOpenGuide?: () => void;
}

export const PWAInstallButton: React.FC<Props> = ({ language = 'lo',onOpenGuide }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const guideRef=useRef<HTMLDivElement>(null);

  useEffect(()=>{
    if(!showIOSGuide||isInstalled)return;
    let previousOverflow:string|undefined,previousFocus:HTMLElement|null=null;
    // Let the navigation finish closing before the guide takes focus and scroll lock.
    const frame=window.requestAnimationFrame(()=>{
      previousOverflow=document.body.style.overflow;
      previousFocus=document.activeElement as HTMLElement|null;
      document.body.style.overflow='hidden';
      guideRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    });
    const onKeyDown=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();setShowIOSGuide(false);}
      if(event.key!=='Tab')return;
      const buttons=guideRef.current?.querySelectorAll<HTMLButtonElement>('button');
      if(!buttons?.length)return;
      const first=buttons[0],last=buttons[buttons.length-1];
      if(event.shiftKey&&(document.activeElement===first||!guideRef.current?.contains(document.activeElement))){event.preventDefault();event.stopImmediatePropagation();last.focus();}
      else if(!event.shiftKey&&(document.activeElement===last||!guideRef.current?.contains(document.activeElement))){event.preventDefault();event.stopImmediatePropagation();first.focus();}
    };
    document.addEventListener('keydown',onKeyDown,true);
    return ()=>{
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown',onKeyDown,true);
      if(previousOverflow!==undefined)document.body.style.overflow=previousOverflow;
      if(previousFocus?.isConnected&&!previousFocus.closest('[inert]'))previousFocus.focus();
    };
  },[showIOSGuide,isInstalled]);

  // If already installed, show small badge
  if (isInstalled) {
    return (
      <div className="flex w-full items-center justify-center gap-2 px-3 py-2.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl">
        <CheckCircle className="h-4 w-4 shrink-0" />
        <span className="whitespace-nowrap">{language === 'lo' ? 'ຕິດຕັ້ງແລ້ວ' : 'PWA Installed'}</span>
      </div>
    );
  }

  // Chromium / Android / Desktop flow
  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 transition cursor-pointer active:scale-95"
      >
        <Download className="h-4 w-4 shrink-0" />
        <span className="whitespace-nowrap">{language === 'lo' ? 'ຕິດຕັ້ງແອັບ' : 'Install App'}</span>
      </button>
    );
  }

  // iOS Safari flow
  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => {setShowIOSGuide(true);onOpenGuide?.();}}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition cursor-pointer"
        >
          <Smartphone className="h-4 w-4 shrink-0 text-blue-600" />
          <span className="whitespace-nowrap">{language === 'lo' ? 'ຕິດຕັ້ງເທິງ iPhone' : 'Install on iOS'}</span>
        </button>

        {showIOSGuide && createPortal(
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
            <div ref={guideRef} role="dialog" aria-modal="true" aria-labelledby="pwa-install-guide-title" className="max-h-[calc(100dvh_-_2rem)] w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl border border-slate-100">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 id="pwa-install-guide-title" className="text-base font-bold text-slate-900">
                  {language === 'lo' ? 'ວິທີຕິດຕັ້ງແອັບເທິງ iPhone / iPad' : 'Install on iPhone / iPad'}
                </h3>
                <button
                  type="button"
                  aria-label={language==='lo'?'ປິດຄຳແນະນຳ':'Close installation guide'}
                  onClick={() => setShowIOSGuide(false)}
                  className="text-slate-400 hover:text-slate-600 p-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="mt-4 space-y-3 text-sm text-slate-600">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-xs">
                    1
                  </div>
                  <p>
                    {language === 'lo'
                      ? 'ກົດປຸ່ມ Share (ແບ່ງປັນ) ທີ່ແຖບລຸ່ມຂອງ Safari'
                      : 'Tap the Share icon at the bottom of Safari'}
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-xs">
                    2
                  </div>
                  <p>
                    {language === 'lo'
                      ? 'ເລື່ອນລົງແລ້ວກົດເລືອກ "Add to Home Screen" (ເພີ່ມໃສ່ໜ້າຈໍຫຼັກ)'
                      : 'Scroll down and tap "Add to Home Screen"'}
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-xs">
                    3
                  </div>
                  <p>
                    {language === 'lo'
                      ? 'ກົດ "Add" ຢູ່ມຸມຂວາເທິງ ເພື່ອສຳເລັດການຕິດຕັ້ງ'
                      : 'Tap "Add" in the top-right corner to complete'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-6 w-full rounded-xl bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 transition"
              >
                {language === 'lo' ? 'ເຂົ້າໃຈແລ້ວ' : 'Got it'}
              </button>
            </div>
          </div>,document.body
        )}
      </>
    );
  }

  return null;
};
