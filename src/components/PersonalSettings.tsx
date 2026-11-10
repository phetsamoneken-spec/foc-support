import React, {useState} from 'react';
import {UserRound, ShieldCheck, LogOut, ChevronRight} from 'lucide-react';
import {storage} from '../services/storage';
import {EditProfileModal} from './EditProfileModal';
import {PWAInstallButton} from './PWAInstallButton';
import {EmployeeAvatar} from './EmployeeAvatar';
import {APP_VERSION} from '../services/appUpdates';
export function PersonalSettings(){
  const [editing,setEditing]=useState(false),user=storage.getCurrentUser(),lo=storage.getSettings().language==='lo';
  return <section className="space-y-4"><div><p className="gold-eyebrow">MKT BUDGET</p><h2 className="text-xl font-bold">{lo?'ການຕັ້ງຄ່າ':'Settings'}</h2></div>
    <div className="gold-card p-5 flex items-center gap-3"><EmployeeAvatar user={user}/><div className="min-w-0"><h3 className="font-bold break-words">{user?.fullName}</h3><p className="text-sm text-slate-500">{user?.username} · {user?.team}</p></div></div>
    <div className="gold-card p-4 space-y-3"><button type="button" className="gold-settings-row" onClick={()=>setEditing(true)}><UserRound size={20}/><span>{lo?'ໂປຣໄຟລ໌ ແລະລະຫັດຜ່ານ':'Profile & password'}</span><ChevronRight size={18}/></button>
    <p className="text-xs flex gap-2 text-slate-600"><ShieldCheck size={18} className="shrink-0"/>{lo?`ສິດການໃຊ້ງານ: ທີມ ${user?.team}`:`Access: Team ${user?.team}`}</p><PWAInstallButton language={lo?'lo':'en'}/></div>
    <button type="button" className="gold-settings-row gold-card text-red-700 p-4 w-full" onClick={()=>storage.logout()}><LogOut size={20}/><span>{lo?'ອອກຈາກລະບົບ':'Log out'}</span></button><p className="text-xs text-slate-500 text-center">MKT Budget · v{APP_VERSION}</p>
    {editing&&<EditProfileModal onClose={()=>setEditing(false)}/>}
  </section>;
}
