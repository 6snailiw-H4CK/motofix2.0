/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { 
  signOut
} from 'firebase/auth';
import { auth } from './firebase';
import { Toast } from './components/feedback/Toast';
import { AuthScreen } from './components/auth/AuthScreen';
import { BlockedAccessScreen } from './components/auth/BlockedAccessScreen';
import { ErrorBoundary } from './components/layout/ErrorBoundary';
import { LoadingScreen } from './components/layout/LoadingScreen';
import { AppShell } from './components/layout/AppShell';
import { AppViewRenderer } from './components/layout/AppViewRenderer';
import { ProfileSetupModal } from './components/settings/ProfileSetupModal';
import { DEFAULT_SERVICE_TYPES } from './constants/appDefaults';
import { canAccessFiscalModule } from './config/fiscal';
import { useAdminActions } from './hooks/useAdminActions';
import { useAppDerivedData } from './hooks/useAppDerivedData';
import { useAppShellState } from './hooks/useAppShellState';
import { useAppointmentActions } from './hooks/useAppointmentActions';
import { useAuthProfile } from './hooks/useAuthProfile';
import { useClientActions } from './hooks/useClientActions';
import { useClientFormState } from './hooks/useClientFormState';
import { useClientFlow } from './hooks/useClientFlow';
import { useClientStatusSync } from './hooks/useClientStatusSync';
import { useCashRegisterActions } from './hooks/useCashRegisterActions';
import { useDeleteConfirmation } from './hooks/useDeleteConfirmation';
import { useExpenseActions } from './hooks/useExpenseActions';
import { useFiscalActions } from './hooks/useFiscalActions';
import { useMaintenanceActions } from './hooks/useMaintenanceActions';
import { useMaintenanceStats } from './hooks/useMaintenanceStats';
import { useMessageLogActions } from './hooks/useMessageLogActions';
import { useNotifications } from './hooks/useNotifications';
import { useOfflineDataPreload } from './hooks/useOfflineDataPreload';
import { useOfflineSyncStatus } from './hooks/useOfflineSyncStatus';
import { useProductActions } from './hooks/useProductActions';
import { useServiceTypeActions } from './hooks/useServiceTypeActions';
import { useSettingsActions } from './hooks/useSettingsActions';
import { useSubscriptionStatus } from './hooks/useSubscriptionStatus';
import { useSubscriptionExpiryGuard } from './hooks/useSubscriptionExpiryGuard';
import { useUserCollections } from './hooks/useUserCollections';
import { useWarrantyActions } from './hooks/useWarrantyActions';
import { useWhatsAppReminderActions } from './hooks/useWhatsAppReminderActions';
import { getMaintenanceStatus } from './lib/maintenanceStatus';
import { canonicalServiceType, getServiceTypeKey } from './lib/serviceTypes';

// --- Main App ---

