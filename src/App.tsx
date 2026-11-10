/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * MKT Customer Budget Management Web App
 * Teams B1 - B7
 */

import React, { useState, useEffect, lazy, Suspense } from 'react';
import { MotionConfig } from 'motion/react';
import { BottomNavigation } from './components/BottomNavigation';
import { PersonalSettings } from './components/PersonalSettings';
import { useGoldAppearance } from './components/GoldAppearance';
import { useDashboardTheme } from './components/ThemeSwitcher';
import { storage } from './services/storage';
import { startSheetAutoRefresh } from './services/sheetAutoRefresh';
import { translations, Language } from './locales/translations';
import { Team, User } from './types';

// Components
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { OfflineIndicator } from './components/OfflineIndicator';
import { SheetDataNotice } from './components/SheetDataNotice';
import { SaveSuccessToast } from './components/SaveSuccessToast';

// Views
import { LoginView } from './views/LoginView';
import { DashboardView } from './views/DashboardView';
const CustomersView=lazy(()=>import('./views/CustomersView').then(module=>({default:module.CustomersView})));
const BudgetManagementView=lazy(()=>import('./views/BudgetManagementView').then(module=>({default:module.BudgetManagementView})));
const TransactionsView=lazy(()=>import('./views/TransactionsView').then(module=>({default:module.TransactionsView})));
const ContractManagementView=lazy(()=>import('./views/ContractManagementView').then(module=>({default:module.ContractManagementView})));
const ReportsView=lazy(()=>import('./views/ReportsView').then(module=>({default:module.ReportsView})));
const UsersView=lazy(()=>import('./views/UsersView').then(module=>({default:module.UsersView})));
const SettingsView=lazy(()=>import('./views/SettingsView').then(module=>({default:module.SettingsView})));

// Modals
const CustomerDetailModal=lazy(()=>import('./views/CustomerDetailModal').then(module=>({default:module.CustomerDetailModal})));
const AddTransactionModal=lazy(()=>import('./views/AddTransactionModal').then(module=>({default:module.AddTransactionModal})));
const AddContractModal=lazy(()=>import('./views/AddContractModal').then(module=>({default:module.AddContractModal})));
const AddCustomerModal=lazy(()=>import('./views/AddCustomerModal').then(module=>({default:module.AddCustomerModal})));
const GasDocsModal=lazy(()=>import('./views/GasDocsModal').then(module=>({default:module.GasDocsModal})));

