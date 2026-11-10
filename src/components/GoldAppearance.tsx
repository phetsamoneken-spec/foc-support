import {useSyncExternalStore} from 'react';
const key='mkt-beerlao-gold-ui-v1',eventName='mkt-appearance-change';
let volatilePreference=true;
const read=()=>{try{const saved=localStorage.getItem(key);return saved===null?volatilePreference:saved!=='off';}catch{return volatilePreference;}};
const subscribe=(listener:()=>void)=>{window.addEventListener(eventName,listener);window.addEventListener('storage',listener);return()=>{window.removeEventListener(eventName,listener);window.removeEventListener('storage',listener);};};
export function setGoldAppearance(enabled:boolean){volatilePreference=enabled;try{localStorage.setItem(key,enabled?'on':'off');}catch{}window.dispatchEvent(new Event(eventName));}
export function useGoldAppearance(){return useSyncExternalStore(subscribe,read,()=>true);}
