import {isSupabaseBackend,SUPABASE_DASHBOARD_URL} from '../config/supabase';
import React, { useState } from 'react';
import {
  FileSpreadsheet,
  Globe,
  LogOut,
  User,
  Shield,
  Menu,
  X,
  ExternalLink,
  ChevronDown
} from 'lucide-react';
import { storage } from '../services/storage';
import {GasService} from '../services/gasService';
import { translations, Language } from '../locales/translations';
import { PWAInstallButton } from './PWAInstallButton';
import { Team, TEAMS } from '../types';
import { EditProfileModal } from './EditProfileModal';

interface HeaderProps {
  currentView: string;
  onSelectView: (view: string) => void;
  selectedTeam: Team | 'ALL';
  onSelectTeam: (team: Team | 'ALL') => void;
  navigationOpen: boolean;
  setNavigationOpen: (open: boolean) => void;
  onOpenGasDocs: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  selectedTeam,
  onSelectTeam,
  navigationOpen,
  setNavigationOpen,
  onOpenGasDocs
}) => {
  const currentUser = storage.getCurrentUser();
  const settings = storage.getSettings();
  const lang: Language = settings.language;
  const t = translations[lang];

  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);

  const toggleLanguage = async () => {
    if(!storage.canManageSettings())return;
    const nextLang = lang === 'lo' ? 'en' : 'lo';
    storage.updateSettings({ language: nextLang });
    if(storage.getSettings().appsScriptUrl){const result=await GasService.saveSharedSettings();if(!result.success)window.alert('Settings are not yet published: '+result.message);}
  };

  const isAdmin = currentUser?.role === 'ADMIN';

  return (
    <header className="sticky top-0 z-40 bg-slate-900 border-b border-slate-800 text-white shadow-md">
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Navigation toggle and logo */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setNavigationOpen(!navigationOpen)}
              type="button"
              className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer"
              aria-label="Toggle navigation"
              aria-expanded={navigationOpen}
              aria-controls="main-navigation"
            >
              {navigationOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>

            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-emerald-500 p-0.5 shadow-md flex items-center justify-center">
                <div className="w-full h-full bg-slate-900 rounded-[10px] flex items-center justify-center font-black text-blue-400 text-sm">
                  MKT
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="font-bold text-base sm:text-lg tracking-tight text-white leading-none">
                    {t.appName}
                  </h1>
                  <span className="hidden sm:inline-block px-2 py-0.5 text-[10px] font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-full">
                    B1 - B7
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 hidden md:block">
                  {t.appNameSub} • ID: {settings.spreadsheetId.slice(0, 10)}...
                </p>
              </div>
            </div>
          </div>

          {/* Center / Right: Actions & Controls */}
          <div className="flex items-center gap-2 sm:gap-3">
            
            {/* Team Selector: If Admin, allow selecting B1-B7 or ALL. If Team User, lock to assigned team */}
            <div className="hidden sm:flex items-center gap-1.5 bg-slate-800/80 px-2.5 py-1.5 rounded-xl border border-slate-700">
              <span className="text-xs text-slate-400 font-medium">{t.team}:</span>
              {isAdmin ? (
                <select
                  value={selectedTeam}
                  onChange={(e) => onSelectTeam(e.target.value as Team | 'ALL')}
                  className="bg-transparent text-xs font-semibold text-white focus:outline-none cursor-pointer"
                >
                  <option value="ALL" className="bg-slate-900 text-white">{t.allTeams}</option>
                  {TEAMS.map((team) => (
                    <option key={team} value={team} className="bg-slate-900 text-white">
                      {t.team} {team}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-xs font-bold text-emerald-400 px-1">
                  {t.team} {currentUser?.team}
                </span>
              )}
            </div>

            {/* Google Sheets Link */}
            {isAdmin && <a
              href={isSupabaseBackend(settings.appsScriptUrl)?SUPABASE_DASHBOARD_URL:`https://docs.google.com/spreadsheets/d/${settings.spreadsheetId}/edit`}
              target="_blank"
              rel="noopener noreferrer"
              title={isSupabaseBackend(settings.appsScriptUrl)?'Open Supabase':'Open Google Spreadsheet'}
              className="hidden md:flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-400 bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-800/60 rounded-xl transition"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>{isSupabaseBackend(settings.appsScriptUrl)?'Supabase':'Google Sheet'}</span>
              <ExternalLink className="w-3 h-3 text-emerald-500" />
            </a>}

            {/* GAS Backend Code Modal Button (Admin Only) */}
            {isAdmin && !isSupabaseBackend(settings.appsScriptUrl) && (
              <button
                onClick={onOpenGasDocs}
                className="hidden lg:flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-300 bg-blue-950/60 hover:bg-blue-900/60 border border-blue-800/60 rounded-xl transition cursor-pointer"
                title="Google Apps Script backend deployment files"
              >
                <span>GAS Backend</span>
              </button>
            )}

            {/* PWA Install Button */}
            <PWAInstallButton language={lang} />

            {/* Language Switcher */}
            {isAdmin && <button
              onClick={toggleLanguage}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl transition cursor-pointer"
              title="Switch Language (Lao / English)"
            >
              <Globe className="w-3.5 h-3.5 text-blue-400" />
              <span className="font-semibold">{lang === 'lo' ? 'ລາວ 🇱🇦' : 'EN 🇬🇧'}</span>
            </button>}

            {/* User Profile Dropdown */}
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 pl-2 pr-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl transition cursor-pointer"
              >
                <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold ${
                  isAdmin ? 'bg-amber-500 text-slate-900' : 'bg-blue-600 text-white'
                }`}>
                  {isAdmin ? <Shield className="w-3.5 h-3.5" /> : (currentUser?.username?.charAt(0).toUpperCase() || 'U')}
                </div>
                <div className="text-left hidden sm:block">
                  <div className="text-xs font-semibold text-white leading-tight">
                    {currentUser?.username}
                  </div>
                  <div className="text-[10px] text-slate-400 leading-tight">
                    {isAdmin ? 'Admin' : `Team ${currentUser?.team}`}
                  </div>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-white shadow-2xl border border-slate-100 py-2 z-50 text-slate-800 animate-in fade-in zoom-in-95">
                  <div className="px-4 py-2 border-b border-slate-100">
                    <p className="text-xs text-slate-500">{t.profile}</p>
                    <p className="text-sm font-bold text-slate-900 truncate">
                      {currentUser?.fullName}
                    </p>
                    <p className="text-xs text-blue-600 font-semibold mt-0.5">
                      {isAdmin ? t.roleAdmin : `${t.roleTeamUser} (${currentUser?.team})`}
                    </p>
                  </div>

                  <div className="py-1">
                    <button
                      onClick={() => {
                        setUserMenuOpen(false);
                        setShowEditProfileModal(true);
                      }}
                      className="w-full text-left px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 flex items-center gap-2 cursor-pointer transition"
                    >
                      <User className="w-4 h-4 text-blue-600" />
                      <span>{lang === 'lo' ? 'ແກ້ໄຂໂປຣໄຟລ໌ / ລະຫັດຜ່ານ' : 'Edit Profile & Password'}</span>
                    </button>

                    <button
                      onClick={() => {
                        setUserMenuOpen(false);
                        storage.logout();
                      }}
                      className="w-full text-left px-4 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 flex items-center gap-2 cursor-pointer transition border-t border-slate-100"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>{t.logout}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>
      </div>

      {showEditProfileModal && (
        <EditProfileModal
          onClose={() => setShowEditProfileModal(false)}
        />
      )}
    </header>
  );
};