export default function App() {
  const goldAppearance=useGoldAppearance();
  const [currentUser, setCurrentUser] = useState<User | null>(storage.getCurrentUser());
  const [currentView, setCurrentView] = useState<string>('dashboard');
  const [selectedTeam, setSelectedTeam] = useState<Team | 'ALL'>('ALL');
  const [navigationOpen, setNavigationOpen] = useState(false);
  const { theme, setTheme } = useDashboardTheme(currentUser?.username || 'guest');
  const backendUrl=storage.getSettings().appsScriptUrl;
  const sharedTheme=storage.getSettings().dashboardTheme;
  useEffect(()=>{if(sharedTheme)setTheme(sharedTheme);},[currentUser?.id,sharedTheme]);
  useEffect(()=>{if(currentUser?.role!=='ADMIN'&&currentView==='users')setCurrentView('dashboard');},[currentUser?.role,currentView]);
  useEffect(()=>{
    const refresh=async()=>{
      storage.refreshBudgetCalendar();
      if(currentUser && backendUrl && storage.hasRemoteUserSession()){
        if(storage.getPendingSheetPublish()||storage.getSheetDataState().status==='loading'||storage.getBusinessWriteState().status==='saving')return;
        if(storage.getPendingBusinessWrite()){const saved=await storage.retryPendingBusinessWrite();if(!saved.success)return;}
        if(storage.hasUnsyncedBusinessData()){const common=await storage.refreshSharedSettings();if(!common.success)return;}
        await storage.loadBusinessFromSheets(false,true);
      }
    };
    const calendarTimer=window.setInterval(()=>storage.refreshBudgetCalendar(),30000);
    const stopRefresh=currentUser&&backendUrl?startSheetAutoRefresh(refresh):()=>{};
    return ()=>{window.clearInterval(calendarTimer);stopRefresh();};
  },[currentUser?.id,backendUrl]);

  // Modal States
  const [detailCustomerCode, setDetailCustomerCode] = useState<string | null>(null);
  const [addTransactionCustomerCode, setAddTransactionCustomerCode] = useState<string | null>(null);
  const [showAddTransactionModal, setShowAddTransactionModal] = useState(false);
  const [addContractCustomerCode, setAddContractCustomerCode] = useState<string | null>(null);
  const [showAddContractModal, setShowAddContractModal] = useState(false);
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false);
  const [showGasDocsModal, setShowGasDocsModal] = useState(false);

  // Re-render on storage updates
  useEffect(() => {
    const unsubscribe = storage.subscribe(() => {
      const user = storage.getCurrentUser();
      setCurrentUser(user ? { ...user } : null);
      if (user && user.role !== 'ADMIN' && user.team !== 'ALL') {
        setSelectedTeam(user.team);
      }
    });

    // Check initial user team
    const initialUser = storage.getCurrentUser();
    if (initialUser && initialUser.role !== 'ADMIN' && initialUser.team !== 'ALL') {
      setSelectedTeam(initialUser.team);
    }

    return () => unsubscribe();
  }, []);

  // Not logged in -> Show Login
  if (!currentUser) {
    return (
      <div className="beerlao-gold gold-login-shell min-h-screen font-sans">
        <LoginView />
        <OfflineIndicator language="lo" />
      </div>
    );
  }

  const settings = storage.getSettings();
  const lang: Language = settings.language;
  const isAdmin = currentUser.role === 'ADMIN';

  const handleOpenAddTransaction = (customerCode?: string) => {
    setAddTransactionCustomerCode(customerCode || null);
    setShowAddTransactionModal(true);
  };

  const handleOpenAddContract = (customerCode?: string) => {
    setAddContractCustomerCode(customerCode || null);
    setShowAddContractModal(true);
  };

  return (
    <MotionConfig reducedMotion="user"><div className={`mkt-shell ${goldAppearance?'beerlao-gold':''} theme-${isAdmin?theme:(sharedTheme||'glass')} min-h-screen flex flex-col font-sans`}>
      <SaveSuccessToast userId={currentUser.id} language={lang} />
      
      {/* Global Header */}
      <Header
        currentView={currentView}
        onSelectView={setCurrentView}
        selectedTeam={selectedTeam}
        onSelectTeam={setSelectedTeam}
        navigationOpen={navigationOpen}
        setNavigationOpen={setNavigationOpen}
        onOpenGasDocs={() => setShowGasDocsModal(true)}
      />

      <div className="flex-1 flex w-full">
        
        {/* Sidebar */}
        <Sidebar
          currentView={currentView}
          onSelectView={setCurrentView}
          navigationOpen={navigationOpen}
          setNavigationOpen={setNavigationOpen}
          onOpenGasDocs={() => setShowGasDocsModal(true)}
        />

        {/* Main Content Area */}
        <main className="mkt-main flex-1 p-4 sm:p-6 lg:p-8 min-w-0 overflow-y-auto">
          <SheetDataNotice />
          <Suspense fallback={<div className="gold-view-loading" role="status"><span className="gold-loading-spinner"/>{lang==='lo'?'ກຳລັງໂຫຼດ…':'Loading…'}</div>}>
          {currentView === 'dashboard' && (
            <DashboardView
              selectedTeam={selectedTeam}
              onSelectTeam={setSelectedTeam}
              onNavigate={setCurrentView}
              onOpenAddTransaction={() => handleOpenAddTransaction()}
              onOpenAddContract={() => handleOpenAddContract()}
            />
          )}

          {currentView === 'customers' && (
            <CustomersView
              selectedTeam={selectedTeam}
              onSelectTeam={setSelectedTeam}
              onOpenCustomerDetail={(code) => setDetailCustomerCode(code)}
              onOpenAddCustomer={() => setShowAddCustomerModal(true)}
              onOpenAddTransaction={(code) => handleOpenAddTransaction(code)}
            />
          )}

          {currentView === 'budgets' && (
            <BudgetManagementView
              onOpenAddContract={()=>handleOpenAddContract()}
              selectedTeam={selectedTeam}
              onSelectTeam={setSelectedTeam}
              onOpenCustomerDetail={(code) => setDetailCustomerCode(code)}
              onOpenAddTransaction={(code) => handleOpenAddTransaction(code)}
            />
          )}

          {currentView === 'transactions' && (
            <TransactionsView
              selectedTeam={selectedTeam}
              onSelectTeam={setSelectedTeam}
              onOpenAddTransaction={() => handleOpenAddTransaction()}
              onOpenCustomerDetail={(code) => setDetailCustomerCode(code)}
            />
          )}

          {currentView === 'contracts' && (
            <ContractManagementView
              selectedTeam={selectedTeam}
              onSelectTeam={setSelectedTeam}
              onOpenCustomerDetail={(code) => setDetailCustomerCode(code)}
              onOpenAddContract={(code) => handleOpenAddContract(code)}
            />
          )}

          {currentView === 'reports' && (
            <ReportsView
              selectedTeam={selectedTeam}
              onSelectTeam={setSelectedTeam}
            />
          )}

          {currentView === 'users' && isAdmin && (
            <UsersView />
          )}

          {currentView === 'settings' && !isAdmin && <PersonalSettings/>}
          {currentView === 'settings' && isAdmin && (
            <SettingsView
              theme={theme}
              onThemeChange={setTheme}
              onOpenGasDocs={() => setShowGasDocsModal(true)}
            />
          )}
          </Suspense>
        </main>
      </div>

      <BottomNavigation currentView={currentView} onNavigate={(view)=>{setCurrentView(view);setNavigationOpen(false);window.scrollTo({top:0,behavior:'instant'});}} language={lang}/>

      {/* Offline Alert Indicator */}
      <OfflineIndicator language={lang} />

      {/* Modals */}
      <Suspense fallback={<div className="gold-modal-loading" role="status"><span className="gold-loading-spinner"/>{lang==='lo'?'ກຳລັງໂຫຼດ…':'Loading…'}</div>}>
      {detailCustomerCode && (
        <CustomerDetailModal
          customerCode={detailCustomerCode}
          onClose={() => setDetailCustomerCode(null)}
          onOpenAddTransaction={(code) => {
            setDetailCustomerCode(null);
            handleOpenAddTransaction(code);
          }}
          onOpenAddContract={(code) => {
            setDetailCustomerCode(null);
            handleOpenAddContract(code);
          }}
        />
      )}

      {showAddTransactionModal && (
        <AddTransactionModal
          initialCustomerCode={addTransactionCustomerCode || undefined}
          onClose={() => {
            setShowAddTransactionModal(false);
            setAddTransactionCustomerCode(null);
          }}
          onSuccess={() => {
            setShowAddTransactionModal(false);
            setAddTransactionCustomerCode(null);
          }}
        />
      )}

      {showAddContractModal && (
        <AddContractModal
          initialCustomerCode={addContractCustomerCode || undefined}
          onClose={() => {
            setShowAddContractModal(false);
            setAddContractCustomerCode(null);
          }}
          onSuccess={() => {
            setShowAddContractModal(false);
            setAddContractCustomerCode(null);
          }}
        />
      )}

      {showAddCustomerModal && (
        <AddCustomerModal
          onClose={() => setShowAddCustomerModal(false)}
          onSuccess={() => setShowAddCustomerModal(false)}
        />
      )}

      {showGasDocsModal && (
        <GasDocsModal
          onClose={() => setShowGasDocsModal(false)}
        />
      )}

      </Suspense>
    </div></MotionConfig>
  );
}
