import React, { useState } from 'react';
import {
  X,
  CalendarCheck,
  Calendar,
  Wallet,
  Building2,
  Info,
  CheckCircle2
} from 'lucide-react';
import { storage } from '../services/storage';
import { translations, Language } from '../locales/translations';

interface AddContractModalProps {
  initialCustomerCode?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export const AddContractModal: React.FC<AddContractModalProps> = ({
  initialCustomerCode,
  onClose,
  onSuccess
}) => {
  const currentUser = storage.getCurrentUser();
  const settings = storage.getSettings();
  const lang: Language = settings.language;
  const t = translations[lang];

  const availableCustomers = storage.getCustomers('ALL');
  const [customerCode, setCustomerCode] = useState(
    initialCustomerCode || (availableCustomers[0]?.code ?? '')
  );

  const pricePerCrate = settings.pricePerCrate || 240000;
  const initialCond = (initialCustomerCode || availableCustomers[0]?.code)
    ? storage.getCustomerCondition(initialCustomerCode || availableCustomers[0]?.code)
    : null;
  const initialQty = initialCond?.conditionQuantity || 125;

  // Default contract dates: e.g. next 1-year cycle
  const [commencingOn, setCommencingOn] = useState('2026-11-01');
  const [expiringOn, setExpiringOn] = useState('2027-10-31');
  const [annualBudget, setAnnualBudget] = useState<number>(storage.usesSupabase?0:initialQty * pricePerCrate);
  const [notes, setNotes] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedCustomer = storage.getCustomerByCode(customerCode);
  const selectedCond = customerCode ? storage.getCustomerCondition(customerCode) : null;
  const existingContracts = selectedCustomer ? storage.getCustomerContracts(selectedCustomer.code) : [];
  const nextCycle = existingContracts.length + 1;

  const handleCustomerChange = (newCode: string) => {
    setCustomerCode(newCode);
    const cond = storage.getCustomerCondition(newCode);
    const qty = cond?.conditionQuantity || 125;
    if(!storage.usesSupabase)setAnnualBudget(qty * pricePerCrate);
  };

  const [isSaving,setIsSaving]=useState(false);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if(isSaving)return;
    setErrorMessage(null);

    if (!customerCode) {
      setErrorMessage('Please select a customer');
      return;
    }

    if (new Date(expiringOn).getTime() <= new Date(commencingOn).getTime()) {
      setErrorMessage(
        lang === 'lo'
          ? 'ວັນສິ້ນສຸດ Expiring On ຕ້ອງຢູ່ຫຼັງວັນເລີ່ມຕົ້ນ Commencing On'
          : 'Expiring date must be after commencing date'
      );
      return;
    }

    setIsSaving(true);
    const res = await storage.commitBusinessChange('NEW_CONTRACT',{
      customerCode,
      commencingOn,
      expiringOn,
      annualBudget: Number(annualBudget) || 0,
      notes
    });

    setIsSaving(false);
    if (res.success) {
      onSuccess();
    } else {
      setErrorMessage(res.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="w-full max-w-lg rounded-3xl bg-white shadow-2xl border border-slate-100 overflow-hidden my-8 animate-in fade-in zoom-in-95">
        
        {/* Header */}
        <div className="bg-slate-900 p-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center">
              <CalendarCheck className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                {t.addNewContract}
              </h3>
              <p className="text-[11px] text-slate-400">
                {lang === 'lo' ? 'ສ້າງຮອບສັນຍາ ແລະ ງົບປະມານໃໝ່ (Cycle Renewal)' : 'New Annual Contract Cycle & Budget Activation'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-900">
            <span className="font-bold">{lang === 'lo' ? 'ຮອບສັນຍາທີ່ຈະສ້າງ:' : 'Target Cycle:'}</span>{' '}
            <span className="font-mono font-bold text-blue-700">Cycle #{nextCycle}</span>
            <p className="mt-0.5 text-blue-800 text-[11px]">
              {lang === 'lo'
                ? 'ປະຫວັດສັນຍາ ແລະ ລາຍຈ່າຍຮອບເກົ່າຈະຍັງຄົງຢູ່ຄົບຖ້ວນໃນລະບົບ.'
                : 'All previous contract periods and transaction history remain fully preserved.'}
            </p>
          </div>

          {/* Customer Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {t.customerName} <span className="text-rose-500">*</span>
            </label>
            <select
              required
              value={customerCode}
              onChange={(e) => handleCustomerChange(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {availableCustomers.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} - {c.name} ({c.team})
                </option>
              ))}
            </select>
          </div>

          {/* Contract Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t.commencingOn} <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                required
                value={commencingOn}
                onChange={(e) => setCommencingOn(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t.expiringOn} <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                required
                value={expiringOn}
                onChange={(e) => setExpiringOn(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Annual Budget Amount */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {t.annualBudget} ({settings.currencySymbol}) <span className="text-rose-500">*</span>
            </label>
            <input
              type="number"
              required
              min="0"
              step="any"
              value={annualBudget}
              onChange={(e) => setAnnualBudget(Number(e.target.value))}
              className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-[10px] text-emerald-700 font-mono mt-1 block">
              {selectedCond?.conditionQuantity || 125} {selectedCond?.conditionUOM || 'ລັງ'} × {storage.formatCurrency(pricePerCrate)} = {storage.formatCurrency(annualBudget)}
            </span>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {lang === 'lo' ? 'ໝາຍເຫດສັນຍາ' : 'Contract Notes / Reference'}
            </label>
            <input
              type="text"
              placeholder={lang === 'lo' ? 'ເຊັ່ນ: ຕໍ່ສັນຍາຮອບປີ 2026-2027...' : 'e.g. Annual renewal agreement 2026-2027...'}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
            >
              {t.cancel}
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md shadow-blue-600/30 transition cursor-pointer active:scale-95"
            >
              {lang === 'lo' ? 'ບັນທຶກສັນຍາຮອບໃໝ່' : 'Activate New Cycle'}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
