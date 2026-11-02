import {annualPeriods,businessToday} from '../services/annualBudgets';
import React, { useState } from 'react';
import {
  Wallet,
  Search,
  Filter,
  AlertTriangle,
  AlertOctagon,
  CheckCircle2,
  Edit3,
  Plus,
  ShieldCheck,
  TrendingUp,
  Download,
  Info,
  Package
} from 'lucide-react';
import { motion } from 'motion/react';
import { storage } from '../services/storage';
import { translations, Language } from '../locales/translations';
import { Team, TEAMS, BudgetStatus } from '../types';
import { EditPricePerCrateModal } from '../components/EditPricePerCrateModal';

interface BudgetManagementViewProps {
  selectedTeam: Team | 'ALL';
  onSelectTeam: (team: Team | 'ALL') => void;
  onOpenCustomerDetail: (customerCode: string) => void;
  onOpenAddTransaction: (customerCode?: string) => void;
}

export const BudgetManagementView: React.FC<BudgetManagementViewProps> = ({
  selectedTeam,
  onSelectTeam,
  onOpenCustomerDetail,
  onOpenAddTransaction
}) => {
  const currentUser = storage.getCurrentUser();
  const settings = storage.getSettings();
  const lang: Language = settings.language;
  const t = translations[lang];
  const isAdmin = currentUser?.role === 'ADMIN';

  const [searchTerm, setSearchTerm] = useState('');
  const [budgetStatusFilter, setBudgetStatusFilter] = useState<'ALL' | BudgetStatus>('ALL');
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const pricePerCrate = settings.pricePerCrate || 240000;
  const [editingBudget, setEditingBudget] = useState<{
    budgetId: string;
    contractId?:string;
    periodNumber?:number;
    customerName: string;
    currentAmount: number;
    newAmount: number;
    notes: string;
  } | null>(null);

  const [selectedPeriods,setSelectedPeriods]=useState<Record<string,number>>({});
  const rawCustomers = storage.getCustomers(selectedTeam, searchTerm);

  const dataList = rawCustomers.map((c) => {
    const contract = storage.getActiveContract(c.code);
    const currentBudget = storage.getBudgetForCustomer(c.code);
    const periodNumber=selectedPeriods[c.code]||currentBudget?.periodNumber||(contract?annualPeriods(contract).find(p=>businessToday()>=p.periodStart&&businessToday()<=p.periodEnd)?.periodNumber:undefined)||1;
    const budget=storage.usesSupabase&&contract?storage.getContractBudgets(contract.id).find(b=>b.periodNumber===periodNumber):currentBudget;
    const condition = storage.getCustomerCondition(c.code);
    return {
      customer: c,
      contract,
      budget,
      periodNumber,
      condition
    };
  });

  const filtered = dataList.filter((item) => {
    if (budgetStatusFilter === 'ALL') return true;
    return item.budget?.status === budgetStatusFilter;
  });

  const [isSaving,setIsSaving]=useState(false);
  const handleSaveBudgetAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBudget||isSaving) return;
    setIsSaving(true);
    const res = await storage.commitBusinessChange(editingBudget.budgetId?'UPDATE_BUDGET':'CREATE_BUDGET',{budgetId:editingBudget.budgetId,contractId:editingBudget.contractId,periodNumber:editingBudget.periodNumber,newAmount:editingBudget.newAmount,notes:editingBudget.notes});
    setIsSaving(false);
    if (res.success) {
      setEditingBudget(null);
    } else {
      alert(res.message);
    }
  };

  const getStatusBadge = (status?: BudgetStatus, utilRate = 0) => {
    if (status === 'EXCEEDED' || utilRate > 100) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300">
          <AlertOctagon className="w-3.5 h-3.5 text-rose-600" />
          <span>{t.statusExceeded}</span>
        </span>
      );
    }
    if (status === 'CRITICAL_100' || utilRate >= 100) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
          <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
          <span>{t.statusCritical100}</span>
        </span>
      );
    }
    if (status === 'WARNING_80' || utilRate >= 80) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
          <span>{t.statusWarning80}</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
        <CheckCircle2 className="w-3.5 h-3.5" />
        <span>{t.statusNormal}</span>
      </span>
    );
  };

  const getProgressBarColor = (utilRate: number) => {
    if (utilRate >= 100) return 'bg-rose-500';
    if (utilRate >= 80) return 'bg-amber-500';
    return 'bg-emerald-500';
  };

  return (
    <div className="space-y-5">
      
      {/* Title & Info */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <span>{t.navBudgets}</span>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
              {filtered.length} {lang === 'lo' ? 'ບັນຊີງົບປະມານ' : 'budget accounts'}
            </span>
          </h2>
          <p className="text-xs text-slate-500">
            {storage.usesSupabase?(lang==='lo'?'Admin ກຳນົດງົບເລີ່ມຕົ້ນ; ແຕ່ລະທີມແກ້ງົບຂອງຕົນເອງໄດ້':'Admin initializes each annual period; teams edit their own budgets'):lang === 'lo'
              ? 'ຕິດຕາມການນຳໃຊ້ງົບປະມານ (ລັງລະ ' + storage.formatCurrency(pricePerCrate) + '), ເປີເຊັນການໃຊ້, ຍອດຍັງເຫຼືອ ແລະ ແຈ້ງເຕືອນ 80% / 100%'
              : 'Monitor annual budget allowances (' + storage.formatCurrency(pricePerCrate) + '/crate formula), burn rate, and warnings'}
          </p>
        </div>

        {/* Quick Beer Crate Price Pill */}
        {!storage.usesSupabase&&<div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200/90 px-3 py-1.5 rounded-xl shadow-2xs">
          <Package className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <div className="text-xs">
            <span className="text-slate-500 font-medium">{lang === 'lo' ? 'ລາຄາເບຍ:' : 'Beer Crate:'} </span>
            <span className="font-mono font-bold text-emerald-700">
              {storage.formatCurrency(pricePerCrate)}
            </span>
            <span className="text-[10px] text-slate-400">/{lang === 'lo' ? 'ລັງ' : 'crate'}</span>
          </div>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowPriceModal(true)}
              className="ml-1 text-[11px] font-bold text-emerald-800 hover:text-emerald-950 underline cursor-pointer bg-white/80 px-2 py-0.5 rounded-md border border-emerald-300 hover:bg-white transition"
            >
              {lang === 'lo' ? 'ແກ້ໄຂລາຄາ' : 'Edit'}
            </button>
          )}
        </div>}
      </div>

      {/* Toast Feedback */}
      {toastMessage && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="p-3 bg-emerald-600 text-white rounded-2xl text-xs font-semibold shadow-md flex items-center justify-between"
        >
          <span>{toastMessage}</span>
          <button
            onClick={() => setToastMessage(null)}
            className="text-white/80 hover:text-white font-bold ml-2 cursor-pointer"
          >
            ✕
          </button>
        </motion.div>
      )}

      {/* Rules Notice */}
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-xs text-blue-900 flex items-start gap-3">
        <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
        <div>
          <span className="font-bold">{lang === 'lo' ? 'ຫຼັກການຄວບຄຸມງົບປະມານ:' : 'Budget Control Rules:'}</span>
          <p className="mt-0.5 text-blue-800 leading-relaxed">
            {lang === 'lo'
              ? 'ລະບົບຈະລັອກບໍ່ໃຫ້ບັນທຶກລາຍຈ່າຍເກີນງົບປະມານ (Remaining Budget) ໂດຍອັດຕະໂນມັດ ເວັ້ນເສຍແຕ່ໄດ້ຮັບການອະນຸມັດພິເສດຈາກ Admin. ເມື່ອງົບປະມານຮອດ 80% ຈະຂຶ້ນເຕືອນສີສົ້ມ ແລະ 100% ຈະຂຶ້ນເຕືອນສີແດງ.'
              : 'Transactions exceeding the remaining balance are automatically blocked unless authorized by Admin exception. Progress bars highlight 80% warning (Amber) and 100% full budget (Red).'}
          </p>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white p-4 rounded-2xl shadow-xs border border-slate-200 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={lang === 'lo' ? 'ຄົ້ນຫາຕາມລະຫັດ ຫຼື ຊື່ລູກຄ້າ...' : 'Search customer code or name...'}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {isAdmin && (
            <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-200">
              <span className="text-xs text-slate-500 font-medium">{t.team}:</span>
              <select
                value={selectedTeam}
                onChange={(e) => onSelectTeam(e.target.value as Team | 'ALL')}
                className="bg-transparent text-xs font-bold text-slate-800 focus:outline-none cursor-pointer"
              >
                <option value="ALL">{t.allTeams}</option>
                {TEAMS.map((tm) => (
                  <option key={tm} value={tm}>
                    {t.team} {tm}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-200">
            <span className="text-xs text-slate-500 font-medium">{t.status}:</span>
            <select
              value={budgetStatusFilter}
              onChange={(e) => setBudgetStatusFilter(e.target.value as 'ALL' | BudgetStatus)}
              className="bg-transparent text-xs font-bold text-slate-800 focus:outline-none cursor-pointer"
            >
              <option value="ALL">{t.all}</option>
              <option value="NORMAL">{t.statusNormal}</option>
              <option value="WARNING_80">{t.statusWarning80}</option>
              <option value="CRITICAL_100">{t.statusCritical100}</option>
              <option value="EXCEEDED">{t.statusExceeded}</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Budget Grid / Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((item) => {
          const budget = item.budget;
          const contract = item.contract;
          const utilRate = budget?.utilizationPercentage || 0;
          const isOverBudget = utilRate > 100 || (budget?.remainingAmount || 0) < 0;

          return (
            <div
              key={item.customer.code}
              className={`bg-white rounded-2xl p-5 shadow-xs border transition flex flex-col justify-between ${
                isOverBudget
                  ? 'border-rose-300 ring-1 ring-rose-300'
                  : utilRate >= 80
                  ? 'border-amber-300'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div>
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="truncate">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md">
                        {item.customer.code}
                      </span>
                      <span className="text-xs font-bold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-700">
                        {item.customer.team}
                      </span>
                    </div>
                    <h3
                      onClick={() => onOpenCustomerDetail(item.customer.code)}
                      className="mt-1.5 font-bold text-sm text-slate-900 truncate hover:text-blue-600 cursor-pointer"
                      title={item.customer.name}
                    >
                      {item.customer.name}
                    </h3>
                  </div>

                  <div>{getStatusBadge(budget?.status, utilRate)}</div>
                </div>

                {storage.usesSupabase&&contract&&<label className="mt-3 block text-xs">{lang==='lo'?'ເລືອກງົບປີທີ':'Annual period'}
                  <select className="mt-1 w-full rounded-lg border p-2" value={item.periodNumber} onChange={e=>setSelectedPeriods(p=>({...p,[item.customer.code]:Number(e.target.value)}))}>
                    {annualPeriods(contract).map(period=><option key={period.periodNumber} value={period.periodNumber}>{period.periodNumber}: {period.periodStart} → {period.periodEnd}</option>)}
                  </select>
                </label>}
                {storage.usesSupabase&&!budget&&<p className="mt-2 text-sm text-amber-800">{lang==='lo'?'ຍັງບໍ່ໄດ້ກຳນົດງົບ':'Budget has not been initialized'}</p>}
                {budget?.periodStart && <p className="mt-2 text-xs text-blue-700">{lang==='lo'?'ງົບປີທີ':'Budget year'} {budget.periodNumber}: {budget.periodStart} → {budget.periodEnd}</p>}
                {/* Contract cycle dates */}
                <div className="mt-3 text-xs text-slate-500 bg-slate-50 p-2 rounded-xl flex items-center justify-between">
                  <span>{t.contractPeriod}:</span>
                  <span className="font-semibold text-slate-800">
                    {contract?.commencingOn} → {contract?.expiringOn}
                  </span>
                </div>

                {/* Financial Figures */}
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="bg-slate-50 p-2 rounded-xl">
                    <p className="text-[10px] text-slate-500 font-semibold">{t.annualBudget}</p>
                    <p className="text-xs font-bold text-slate-900 truncate mt-0.5">
                      {storage.usesSupabase&&!budget?'—':storage.formatCurrency(budget?.annualAmount || 0)}
                    </p>
                    {!storage.usesSupabase&&item.condition?.conditionQuantity ? (
                      <span className="text-[9px] text-blue-600 block font-semibold mt-0.5">
                        {item.condition.conditionQuantity.toLocaleString()} ລັງ × {storage.formatCurrency(pricePerCrate)}
                      </span>
                    ) : null}
                  </div>
                  <div className="bg-slate-50 p-2 rounded-xl">
                    <p className="text-[10px] text-slate-500 font-semibold">{t.budgetUsed}</p>
                    <p className="text-xs font-bold text-amber-600 truncate mt-0.5">
                      {storage.usesSupabase&&!budget?'—':storage.formatCurrency(budget?.totalUsed || 0)}
                    </p>
                  </div>
                  <div className={`p-2 rounded-xl ${isOverBudget ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
                    <p className="text-[10px] font-semibold">{t.remainingBudget}</p>
                    <p className="text-xs font-black truncate mt-0.5">
                      {storage.usesSupabase&&!budget?'—':storage.formatCurrency(budget?.remainingAmount || 0)}
                    </p>
                  </div>
                </div>

                {/* Progress Bar & Percentage */}
                <div className="mt-4 space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-slate-600">{t.utilizationRate}</span>
                    <span className={utilRate >= 100 ? 'text-rose-600 font-bold' : utilRate >= 80 ? 'text-amber-600 font-bold' : 'text-emerald-600 font-bold'}>
                      {utilRate}%
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${getProgressBarColor(utilRate)}`}
                      style={{ width: `${Math.min(100, utilRate)}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <button
                  onClick={() => onOpenAddTransaction(item.customer.code)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition cursor-pointer shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{t.newTransaction}</span>
                </button>

                {storage.usesSupabase&&isAdmin&&contract&&!budget&&<button className="rounded-xl border px-3 py-2 text-xs font-bold text-blue-700" onClick={()=>setEditingBudget({budgetId:'',contractId:contract.id,periodNumber:item.periodNumber,customerName:item.customer.name,currentAmount:0,newAmount:0,notes:''})}>{lang==='lo'?'ກຳນົດງົບ':'Initialize budget'}</button>}
                {budget && (isAdmin || storage.usesSupabase&&currentUser?.team===budget.team) && (
                  <button
                    onClick={() =>
                      setEditingBudget({
                        budgetId: budget.id,
                        customerName: item.customer.name,
                        currentAmount: budget.annualAmount,
                        newAmount: budget.annualAmount,
                        notes: ''
                      })
                    }
                    className="p-1.5 rounded-xl border border-slate-200 text-slate-600 hover:text-blue-600 hover:bg-slate-50 transition cursor-pointer"
                    title={lang === 'lo' ? 'ປັບແກ້ງົບປະມານປະຈຳປີ' : 'Adjust Annual Budget'}
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Admin Budget Edit Modal */}
      {editingBudget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Wallet className="w-5 h-5 text-blue-600" />
              <span>{lang === 'lo' ? 'ປັບແກ້ງົບປະມານປະຈຳປີ (Admin)' : 'Adjust Annual Budget (Admin)'}</span>
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              {editingBudget.customerName}
            </p>

            <form onSubmit={handleSaveBudgetAdjustment} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {lang === 'lo' ? 'ງົບປະມານເດີມ' : 'Current Budget'}
                </label>
                <div className="text-sm font-bold text-slate-500 bg-slate-50 p-2.5 rounded-xl">
                  {storage.formatCurrency(editingBudget.currentAmount)}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {lang === 'lo' ? 'ງົບປະມານໃໝ່ທີ່ຕ້ອງການຕັ້ງ' : 'New Annual Budget Amount'}
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  step="any"
                  value={editingBudget.newAmount}
                  onChange={(e) =>
                    setEditingBudget({ ...editingBudget, newAmount: Number(e.target.value) })
                  }
                  className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {lang === 'lo' ? 'ເຫດຜົນໃນການປັບແກ້' : 'Adjustment Reason / Authorization'}
                </label>
                <input
                  type="text"
                  required
                  placeholder={lang === 'lo' ? 'ເຊັ່ນ: ປັບຕາມສັນຍາເພີ່ມເຕີມ Q3...' : 'e.g., Authorized expansion for Q3...'}
                  value={editingBudget.notes}
                  onChange={(e) =>
                    setEditingBudget({ ...editingBudget, notes: e.target.value })
                  }
                  className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingBudget(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white shadow-md shadow-blue-600/30"
                >
                  {t.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Beer Crate Price Modal */}
      {showPriceModal && (
        <EditPricePerCrateModal
          onClose={() => setShowPriceModal(false)}
          onSuccess={(count, newPrice) => {
            setShowPriceModal(false);
            setToastMessage(
              lang === 'lo'
                ? count > 0
                  ? `ອັບເດດລາຄາເບຍ ${storage.formatCurrency(newPrice)}/ລັງ ແລະ ຄິດໄລ່ງົບປະມານຄືນ ${count} ລູກຄ້າສຳເລັດແລ້ວ!`
                  : `ອັບເດດລາຄາເບຍ ${storage.formatCurrency(newPrice)}/ລັງ ສຳເລັດແລ້ວ!`
                : `Beer crate price updated to ${storage.formatCurrency(newPrice)}/crate!`
            );
          }}
        />
      )}

    </div>
  );
};
