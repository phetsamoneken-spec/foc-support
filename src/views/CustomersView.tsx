import React, { useState } from 'react';
import {
  Users,
  Search,
  Filter,
  Plus,
  Download,
  Upload,
  ArrowUpDown,
  ExternalLink,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  FileSpreadsheet,
  Trash2
} from 'lucide-react';
import { storage } from '../services/storage';
import { translations, Language } from '../locales/translations';
import { Customer, Team, TEAMS, ContractStatus } from '../types';
import { UploadExcelModal } from './UploadExcelModal';
import { AddCustomerModal } from './AddCustomerModal';
import { Pencil } from 'lucide-react';
import { DeleteAllCustomersModal } from './DeleteAllCustomersModal';

interface CustomersViewProps {
  selectedTeam: Team | 'ALL';
  onSelectTeam: (team: Team | 'ALL') => void;
  onOpenCustomerDetail: (customerCode: string) => void;
  onOpenAddCustomer: () => void;
  onOpenAddTransaction: (customerCode?: string) => void;
}

export const CustomersView: React.FC<CustomersViewProps> = ({
  selectedTeam,
  onSelectTeam,
  onOpenCustomerDetail,
  onOpenAddCustomer,
  onOpenAddTransaction
}) => {
  const currentUser = storage.getCurrentUser();
  const settings = storage.getSettings();
  const lang: Language = settings.language;
  const t = translations[lang];
  const isAdmin = currentUser?.role === 'ADMIN';

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | ContractStatus>('ALL');
  const [sortBy, setSortBy] = useState<'code' | 'name' | 'budget' | 'remaining' | 'expiring'>('code');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;

  // Query customers with RBAC
  const rawCustomers = storage.getCustomers(selectedTeam, searchTerm);

  // Map each customer with their condition, contract, and budget
  const customersWithData = rawCustomers.map((c) => {
    const condition = storage.getCustomerCondition(c.code);
    const contract = storage.getActiveContract(c.code);
    const budget = storage.getBudgetForCustomer(c.code);
    return {
      customer: c,
      condition,
      contract,
      budget
    };
  });

  // Filter by contract status if set
  const filtered = customersWithData.filter((item) => {
    if (statusFilter === 'ALL') return true;
    return item.contract?.status === statusFilter;
  });

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    let comparison = 0;
    if (sortBy === 'code') {
      comparison = a.customer.code.localeCompare(b.customer.code);
    } else if (sortBy === 'name') {
      comparison = a.customer.name.localeCompare(b.customer.name);
    } else if (sortBy === 'budget') {
      comparison = (a.budget?.annualAmount || 0) - (b.budget?.annualAmount || 0);
    } else if (sortBy === 'remaining') {
      comparison = (a.budget?.remainingAmount || 0) - (b.budget?.remainingAmount || 0);
    } else if (sortBy === 'expiring') {
      comparison = (a.contract?.expiringOn || '').localeCompare(b.contract?.expiringOn || '');
    }
    return sortOrder === 'asc' ? comparison : -comparison;
  });

  const totalPages = Math.ceil(sorted.length / pageSize) || 1;
  const paginated = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const toggleSort = (column: 'code' | 'name' | 'budget' | 'remaining' | 'expiring') => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
  };

  const getStatusBadge = (status?: ContractStatus) => {
    switch (status) {
      case 'ACTIVE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3" />
            <span>{t.statusActive}</span>
          </span>
        );
      case 'EXPIRING_SOON':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="w-3 h-3" />
            <span>{t.statusExpiringSoon}</span>
          </span>
        );
      case 'EXPIRED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-3 h-3" />
            <span>{t.statusExpired}</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
            <span>{t.statusUpcoming}</span>
          </span>
        );
    }
  };

  const handleExportCsv = () => {
    // Generate standard CSV with UTF-8 BOM so Lao script displays properly in Excel
    const headers = [
      'MDE',
      'Customer Code',
      'Customer Name',
      'Condition Quantity',
      'Condition UOM',
      'Condition Product Description',
      'Commencing On',
      'Expiring On',
      'Annual Budget',
      'Used Budget',
      'Remaining Budget',
      'Utilization Rate (%)',
      'Status'
    ];

    const rows = sorted.map((item) => [
      item.customer.mde,
      item.customer.code,
      `"${item.customer.name.replace(/"/g, '""')}"`,
      item.condition?.conditionQuantity || 0,
      item.condition?.conditionUOM || '',
      `"${(item.condition?.conditionProductDescription || '').replace(/"/g, '""')}"`,
      item.contract?.commencingOn || '',
      item.contract?.expiringOn || '',
      item.budget?.annualAmount || 0,
      item.budget?.totalUsed || 0,
      item.budget?.remainingAmount || 0,
      item.budget?.utilizationPercentage || 0,
      item.contract?.status || ''
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `MKT_Customers_${selectedTeam}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const [showUploadExcelModal, setShowUploadExcelModal] = useState(false);
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [feedbackIsError, setFeedbackIsError] = useState(false);

  const showToast = (msg: string, success = true) => {
    setFeedbackMsg(msg);
    setFeedbackIsError(!success);
    setTimeout(() => setFeedbackMsg(null), 4000);
  };

  const [editingCode,setEditingCode]=useState<string|null>(null);
  const [deletingCode,setDeletingCode]=useState<string|null>(null);
  const handleDeleteCustomer = async (customer: Customer) => {
    if(deletingCode)return;
    const confirmed = window.confirm(lang === 'lo'
      ? `ລົບຮ້ານ “${customer.name}” (${customer.code}) ຂອງທີມ ${customer.team} ອອກຈາກແອັບ ແລະຕາຕະລາງໃຊ້ງານໃນ Sheet ບໍ່?\nຂໍ້ມູນຮ້ານ, ສັນຍາ, ງົບ ແລະລາຍຈ່າຍຈະສຳຮອງໄວ້ກ່ອນລົບ.`
      : `Delete store “${customer.name}” (${customer.code}), Team ${customer.team}, from the app and working Sheet tables?\nStore, contract, budget and spending records will be backed up before their rows are removed.`);
    if (!confirmed) return;
    setDeletingCode(customer.code);
    const result = await storage.commitBusinessChange('DELETE_CUSTOMER',{customerCode:customer.code});
    setDeletingCode(null);
    if (result.success) setCurrentPage(page => Math.min(page, Math.max(1, Math.ceil((sorted.length - 1) / pageSize))));
    showToast(result.message, result.success);
  };

  return (
    <div className="space-y-5">
      
      {/* Toast Feedback */}
      {feedbackMsg && (
        <div role={feedbackIsError ? 'alert' : 'status'} className={`p-3.5 rounded-2xl border text-xs font-bold flex items-center gap-2 shadow-sm animate-in fade-in ${feedbackIsError ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800'}`}>
          {feedbackIsError ? <AlertTriangle className="w-4 h-4 flex-shrink-0" /> : <CheckCircle2 className="w-4 h-4 flex-shrink-0" />}
          <span>{feedbackMsg}</span>
        </div>
      )}

      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <span>{t.navCustomers}</span>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
              {sorted.length} {lang === 'lo' ? 'ລາຍການ' : 'records'}
            </span>
          </h2>
          <p className="text-xs text-slate-500">
            {lang === 'lo'
              ? 'ລາຍຊື່ລູກຄ້າ, ເງື່ອນໄຂສັນຍາ, ງົບປະມານປະຈຳປີ ແລະ ຮອບສັນຍາຕົວຈິງ'
              : 'Customer accounts, contract conditions, annual budget amounts and lifecycle dates'}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          
          {/* Upload Excel Button */}
          {isAdmin && !storage.usesSupabase && <button
            onClick={() => setShowUploadExcelModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-xl transition cursor-pointer shadow-xs active:scale-95"
            title="Upload Excel (.xlsx, .xls, .csv)"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>{lang === 'lo' ? 'ອັບໂຫຼດ Excel' : 'Upload Excel'}</span>
          </button>}

          {/* Export CSV/Excel */}
          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl transition cursor-pointer shadow-xs"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>{t.exportCsv}</span>
          </button>

          {/* Delete All Customers (Admin Only) */}
          {isAdmin && !storage.usesSupabase && sorted.length > 0 && (
            <button
              onClick={() => setShowDeleteAllModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition cursor-pointer shadow-xs"
              title={lang === 'lo' ? 'ລຶບລາຍຊື່ລູກຄ້າທັງໝົດ' : 'Delete All Customers'}
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
              <span>{lang === 'lo' ? 'ລຶບທັງໝົດ' : 'Delete All'}</span>
            </button>
          )}

          {/* Add New Customer / Store (Available to both Admin and Team Users) */}
          <button
            onClick={onOpenAddCustomer}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-xl transition cursor-pointer shadow-md shadow-blue-600/20 active:scale-95"
            title={lang === 'lo' ? 'ເພີ່ມຮ້ານໃໝ່' : 'Add New Store / Customer'}
          >
            <Plus className="w-4 h-4" />
            <span>{lang === 'lo' ? 'ເພີ່ມຮ້ານໃໝ່' : t.addNewCustomer}</span>
          </button>
        </div>
      </div>

      {/* Empty State Warning Banner */}
      {sorted.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto font-bold">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-base text-amber-950">
              {lang === 'lo' ? 'ຍັງບໍ່ມີຂໍ້ມູນລູກຄ້າໃນລະບົບ' : 'No Customer Records Found'}
            </h3>
            <p className="text-xs text-amber-800 max-w-md mx-auto mt-1">
              {storage.usesSupabase?(lang==='lo'?'ເພີ່ມລູກຄ້າໃໝ່ ຫຼືໂຫຼດຂໍ້ມູນໃໝ່ຈາກ Supabase.':'Add a customer or refresh Supabase data.'):lang === 'lo'
                ? (isAdmin ? 'ອັບໂຫຼດ Excel ຫຼືໂຫຼດຂໍ້ມູນຈາກ Sheet ກາງ.' : 'ກົດໂຫຼດຈາກ Sheet ເພື່ອເບິ່ງລູກຄ້າໃນທີມທີ່ Admin ກຳນົດໃຫ້ທ່ານ.')
                : (isAdmin ? 'Upload Excel or load the shared Sheet data.' : 'Load from Sheet to see the customers assigned to your team by Admin.')}
            </p>
          </div>
          <div className="flex items-center justify-center gap-2 pt-2">
            {isAdmin && !storage.usesSupabase && <button
              onClick={() => setShowUploadExcelModal(true)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 cursor-pointer"
            >
              {lang === 'lo' ? 'ອັບໂຫຼດໄຟລ໌ Excel ດຽວນີ້' : 'Upload Excel File Now'}
            </button>}
            {isAdmin && !storage.usesSupabase && !settings.appsScriptUrl && (
              <button
                onClick={() => {
                  storage.resetToSeedData();
                  showToast(lang === 'lo' ? 'ໂຫຼດຂໍ້ມູນຕົວຢ່າງ 578 ລາຍການສຳເລັດແລ້ວ' : 'Loaded 578 demo customers');
                }}
                className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer"
              >
                {lang === 'lo' ? 'ໂຫຼດຂໍ້ມູນຕົວຢ່າງ 578 ລາຍການ' : 'Load Demo 578 Records'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl shadow-xs border border-slate-200 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            placeholder={lang === 'lo' ? 'ຄົ້ນຫາຕາມລະຫັດ, ຊື່ລູກຄ້າ, ແຂວງ...' : 'Search by code, customer name, province...'}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
          />
        </div>

        {/* Filter Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          
          {/* Team Filter (if Admin) */}
          {isAdmin && (
            <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-200">
              <span className="text-xs text-slate-500 font-medium">{t.team}:</span>
              <select
                value={selectedTeam}
                onChange={(e) => {
                  onSelectTeam(e.target.value as Team | 'ALL');
                  setCurrentPage(1);
                }}
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

          {/* Status Filter */}
          <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-200">
            <span className="text-xs text-slate-500 font-medium">{t.status}:</span>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as 'ALL' | ContractStatus);
                setCurrentPage(1);
              }}
              className="bg-transparent text-xs font-bold text-slate-800 focus:outline-none cursor-pointer"
            >
              <option value="ALL">{t.all}</option>
              <option value="ACTIVE">{t.statusActive}</option>
              <option value="EXPIRING_SOON">{t.statusExpiringSoon}</option>
              <option value="EXPIRED">{t.statusExpired}</option>
            </select>
          </div>

        </div>
      </div>

      {/* Main Customers Table */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-semibold select-none">
                <th
                  onClick={() => toggleSort('code')}
                  className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition whitespace-nowrap"
                >
                  <div className="flex items-center gap-1">
                    <span>{t.customerCode}</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => toggleSort('name')}
                  className="min-w-[240px] py-3 px-4 cursor-pointer hover:bg-slate-100 transition whitespace-nowrap"
                >
                  <div className="flex items-center gap-1">
                    <span>{t.customerName}</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th className="py-3 px-3 whitespace-nowrap">{t.team}</th>
                <th className="py-3 px-4 whitespace-nowrap">{t.conditionProduct}</th>
                <th className="py-3 px-3 whitespace-nowrap">{t.conditionQty}</th>
                <th
                  onClick={() => toggleSort('expiring')}
                  className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition whitespace-nowrap"
                >
                  <div className="flex items-center gap-1">
                    <span>{t.contractPeriod}</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => toggleSort('budget')}
                  className="py-3 px-4 text-right cursor-pointer hover:bg-slate-100 transition whitespace-nowrap"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>{t.annualBudget}</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => toggleSort('remaining')}
                  className="py-3 px-4 text-right cursor-pointer hover:bg-slate-100 transition whitespace-nowrap"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>{t.remainingBudget}</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th className="py-3 px-3 text-center whitespace-nowrap">{t.status}</th>
                <th className="py-3 px-4 text-right whitespace-nowrap">{t.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-normal text-slate-800">
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    {lang === 'lo' ? 'ບໍ່ພົບຂໍ້ມູນລູກຄ້າທີ່ກົງກັບເງື່ອນໄຂ' : 'No customers found matching search'}
                  </td>
                </tr>
              ) : (
                paginated.map((item) => {
                  const utilRate = item.budget?.utilizationPercentage || 0;
                  return (
                    <tr
                      key={item.customer.code}
                      className="hover:bg-slate-50/80 transition group"
                    >
                      <td className="py-3 px-4 font-mono font-bold text-blue-700 whitespace-nowrap">
                        {item.customer.code}
                      </td>
                      <td className="min-w-[240px] py-3 px-4 whitespace-nowrap">
                        <div className="font-bold text-slate-900 leading-tight whitespace-nowrap">
                          {item.customer.name}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate max-w-xs">
                          {item.customer.province || item.customer.address}
                        </div>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded-md font-bold text-[11px] bg-slate-100 text-slate-700">
                          {item.customer.team}
                        </span>
                      </td>
                      <td className="py-3 px-4 max-w-[200px] truncate text-slate-600" title={item.condition?.conditionProductDescription}>
                        {item.condition?.conditionProductDescription || '-'}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap font-medium text-slate-700">
                        {item.condition?.conditionQuantity ? item.condition.conditionQuantity.toLocaleString() : '0'}{' '}
                        <span className="text-[10px] text-slate-400">{item.condition?.conditionUOM}</span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="text-[11px] text-slate-800 font-medium">
                          {item.contract?.commencingOn} → {item.contract?.expiringOn}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {t.cycleNumber} {item.contract?.cycleNumber || 1} · {lang==='lo'?'ງົບປີທີ':'Budget year'} {item.budget?.periodNumber || 1}
                          {item.budget?.periodStart && <span className="block">{item.budget.periodStart} → {item.budget.periodEnd}</span>}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-slate-900 whitespace-nowrap">
                        {storage.usesSupabase&&!item.budget?'—':storage.formatCurrency(item.budget?.annualAmount || 0)}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="font-bold text-emerald-600">
                          {storage.formatCurrency(item.budget?.remainingAmount || 0)}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {utilRate}% {lang === 'lo' ? 'ໃຊ້ແລ້ວ' : 'used'}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        {getStatusBadge(item.contract?.status)}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => onOpenCustomerDetail(item.customer.code)}
                            title={t.viewDetails}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition cursor-pointer"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => onOpenAddTransaction(item.customer.code)}
                            title={t.newTransaction}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 transition cursor-pointer"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                          {storage.canEditCustomer(item.customer.team)&&<button type="button" title={lang==='lo'?'ແກ້ໄຂຮ້ານ':'Edit store'} aria-label={`Edit store ${item.customer.name}`} onClick={()=>setEditingCode(item.customer.code)} className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50"><Pencil className="h-4 w-4" /></button>}
                          {storage.canDeleteCustomer(item.customer.code) && <button
                            type="button"
                            onClick={() => handleDeleteCustomer(item.customer)}
                            disabled={Boolean(deletingCode)}
                            title={lang === 'lo' ? 'ລົບຮ້ານ' : 'Delete store'}
                            aria-label={`${lang === 'lo' ? 'ລົບຮ້ານ' : 'Delete store'} ${item.customer.name}`}
                            className="p-1.5 rounded-lg text-rose-600 hover:text-rose-700 hover:bg-rose-50 transition cursor-pointer"
                          ><Trash2 className="w-4 h-4" /></button>}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination bar */}
        <div className="py-3 px-4 bg-slate-50/60 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span>
            {lang === 'lo'
              ? `ສະແດງ ${(currentPage - 1) * pageSize + 1} - ${Math.min(currentPage * pageSize, sorted.length)} ຈາກທັງໝົດ ${sorted.length} ລາຍການ`
              : `Showing ${(currentPage - 1) * pageSize + 1} - ${Math.min(currentPage * pageSize, sorted.length)} of ${sorted.length} entries`}
          </span>

          <div className="flex items-center gap-1.5">
            <button
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium text-slate-700"
            >
              {lang === 'lo' ? 'ກ່ອນໜ້າ' : 'Previous'}
            </button>
            <span className="font-bold text-slate-800 px-2">
              {currentPage} / {totalPages}
            </span>
            <button
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium text-slate-700"
            >
              {lang === 'lo' ? 'ຖັດໄປ' : 'Next'}
            </button>
          </div>
        </div>
      </div>

      {/* Upload Excel Modal */}
      {showUploadExcelModal && isAdmin && (
        <UploadExcelModal
          onClose={() => setShowUploadExcelModal(false)}
          onSuccess={(count) => {
            setShowUploadExcelModal(false);
            showToast(
              lang === 'lo'
                ? `ອັບໂຫຼດ ແລະ ນຳເຂົ້າຂໍ້ມູນລູກຄ້າ ${count} ລາຍການສຳເລັດແລ້ວ!`
                : `Successfully imported ${count} customers from Excel!`
            );
          }}
        />
      )}

      {editingCode&&<AddCustomerModal initialCustomerCode={editingCode} onClose={()=>setEditingCode(null)} onSuccess={()=>{setEditingCode(null);showToast(lang==='lo'?'ແກ້ໄຂຮ້ານ ແລະບັນທຶກໄປ Sheet ແລ້ວ':'Store updated in Sheet');}} />}
      {/* Delete All Customers Modal */}
      {showDeleteAllModal && isAdmin && (
        <DeleteAllCustomersModal
          customerCount={sorted.length}
          onClose={() => setShowDeleteAllModal(false)}
          onSuccess={() => {
            setShowDeleteAllModal(false);
            showToast(
              lang === 'lo'
                ? 'ລົບຮ້ານທັງໝົດອອກຈາກລາຍຊື່ແລ້ວ; ປະຫວັດລາຍຈ່າຍຍັງເກັບໄວ້.'
                : 'All stores removed from the active list. Spending history retained.'
            );
          }}
          onOpenUploadExcel={() => {
            if(storage.usesSupabase)return;
            setShowDeleteAllModal(false);
            setShowUploadExcelModal(true);
          }}
        />
      )}

    </div>
  );
};

