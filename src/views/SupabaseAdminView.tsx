import React from 'react';
import {storage} from '../services/storage';
export function SupabaseAdminView({view}:{view:'users'|'settings'}){
  const users=storage.getUsers();
  return <section className="rounded-2xl border bg-white p-5 space-y-4">
    <h2 className="text-xl font-bold">{view==='users'?'ບັນຊີຜູ້ໃຊ້':'ການເຊື່ອມຕໍ່ Supabase'}</h2>
    <p className="text-sm text-slate-600">{view==='users'?'ການສ້າງບັນຊີ ແລະກຳນົດສິດໃຊ້ Supabase Authentication ແລະ profile ທີ່ Admin ອະນຸມັດ.':'ແອັບອ່ານ ແລະບັນທຶກຜ່ານ Supabase. ການນຳເຂົ້າຂໍ້ມູນເກົ່າ ແລະປ່ຽນຄ່າສ່ວນກາງຍັງຕ້ອງຜ່ານການກວດສອບຂອງ Admin.'}</p>
    {view==='users'&&<table className="w-full text-left text-sm"><thead><tr><th>Username</th><th>Role</th><th>Team</th><th>Status</th></tr></thead><tbody>{users.map(u=><tr key={u.id}><td className="py-2">{u.username}</td><td>{u.role}</td><td>{u.team}</td><td>{u.isActive?'Active':'Inactive'}</td></tr>)}</tbody></table>}
    <a className="inline-block text-blue-700 underline" target="_blank" rel="noreferrer" href="https://supabase.com/dashboard/project/itenbxivivbffsjvhduh/auth/users">ເປີດ Supabase Dashboard</a>
  </section>;
}
