import React, { useState, useRef } from 'react';
import {useModalDialog} from '../hooks/useModalDialog';
import {ActionButton} from '../components/ActionButton';
import {
  X,
  UserPlus,
  Building2,
  Package,
  Calendar,
  Wallet
} from 'lucide-react';
import { storage } from '../services/storage';
import { translations, Language } from '../locales/translations';
import { Team, TEAMS } from '../types';

interface AddCustomerModalProps {
  initialCustomerCode?:string;
  onClose: () => void;
  onSuccess: () => void;
}

export const AddCustomerModal: React.FC<AddCustomerModalProps> = ({
  initialCustomerCode,
  onClose,
  onSuccess
}) => {
  const editing=Boolean(initialCustomerCode),existing=initialCustomerCode?storage.getCustomerByCode(initialCustomerCode):undefined;
  const previousCondition=initialCustomerCode?storage.getCustomerCondition(initialCustomerCode):undefined;
  const previousContract=initialCustomerCode?storage.getActiveContract(initialCustomerCode):undefined;
  const previousBudget=initialCustomerCode?storage.getBudgetForCustomer(initialCustomerCode):undefined;
  const currentUser = storage.getCurrentUser();
  const settings = storage.getSettings();
  const lang: Language = settings.language;
  const t = translations[lang];

  const isAdmin = currentUser?.role === 'ADMIN';
  const userTeam: Team = currentUser?.team && currentUser.team !== 'ALL' ? (currentUser.team as Team) : 'B1';
  const [team, setTeam] = useState<Team>(existing?.team||userTeam);
  const [code, setCode] = useState(existing?.code||`CUST-${userTeam}-${Date.now().toString().slice(-4)}`);
  const [name, setName] = useState(existing?.name||'');
  const [phone, setPhone] = useState(existing?.phone||'');
  const [province, setProvince] = useState(existing?(existing.province||''):'ນະຄອນຫຼວງວຽງຈັນ (Vientiane Capital)');
  const [address, setAddress] = useState(existing?.address||'');

  const pricePerCrate = settings.pricePerCrate || 240000;

  // Condition fields
  const [conditionQty, setConditionQty] = useState<number>(previousCondition?.conditionQuantity??125);
  const [conditionUOM, setConditionUOM] = useState(previousCondition?.conditionUOM||'Cartons');
  const [conditionProductDescription, setConditionProductDescription] = useState(previousCondition?.conditionProductDescription||'Beerlao Lager Can 330ml x 24');

  // Contract & Budget
  const [commencingOn, setCommencingOn] = useState(previousContract?.commencingOn||'2026-01-01');
  const [expiringOn, setExpiringOn] = useState(previousContract?.expiringOn||'2026-12-31');
  const [annualBudget, setAnnualBudget] = useState<number>(previousBudget?.annualAmount??125*pricePerCrate);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleTeamChange = (newTeam: Team) => {
    setTeam(newTeam);
    if(!editing)setCode(`CUST-${newTeam}-${Date.now().toString().slice(-4)}`);
  };

  const handleQtyChange = (qty: number) => {
    setConditionQty(qty);
    setAnnualBudget(qty * pricePerCrate);
  };

  const savingRef=useRef(false);
  const [isSaving,setIsSaving]=useState(false);
  const modalRef=useModalDialog(onClose,isSaving);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if(savingRef.current)return;
    setErrorMessage(null);

    savingRef.current=true;
    setIsSaving(true);
    const payload:Record<string,unknown>={
      code,
      name,
      team,
      conditionQty,
      conditionUOM,
      conditionProductDescription,
      commencingOn,
      expiringOn,
      annualBudget,
      phone,
      address,
      province
    };
    if(editing&&!isAdmin)for(const key of ['conditionQty','conditionUOM','conditionProductDescription','commencingOn','expiringOn','annualBudget'])delete payload[key];
    let res:{success:boolean;message?:string};
    try {res=await storage.commitBusinessChange(editing?'UPDATE_CUSTOMER':'ADD_CUSTOMER',payload);}
    catch(error){res={success:false,message:error instanceof Error?error.message:String(error)};}
    finally{savingRef.current=false;setIsSaving(false);}
    if (res.success) {
      onSuccess();
    } else {
      setErrorMessage(res.message || (lang==='lo'?'ບໍ່ສາມາດບັນທຶກໄດ້':'Unable to save'));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div ref={modalRef} role="dialog" aria-modal="true" aria-label={lang==='lo'?'ເພີ່ມລູກຄ້າ':'Add customer'} className="w-full max-w-2xl rounded-3xl bg-white shadow-2xl border border-slate-100 overflow-hidden my-8 animate-in fade-in zoom-in-95">
        
        {/* Header */}
        <div className="bg-slate-900 p-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center">
              <UserPlus className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                {editing?(lang==='lo'?'ແກ້ໄຂຂໍ້ມູນຮ້ານ':'Edit store'):(lang === 'lo' ? 'ເພີ່ມຮ້ານໃໝ່ (Add Store / Customer)' : t.addNewCustomer)}
              </h3>
              <p className="text-[11px] text-slate-400">
                {lang === 'lo' ? 'ເພີ່ມຂໍ້ມູນຮ້ານໃໝ່ພ້ອມເງື່ອນໄຂສິນຄ້າ ແລະ ຮອບສັນຍາ' : 'Register New Customer Account & Contract Conditions'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label={lang==='lo'?'ປິດ':'Close'}
            disabled={isSaving}
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          
          {errorMessage && (
            <div role="alert" className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
              {errorMessage}
            </div>
          )}

          {/* Basic Info */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t.team} <span className="text-rose-500">*</span>
              </label>
              {isAdmin ? (
                <select
                  required
                  value={team}
                  onChange={(e) => handleTeamChange(e.target.value as Team)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {TEAMS.map((tm) => (
                    <option key={tm} value={tm}>
                      Team {tm} (MDE-{tm})
                    </option>
                  ))}
                </select>
              ) : (
                <div className="w-full p-2.5 bg-blue-50/70 border border-blue-200 rounded-xl text-xs font-bold text-blue-900 flex items-center justify-between">
                  <span>Team {team} (MDE-{team})</span>
                  <span className="text-[10px] bg-blue-200/60 text-blue-800 px-2 py-0.5 rounded-md">
                    {lang === 'lo' ? 'ທີມຂອງທ່ານ' : 'Your Team'}
                  </span>
                </div>
              )}
            </div>

            <div>
              <label htmlFor="addcustomermodal-field-1" className="block text-xs font-semibold text-slate-700 mb-1">
                {t.customerCode} <span className="text-rose-500">*</span>
              </label>
              <input id="addcustomermodal-field-1"
                type="text"
                required
                readOnly={editing}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label htmlFor="addcustomermodal-field-2" className="block text-xs font-semibold text-slate-700 mb-1">
                {lang === 'lo' ? 'ເບີໂທລະສັບ' : 'Phone'}
              </label>
              <input id="addcustomermodal-field-2"
                type="text"
                placeholder="+856 20 ..."
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label htmlFor="addcustomermodal-field-3" className="block text-xs font-semibold text-slate-700 mb-1">
              {t.customerName} <span className="text-rose-500">*</span>
            </label>
            <input id="addcustomermodal-field-3"
              type="text"
              required
              placeholder={lang === 'lo' ? 'ເຊັ່ນ: ຮ້ານອາຫານ ດາວເຮືອງ ສາຂາ 1' : 'Customer / Store name'}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Condition Info */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
              <Package className="w-4 h-4 text-emerald-600" />
              <span>{lang === 'lo' ? 'ເງື່ອນໄຂສັນຍາ (Contract Conditions)' : 'Contract Conditions'}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label htmlFor="addcustomermodal-field-4" className="block text-xs font-semibold text-slate-700 mb-1">
                  {t.conditionProduct} <span className="text-rose-500">*</span>
                </label>
                <input id="addcustomermodal-field-4"
                  type="text"
                  required
                  disabled={editing&&!isAdmin}
                  value={conditionProductDescription}
                  onChange={(e) => setConditionProductDescription(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t.conditionQty} & {t.conditionUOM}
                </label>
                <div className="flex gap-1.5">
                  <input
                    type="number"
                    required
                    min={editing?0:1}
                    disabled={editing&&!isAdmin}
                    value={conditionQty}
                    onChange={(e) => handleQtyChange(Number(e.target.value))}
                    className="w-2/3 p-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900"
                  />
                  <input
                    type="text"
                    required
                    disabled={editing&&!isAdmin}
                    value={conditionUOM}
                    onChange={(e) => setConditionUOM(e.target.value)}
                    className="w-1/3 p-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Contract Dates & Initial Budget */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="addcustomermodal-field-5" className="block text-xs font-semibold text-slate-700 mb-1">
                {t.commencingOn} <span className="text-rose-500">*</span>
              </label>
              <input id="addcustomermodal-field-5"
                type="date"
                required
                readOnly={editing}
                  value={commencingOn}
                onChange={(e) => setCommencingOn(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-900"
              />
            </div>

            <div>
              <label htmlFor="addcustomermodal-field-6" className="block text-xs font-semibold text-slate-700 mb-1">
                {t.expiringOn} <span className="text-rose-500">*</span>
              </label>
              <input id="addcustomermodal-field-6"
                type="date"
                required
                readOnly={editing}
                  value={expiringOn}
                onChange={(e) => setExpiringOn(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-900"
              />
            </div>

            <div>
              <label htmlFor="addcustomermodal-field-7" className="block text-xs font-semibold text-slate-700 mb-1">
                {t.annualBudget} ({settings.currencySymbol}) <span className="text-rose-500">*</span>
              </label>
              <input id="addcustomermodal-field-7"
                type="number"
                required
                min="0"
                step="any"
                disabled={editing&&!isAdmin}
                    value={annualBudget}
                onChange={(e) => setAnnualBudget(Number(e.target.value))}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900"
              />
              <span className="text-[10px] text-emerald-700 font-mono mt-1 block">
                {conditionQty} {conditionUOM || 'ລັງ'} × {storage.formatCurrency(pricePerCrate)} = {storage.formatCurrency(annualBudget)}
              </span>
            </div>
          </div>

          {/* Buttons */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
            >
              {t.cancel}
            </button>
            <ActionButton
              type="submit"
              loading={isSaving} loadingLabel={lang==='lo'?'ກຳລັງບັນທຶກ…':'Saving…'}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md shadow-blue-600/30 transition cursor-pointer active:scale-95"
            >
              {lang === 'lo' ? 'ບັນທຶກລູກຄ້າໃໝ່' : 'Register Customer'}
            </ActionButton>
          </div>

        </form>

      </div>
    </div>
  );
};
