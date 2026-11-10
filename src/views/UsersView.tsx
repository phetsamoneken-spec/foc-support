import {isSupabaseBackend} from '../config/supabase';
import React, { useRef, useState } from 'react';
import {ModalLayer} from '../components/ModalLayer';
import {EmployeePortraitEditor} from '../components/EmployeePortraitEditor';
import {EmployeeAvatar} from '../components/EmployeeAvatar';
import {
  UserCog,
  Plus,
  Shield,
  User,
  KeyRound,
  CheckCircle2,
  XCircle,
  History,
  AlertCircle,
  Search,
  Lock,
  Edit2,
  RotateCcw,
  Eye,
  EyeOff,
  Copy,
  Check,
  Info,
  Trash2,
  X
} from 'lucide-react';
import { storage } from '../services/storage';
import { translations, Language } from '../locales/translations';
import { Team, TEAMS, User as UserType, UserRole } from '../types';

export const UsersView: React.FC = () => {
  const settings = storage.getSettings();
  const lang: Language = settings.language;
  const t = translations[lang];

  const [activeTab, setActiveTab] = useState<'USERS' | 'ACTIVITY_LOG'>('USERS');
  const [users, setUsers] = useState<UserType[]>(storage.getUsers());
  const [logs, setLogs] = useState(storage.getLogs(150));
  const [searchQuery, setSearchQuery] = useState('');
  const [teamFilter, setTeamFilter] = useState<Team | 'ALL'>('ALL');
  const [sheetUsername, setSheetUsername] = useState('admin');
  const [sheetPassword, setSheetPassword] = useState('');
  const [accountBusy, setAccountBusy] = useState(false);
  const [connected, setConnected] = useState(storage.hasRemoteUserSession());
  const [showPasswords, setShowPasswords] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Add User State
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('TEAM_USER');
  const [newTeam, setNewTeam] = useState<Team>('B1');
  const [newEmail, setNewEmail] = useState('');
  const [addError, setAddError] = useState<string | null>(null);

  // Edit User State
  const [editingUser, setEditingUser] = useState<UserType | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('TEAM_USER');
  const [editTeam, setEditTeam] = useState<Team>('B1');
  const [editEmail, setEditEmail] = useState('');
  const [editIsActive, setEditIsActive] = useState(true);
  const [editError, setEditError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [adding,setAdding]=useState(false),[portraitBusy,setPortraitBusy]=useState(false);
  const editFlight=useRef(false),addFlight=useRef(false);

  // Notification Banner
  const [alertMessage, setAlertMessage] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);

  const refreshUsers = () => {
    setUsers(storage.getUsers());
  };

  const handleOpenEdit = (u: UserType) => {
    setEditingUser(u);
    setEditFullName(u.fullName);
    setEditUsername(u.username);
    setEditPassword(settings.appsScriptUrl ? '' : (u.password || `${u.username}_123`));
    setEditRole(u.role);
    setEditTeam(u.team === 'ALL' ? 'B1' : u.team);
    setEditEmail(u.email || '');
    setEditIsActive(u.isActive);
    setEditError(null);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser || editFlight.current || portraitBusy) return;
    editFlight.current=true;
    setEditError(null);
    setSavingEdit(true);

    const res = await storage.updateUser(editingUser.id, {
      fullName: editFullName.trim(),
      username: editUsername.trim(),
      password: editPassword,
      role: editRole,
      team: editRole === 'ADMIN' ? 'ALL' : editTeam,
      email: editEmail.trim(),
      isActive: editIsActive
    });
    editFlight.current=false;setSavingEdit(false);

    if (res.success) {
      refreshUsers();
      setEditingUser(null);
      setAlertMessage({
        text: `ອັບເດດຂໍ້ມູນ ${editUsername} ສຳເລັດແລ້ວ!`,
        type: 'success'
      });
      setTimeout(() => setAlertMessage(null), 3500);
    } else {
      setEditError(res.message);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if(addFlight.current)return;addFlight.current=true;setAdding(true);
    setAddError(null);

    const res = await storage.addUser({
      username: newUsername.trim(),
      password: settings.appsScriptUrl ? newPassword : (newPassword.trim() || `${newUsername.trim()}_123`),
      fullName: newFullName.trim(),
      role: newRole,
      team: newRole === 'ADMIN' ? 'ALL' : newTeam,
      email: newEmail.trim()
    });

    addFlight.current=false;setAdding(false);
    if (res.success) {
      refreshUsers();
      setShowAddUserModal(false);
      setNewUsername('');
      setNewPassword('');
      setNewFullName('');
      setNewEmail('');
      setAlertMessage({
        text: `ສ້າງບັນຊີຜູ້ໃຊ້ງານ ${newUsername} ສຳເລັດແລ້ວ!`,
        type: 'success'
      });
      setTimeout(() => setAlertMessage(null), 3500);
    } else {
      setAddError(res.message);
    }
  };

  const handleResetPassword = async (u: UserType) => {
    const defaultPw = settings.appsScriptUrl ? window.prompt('New password (8–72 characters)') : `${u.username}_123`;
    if (!defaultPw) return;
    const res = await storage.resetUserPassword(u.id, defaultPw);
    if (res.success) {
      refreshUsers();
      setAlertMessage({
        text: settings.appsScriptUrl ? `Password for ${u.username} saved securely to USERS` : `ຣີເຊັດລະຫັດຜ່ານຂອງ ${u.username} ເປັນ "${defaultPw}" ສຳເລັດແລ້ວ!`,
        type: 'success'
      });
      setTimeout(() => setAlertMessage(null), 4000);
    } else { setAlertMessage({text:res.message,type:'error'}); }
  };

  const handleToggleStatus = async (u: UserType) => {
    const res = await storage.updateUser(u.id, { isActive: !u.isActive });
    refreshUsers();
    setAlertMessage({text:res.message,type:res.success ? 'success' : 'error'});
  };

  const handleDeleteUser = async (u: UserType) => {
    if (confirm(`ທ່ານແນ່ໃຈບໍ່ວ່າຕ້ອງການລຶບບັນຊີ ${u.username} (${u.fullName})?`)) {
      const res = await storage.deleteUser(u.id);
      if (res.success) {
        refreshUsers();
        setAlertMessage({
          text: `ລຶບບັນຊີ ${u.username} ສຳເລັດແລ້ວ`,
          type: 'info'
        });
        setTimeout(() => setAlertMessage(null), 3000);
      } else {
        alert(res.message);
      }
    }
  };

  const copyCredentials = (u: UserType) => {
    const pw = u.password || `${u.username}_123`;
    const text = `Username: ${u.username}\n${settings.appsScriptUrl ? "" : `Password: ${pw}\n`}Role: ${u.role === 'ADMIN' ? 'Admin' : `Team ${u.team}`}`;
    navigator.clipboard.writeText(text);
    setCopiedId(u.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Filtered users
  const filteredUsers = users.filter((u) => {
    const matchesTeam = teamFilter === 'ALL' || u.role === 'ADMIN' || u.team === teamFilter;
    const q = searchQuery.toLowerCase();
    const matchesQuery =
      !q ||
      u.username.toLowerCase().includes(q) ||
      u.fullName.toLowerCase().includes(q) ||
      (u.email && u.email.toLowerCase().includes(q)) ||
      u.team.toLowerCase().includes(q);
    return matchesTeam && matchesQuery;
  });

  const sheetOperation = async (operation: () => Promise<{success:boolean;message?:string}>) => {
    if (accountBusy) return;
    setAccountBusy(true);
    try {
      const result = await operation();
      setConnected(storage.hasRemoteUserSession());
      refreshUsers();
      setAlertMessage({text:result.message || (result.success ? 'Connected to Sheets' : 'Operation failed'),type:result.success ? 'success' : 'error'});
      if (result.success) setSheetPassword('');
    } finally { setAccountBusy(false); }
  };

  return (
    <div className="employee-view space-y-6">
      {settings.appsScriptUrl && <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
        <h3 className="font-bold text-slate-900">User accounts → {isSupabaseBackend(settings.appsScriptUrl)?'Supabase Auth':'Google Sheet USERS'}</h3>
        {isSupabaseBackend(settings.appsScriptUrl)?<p className="text-xs text-slate-600">{lang==='lo'?'ບັນຊີຜູ້ໃຊ້ບັນທຶກໃນ Supabase Auth. Admin ສາມາດເພີ່ມ, ແກ້ໄຂ, ປິດບັນຊີ ແລະກຳນົດທີມໄດ້.':'Accounts are stored in Supabase Auth. Admin can create, edit, disable accounts and assign teams.'}</p>:<p className="text-xs text-slate-600">{lang === 'lo' ? 'ເຂົ້າລະບົບ backend ດ້ວຍ Admin ກ່ອນ. ກົດ Sync Users ເພື່ອຍ້າຍບັນຊີເກົ່າໃນ browser ໄປ Sheet. ຫຼັງຈາກນັ້ນການເພີ່ມ/ແກ້ User ຈະຂຽນລົງ Sheet ໂດຍກົງ.' : 'Sign in as a backend Admin. Sync Users migrates this browser’s accounts to Sheets. Subsequent user changes are written directly to Sheets.'}</p>}
        {!connected && <div className="flex flex-wrap gap-2">
          <input aria-label="Sheet admin username" value={sheetUsername} onChange={e=>setSheetUsername(e.target.value)} className="rounded-xl border p-2 text-slate-900" />
          <input aria-label="Sheet admin password" type="password" value={sheetPassword} onChange={e=>setSheetPassword(e.target.value)} className="rounded-xl border p-2 text-slate-900" />
          <button type="button" disabled={accountBusy} onClick={()=>sheetOperation(()=>storage.login(sheetUsername,sheetPassword))} className="rounded-xl bg-blue-600 px-4 py-2 text-white">Sign in to Sheets</button>
        </div>}
        {connected && <div className="flex flex-wrap gap-2">
          {!isSupabaseBackend(settings.appsScriptUrl)&&<button type="button" disabled={accountBusy} onClick={()=>sheetOperation(()=>storage.syncUsersToSheets())} className="rounded-xl bg-emerald-600 px-4 py-2 text-white">Sync Users → Sheet</button>}
          <button type="button" disabled={accountBusy} onClick={()=>sheetOperation(()=>storage.loadUsersFromSheets())} className="rounded-xl border px-4 py-2 text-slate-800">Reload users</button>
        </div>}
        {accountBusy && <p role="status" className="text-xs text-blue-700">Saving user accounts…</p>}
      </section>}
      
      {/* Alert Notification */}
      {alertMessage && (
        <div
          className={`p-4 rounded-2xl border text-xs font-semibold flex items-center justify-between shadow-md transition-all ${
            alertMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-blue-50 text-blue-800 border-blue-200'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600" />
            <span>{alertMessage.text}</span>
          </div>
          <button
            onClick={() => setAlertMessage(null)}
            className="text-slate-400 hover:text-slate-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Guide Banner for Admin & Team Login */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-blue-950 rounded-3xl p-6 text-white shadow-xl border border-slate-700/60">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0 text-amber-400">
            <KeyRound className="w-6 h-6" />
          </div>
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-400/20 text-amber-300 border border-amber-400/30 uppercase tracking-wide">
                Admin Guide
              </span>
              <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
                ວິທີແກ້ໄຂຂໍ້ມູນ Admin ແລະ ຈັດການ Login ຂອງທີມງານ B1 - B7
              </h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed max-w-3xl">
              ທ່ານສາມາດແກ້ໄຂຊື່, username, ລະຫັດຜ່ານ, ແລະ ສິດທີມງານໄດ້ທຸກຄົນ. ທີມງານແຕ່ລະຄົນ (B1–B7) ເມື່ອ Login ແລ້ວ ຈະເຂົ້າເບິ່ງໄດ້ສະເພາະລູກຄ້າ ແລະ ງົບປະມານຂອງທີມຕົນເອງເທົ່ານັ້ນ.
            </p>
            <div className="pt-2 grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
              <div className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/70">
                <span className="text-[10px] uppercase font-bold text-amber-400 block mb-0.5">
                  1. ແກ້ໄຂບັນຊີ Admin
                </span>
                <span className="text-slate-300 text-[11px]">
                  ກົດປຸ່ມ <strong className="text-white">"ແກ້ໄຂ"</strong> ຢູ່ແຖວ <span className="font-mono text-amber-300">admin</span> ເພື່ອປ່ຽນຊື່, username ຫຼື ຕັ້ງລະຫັດຜ່ານໃໝ່
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/70">
                <span className="text-[10px] uppercase font-bold text-blue-400 block mb-0.5">
                  2. Login ຂອງທີມ B1 - B7
                </span>
                <span className="text-slate-300 text-[11px]">
                  Username ເລີ່ມຕົ້ນ: <span className="font-mono text-blue-300">b1_user</span>, <span className="font-mono text-blue-300">b2_user</span>... (ລະຫັດ: <span className="font-mono text-blue-300">CHANGE_ME_TEAM_B1_PASSWORD</span>)
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/70">
                <span className="text-[10px] uppercase font-bold text-emerald-400 block mb-0.5">
                  3. ກ໊ອບປີ້ & ແຈ້ງທີມງານ
                </span>
                <span className="text-slate-300 text-[11px]">
                  ກົດປຸ່ມ <strong className="text-white">ກ໊ອບປີ້</strong> (Copy) ເພື່ອຄັດລອກ Username ແລະ ລະຫັດຜ່ານສົ່ງໃຫ້ຫົວໜ້າທີມໄດ້ທັນທີ
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Tabs and Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        {/* Tab Buttons */}
        <div className="bg-white p-1.5 rounded-2xl shadow-xs border border-slate-200 flex items-center gap-1.5">
          <button
            onClick={() => setActiveTab('USERS')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeTab === 'USERS'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <User className="w-4 h-4" />
            <span>ບັນຊີຜູ້ໃຊ້ງານ (Users)</span>
            <span className="px-1.5 py-0.2 rounded-full bg-blue-500/20 text-blue-400 text-[10px]">
              {users.length}
            </span>
          </button>

          <button
            onClick={() => {
              setActiveTab('ACTIVITY_LOG');
              setLogs(storage.getLogs(150));
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeTab === 'ACTIVITY_LOG'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <History className="w-4 h-4" />
            <span>ປະຫວັດລະບົບ (Activity Log)</span>
            <span className="px-1.5 py-0.2 rounded-full bg-slate-200 text-slate-700 text-[10px]">
              {logs.length}
            </span>
          </button>
        </div>

        {/* Action Controls */}
        {activeTab === 'USERS' && (
          <div className="flex items-center gap-2">
            <button
              disabled={!!settings.appsScriptUrl} title={settings.appsScriptUrl ? "Passwords are hashed in Sheets and cannot be retrieved" : undefined}
              onClick={() => setShowPasswords(!showPasswords)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border transition cursor-pointer ${
                showPasswords
                  ? 'bg-amber-50 text-amber-800 border-amber-300'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
              
            >
              {showPasswords ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              <span>{showPasswords ? 'ເຊື່ອງລະຫັດຜ່ານ' : 'ສະແດງລະຫັດຜ່ານ'}</span>
            </button>

            <button
              onClick={() => setShowAddUserModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-xl transition cursor-pointer shadow-md shadow-blue-600/20 active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>ເພີ່ມຜູ້ໃຊ້ງານໃໝ່</span>
            </button>
          </div>
        )}
      </div>

      {/* Users Tab View */}
      {activeTab === 'USERS' && (
        <div className="space-y-4">
          
          {/* Filters: Search & Team Filter */}
          <div className="bg-white p-3.5 rounded-2xl shadow-xs border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ຄົ້ນຫາຊື່, username, ອີເມວ..."
                className="w-full pl-9 pr-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-900"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="text-xs font-semibold text-slate-500">ທີມ:</span>
              <select
                value={teamFilter}
                onChange={(e) => setTeamFilter(e.target.value as Team | 'ALL')}
                className="px-3 py-2 text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                <option value="ALL">ທຸກທີມ (All Teams)</option>
                {TEAMS.map((tm) => (
                  <option key={tm} value={tm}>ທີມ {tm}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Users Table */}
          <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
            <div className="employee-table-wrap overflow-x-auto">
              <table className="employee-table w-full text-left text-xs border-collapse" data-employee-table="true">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <th className="py-3.5 px-4">ຊື່ເຂົ້າໃຊ້ (Username)</th>
                    <th className="py-3.5 px-4">ຊື່ ແລະ ນາມສະກຸນ</th>
                    <th className="py-3.5 px-3">ບົດບາດ (Role)</th>
                    <th className="py-3.5 px-3">ທີມທີ່ຮັບຜິດຊອບ</th>
                    <th className="py-3.5 px-4">ລະຫັດຜ່ານ (Password)</th>
                    <th className="py-3.5 px-4">ອີເມວ</th>
                    <th className="py-3.5 px-3">ເຂົ້າສູ່ລະບົບລ່າສຸດ</th>
                    <th className="py-3.5 px-3 text-center">ສະຖານະ</th>
                    <th className="py-3.5 px-4 text-right">ຈັດການ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-800">
                  {filteredUsers.map((u) => {
                    const isAdmin = u.role === 'ADMIN';
                    const userPw = settings.appsScriptUrl ? 'Stored as hash in USERS' : (u.password || `${u.username}_123`);

                    return (
                      <tr key={u.id} className="hover:bg-slate-50/80 transition">
                        {/* Username */}
                        <td data-label="ຊື່ເຂົ້າໃຊ້" className="py-3.5 px-4">
                          <div className="employee-identity flex items-center gap-2"><EmployeeAvatar user={u} compact/>
                            <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200">
                              {u.username}
                            </span>
                          </div>
                        </td>

                        {/* Full Name */}
                        <td data-label="ຊື່ພະນັກງານ" className="py-3.5 px-4 font-semibold text-slate-900">
                          {u.fullName}
                        </td>

                        {/* Role */}
                        <td data-label="ບົດບາດ" className="py-3.5 px-3">
                          {isAdmin ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                              <Shield className="w-3 h-3 text-amber-700" />
                              <span>Admin</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                              <User className="w-3 h-3 text-blue-600" />
                              <span>Team User</span>
                            </span>
                          )}
                        </td>

                        {/* Team */}
                        <td data-label="ທີມ" className="py-3.5 px-3">
                          <span className={`px-2.5 py-0.5 rounded-md font-bold text-xs ${
                            u.team === 'ALL'
                              ? 'bg-amber-50 text-amber-900 border border-amber-200'
                              : 'bg-slate-100 text-slate-800 border border-slate-200'
                          }`}>
                            {u.team === 'ALL' ? 'B1–B7' : `ທີມ ${u.team}`}
                          </span>
                        </td>

                        {/* Password */}
                        <td data-label="ລະຫັດຜ່ານ" className="py-3.5 px-4 font-mono">
                          <div className="flex items-center gap-1.5">
                            <span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${
                              showPasswords ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-slate-100 text-slate-600'
                            }`}>
                              {showPasswords ? userPw : '••••••••'}
                            </span>
                            <button
                              onClick={() => copyCredentials(u)}
                              className="p-1 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition cursor-pointer"
                              title={settings.appsScriptUrl ? "Copy username and role" : "Copy username and password"}
                            >
                              {copiedId === u.id ? (
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </td>

                        {/* Email */}
                        <td data-label="ອີເມວ" className="py-3.5 px-4 text-slate-500 font-mono text-[11px]">
                          {u.email || '-'}
                        </td>

                        {/* Last Login */}
                        <td data-label="ເຂົ້າລະບົບລ່າສຸດ" className="py-3.5 px-3 text-slate-500 text-[11px] whitespace-nowrap">
                          {u.lastLogin || '-'}
                          {u.updatedAt&&<span className="block text-[10px] text-slate-500">{lang==='lo'?'ແກ້ໄຂ:':'Edited:'} {new Date(u.updatedAt).toLocaleString(lang==='lo'?'lo-LA':'en-GB',{timeZone:'Asia/Bangkok'})}</span>}
                        </td>

                        {/* Status */}
                        <td data-label="ສະຖານະ" className="py-3.5 px-3 text-center">
                          {u.isActive ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>Active</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                              <XCircle className="w-3 h-3 text-rose-600" />
                              <span>Disabled</span>
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td data-label="ຈັດການ" className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Edit Button */}
                            <button
                              onClick={() => handleOpenEdit(u)}
                              className="px-2.5 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50 border border-blue-200 rounded-lg transition cursor-pointer flex items-center gap-1"
                              title="ແກ້ໄຂຂໍ້ມູນບັນຊີ ແລະ ລະຫັດຜ່ານ"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                              <span>ແກ້ໄຂ</span>
                            </button>

                            {/* Reset Password */}
                            <button
                              onClick={() => handleResetPassword(u)}
                              className="p-1 text-xs font-semibold text-slate-500 hover:text-amber-600 hover:bg-amber-50 border border-slate-200 rounded-lg transition cursor-pointer"
                              title={settings.appsScriptUrl ? 'ຕັ້ງລະຫັດຜ່ານໃໝ່ໃນ Sheet' : `ຣີເຊັດລະຫັດຜ່ານເປັນ ${u.username}_123`}
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>

                            {/* Disable / Enable (Not allowed on main admin) */}
                            {u.username !== 'admin' && (
                              <button
                                onClick={() => handleToggleStatus(u)}
                                className={`px-2 py-1 text-xs font-semibold rounded-lg transition cursor-pointer ${
                                  u.isActive
                                    ? 'text-rose-600 hover:bg-rose-50 border border-rose-200'
                                    : 'text-emerald-600 hover:bg-emerald-50 border border-emerald-200'
                                }`}
                              >
                                {u.isActive ? 'ປິດ' : 'ເປີດ'}
                              </button>
                            )}

                            {/* Delete (non-admin only) */}
                            {u.username !== 'admin' && (
                              <button
                                onClick={() => handleDeleteUser(u)}
                                className="p-1 text-rose-500 hover:bg-rose-50 border border-rose-200 rounded-lg transition cursor-pointer"
                                title="ລຶບບັນຊີນີ້"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Activity Log Tab Content */}
      {activeTab === 'ACTIVITY_LOG' && (
        <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center text-xs">
            <span className="text-slate-700 font-semibold">
              ບັນທຶກການເຄື່ອນໄຫວລະບົບ (Real-Time Audit Trail):
            </span>
            <span className="text-slate-400 font-mono text-[11px]">Real-time Event Log</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-3">User</th>
                  <th className="py-3 px-2">Role</th>
                  <th className="py-3 px-3">Action</th>
                  <th className="py-3 px-4">Audit Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50 transition">
                    <td className="py-2.5 px-4 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                      {log.timestamp}
                    </td>
                    <td className="py-2.5 px-3 font-bold text-slate-900">
                      {log.user}
                    </td>
                    <td className="py-2.5 px-2">
                      <span className="px-1.5 py-0.5 rounded-sm text-[10px] font-bold bg-slate-100 text-slate-600">
                        {log.role}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-blue-700 whitespace-nowrap">
                      {log.action}
                    </td>
                    <td className="py-2.5 px-4 text-slate-700">
                      {log.details}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* EDIT USER MODAL */}
      {editingUser && (
        <ModalLayer label="ແກ້ໄຂຂໍ້ມູນພະນັກງານ" locked={savingEdit||portraitBusy} onClose={()=>setEditingUser(null)}>
          <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-6 py-5 bg-gradient-to-r from-slate-900 to-blue-950 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-500/40 flex items-center justify-center text-blue-300">
                  <UserCog className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-white">ແກ້ໄຂຂໍ້ມູນບັນຊີຜູ້ໃຊ້</h3>
                  <p className="text-xs text-blue-200">
                    ID: {editingUser.id} • {editingUser.username}
                  </p>
                </div>
              </div>
              <button
                disabled={savingEdit||portraitBusy}
                onClick={() => setEditingUser(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-6 space-y-4">
              <EmployeePortraitEditor user={editingUser} onBusyChange={setPortraitBusy}/>
              {editError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{editError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  ຊື່ ແລະ ນາມສະກຸນ (Full Name) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  ຊື່ເຂົ້າສູ່ລະບົບ (Username) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  ລະຫັດຜ່ານໃໝ່ (Password)
                </label>
                <input
                  type="password"
                  required={!settings.appsScriptUrl}
                  placeholder={settings.appsScriptUrl ? 'ປະຫວ່າງເພື່ອໃຊ້ລະຫັດເດີມ' : ''}
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-900"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  ຕັ້ງລະຫັດຜ່ານໃໝ່ທີ່ຕ້ອງການໃຫ້ຜູ້ໃຊ້ນີ້ໃຊ້ Login
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    ບົດບາດ (Role)
                  </label>
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value as UserRole)}
                    className="w-full px-3.5 py-2.5 text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  >
                    <option value="TEAM_USER">Team User</option>
                    <option value="ADMIN">Admin (ທຸກທີມ)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    ທີມທີ່ຮັບຜິດຊອບ
                  </label>
                  {editRole === 'ADMIN' ? (
                    <div className="px-3.5 py-2.5 bg-slate-100 rounded-xl text-xs font-bold text-slate-600 border border-slate-200">
                      ທຸກທີມ (ALL)
                    </div>
                  ) : (
                    <select
                      value={editTeam}
                      onChange={(e) => setEditTeam(e.target.value as Team)}
                      className="w-full px-3.5 py-2.5 text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                    >
                      {TEAMS.map((tm) => (
                        <option key={tm} value={tm}>ທີມ {tm}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  ອີເມວ (Email)
                </label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-900"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="editIsActive"
                  checked={editIsActive}
                  onChange={(e) => setEditIsActive(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded-sm cursor-pointer"
                />
                <label htmlFor="editIsActive" className="text-xs font-semibold text-slate-700 cursor-pointer">
                  ເປີດໃຊ້ງານບັນຊີນີ້ (Active Account)
                </label>
              </div>

              <div className="pt-4 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  disabled={savingEdit||portraitBusy}
                onClick={() => setEditingUser(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                >
                  ຍົກເລີກ
                </button>
                <button
                  type="submit"
                  disabled={savingEdit||portraitBusy}
                  className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-xl transition cursor-pointer shadow-md shadow-blue-600/20 active:scale-95"
                >
                  {savingEdit ? 'ກຳລັງບັນທຶກ…' : 'ບັນທຶກການແກ້ໄຂ'}
                </button>
              </div>
            </form>
          </div>
        </ModalLayer>
      )}

      {/* ADD USER MODAL */}
      {showAddUserModal && (
        <ModalLayer label="ເພີ່ມພະນັກງານ" locked={adding} onClose={()=>setShowAddUserModal(false)}>
          <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-6 py-5 bg-gradient-to-r from-slate-900 to-blue-950 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-500/40 flex items-center justify-center text-blue-300">
                  <UserCog className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-white">ເພີ່ມບັນຊີຜູ້ໃຊ້ງານໃໝ່</h3>
                  <p className="text-xs text-blue-200">ກຳນົດສິດທີມ B1 - B7 ຫຼື Admin</p>
                </div>
              </div>
              <button
                disabled={adding}
                onClick={() => setShowAddUserModal(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddUser} className="p-6 space-y-4">
              {addError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{addError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  ຊື່ ແລະ ນາມສະກຸນ (Full Name) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="ຕົວຢ່າງ: ສຸລິຍາ ມະນີວົງ"
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  ຊື່ເຂົ້າສູ່ລະບົບ (Username) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. b2_leader"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  ລະຫັດຜ່ານ (Password)
                </label>
                <input
                  type="password"
                  required={!!settings.appsScriptUrl}
                  minLength={settings.appsScriptUrl ? 8 : undefined}
                  placeholder={settings.appsScriptUrl ? 'ລະຫັດຜ່ານ 8–72 ຕົວອັກສອນ' : 'ຖ້າປະຫວ່າງ ຈະເປັນ: [username]_123'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    ບົດບາດ (Role)
                  </label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as UserRole)}
                    className="w-full px-3.5 py-2.5 text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  >
                    <option value="TEAM_USER">Team User</option>
                    <option value="ADMIN">Admin (ທຸກທີມ)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    ທີມທີ່ຮັບຜິດຊອບ
                  </label>
                  {newRole === 'ADMIN' ? (
                    <div className="px-3.5 py-2.5 bg-slate-100 rounded-xl text-xs font-bold text-slate-600 border border-slate-200">
                      ທຸກທີມ (ALL)
                    </div>
                  ) : (
                    <select
                      value={newTeam}
                      onChange={(e) => setNewTeam(e.target.value as Team)}
                      className="w-full px-3.5 py-2.5 text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                    >
                      {TEAMS.map((tm) => (
                        <option key={tm} value={tm}>ທີມ {tm}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  ອີເມວ (Email)
                </label>
                <input
                  type="email"
                  placeholder="name@example.invalid"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-900"
                />
              </div>

              <div className="pt-4 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  disabled={adding}
                onClick={() => setShowAddUserModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                >
                  ຍົກເລີກ
                </button>
                <button
                  type="submit"
                  disabled={adding}
                  className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-xl transition cursor-pointer shadow-md shadow-blue-600/20 active:scale-95"
                >
                  {adding?'ກຳລັງບັນທຶກ…':'ເພີ່ມຜູ້ໃຊ້ງານ'}
                </button>
              </div>
            </form>
          </div>
        </ModalLayer>
      )}

    </div>
  );
};
