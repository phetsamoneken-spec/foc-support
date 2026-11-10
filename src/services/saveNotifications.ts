export interface SaveNotification {id:number;actorId:string;}
const listeners=new Set<(notification:SaveNotification)=>void>();
let sequence=0;

export function subscribeToSaveSuccess(listener:(notification:SaveNotification)=>void){
  listeners.add(listener);
  return ()=>{listeners.delete(listener);};
}

// Emit only after an acknowledged save has passed its response validation.
export function announceSaveSuccess(actorId:string){
  const notification={id:++sequence,actorId};
  listeners.forEach(listener=>listener(notification));
}
