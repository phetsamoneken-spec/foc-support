import React, { useState, useRef, useEffect } from 'react';
import {useModalDialog} from '../hooks/useModalDialog';
import {businessToday} from '../services/annualBudgets';
import {ActionButton} from '../components/ActionButton';
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
  onOpenAddContract:()=>void;
}

export const BudgetManagementView: React.FC<BudgetManagementViewProps> = ({
  selectedTeam,
  onSelectTeam,
  onOpenCustomerDetail,
  onOpenAddTransaction,
  onOpenAddContract
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
    customerName: string;
    currentAmount: number;
    newAmount: number;
    notes: string;
  } | null>(null);

  const [periodMode,setPeriodMode]=useState<'current'|'month'|'year'>('current');
  const [periodMonth,setPeriodMonth]=useState(businessToday().slice(0,7));
  const [periodYear,setPeriodYear]=useState(businessToday().slice(0,4));
  const [categoryFilter,setCategoryFilter]=useState('ALL');
  const transactions=storage.getTransactions({team:selectedTeam,status:'ACTIVE'});
  const categories=[...new Set(transactions.map(row=>row.category))].sort();
  const rawCustomers = storage.getCustomers(selectedTeam, searchTerm);

  const periodStart=periodMode==='month'?`${periodMonth}-01`:`${periodYear}-01-01`;
  const periodEnd=periodMode==='month'?`${periodMonth}-${new Date(Number(periodMonth.slice(0,4)),Number(periodMonth.slice(5,7)),0).getDate()}`:`${periodYear}-12-31`;
  const years=periodMode!=='year'?[]:[...new Set(rawCustomers.flatMap(customer=>storage.getCustomerContracts(customer.code).flatMap(contract=>{
    const first=Number(contract.commencingOn.slice(0,4)),last=Number(contract.expiringOn.slice(0,4));
    if(!Number.isInteger(first)||!Number.isInteger(last)||last<first)return [];
    return Array.from({length:last-first+1},(_,offset)=>String(first+offset));
  })))].sort().reverse();
  const dataList=rawCustomers.flatMap(c=>{
    const condition=storage.getCustomerCondition(c.code);
    if(periodMode==='current')return [{customer:c,contract:storage.getActiveContract(c.code),budget:storage.getBudgetForCustomer(c.code),condition}];
    return storage.getCustomerContracts(c.code).flatMap(contract=>storage.getContractBudgets(contract.id)
      .filter(b=>(b.periodStart||contract.commencingOn)<=periodEnd&&(b.periodEnd||contract.expiringOn)>=periodStart)
      .map(budget=>({customer:c,contract,budget,condition})));
  });
  const matchingTransactions=transactions.filter(row=>(categoryFilter==='ALL'||row.category===categoryFilter)&&(periodMode==='current'||row.date>=periodStart&&row.date<=periodEnd));
  const filtered=dataList.filter(item=>(budgetStatusFilter==='ALL'||item.budget?.status===budgetStatusFilter)&&(categoryFilter==='ALL'||matchingTransactions.some(row=>row.budgetId===item.budget?.id)));
  const [visibleCount,setVisibleCount]=useState(24);
  useEffect(()=>setVisibleCount(24),[searchTerm,budgetStatusFilter,selectedTeam,periodMode,periodMonth,periodYear,categoryFilter]);
  const [saveError,setSaveError]=useState('');
  useEffect(()=>setSaveError(''),[editingBudget?.budgetId]);
  const savingRef=useRef(false);
  const [isSaving,setIsSaving]=useState(false);
  const modalRef=useModalDialog(()=>setEditingBudget(null),isSaving,Boolean(editingBudget));
  const handleSaveBudgetAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBudget||savingRef.current) return;
    savingRef.current=true;
    setSaveError('');
    setIsSaving(true);
    let res:{success:boolean;message?:string};
    try {
      res = await storage.commitBusinessChange('UPDATE_BUDGET',{budgetId:editingBudget.budgetId,newAmount:editingBudget.newAmount,notes:editingBudget.notes});
    } catch (error) {res={success:false,message:error instanceof Error?error.message:String(error)};} finally {savingRef.current=false;setIsSaving(false);}

    if (res.success) {
      setEditingBudget(null);
    } else {
      setSaveError(res.message || (lang==='lo'?'ບໍ່ສາມາດບັນທຶກໄດ້':'Unable to save'));
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
    <div className="gold-budget-view space-y-4">
      
      {/* Title & Info */}
      <div className="gold-budget-heading flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <span>{t.navBudgets}</span>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
              {filtered.length} {lang === 'lo' ? 'ບັນຊີງົບປະມານ' : 'budget accounts'}
            </span>
          </h2>
          <p className="text-xs text-slate-500">
            {lang === 'lo'
              ? 'ຕິດຕາມການນຳໃຊ້ງົບປະມານ (ລັງລະ ' + storage.formatCurrency(pricePerCrate) + '), ເປີເຊັນການໃຊ້, ຍອດຍັງເຫຼືອ ແລະ ແຈ້ງເຕືອນ 80% / 100%'
              : 'Monitor annual budget allowances (' + storage.formatCurrency(pricePerCrate) + '/crate formula), burn rate, and warnings'}
          </p>
        </div>

        {isAdmin&&<button type="button" aria-label={lang==='lo'?'ເພີ່ມສັນຍາ / ງົບປະມານ':'New contract / budget'} className="gold-new-budget inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 text-white px-4 py-2.5 text-xs font-bold" onClick={onOpenAddContract}><Plus size={18}/><span className="hidden sm:inline">{lang==='lo'?'ເພີ່ມສັນຍາ / ງົບປະມານ':'New contract / budget'}</span></button>}
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

      {/* Search and Filters */}
      <div className="gold-budget-search bg-white p-4 rounded-2xl shadow-xs border border-slate-200 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            aria-label={lang==='lo'?'ຄົ້ນຫາລູກຄ້າ':'Search customers'}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={lang === 'lo' ? 'ຄົ້ນຫາຕາມລະຫັດ ຫຼື ຊື່ລູກຄ້າ...' : 'Search customer code or name...'}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
          />
        </div>

        <div className="gold-budget-search-filters flex items-center gap-2 flex-wrap">
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

      <details className="gold-card gold-advanced-filters p-3"><summary className="font-semibold text-xs cursor-pointer">{lang==='lo'?'ຕົວກອງ ແລະຫຼັກການງົບປະມານ':'Filters & budget rules'}<Filter size={16}/></summary><div className="space-y-3 pt-3">
        <div className="gold-budget-controls">
          <label>{lang==='lo'?'ໄລຍະງົບປະມານ':'Budget periods'}<select aria-label={lang==='lo'?'ໄລຍະງົບປະມານ':'Budget periods'} value={periodMode} onChange={e=>setPeriodMode(e.target.value as typeof periodMode)}><option value="current">{lang==='lo'?'ຮອບປັດຈຸບັນ':'Current periods'}</option><option value="month">{lang==='lo'?'ລາຍເດືອນ':'Monthly'}</option><option value="year">{lang==='lo'?'ລາຍປີ':'Annual'}</option></select></label>
          {periodMode==='month'&&<label>{lang==='lo'?'ເດືອນ / ປີ':'Month / year'}<input type="month" required value={periodMonth} onChange={e=>{if(e.target.value)setPeriodMonth(e.target.value);}}/></label>}
          {periodMode==='year'&&<label>{lang==='lo'?'ປີ':'Year'}<select aria-label={lang==='lo'?'ປີ':'Year'} value={periodYear} onChange={e=>setPeriodYear(e.target.value)}>{[...new Set([periodYear,...years])].map(year=><option key={year}>{year}</option>)}</select></label>}
          <label>{lang==='lo'?'ໝວດລາຍຈ່າຍ':'Spending category'}<select aria-label={lang==='lo'?'ໝວດລາຍຈ່າຍ':'Spending category'} value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)}><option value="ALL">{t.all}</option>{categories.map(category=><option key={category}>{category}</option>)}</select></label>
        </div>
        {periodMode!=='current'&&<p className="text-xs text-slate-500">{lang==='lo'?'ສະແດງຮອບງົບປະມານທີ່ກົງກັບໄລຍະທີ່ເລືອກ. ຍອດງົບ ແລະຍອດໃຊ້ແມ່ນຍອດທັງຮອບຕາມສັນຍາ.':'Shows budget periods overlapping the selection. Budget and used amounts are full contract-period totals.'}</p>}
              {/* Quick Beer Crate Price Pill */}
        <div className="gold-price-pill flex items-center gap-2 bg-emerald-50 border border-emerald-200/90 px-3 py-1.5 rounded-xl shadow-2xs">
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
        </div>
      {/* Rules Notice */}
      <details className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-xs text-blue-900"><summary className="cursor-pointer min-h-6 font-bold">{lang==='lo'?'ຫຼັກການຄວບຄຸມງົບປະມານ':'Budget control rules'}</summary><div className="mt-2 flex items-start gap-3">
        <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
        <div>
          <span className="font-bold">{lang === 'lo' ? 'ຫຼັກການຄວບຄຸມງົບປະມານ:' : 'Budget Control Rules:'}</span>
          <p className="mt-0.5 text-blue-800 leading-relaxed">
            {lang === 'lo'
              ? 'ລະບົບຈະລັອກບໍ່ໃຫ້ບັນທຶກລາຍຈ່າຍເກີນງົບປະມານ (Remaining Budget) ໂດຍອັດຕະໂນມັດ ເວັ້ນເສຍແຕ່ໄດ້ຮັບການອະນຸມັດພິເສດຈາກ Admin. ເມື່ອງົບປະມານຮອດ 80% ຈະຂຶ້ນເຕືອນສີສົ້ມ ແລະ 100% ຈະຂຶ້ນເຕືອນສີແດງ.'
              : 'Transactions exceeding the remaining balance are automatically blocked unless authorized by Admin exception. Progress bars highlight 80% warning (Amber) and 100% full budget (Red).'}
          </p>
        </div>
      </div></details>

      </div></details>
      {filtered.length===0&&<div className="gold-card gold-budget-empty"><Wallet className="mx-auto mb-3 text-amber-700"/><p className="font-bold text-sm">{lang==='lo'?'ບໍ່ພົບງົບປະມານ':'No matching budgets'}</p><p className="text-xs text-slate-500 mt-2">{lang==='lo'?'ລອງປ່ຽນຄຳຄົ້ນຫາ ຫຼືຕົວກອງ':'Try a different search or filter'}</p></div>}
      {/* Main Budget Grid / Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.slice(0,visibleCount).map((item) => {
          const budget = item.budget;
          const contract = item.contract;
          const utilRate = budget?.utilizationPercentage || 0;
          const isOverBudget = utilRate > 100 || (budget?.remainingAmount || 0) < 0;

          return (
            <div
              key={item.budget?.id||item.customer.code}
              className={`gold-budget-card bg-white rounded-2xl p-4 shadow-xs border transition flex flex-col justify-between ${
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
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md">
                        {item.customer.code}
                      </span>
                      <span className="text-xs font-bold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-700">
                        {item.customer.team}
                      </span>
                    </div>
                    <button type="button"
                      onClick={() => onOpenCustomerDetail(item.customer.code)}
                      className="mt-1.5 font-bold text-sm text-slate-900 text-left break-words hover:text-blue-600 cursor-pointer"
                      title={item.customer.name}
                    >
                      {item.customer.name}
                    </button>
                  </div>

                  <div>{getStatusBadge(budget?.status, utilRate)}</div>
                </div>

                {budget?.periodStart && <p className="mt-2 text-xs text-blue-700">{lang==='lo'?'ງົບປີທີ':'Budget year'} {budget.periodNumber}: {budget.periodStart} → {budget.periodEnd}</p>}
                {/* Contract cycle dates */}
                <div className="mt-3 text-xs text-slate-500 bg-slate-50 p-2 rounded-xl flex flex-wrap gap-1 items-center justify-between">
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
                      {storage.formatCurrency(budget?.annualAmount || 0)}
                    </p>
                    {item.condition?.conditionQuantity ? (
                      <span className="text-[9px] text-blue-600 block font-semibold mt-0.5">
                        {item.condition.conditionQuantity.toLocaleString()} ລັງ × {storage.formatCurrency(pricePerCrate)}
                      </span>
                    ) : null}
                  </div>
                  <div className="bg-slate-50 p-2 rounded-xl">
                    <p className="text-[10px] text-slate-500 font-semibold">{t.budgetUsed}</p>
                    <p className="text-xs font-bold text-amber-600 truncate mt-0.5">
                      {storage.formatCurrency(budget?.totalUsed || 0)}
                    </p>
                  </div>
                  <div className={`p-2 rounded-xl ${isOverBudget ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
                    <p className="text-[10px] font-semibold">{t.remainingBudget}</p>
                    <p className="text-xs font-black truncate mt-0.5">
                      {storage.formatCurrency(budget?.remainingAmount || 0)}
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

              {periodMode!=='current'&&<p className="text-xs text-slate-600 mt-3">{lang==='lo'?'ໃຊ້ໃນໄລຍະທີ່ເລືອກ':'Spent in selection'}: <b>{storage.formatCurrency(matchingTransactions.filter(row=>row.budgetId===budget?.id).reduce((sum,row)=>sum+row.amount,0))}</b></p>}
              {/* Action Buttons */}
              <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <button
                  onClick={() => onOpenAddTransaction(item.customer.code)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition cursor-pointer shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{t.newTransaction}</span>
                </button>

                {isAdmin && budget && (
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

      {visibleCount<filtered.length&&<button type="button" className="gold-card w-full p-3 text-xs font-bold" onClick={()=>setVisibleCount(count=>count+24)}>{lang==='lo'?'ເບິ່ງເພີ່ມ':'Show more'} ({Math.min(visibleCount,filtered.length)}/{filtered.length})</button>}
      {/* Admin Budget Edit Modal */}
      {editingBudget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div ref={modalRef} role="dialog" aria-modal="true" aria-label={lang==='lo'?'ປັບແກ້ງົບປະມານ':'Adjust Annual Budget'} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Wallet className="w-5 h-5 text-blue-600" />
              <span>{lang === 'lo' ? 'ປັບແກ້ງົບປະມານປະຈຳປີ (Admin)' : 'Adjust Annual Budget (Admin)'}</span>
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              {editingBudget.customerName}
            </p>

            <form onSubmit={handleSaveBudgetAdjustment} className="mt-4 space-y-4">
              {saveError&&<p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">{saveError}</p>}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {lang === 'lo' ? 'ງົບປະມານເດີມ' : 'Current Budget'}
                </label>
                <div className="text-sm font-bold text-slate-500 bg-slate-50 p-2.5 rounded-xl">
                  {storage.formatCurrency(editingBudget.currentAmount)}
                </div>
              </div>

              <div>
                <label htmlFor="budgetmanagementview-field-1" className="block text-xs font-semibold text-slate-700 mb-1">
                  {lang === 'lo' ? 'ງົບປະມານໃໝ່ທີ່ຕ້ອງການຕັ້ງ' : 'New Annual Budget Amount'}
                </label>
                <input id="budgetmanagementview-field-1"
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
                <label htmlFor="budgetmanagementview-field-2" className="block text-xs font-semibold text-slate-700 mb-1">
                  {lang === 'lo' ? 'ເຫດຜົນໃນການປັບແກ້' : 'Adjustment Reason / Authorization'}
                </label>
                <input id="budgetmanagementview-field-2"
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
                  disabled={isSaving}
                  onClick={() => setEditingBudget(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  {t.cancel}
                </button>
                <ActionButton
                  type="submit"
                  loading={isSaving}
                  loadingLabel={lang==='lo'?'ກຳລັງບັນທຶກ…':'Saving…'}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white shadow-md shadow-blue-600/30"
                >
                  {t.save}
                </ActionButton>
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
