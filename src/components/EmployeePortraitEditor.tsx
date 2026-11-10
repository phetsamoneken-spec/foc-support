import React,{useEffect,useRef,useState} from 'react';
import {Camera,LoaderCircle,Trash2,CheckCircle2} from 'lucide-react';
import type {User} from '../types';
import {storage} from '../services/storage';
import {isSupabaseBackend} from '../config/supabase';
import {savePortrait,deletePortrait} from '../services/employeePortraits';
import {drawPortrait,type PortraitCrop} from '../services/portraitCrop';
import {announceSaveSuccess} from '../services/saveNotifications';
import {useEmployeePortrait} from '../hooks/useEmployeePortrait';
import {EmployeeAvatar} from './EmployeeAvatar';

export function EmployeePortraitEditor({user,onBusyChange}:{user:User;onBusyChange?:(busy:boolean)=>void}){
 const lo=storage.getSettings().language==='lo',endpoint=storage.getSettings().appsScriptUrl,actor=storage.getCurrentUser();
 const allowed=isSupabaseBackend(endpoint)&&Boolean(actor&&(actor.role==='ADMIN'||actor.id===user.id));
 const existing=useEmployeePortrait(user.id),canvas=useRef<HTMLCanvasElement>(null),fileInput=useRef<HTMLInputElement>(null),flight=useRef(false),mounted=useRef(true);
 const [image,setImage]=useState<HTMLImageElement|null>(null),[crop,setCrop]=useState<PortraitCrop>({zoom:1,x:50,y:20});
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{if(image&&canvas.current)drawPortrait(canvas.current,image,crop);},[image,crop]);
 if(!allowed)return null;
 const working=(value:boolean)=>{flight.current=value;if(mounted.current)setBusy(value);onBusyChange?.(value);};
 const select=async(file?:File)=>{
  if(!file||flight.current)return;
  setError('');setSaved(false);
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024*1024){setError(lo?'ເລືອກຮູບ JPG, PNG ຫຼື WebP ຂະໜາດບໍ່ເກີນ 10 MB.':'Choose a JPG, PNG or WebP image up to 10 MB.');return;}
  working(true);const url=URL.createObjectURL(file);
  try{const source=new Image();source.src=url;await source.decode();if(source.naturalWidth<80||source.naturalHeight<80||source.naturalWidth*source.naturalHeight>40000000)throw Error(lo?'ເລືອກຮູບທີ່ຊັດເຈນ ແລະຂະໜາດບໍ່ເກີນ 40 ລ້ານພິກເຊວ.':'Use a clear photo between 80 pixels and 40 megapixels.');if(mounted.current){setImage(source);setCrop({zoom:1,x:50,y:20});}}
  catch(e){if(mounted.current)setError(e instanceof Error?e.message:'Could not open this image.');}
  finally{URL.revokeObjectURL(url);working(false);}
 };
 const commit=async(remove=false)=>{
  if(flight.current)return;working(true);setError('');setSaved(false);
  try{
   if(remove)await deletePortrait(endpoint,user.id);
   else{if(!canvas.current||!image)throw Error('Choose a photo first.');const blob=await new Promise<Blob|null>(resolve=>canvas.current!.toBlob(resolve,'image/jpeg',.85));if(!blob)throw Error('Could not prepare this photo.');await savePortrait(endpoint,user.id,blob);}
   if(mounted.current){setImage(null);setSaved(true);}if(actor)announceSaveSuccess(actor.id);
  }catch(e){if(mounted.current)setError(e instanceof Error?e.message:String(e));}
  finally{working(false);}
 };
 return <section className="employee-portrait-editor" aria-label={lo?'ຮູບພະນັກງານ':'Employee photo'}>
  <div className="portrait-editor-heading"><EmployeeAvatar user={user}/><div><h4>{lo?'ຮູບໂປຣໄຟລ໌ພະນັກງານ':'Employee profile photo'}</h4><p>{lo?'ປັບຮູບໃຫ້ເຫັນຫົວເຖິງເອິກ':'Frame the head, shoulders and upper chest'}</p></div></div>
  <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" aria-label={lo?'ເລືອກຮູບພະນັກງານ':'Choose employee photo'} disabled={busy} onChange={event=>{void select(event.target.files?.[0]);event.target.value='';}}/>
  <div className="portrait-editor-actions"><button type="button" disabled={busy} onClick={()=>fileInput.current?.click()}><Camera size={17}/>{lo?'ເລືອກຮູບ':'Choose photo'}</button>{existing&&!image&&<button type="button" disabled={busy} onClick={()=>{if(confirm(lo?'ລົບຮູບໂປຣໄຟລ໌ນີ້ບໍ?':'Remove this profile photo?'))void commit(true);}}><Trash2 size={17}/>{lo?'ລົບຮູບ':'Remove photo'}</button>}</div>
  {image&&<div className="portrait-crop-controls"><div className="portrait-crop-preview"><canvas ref={canvas} width={320} height={320} role="img" aria-label={lo?'ຕົວຢ່າງຮູບທີ່ຈະບັນທຶກ':'Preview of the saved portrait'}/><span aria-hidden="true"/></div><p>{lo?'ເລື່ອນຮູບ ແລະຊູມໃຫ້ຫົວຢູ່ກາງວົງ. ຮູບທີ່ເຫັນນີ້ຈະຖືກບັນທຶກ.':'Move and zoom until the head and upper chest fit inside the circle. This preview is the photo that will be saved.'}</p>
   {(['zoom','x','y'] as const).map(axis=><label key={axis}>{axis==='zoom'?(lo?'ຊູມ':'Zoom'):axis==='x'?(lo?'ຊ້າຍ / ຂວາ':'Left / right'):(lo?'ເທິງ / ລຸ່ມ':'Up / down')}<input type="range" min={axis==='zoom'?1:0} max={axis==='zoom'?3:100} step={axis==='zoom'?.05:1} value={crop[axis]} disabled={busy} onChange={event=>setCrop(value=>({...value,[axis]:Number(event.target.value)}))}/></label>)}
   <div className="portrait-editor-actions"><button type="button" className="portrait-save" disabled={busy} onClick={()=>void commit()}>{busy?<LoaderCircle size={17} className="gold-loading-spinner"/>:<CheckCircle2 size={17}/>} {busy?(lo?'ກຳລັງບັນທຶກ…':'Saving…'):(lo?'ບັນທຶກຮູບ':'Save photo')}</button><button type="button" disabled={busy} onClick={()=>setImage(null)}>{lo?'ຍົກເລີກຮູບ':'Cancel photo'}</button></div>
  </div>}
  {busy&&!image&&<p role="status">{lo?'ກຳລັງດຳເນີນການ…':'Working…'}</p>}{saved&&<p role="status" className="portrait-saved">{lo?'ບັນທຶກຮູບສຳເລັດແລ້ວ':'Photo saved successfully'}</p>}{error&&<p role="alert" className="portrait-error">{error}</p>}
 </section>;
}