export default function App() {
  const { user, userProfile, loading, isNewUser } = useAuthProfile();
  const {
    allUsers,
    clients,
    maintenances,
    warranties,
    settings,
    setSettings,
    settingsLoaded,
    appointments,
    expenseEntries,
    messageLogs,
    productCatalog,
    cashLaunches,
    fiscalCompanies,
    fiscalInvoices,
    fiscalLogs,
    operationalLogs,
    collectionListenerIssues
  } = useUserCollections({ user, userProfile, isNewUser });
  const offlineSyncStatus = useOfflineSyncStatus();
  useOfflineDataPreload({ user, userProfile });
  const {
    colorMode,
    expandedTopService,
    isNewService,
    searchQuery,
    serviceListFilter,
    setColorMode,
    setExpandedTopService,
    setIsNewService,
    setSearchQuery,
    setServiceListFilter,
    setToast,
    setView,
    toast,
    view,
  } = useAppShellState();
  const {
    clearDeleteConfirm,
    confirmOrRequestDelete,
    getDeleteConfirmId,
  } = useDeleteConfirmation();
  const disabledDefaultServiceKeys = new Set((settings.disabledDefaultServiceTypes || []).map(getServiceTypeKey));
  const activeDefaultServiceTypes = DEFAULT_SERVICE_TYPES.filter(type => !disabledDefaultServiceKeys.has(getServiceTypeKey(type)));
  const defaultServiceType = canonicalServiceType(activeDefaultServiceTypes[0] || settings.serviceTypes?.[0] || DEFAULT_SERVICE_TYPES[0]);
  const workshopName = settings.businessName || userProfile?.displayName || 'MotoFix';
  const getStatus = getMaintenanceStatus;
  const fiscalModuleAvailable = canAccessFiscalModule(userProfile, user?.email);

  const [adminPinPromptOpen, setAdminPinPromptOpen] = useState(false);
  const [adminPinError, setAdminPinError] = useState<string | null>(null);
  const [adminPinValue, setAdminPinValue] = useState('');

  const handleViewChange = useCallback((nextView: Parameters<typeof setView>[0]) => {
    if (nextView === 'fiscal' && !fiscalModuleAvailable) {
      setView('dashboard');
      return;
    }

    if (nextView === 'admin') {
      setAdminPinError(null);
      setAdminPinValue('');
      setAdminPinPromptOpen(true);
      return;
    }

    setView(nextView);
  }, [fiscalModuleAvailable, setView]);

  const handleAdminPinSubmit = useCallback((input: string) => {
    if (input === '1570') {
      setAdminPinPromptOpen(false);
      setAdminPinError(null);
      setAdminPinValue('');
      setView('admin');
      return;
    }

    setAdminPinError('Senha incorreta. Tente novamente.');
  }, [setView]);

  const handleAdminPinCancel = useCallback(() => {
    setAdminPinPromptOpen(false);
    setAdminPinError(null);
    setAdminPinValue('');
  }, []);

  const handleExpenseSaved = useCallback(() => setView('expenses'), [setView]);
  const openWarrantyForm = useCallback(() => setView('new-warranty'), [setView]);
  const handleWarrantySaved = useCallback(() => setView('warranties'), [setView]);
  const handleDeleteConfirmed = useCallback(() => clearDeleteConfirm(), [clearDeleteConfirm]);

  const clientForm = useClientFormState({
    clients,
    defaultServiceType,
    isClientFormOpen: view === 'new-client',
    maintenances,
  });
  const { handleClientSaved } = useClientFlow({
    clientForm,
    setIsNewService,
    setView,
    view,
  });
  const serviceTypeActions = useServiceTypeActions({
    user,
    settings,
    setSettings,
    onSelectServiceType: clientForm.setServiceType,
  });
  const clientActions = useClientActions({
    user,
    clients,
    maintenances,
    editingClient: clientForm.editingClient,
    getStatus,
    isCreatingService: clientForm.isCreatingService,
    onSaved: handleClientSaved,
    onDeleted: handleDeleteConfirmed,
    workshopName,
  });
  const appointmentActions = useAppointmentActions({
    user,
    onDeleted: handleDeleteConfirmed,
  });
  const adminActions = useAdminActions({
    users: allUsers,
    userProfile,
  });
  const expenseActions = useExpenseActions({
    user,
    onAfterSave: handleExpenseSaved,
    workshopName,
  });
  const cashRegisterActions = useCashRegisterActions({
    user,
    workshopName,
  });
  const fiscalActions = useFiscalActions({
    fiscalCompanies,
  });
  const productActions = useProductActions({
    user,
    onDeleted: handleDeleteConfirmed,
  });
  const maintenanceActions = useMaintenanceActions({
    user,
    clients,
    defaultServiceType,
    getStatus,
    maintenances,
    onDeleted: handleDeleteConfirmed,
    workshopName,
  });
  const messageLogActions = useMessageLogActions({
    user,
    onDeleted: handleDeleteConfirmed,
  });
  const settingsActions = useSettingsActions({
    user,
    settings,
    setSettings,
  });
  const warrantyActions = useWarrantyActions({
    user,
    settings,
    warranties,
    onOpenForm: openWarrantyForm,
    onSaved: handleWarrantySaved,
    onDeleted: handleDeleteConfirmed,
    workshopName,
  });

  const {
    alertCount,
    dailyPendingAlerts,
    requestNotificationPermission
  } = useNotifications({ clients });
  const { sendWhatsApp } = useWhatsAppReminderActions({
    user,
    settings,
    setToast,
  });
  useClientStatusSync({
    user,
    clients,
    getStatus,
  });
  useSubscriptionExpiryGuard({
    userProfile,
  });

  const maintenanceStats = useMaintenanceStats({
    cashLaunches,
    clients,
    maintenances,
    warranties,
    searchQuery,
    serviceListFilter,
  });

  const { isExpired, shouldBlock } = useSubscriptionStatus({ userProfile });

  useEffect(() => {
    if (isExpired && !shouldBlock && userProfile && userProfile.role !== 'admin') {
      handleViewChange('checkout');
    }
  }, [handleViewChange, isExpired, shouldBlock, userProfile]);

  useEffect(() => {
    if (view === 'fiscal' && !fiscalModuleAvailable) {
      setView('dashboard');
    }
  }, [fiscalModuleAvailable, setView, view]);

  const shouldBlockUser = shouldBlock;

  const {
    chartData,
    historyServiceTypeOptions,
    nextAppointment,
    scheduleClientHistoryRows,
    serviceTypeOptions,
  } = useAppDerivedData({
    appointments,
    clients,
    editingClient: clientForm.editingClient,
    maintenances,
    settings,
  });

  // Early returns AFTER all hooks
  if (loading) return <LoadingScreen />;
  if (!user) return <AuthScreen />;

  if (shouldBlockUser) {
    return <BlockedAccessScreen userId={user.uid} onSignOut={() => signOut(auth)} />;
  }

  return (
    <ErrorBoundary>
      <AppShell
        alertCount={alertCount}
        colorMode={colorMode}
        settings={settings}
        collectionListenerIssues={collectionListenerIssues}
        fiscalModuleAvailable={fiscalModuleAvailable}
        offlineSyncStatus={offlineSyncStatus}
        userProfile={userProfile}
        view={view}
        onColorModeChange={setColorMode}
        onRequestNotifications={requestNotificationPermission}
        onSignOut={() => signOut(auth)}
        onViewChange={handleViewChange}
      >
        <AppViewRenderer
          actions={{
            admin: adminActions,
            appointment: appointmentActions,
            cashRegister: cashRegisterActions,
            client: clientActions,
            clientForm,
            expense: expenseActions,
            fiscal: fiscalActions,
            maintenance: maintenanceActions,
            messageLog: messageLogActions,
            product: productActions,
            sendWhatsApp,
            serviceType: serviceTypeActions,
            settings: settingsActions,
            warranty: warrantyActions,
          }}
          data={{
            allUsers,
            appointments,
            cashLaunches,
            chartData,
            clients,
            dailyPendingAlerts,
            expenseEntries,
            fiscalCompanies,
            fiscalInvoices,
            fiscalLogs,
            historyServiceTypeOptions,
            maintenanceStats,
            maintenances,
            messageLogs,
            nextAppointment,
            productCatalog,
            operationalLogs,
            scheduleClientHistoryRows,
            serviceTypeOptions,
            settings,
            warranties,
          }}
          session={{
            currentUserId: user.uid,
            deleteConfirmation: { confirmOrRequestDelete, getDeleteConfirmId },
            userEmail: user.email,
            userProfile,
            offlineSyncStatus,
          }}
          ui={{
            colorMode,
            expandedTopService,
            fiscalModuleAvailable,
            isNewService,
            searchQuery,
            serviceListFilter,
            setExpandedTopService,
            setIsNewService,
            setSearchQuery,
            setServiceListFilter,
            setSettings,
            setView: handleViewChange,
            view,
          }}
        />
      </AppShell>

      {!settings?.isProfileComplete && settingsLoaded && (
        <ProfileSetupModal onComplete={settingsActions.completeProfileSetup} />
      )}
      {toast ? (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      ) : null}

      {adminPinPromptOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-primary/30 bg-slate-900 p-6 shadow-2xl">
            <div className="mb-4 text-center">
              <p className="text-sm uppercase tracking-[0.28em] text-slate-500">Acesso Administrativo</p>
              <h2 className="mt-2 text-2xl font-bold text-white">Digite a senha</h2>
            </div>
            <div className="space-y-4">
              <input
                type="password"
                value={adminPinValue}
                autoFocus
                maxLength={4}
                onChange={(event) => setAdminPinValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    handleAdminPinSubmit(adminPinValue.trim());
                  }
                }}
                placeholder="PIN de 4 dígitos"
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-lg font-semibold text-white outline-none ring-1 ring-slate-800 focus:border-primary focus:ring-primary/40"
              />
              {adminPinError && <p className="text-sm text-red-400">{adminPinError}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleAdminPinCancel}
                  className="flex-1 rounded-2xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:bg-slate-700"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => handleAdminPinSubmit(adminPinValue.trim())}
                  className="flex-1 rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white transition hover:bg-primary/90"
                >
                  Entrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </ErrorBoundary>
  );
}
