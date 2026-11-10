/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * MKT Customer Budget Management Web App
 * Teams B1 - B7
 */

import React, { useState, useEffect } from 'react';
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
import { CustomersView } from './views/CustomersView';
import { BudgetManagementView } from './views/BudgetManagementView';
import { TransactionsView } from './views/TransactionsView';
import { ContractManagementView } from './views/ContractManagementView';
import { ReportsView } from './views/ReportsView';
import { UsersView } from './views/UsersView';
import { SettingsView } from './views/SettingsView';

// Modals
import { CustomerDetailModal } from './views/CustomerDetailModal';
import { AddTransactionModal } from './views/AddTransactionModal';
import { AddContractModal } from './views/AddContractModal';
import { AddCustomerModal } from './views/AddCustomerModal';
import { GasDocsModal } from './views/GasDocsModal';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(storage.getCurrentUser());
  const [currentView, setCurrentView] = useState<string>('dashboard');
  const [selectedTeam, setSelectedTeam] = useState<Team | 'ALL'>('ALL');
  const [navigationOpen, setNavigationOpen] = useState(false);
  const { theme, setTheme } = useDashboardTheme(currentUser?.username || 'guest');
  const backendUrl=storage.getSettings().appsScriptUrl;
  const sharedTheme=storage.getSettings().dashboardTheme;
  useEffect(()=>{if(sharedTheme)setTheme(sharedTheme);},[currentUser?.id,sharedTheme]);
  useEffect(()=>{if(currentUser?.role!=='ADMIN'&&['settings','users'].includes(currentView))setCurrentView('dashboard');},[currentUser?.role,currentView]);
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
      <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
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
    <div className={`mkt-shell theme-${isAdmin?theme:(sharedTheme||'glass')} min-h-screen flex flex-col font-sans`}>
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

          {currentView === 'settings' && isAdmin && (
            <SettingsView
              theme={theme}
              onThemeChange={setTheme}
              onOpenGasDocs={() => setShowGasDocsModal(true)}
            />
          )}
        </main>
      </div>

      {/* Offline Alert Indicator */}
      <OfflineIndicator language={lang} />

      {/* Modals */}
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

    </div>
  );
}
