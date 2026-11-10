import React, { useState, useRef } from 'react';
import {useModalDialog} from '../hooks/useModalDialog';
import {ActionButton} from '../components/ActionButton';
import {
  X,
  PlusCircle,
  AlertTriangle,
  ReceiptText,
  Calendar,
  Wallet,
  Building2,
  FileText,
  ShieldAlert
} from 'lucide-react';
import { businessToday } from '../services/annualBudgets';
import { storage } from '../services/storage';
import { translations, Language } from '../locales/translations';
import { Team, TransactionCategory } from '../types';

interface AddTransactionModalProps {
  initialCustomerCode?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export const AddTransactionModal: React.FC<AddTransactionModalProps> = ({
  initialCustomerCode,
  onClose,
  onSuccess
}) => {
  const currentUser = storage.getCurrentUser();
  const settings = storage.getSettings();
  const lang: Language = settings.language;
  const t = translations[lang];
  const isAdmin = currentUser?.role === 'ADMIN';

  // Available customers for current user's team
  const availableCustomers = storage.getCustomers('ALL');

  const [customerCode, setCustomerCode] = useState(
    initialCustomerCode || (availableCustomers[0]?.code ?? '')
  );
  const [category, setCategory] = useState<TransactionCategory>('POSM / Signboard');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [invoiceRef, setInvoiceRef] = useState('');
  const [date, setDate] = useState(businessToday());

  // Admin Exception Authorization
  const [allowException, setAllowException] = useState(false);
  const [exceptionReason, setExceptionReason] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedCustomer = storage.getCustomerByCode(customerCode);
  const activeContract = selectedCustomer ? storage.getContractForDate(selectedCustomer.code,date) : undefined;
  const budget = activeContract ? storage.getContractBudget(activeContract.id,date,false) : undefined;

  const numAmount = Number(amount) || 0;
  const remainingBudget = budget?.remainingAmount || 0;
  const projectedRemaining = remainingBudget - numAmount;
  const isOverBudget = projectedRemaining < 0;

  const categories: TransactionCategory[] = [
    'POSM / Signboard',
    'Event & Sponsorship',
    'Trade Promotion',
    'Sampling & Activation',
    'Rebate & Discount',
    'Media & Digital',
    'Customer Incentive',
    'Other'
  ];

  const savingRef=useRef(false);
  const [isSaving,setIsSaving]=useState(false);
  const modalRef=useModalDialog(onClose,isSaving);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if(savingRef.current)return;
    setErrorMessage(null);

    if (!customerCode) {
      setErrorMessage(lang === 'lo' ? 'ກະລຸນາເລືອກລູກຄ້າ' : 'Please select a customer');
      return;
    }

    if (numAmount <= 0) {
      setErrorMessage(lang === 'lo' ? 'ຈຳນວນເງິນຕ້ອງຫຼາຍກວ່າ 0' : 'Amount must be greater than zero');
      return;
    }

    if (isOverBudget && !isAdmin && !allowException) {
      setErrorMessage(
        lang === 'lo'
          ? `ຍອດເງິນເກີນງົບປະມານຍັງເຫຼືອ! ຍັງເຫຼືອພຽງ ${storage.formatCurrency(remainingBudget)}. ຕ້ອງໃຫ້ Admin ອະນຸມັດພິເສດ.`
          : `Amount exceeds remaining budget of ${storage.formatCurrency(remainingBudget)}. Admin exception required.`
      );
      return;
    }

    if(!budget){setErrorMessage(lang==='lo'?'ວັນທີລາຍຈ່າຍຢູ່ນອກໄລຍະສັນຍາ':'Transaction date is outside the contract');return;}

    savingRef.current=true;
    setIsSaving(true);
    let res:{success:boolean;message?:string};
    try {
      res = await storage.commitBusinessChange('ADD_TRANSACTION',{
      customerCode,
      category,
      description,
      amount: numAmount,
      invoiceRef,
      date,
      allowException: isAdmin ? allowException : false,
      exceptionReason: allowException ? exceptionReason : undefined
    });
    } catch (error) {res={success:false,message:error instanceof Error?error.message:String(error)};} finally {savingRef.current=false;setIsSaving(false);}

    if (res.success) {
      onSuccess();
    } else {
      setErrorMessage(res.message || (lang==='lo'?'ບໍ່ສາມາດບັນທຶກໄດ້':'Unable to save'));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div ref={modalRef} role="dialog" aria-modal="true" aria-label={t.newTransaction} className="w-full max-w-xl rounded-3xl bg-white shadow-2xl border border-slate-100 overflow-hidden my-8 animate-in fade-in zoom-in-95">
        
        {/* Header */}
        <div className="bg-slate-900 p-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center">
              <ReceiptText className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                {t.newTransaction}
              </h3>
              <p className="text-[11px] text-slate-400">
                {lang === 'lo' ? 'ບັນທຶກການເບີກຈ່າຍງົບປະມານການຕະຫຼາດ' : 'Record Marketing Budget Expenditure'}
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
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {budget?.periodStart && <p className="rounded-xl bg-blue-50 p-3 text-xs text-blue-800" data-testid="transaction-budget-period">
            {lang==='lo'?'ງົບປະມານປີທີ':'Budget year'} {budget.periodNumber}: {budget.periodStart} → {budget.periodEnd}
          </p>}
          
          {errorMessage && (
            <div role="alert" className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Customer Selection */}
          <div>
            <label htmlFor="addtransactionmodal-field-1" className="block text-xs font-semibold text-slate-700 mb-1">
              {t.customerName} <span className="text-rose-500">*</span>
            </label>
            <select id="addtransactionmodal-field-1"
              required
              value={customerCode}
              onChange={(e) => setCustomerCode(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {availableCustomers.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} - {c.name} ({c.team})
                </option>
              ))}
            </select>
          </div>

          {/* Real-Time Budget Status Box */}
          {budget && (
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-slate-500">{t.remainingBudget}:</span>
                <p className="text-sm font-black text-emerald-600 mt-0.5">
                  {storage.formatCurrency(budget.remainingAmount)}
                </p>
                <span className="text-[10px] text-slate-400">
                  {lang === 'lo' ? 'ຈາກງົບລວມ' : 'From total'} {storage.formatCurrency(budget.annualAmount)}
                </span>
              </div>

              <div>
                <span className="text-slate-500">{lang === 'lo' ? 'ຍອດເຫຼືອຄາດຄະເນ:' : 'Projected Balance:'}</span>
                <p className={`text-sm font-black mt-0.5 ${projectedRemaining < 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                  {storage.formatCurrency(projectedRemaining)}
                </p>
                {projectedRemaining < 0 && (
                  <span className="text-[10px] font-bold text-rose-600">
                    {lang === 'lo' ? '⚠️ ເກີນງົບປະມານ!' : '⚠️ Over-budget!'}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Category & Amount */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="addtransactionmodal-field-2" className="block text-xs font-semibold text-slate-700 mb-1">
                {t.category} <span className="text-rose-500">*</span>
              </label>
              <select id="addtransactionmodal-field-2"
                required
                value={category}
                onChange={(e) => setCategory(e.target.value as TransactionCategory)}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="addtransactionmodal-field-3" className="block text-xs font-semibold text-slate-700 mb-1">
                {t.amount} ({settings.currencySymbol}) <span className="text-rose-500">*</span>
              </label>
              <input id="addtransactionmodal-field-3"
                type="number"
                required
                min="0"
                step="any"
                placeholder="e.g. 15,000,000"
                value={amount}
                onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label htmlFor="addtransactionmodal-field-4" className="block text-xs font-semibold text-slate-700 mb-1">
              {t.description} <span className="text-rose-500">*</span>
            </label>
            <input id="addtransactionmodal-field-4"
              type="text"
              required
              placeholder={lang === 'lo' ? 'ເຊັ່ນ: ຜະລິດປ້າຍໄຟ LED, ຈັດບູດໂປຣໂມຊັ່ນ...' : 'e.g. POSM Signboard fabrication, Booth activation...'}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Date & Invoice Ref */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="addtransactionmodal-field-5" className="block text-xs font-semibold text-slate-700 mb-1">
                {t.date}
              </label>
              <input id="addtransactionmodal-field-5"
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label htmlFor="addtransactionmodal-field-6" className="block text-xs font-semibold text-slate-700 mb-1">
                {t.invoiceRef}
              </label>
              <input id="addtransactionmodal-field-6"
                type="text"
                placeholder="INV-2026-0012"
                value={invoiceRef}
                onChange={(e) => setInvoiceRef(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Admin Over-Budget Exception Authorization */}
          {isAdmin && isOverBudget && (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowException}
                  onChange={(e) => setAllowException(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                <span className="text-xs font-bold text-amber-900">
                  {lang === 'lo' ? 'ອະນຸມັດກໍລະນີພິເສດເກີນງົບປະມານ (Admin Authorization)' : 'Authorize Over-Budget Exception (Admin Override)'}
                </span>
              </label>

              {allowException && (
                <input
                  type="text"
                  required
                  placeholder={lang === 'lo' ? 'ລະບຸເຫດຜົນການອະນຸມັດພິເສດ...' : 'Enter authorization reason...'}
                  aria-label={lang==='lo'?'ເຫດຜົນອະນຸມັດ':'Authorization reason'}
                  value={exceptionReason}
                  onChange={(e) => setExceptionReason(e.target.value)}
                  className="w-full p-2 bg-white border border-amber-300 rounded-lg text-xs text-slate-800"
                />
              )}
            </div>
          )}

          {/* Action Buttons */}
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
              {t.save}
            </ActionButton>
          </div>

        </form>

      </div>
    </div>
  );
};
