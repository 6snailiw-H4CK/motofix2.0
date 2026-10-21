/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { toast as sonnerToast } from 'sonner';
import { 
  signOut
} from 'firebase/auth';
import { auth, logAuthDiagnostic } from './firebase';
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
import { useOfflineSyncStatus } from './hooks/useOfflineSyncStatus';
import { useProductActions } from './hooks/useProductActions';
import { useOilTypeActions } from './hooks/useOilTypeActions';
import { useSettingsActions } from './hooks/useSettingsActions';
import { useSubscriptionStatus } from './hooks/useSubscriptionStatus';
import { useUserCollections } from './hooks/useUserCollections';
import { viewUsesUserCollection } from './hooks/userCollectionScopes';
import { useWarrantyActions } from './hooks/useWarrantyActions';
import { useWhatsAppReminderActions } from './hooks/useWhatsAppReminderActions';
import { getMaintenanceStatus } from './lib/maintenanceStatus';
import { canonicalServiceType, getServiceTypeKey } from './lib/serviceTypes';
import { isAdminRole, isMasterAdminRole } from './types';

// --- Main App ---

export default function App() {
  const { user, userProfile, loading, authLoading, profileLoading, subscriptionResolved, isNewUser, authInitializationError } = useAuthProfile();
  const { isExpired, shouldBlock, subscriptionActive, loading: accessLoading, error: accessError, reason: accessReason, refresh: refreshAccess } = useSubscriptionStatus({
    authenticatedUid: user?.uid,
    userProfile,
  });
  const {
    colorMode,
    clientScheduleReturnView,
    expandedTopService,
    isNewService,
    searchQuery,
    serviceListFilter,
    setColorMode,
    setClientScheduleReturnView,
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
    cashLaunchesLoaded,
    fiscalCompanies,
    fiscalInvoices,
    fiscalLogs,
    operationalLogs,
    collectionListenerIssues,
    refreshCurrentView,
    isRefreshingCollections,
    lastCollectionsSyncedAt,
  } = useUserCollections({ user, userProfile, isNewUser, hasAccountAccess: subscriptionActive, view });
  const offlineSyncStatus = useOfflineSyncStatus();
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

  const handleViewChange = useCallback((nextView: Parameters<typeof setView>[0]) => {
    if (nextView === 'fiscal' && !fiscalModuleAvailable) {
      setView('dashboard');
      return;
    }

    if ((nextView === 'general-report' || nextView === 'financial-health') && !isAdminRole(userProfile?.role)) {
      setView('dashboard');
      return;
    }

    if (nextView === 'admin') {
      if (isMasterAdminRole(userProfile?.role)) setView('master-admin');
      return;
    }

    if (nextView === 'master-admin') {
      if (isMasterAdminRole(userProfile?.role)) setView('master-admin');
      return;
    }

    setView(nextView);
  }, [fiscalModuleAvailable, setView, userProfile?.role]);
  const handleManualDataSync = useCallback(async () => {
    try {
      const result = await refreshCurrentView();
      if (result.failedCollections.length > 0) {
        sonnerToast.error('A sincronização terminou com pendências.', {
          description: `Verifique: ${result.failedCollections.join(', ')}. As falhas permanecem sinalizadas no app.`,
        });
        return;
      }
      sonnerToast.success('Sincronização concluída.', {
        description: `${result.updatedDocuments} registro(s) atualizados. As alterações locais foram enviadas e o Firestore voltou ao modo local.`,
      });
    } catch (error) {
      sonnerToast.error('Não foi possível sincronizar agora.', {
        description: error instanceof Error ? error.message : 'Verifique a conexão e tente novamente.',
      });
    }
  }, [refreshCurrentView]);
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
  const oilTypeActions = useOilTypeActions({
    user,
    settings,
    setSettings,
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

  const { dailyPendingAlerts } = useNotifications({ clients });
  const { sendWhatsApp } = useWhatsAppReminderActions({
    user,
    settings,
    setToast,
  });
  useClientStatusSync({
    user,
    clients,
    getStatus,
    enabled: viewUsesUserCollection(view, 'clients'),
  });
  const maintenanceStats = useMaintenanceStats({
    cashLaunches,
    clients,
    maintenances,
    warranties,
    searchQuery,
    serviceListFilter,
  });

  useEffect(() => {
    if (view === 'fiscal' && !fiscalModuleAvailable) {
      setView('dashboard');
    }
  }, [fiscalModuleAvailable, setView, view]);

  const billingLoading = !!user && (profileLoading || !subscriptionResolved || accessLoading);
  const authenticated = !!user;
  const shouldBlockUser = authenticated && !billingLoading && (!userProfile || !subscriptionActive);
  const diagnosticNow = new Date();
  const diagnosticManualExpiry = userProfile?.manualAccess?.expiresAt || null;
  const diagnosticReason = accessError
    ? `serviço auxiliar indisponível: ${accessError}`
    : accessReason
      ? `acesso manual: ${accessReason}`
      : !authenticated
    ? 'usuário não autenticado'
    : billingLoading
      ? 'perfil ou autorização ainda carregando'
      : !userProfile
        ? 'perfil ausente'
        : userProfile.isActive !== true
          ? 'conta não aprovada ou suspensa'
          : !userProfile.manualAccess?.enabled
            ? 'concessão manual ausente'
            : 'vigência manual vencida ou inválida';

  useEffect(() => {
    if (import.meta.env.DEV && shouldBlockUser) console.info('[Subscription Gate Diagnostic]', {
      uid: user?.uid || null,
      profileLoaded: !!userProfile,
      manualAccessEnabled: userProfile?.manualAccess?.enabled === true,
      manualAccessExpiresAt: diagnosticManualExpiry,
      subscriptionResolved,
      subscriptionActive,
      isExpired,
      shouldBlock: shouldBlockUser,
      reason: diagnosticReason,
      accessError,
    });
  }, [accessError, diagnosticManualExpiry, diagnosticReason, isExpired, shouldBlockUser, subscriptionActive, subscriptionResolved, user, userProfile]);

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

  const authDiagnosticScreen = authLoading || loading || (authenticated && billingLoading)
    ? 'loading'
    : !user
      ? 'auth'
      : shouldBlockUser && view !== 'checkout'
        ? 'blocked-access'
        : 'app';

  useEffect(() => {
    logAuthDiagnostic('main', 'app-screen-selected', {
      screen: authDiagnosticScreen,
      userPresent: Boolean(user),
      authLoading,
      loading,
      authInitializationErrorPresent: Boolean(authInitializationError),
    });
  }, [authDiagnosticScreen, user, authLoading, loading, authInitializationError]);

  // Early returns AFTER all hooks
  if (authLoading || loading || (authenticated && billingLoading)) return <LoadingScreen />;
  if (!user) return <AuthScreen initialAuthError={authInitializationError} />;

  if (shouldBlockUser && view !== 'checkout') {
    return <BlockedAccessScreen
      userId={user.uid}
      onSignOut={() => signOut(auth)}
      onSubscribe={() => setView('checkout')}
      onRetryAccess={refreshAccess}
      accessLoading={accessLoading}
      subscriptionDiagnostic={{
        authenticated,
        profileLoaded: !!userProfile,
        profileUid: userProfile?.uid || null,
        manualAccessEnabled: userProfile?.manualAccess?.enabled === true,
        manualAccessExpiresAt: diagnosticManualExpiry,
        now: diagnosticNow.toLocaleString('pt-BR'),
        subscriptionResolved,
        subscriptionActive,
        isExpired,
        shouldBlock: shouldBlockUser,
        reason: diagnosticReason,
        accessError,
      }}
    />;
  }

  return (
    <ErrorBoundary>
      <AppShell
        colorMode={colorMode}
        settings={settings}
        collectionListenerIssues={collectionListenerIssues}
        fiscalModuleAvailable={fiscalModuleAvailable}
        offlineSyncStatus={offlineSyncStatus}
        isRefreshingData={isRefreshingCollections}
        lastDataSyncAt={lastCollectionsSyncedAt}
        userProfile={userProfile}
        view={view}
        onColorModeChange={setColorMode}
        onSignOut={() => signOut(auth)}
        onManualDataSync={handleManualDataSync}
        onViewChange={handleViewChange}
      >
        <AppViewRenderer
          actions={{
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
            oilType: oilTypeActions,
            settings: settingsActions,
            warranty: warrantyActions,
          }}
          data={{
            appointments,
            cashLaunches,
            cashLaunchesLoaded,
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
            clientScheduleReturnView,
            colorMode,
            expandedTopService,
            fiscalModuleAvailable,
            isNewService,
            searchQuery,
            serviceListFilter,
            setExpandedTopService,
            setClientScheduleReturnView,
            setIsNewService,
            setSearchQuery,
            setServiceListFilter,
            setSettings,
            setView: handleViewChange,
            onColorModeChange: setColorMode,
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

    </ErrorBoundary>
  );
}
