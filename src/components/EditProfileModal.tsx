import React, { useRef, useState } from 'react';
import {ModalLayer} from './ModalLayer';
import {EmployeePortraitEditor} from './EmployeePortraitEditor';
import { X, User, Lock, Mail, CheckCircle2, Shield, AlertCircle } from 'lucide-react';
import { storage } from '../services/storage';
import { User as UserType } from '../types';

interface EditProfileModalProps {
  onClose: () => void;
  onSuccess?: () => void;
}

export const EditProfileModal: React.FC<EditProfileModalProps> = ({ onClose, onSuccess }) => {
  const currentUser = storage.getCurrentUser();
  const [fullName, setFullName] = useState(currentUser?.fullName || '');
  const [username, setUsername] = useState(currentUser?.username || '');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState(currentUser?.email || '');
  const [error, setError] = useState<string | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [saving,setSaving]=useState(false),[portraitBusy,setPortraitBusy]=useState(false);
  const flight=useRef(false);

  if (!currentUser) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if(flight.current||portraitBusy)return;
    setError(null);

    if (!username.trim()) {
      setError('ກະລຸນາປ້ອນຊື່ຜູ້ໃຊ້ງານ (Username is required)');
      return;
    }
    if (!fullName.trim()) {
      setError('ກະລຸນາປ້ອນຊື່ ແລະ ນາມສະກຸນ (Full Name is required)');
      return;
    }

    flight.current=true;setSaving(true);
    const res = await storage.updateOwnProfile({
      fullName: fullName.trim(),
      username: username.trim(),
      password: password || undefined,
      email: email.trim() || undefined
    });

    flight.current=false;setSaving(false);
    if (res.success) {
      setSavedSuccess(true);
      setTimeout(() => {
        if (onSuccess) onSuccess();
        onClose();
      }, 900);
    } else {
      setError(res.message);
    }
  };

  return (
    <ModalLayer label="ແກ້ໄຂໂປຣໄຟລ໌" locked={saving||portraitBusy||savedSuccess} onClose={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95">
        
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-slate-900 to-blue-950 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-500/40 flex items-center justify-center text-blue-300">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">ແກ້ໄຂຂໍ້ມູນບັນຊີສ່ວນຕົວ</h3>
              <p className="text-xs text-blue-200">
                {currentUser.role === 'ADMIN' ? 'ຜູ້ເບິ່ງແຍງລະບົບ (Admin)' : `ທີມງານ ${currentUser.team}`}
              </p>
            </div>
          </div>
          <button
            disabled={saving||portraitBusy||savedSuccess}
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <EmployeePortraitEditor user={currentUser} onBusyChange={setPortraitBusy}/>
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {savedSuccess && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>ບັນທຶກຂໍ້ມູນສຳເລັດແລ້ວ!</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              ຊື່ ແລະ ນາມສະກຸນ (Full Name) <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="ຕົວຢ່າງ: ສຸລິຍາ ມະນີວົງ"
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
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin, b1_user..."
              className="w-full px-3.5 py-2.5 text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-900"
            />
            <p className="text-[11px] text-slate-400 mt-1">ໃຊ້ສຳລັບ Login ເຂົ້າສູ່ລະບົບ</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              ລະຫັດຜ່ານໃໝ່ (Password)
            </label>
            <div className="relative">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="ປະຫວ່າງເພື່ອໃຊ້ລະຫັດເດີມ"
                className="w-full px-3.5 py-2.5 text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-900"
              />
            </div>
            <p className="text-[11px] text-slate-400 mt-1">ລະຫັດຜ່ານທີ່ໃຊ້ເຂົ້າສູ່ລະບົບ</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              ອີເມວ (Email)
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@example.invalid"
              className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-900"
            />
          </div>

          <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
            <button
              type="button"
              disabled={saving||portraitBusy||savedSuccess}
            onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
            >
              ຍົກເລີກ
            </button>
            <button
              type="submit"
              disabled={savedSuccess||saving||portraitBusy}
              className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-xl transition cursor-pointer shadow-md shadow-blue-600/20 active:scale-95 disabled:opacity-50"
            >
              {saving?'ກຳລັງບັນທຶກ…':'ບັນທຶກການແກ້ໄຂ'}
            </button>
          </div>
        </form>

      </div>
    </ModalLayer>
  );
};
