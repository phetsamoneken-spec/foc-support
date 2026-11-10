import React,{useLayoutEffect} from 'react';
import {createPortal} from 'react-dom';
import {useModalDialog} from '../hooks/useModalDialog';

/** Account dialogs live outside the scrolling app so Android cannot clip them. */
export function ModalLayer({children,label,onClose,locked=false}:{children:React.ReactNode;label:string;onClose:()=>void;locked?:boolean}){
  const ref=useModalDialog(onClose,locked);
  useLayoutEffect(()=>{
    const app=document.getElementById('root');
    if(!app)return;
    const previous=app.inert;app.inert=true;
    return()=>{app.inert=previous;};
  },[]);
  return createPortal(<div ref={ref} role="dialog" aria-modal="true" aria-label={label} aria-busy={locked} className="beerlao-gold mkt-overlay-layer account-dialog-layer">{children}</div>,document.body);
}
