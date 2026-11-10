import {useEffect,useRef} from 'react';
/** Keyboard and scroll behavior shared by the existing entry forms. */
export function useModalDialog(onDismiss:()=>void,locked=false,open=true){
  const ref=useRef<HTMLDivElement>(null),latest=useRef({onDismiss,locked});latest.current={onDismiss,locked};
  useEffect(()=>{
    if(!open)return;
    const previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    const focusable=()=>Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]')||[]).filter(el=>el.getClientRects().length>0);
    const frame=requestAnimationFrame(()=>focusable()[0]?.focus());
    const onKey=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(!latest.current.locked)latest.current.onDismiss();}
      if(event.key!=='Tab')return;
      const nodes=focusable(),first=nodes[0],last=nodes[nodes.length-1];
      if(!first){event.preventDefault();return;}
      if(event.shiftKey&&(document.activeElement===first||!ref.current?.contains(document.activeElement))){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&(document.activeElement===last||!ref.current?.contains(document.activeElement))){event.preventDefault();first.focus();}
    };
    document.addEventListener('keydown',onKey,true);
    return()=>{cancelAnimationFrame(frame);document.removeEventListener('keydown',onKey,true);document.body.style.overflow=overflow;if(previous?.isConnected&&!previous.closest('[inert]'))previous.focus();};
  },[open]);
  return ref;
}
