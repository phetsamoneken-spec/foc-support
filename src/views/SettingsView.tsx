import {isSupabaseBackend,SUPABASE_DASHBOARD_URL} from '../config/supabase';
import React, { useRef, useState } from 'react';
import {
  Settings as SettingsIcon,
  Save,
  Coins,
  Bell,
  FileSpreadsheet,
  Code2,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  ShieldAlert,
  Server,
  Download,
  Package
} from 'lucide-react';
import { storage } from '../services/storage';
import { GasService } from '../services/gasService';
import { translations, Language } from '../locales/translations';
import { AppSettings } from '../types';
import { APP_VERSION } from '../services/appUpdates';
import { ThemeSwitcher, type DashboardTheme } from '../components/ThemeSwitcher';

interface SettingsViewProps {
  onOpenGasDocs: () => void;
  theme: DashboardTheme;
  onThemeChange: (theme: DashboardTheme) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onOpenGasDocs, theme, onThemeChange }) => {
  const currentUser = storage.getCurrentUser();
  const settings = storage.getSettings();
  const native=isSupabaseBackend(settings.appsScriptUrl);
  const lang: Language = settings.language;
  const t = translations[lang];
  const isAdmin = currentUser?.role === 'ADMIN';

  const [formData, setFormData] = useState<AppSettings>({ ...settings,dashboardTheme:settings.dashboardTheme??theme });
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<{ success: boolean; message: string } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [testingGas, setTestingGas] = useState(false);
  const [gasTestResult, setGasTestResult] = useState<{
    success: boolean;
    message: string;
    latencyMs?: number;
  } | null>(null);

  const [syncingSheets, setSyncingSheets] = useState(false);
  const [savingShared,setSavingShared]=useState(false);
  const [syncResult, setSyncResult] = useState<{ success: boolean; message: string } | null>(null);

  const saveCurrentSettings = () => {
    try {
      const normalized = { ...formData, appsScriptUrl: formData.appsScriptUrl.trim() };
      const result = storage.updateSettings(normalized);
      setFormData({...storage.getSettings()});
      setSaveFeedback({
        success: result.persisted,
        message: result.persisted
          ? (lang === 'lo' ? 'ກຳລັງກຽມບັນທຶກຄ່າໄປ Sheet…' : 'Preparing to publish settings to Sheet…')
          : (lang === 'lo' ? 'browser ບໍ່ສາມາດເກັບຄ່າຖາວອນໄດ້. ຄ່າມີຜົນໃນໜ້ານີ້ ແຕ່ອາດຫາຍເມື່ອ Refresh; ກະລຸນາອະນຸຍາດ Site storage.' : 'Your browser could not persist the settings. They apply to this session but may be lost on refresh; allow site storage.')
      });
      return true;
    } catch (error) {
      setSaveFeedback({ success: false, message: error instanceof Error ? error.message : String(error) });
      return false;
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if(!isAdmin||savingShared||!saveCurrentSettings())return;
    if(storage.getSettings().appsScriptUrl){
      setSavingShared(true);
      setSaveFeedback({success:true,message:'ກຳລັງບັນທຶກຄ່າ Admin ໄປ Sheet ກາງ…'});
      try{
        const result=await GasService.saveSharedSettings();
        setSaveFeedback({success:result.success,message:result.success?'ບັນທຶກຄ່າ Admin ໄປ Sheet ກາງແລ້ວ. User ຈະໄດ້ຮັບຄ່ານີ້ເມື່ອໂຫຼດຂໍ້ມູນ.':'ຄ່າຢູ່ໃນ browser ແຕ່ຍັງບໍ່ເຜີຍແຜ່: '+result.message});
      }finally{setSavingShared(false);}
    }
  };

  const handleCurrencyChange = (curr: 'LAK' | 'USD' | 'THB') => {
    let symbol = '₭';
    let position: 'before' | 'after' = 'after';

    if (curr === 'USD') {
      symbol = '$';
      position = 'before';
    } else if (curr === 'THB') {
      symbol = '฿';
      position = 'after';
    }

    setFormData({
      ...formData,
      currencyCode: curr,
      currencySymbol: symbol,
      currencyPosition: position
    });
  };

  const handleTestGasConnection = async () => {
    if (!formData.appsScriptUrl) {
      setGasTestResult({
        success: false,
        message: 'ກະລຸນາປ້ອນ URL ຂອງ Google Apps Script Web App ກ່ອນ'
      });
      return;
    }

    setTestingGas(true);
    setGasTestResult(null);
    const res = await GasService.testConnection(formData.appsScriptUrl);
    setTestingGas(false);
    setGasTestResult(res);
    if (res.success && res.details && typeof res.details === 'object') {
      const id = (res.details as { spreadsheetId?: unknown }).spreadsheetId;
      if (typeof id === 'string' && /^[A-Za-z0-9_-]{20,}$/.test(id) && id !== 'YOUR_SPREADSHEET_ID') {
        setFormData(previous => previous.appsScriptUrl === formData.appsScriptUrl ? { ...previous, spreadsheetId: id } : previous);
      }
    }
  };

  const handleSyncToSheets = async () => {
    if (!formRef.current?.reportValidity() || !saveCurrentSettings()) return;
    setSyncingSheets(true);
    setSyncResult(null);
    try {
      const res = await GasService.syncAllToGoogleSheets(formData.appsScriptUrl.trim());
      setSyncResult(res);
    } catch (error) {
      setSyncResult({ success: false, message: error instanceof Error ? error.message : String(error) });
    } finally {
      setSyncingSheets(false);
    }
  };

  const handleResetDatabase = () => {
    const confirmed = window.confirm(
      lang === 'lo'
        ? 'ທ່ານແນ່ໃຈບໍ່ທີ່ຈະຣີເຊັດຖານຂໍ້ມູນຄືນສູ່ຄ່າເລີ່ມຕົ້ນ (ລູກຄ້າ 578 ລາຍການ ທຸກທີມ B1-B7)?'
        : 'Reset database to initial 578 pre-seeded customers across teams B1-B7?'
    );
    if (confirmed) {
      storage.resetToSeedData();
      setFormData(storage.getSettings());
      alert(lang === 'lo' ? 'ຣີເຊັດຂໍ້ມູນສຳເລັດແລ້ວ!' : 'Database reset successfully!');
    }
  };

  if(!isAdmin)return <p role="alert">Admin permission required.</p>;
  return (
    <div className="space-y-6 max-w-6xl w-full">
      
      {/* Title */}
      <div>
        <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
          <span>{t.navSettings}</span>
          <span className="text-xs font-medium text-slate-500">v{APP_VERSION}</span>
        </h2>
        <p className="text-xs text-slate-500">
          {lang === 'lo'
            ? 'ກຳນົດສະກຸນເງິນ, ແຈ້ງເຕືອນສັນຍາ, ເຊື່ອມຕໍ່ຖານຂໍ້ມູນ'
            : 'Configure currency, contract alert days, thresholds, and shared database settings'}
        </p>
      </div>

      <ThemeSwitcher theme={theme} onChange={value=>{onThemeChange(value);setFormData(previous=>({...previous,dashboardTheme:value}));}} language={lang} />

      {saveSuccess && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2 shadow-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>{t.settingsSaved}</span>
        </div>
      )}

      <form ref={formRef} onSubmit={handleSaveSettings} onChange={() => setSaveFeedback(null)} onInvalidCapture={() => setSaveFeedback({ success: false, message: lang === 'lo' ? 'ກະລຸນາກວດຄ່າໃນຊ່ອງທີ່ຖືກໝາຍ ແລ້ວກົດບັນທຶກອີກຄັ້ງ.' : 'Check the highlighted field, then save again.' })} className="space-y-6">
        
        {/* Section 1: Currency Configuration (Admin Configurable) */}
        <div className="bg-white p-5 rounded-2xl shadow-xs border border-slate-200 space-y-4">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">
            <Coins className="w-4 h-4 text-blue-600" />
            <span>{lang === 'lo' ? 'ການຕັ້ງຄ່າສະກຸນເງິນ (Currency Setting)' : 'Currency Configuration'}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(['LAK', 'USD', 'THB'] as const).map((curr) => {
              const isSelected = formData.currencyCode === curr;
              return (
                <div
                  key={curr}
                  onClick={() => isAdmin && handleCurrencyChange(curr)}
                  className={`p-3.5 rounded-xl border transition cursor-pointer flex items-center justify-between ${
                    isSelected
                      ? 'bg-blue-50/80 border-blue-500 ring-1 ring-blue-500'
                      : 'bg-slate-50/60 border-slate-200 hover:bg-slate-100/60'
                  }`}
                >
                  <div>
                    <span className="font-bold text-sm text-slate-900">
                      {curr === 'LAK' ? 'ກີບ (LAK ₭)' : curr === 'USD' ? 'ໂດລາ (USD $)' : 'ບາດ (THB ฿)'}
                    </span>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {curr === 'LAK' ? 'Lao Kip' : curr === 'USD' ? 'US Dollar' : 'Thai Baht'}
                    </p>
                  </div>
                  {isSelected && <CheckCircle2 className="w-5 h-5 text-blue-600" />}
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {lang === 'lo' ? 'ສັນຍະລັກສະກຸນເງິນ (Symbol)' : 'Currency Symbol'}
              </label>
              <input
                type="text"
                disabled={!isAdmin}
                value={formData.currencySymbol}
                onChange={(e) => setFormData({ ...formData, currencySymbol: e.target.value })}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 disabled:opacity-60"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {lang === 'lo' ? 'ຕຳແໜ່ງສັນຍະລັກ' : 'Symbol Position'}
              </label>
              <select
                disabled={!isAdmin}
                value={formData.currencyPosition}
                onChange={(e) =>
                  setFormData({ ...formData, currencyPosition: e.target.value as 'before' | 'after' })
                }
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 disabled:opacity-60"
              >
                <option value="after">{lang === 'lo' ? 'ຫຼັງຕົວເລກ (ເຊັ່ນ: 1,000,000 ₭)' : 'After Number (1,000,000 ₭)'}</option>
                <option value="before">{lang === 'lo' ? 'ໜ້າຕົວເລກ (ເຊັ່ນ: $ 1,000,000)' : 'Before Number ($ 1,000,000)'}</option>
              </select>
            </div>
          </div>
        </div>

        {/* Section 2: Beer Crate Price Formula (Configurable by Admin) */}
        <div className="bg-white p-5 rounded-2xl shadow-xs border border-slate-200 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Package className="w-4 h-4 text-emerald-600" />
              <span>{lang === 'lo' ? 'ລາຄາເບຍຕໍ່ລັງ (Beer Crate Price Formula)' : 'Beer Crate Price Formula'}</span>
            </div>
            <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
              {lang === 'lo' ? 'ແກ້ໄຂໄດ້ຕະຫຼອດ' : 'Configurable'}
            </span>
          </div>

          <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl text-xs text-blue-900 space-y-1">
            <p className="font-bold">
              {lang === 'lo' ? 'ສູດຄິດໄລ່ງົບປະມານປະຈຳປີ (Annual Budget Formula):' : 'Annual Budget Calculation:'}
            </p>
            <p className="text-[11px] font-mono text-blue-800">
              {lang === 'lo'
                ? 'ງົບປະມານປະຈຳປີ = ຈຳນວນເງື່ອນໄຂ (Condition Quantity) × ລາຄາຕໍ່ລັງ (240,000 Kip/Crate)'
                : 'Annual Budget = Condition Quantity (Cartons) × Price per Crate'}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {lang === 'lo' ? 'ລາຄາເບຍຕໍ່ລັງ (Kip / Carton)' : 'Price per Crate (Kip / Carton)'}
              </label>
              <input
                type="number"
                min="0"
                step="any"
                disabled={!isAdmin}
                value={formData.pricePerCrate || 240000}
                onChange={(e) => setFormData({ ...formData, pricePerCrate: Number(e.target.value) })}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 disabled:opacity-60"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">
                {storage.formatCurrency(formData.pricePerCrate || 240000)} / {lang === 'lo' ? 'ລັງ' : 'crate'}
              </span>
            </div>

            <div className="flex flex-col justify-end">
              {isAdmin && (
                <button
                  type="button"
                  disabled={syncingSheets||savingShared}
                  onClick={async () => {
                    if(!formRef.current?.reportValidity())return;
                    setSyncingSheets(true);
                    try{const published=await storage.commitBusinessChange('REPRICE',{price:formData.pricePerCrate||240000,recalculate:true});setSyncResult(published);setSaveSuccess(published.success);}finally{setSyncingSheets(false);}
                  }}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>{lang === 'lo' ? 'ຄິດໄລ່ຄືນງົບປະມານລູກຄ້າທັງໝົດ' : 'Recalculate All Budgets'}</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {native ? <section className="bg-white p-5 rounded-2xl border border-slate-200 space-y-3">
          <h3 className="font-bold text-slate-900">Supabase Database & Auth</h3>
          <p className="text-sm text-slate-600">{lang==='lo'?'ຂໍ້ມູນຮ້ານ, ລາຍຈ່າຍ ແລະ User ບັນທຶກໃນ Supabase. ທຸກເຄື່ອງໃຊ້ຖານຂໍ້ມູນດຽວກັນ ຕາມສິດທີ່ Admin ກຳນົດ.':'Stores, expenses and users are saved in Supabase. Every device uses the same database with permissions set by Admin.'}</p>
          <p className="text-xs text-slate-500">{lang==='lo'?'Google Sheet ເດີມເກັບໄວ້ເປັນສຳຮອງກ່ອນຍ້າຍ.':'The previous Google Sheet remains a backup from before the migration.'}</p>
          <div className="flex gap-3"><button type="button" disabled={testingGas} onClick={handleTestGasConnection} className="rounded-xl border px-4 py-2 text-sm">{lang==='lo'?'ທົດສອບການເຊື່ອມຕໍ່':'Test connection'}</button><a href={SUPABASE_DASHBOARD_URL} target="_blank" rel="noopener noreferrer" className="rounded-xl bg-emerald-600 px-4 py-2 text-sm text-white">Supabase Dashboard</a></div>
          {gasTestResult&&<p role="status" className={gasTestResult.success?'text-emerald-700':'text-rose-700'}>{gasTestResult.message}</p>}
        </section> : <>
        {/* Section 3: Alert Thresholds */}
        <div className="bg-white p-5 rounded-2xl shadow-xs border border-slate-200 space-y-4">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">
            <Bell className="w-4 h-4 text-amber-500" />
            <span>{lang === 'lo' ? 'ເງື່ອນໄຂການແຈ້ງເຕືອນ (Warning Thresholds)' : 'Alert & Warning Thresholds'}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {lang === 'lo' ? 'ເຕືອນສັນຍາໃກ້ໝົດກຳນົດລ່ວງໜ້າ (ວັນ)' : 'Contract Expiring Alert Threshold (Days)'}
              </label>
              <input
                type="number"
                min="5"
                max="90"
                disabled={!isAdmin}
                value={formData.contractAlertDays}
                onChange={(e) => setFormData({ ...formData, contractAlertDays: Number(e.target.value) })}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 disabled:opacity-60"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                {lang === 'lo' ? 'ຄ່າເລີ່ມຕົ້ນ: 30 ວັນ ກ່ອນຮອດວັນສິ້ນສຸດ Expiring On' : 'Default: 30 days prior to contract expiration'}
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {lang === 'lo' ? 'ເຕືອນງົບປະມານໃກ້ໝົດ (%)' : 'Budget Warning Threshold (%)'}
              </label>
              <input
                type="number"
                min="50"
                max="95"
                disabled={!isAdmin}
                value={formData.warningThresholdPercent}
                onChange={(e) => setFormData({ ...formData, warningThresholdPercent: Number(e.target.value) })}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 disabled:opacity-60"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                {lang === 'lo' ? 'ຄ່າເລີ່ມຕົ້ນ: 80% (ສະແດງແຖບສີສົ້ມ)' : 'Default: 80% (Triggers Amber warning bar)'}
              </span>
            </div>
          </div>
        </div>

        {/* Section 3: Google Sheets & Apps Script Configuration */}
        <div className="bg-white p-5 rounded-2xl shadow-xs border border-slate-200 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>Google Sheets Database & Apps Script</span>
            </div>
            {isAdmin && (
              <button
                type="button"
                onClick={onOpenGasDocs}
                className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
              >
                <Code2 className="w-3.5 h-3.5" />
                <span>{lang === 'lo' ? 'ເບິ່ງໂຄດ Backend .gs' : 'View GAS Code'}</span>
              </button>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Google Spreadsheet ID
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                disabled={!isAdmin}
                value={formData.spreadsheetId}
                onChange={e => setFormData({ ...formData, spreadsheetId: e.target.value.trim() })}
                placeholder="Spreadsheet ID (or click Test to read it from the backend)"
                className="w-full p-2.5 bg-slate-100 border border-slate-200 rounded-xl text-xs font-mono font-semibold text-slate-800"
              />
              <a
                href={`https://docs.google.com/spreadsheets/d/${formData.spreadsheetId}/edit`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition whitespace-nowrap shadow-xs"
              >
                <span>Open Sheet</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Google Apps Script Web App URL
            </label>
            <div className="flex items-center gap-2">
              <input
                type="url"
                readOnly={Boolean(import.meta.env?.PROD)}
                disabled={!isAdmin}
                placeholder="https://script.google.com/macros/s/AKfycb.../exec"
                value={formData.appsScriptUrl}
                onChange={(e) => setFormData({ ...formData, appsScriptUrl: e.target.value })}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
              />
              <button
                type="button"
                onClick={handleTestGasConnection}
                disabled={testingGas}
                className="px-3.5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition whitespace-nowrap cursor-pointer disabled:opacity-50"
              >
                {testingGas ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Server className="w-3.5 h-3.5" />
                )}
                <span>{lang === 'lo' ? 'ທົດສອບ' : 'Test'}</span>
              </button>
            </div>

            {gasTestResult && (
              <div
                className={`mt-2 p-3 rounded-xl text-xs flex items-center justify-between ${
                  gasTestResult.success
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  {gasTestResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-600" />
                  )}
                  <span>{gasTestResult.message}</span>
                </div>
                {gasTestResult.latencyMs !== undefined && (
                  <span className="font-mono font-bold text-[11px]">
                    {gasTestResult.latencyMs} ms
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        </>}

        {isAdmin && (
          <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-3">
            <h3 className="text-sm font-bold text-slate-900">{lang === 'lo' ? `ບັນທຶກຂໍ້ມູນໄປ ${native?'Supabase':'Google Sheets'}` : `Save data to ${native?'Supabase':'Google Sheets'}`}</h3>
            {native?<p className="text-xs text-slate-600">{lang==='lo'?'ການເພີ່ມ, ແກ້ໄຂ ແລະລົບ ບັນທຶກໄປ Supabase ທັນທີ. ເຄື່ອງອື່ນຈະໂຫຼດຂໍ້ມູນລ່າສຸດທຸກ 15 ວິນາທີ ໃນຂະນະເປີດແອັບ.':'Adds, edits and deletions save to Supabase immediately. Other open devices refresh every 15 seconds.'}</p>:<p className="text-xs text-slate-600">{lang === 'lo' ? 'Sync ດ້ວຍຕົນເອງ: ລູກຄ້າ, ເງື່ອນໄຂ, ສັນຍາ, ງົບປະມານ, ລາຍຈ່າຍ, ປະຫວັດ ແລະຄ່າທີ່ບັນທຶກແລ້ວ. ອັບເດດຕາມ ID ໂດຍບໍ່ລຶບແຖວເກົ່າ; ຖ້າຕ້ອງການດຶງຂໍ້ມູນກັບ ໃຫ້ກົດ “ໂຫຼດຈາກ Sheet” ດ້ານເທິງ.' : 'Manual app-to-Sheets sync of customers, conditions, contracts, budgets, transactions, logs and saved settings. Updates by ID, preserves other rows, and sends this browser’s changes to Sheets. Use “Load from Sheet” above to import the latest Sheet data.'}</p>}
            <div className="flex flex-wrap gap-2">
              {!native&&<a href="./Code.gs" download="Code.gs" className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700">{lang === 'lo' ? 'ດາວໂຫຼດ Code.gs (ໄຟລ໌ດຽວ)' : 'Download unified Code.gs'}</a>}
              <button type="button" disabled={syncingSheets} onClick={async()=>{setSyncingSheets(true);try{setSyncResult(await storage.backupDatabase());}finally{setSyncingSheets(false);}}} className="px-4 py-2 rounded-xl border border-blue-300 text-blue-800 text-xs font-bold disabled:opacity-50">{lang==='lo'?'ສຳຮອງຂໍ້ມູນທັງໝົດ ລວມ User':'Back up all data including users'}</button>
              <button type="button" onClick={handleSyncToSheets} disabled={syncingSheets || !formData.appsScriptUrl.trim()} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold disabled:opacity-50 flex items-center gap-2 cursor-pointer">
                <RefreshCw className={`w-4 h-4 ${syncingSheets ? 'animate-spin' : ''}`} />
                {syncingSheets ? (lang === 'lo' ? 'ກຳລັງ Sync…' : 'Syncing…') : (lang === 'lo' ? `Sync ໄປ ${native?'Supabase':'Google Sheets'}` : `Sync to ${native?'Supabase':'Google Sheets'}`)}
              </button>
            </div>
            {syncResult && <p role="status" className={`p-3 rounded-xl text-xs border ${syncResult.success ? 'text-emerald-800 bg-emerald-50 border-emerald-200' : 'text-rose-800 bg-rose-50 border-rose-200'}`}>{syncResult.message}</p>}
          </div>
        )}

        {/* Section 4: Data Management & Reset */}
        {isAdmin && (
          <div className="bg-white p-5 rounded-2xl shadow-xs border border-slate-200 space-y-4">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">
              <ShieldAlert className="w-4 h-4 text-rose-600" />
              <span>{lang === 'lo' ? 'ຈັດການຂໍ້ມູນລະບົບ (Data Administration)' : 'Data Administration'}</span>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
              <div>
                <p className="text-xs font-bold text-slate-800">
                  {lang === 'lo' ? 'ຣີເຊັດຖານຂໍ້ມູນລູກຄ້າ 578 ລາຍການ (Reset to Seed Data)' : 'Reset Pre-seeded Database (578 Customers)'}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {lang === 'lo'
                    ? 'ສ້າງຂໍ້ມູນລູກຄ້າ 578 ລາຍການ, ເງື່ອນໄຂສັນຍາ, ແລະ ຮອບງົບປະມານທຸກທີມ B1-B7 ໃໝ່ທັງໝົດ'
                    : 'Regenerates the complete initial 578 customers across teams B1-B7 with standard contract cycles'}
                </p>
              </div>

              <button
                type="button"
                onClick={handleResetDatabase}
                className="px-3.5 py-2 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition cursor-pointer whitespace-nowrap self-start sm:self-auto"
              >
                {lang === 'lo' ? 'ຣີເຊັດຖານຂໍ້ມູນ' : 'Reset Data'}
              </button>
            </div>
          </div>
        )}

        {/* Save button */}
        {isAdmin && (
          <div className="sticky bottom-0 z-30 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-lg">
            {saveFeedback && <p role="status" aria-live="polite" className={`flex-1 text-xs font-semibold ${saveFeedback.success ? 'text-emerald-800' : 'text-rose-700'}`}>{saveFeedback.message}</p>}
            <button
              type="submit"
              disabled={syncingSheets||savingShared}
              aria-label={lang === 'lo' ? 'ບັນທຶກການຕັ້ງຄ່າ' : 'Save settings'}
              className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-md shadow-blue-600/30 transition cursor-pointer active:scale-95"
            >
              <Save className="w-4 h-4" />
              <span>{lang === 'lo' ? 'ບັນທຶກການຕັ້ງຄ່າ' : 'Save settings'}</span>
            </button>
          </div>
        )}

      </form>
    </div>
  );
};
