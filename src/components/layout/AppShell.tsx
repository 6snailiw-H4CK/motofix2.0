import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { AppHeader } from './AppHeader';
import { BottomNav } from './BottomNav';
import { SidebarNav } from './SidebarNav';
import { TopBar } from './TopBar';
import { isAdminRole, isMasterAdminRole, type AppView, type ColorMode, type Settings, type UserProfile } from '../../types';
import type { OfflineSyncStatus } from '../../hooks/useOfflineSyncStatus';
import type { CollectionListenerIssue } from '../../hooks/useUserCollections';

type AppShellProps = {
  children: ReactNode;
  colorMode: ColorMode;
  collectionListenerIssues: CollectionListenerIssue[];
  fiscalModuleAvailable: boolean;
  offlineSyncStatus: OfflineSyncStatus;
  isRefreshingData: boolean;
  lastDataSyncAt: string | null;
  settings: Settings;
  userProfile: UserProfile | null;
  view: AppView;
  onColorModeChange: (mode: ColorMode) => void;
  onSignOut: () => void;
  onManualDataSync: () => void;
  onViewChange: (view: AppView) => void;
};

export const AppShell = ({
  children,
  colorMode,
  collectionListenerIssues,
  fiscalModuleAvailable,
  offlineSyncStatus,
  isRefreshingData,
  lastDataSyncAt,
  settings,
  userProfile,
  view,
  onColorModeChange,
  onSignOut,
  onManualDataSync,
  onViewChange,
}: AppShellProps) => {
  const isAdmin = isAdminRole(userProfile?.role);
  const isMasterAdmin = isMasterAdminRole(userProfile?.role);
  const businessName = settings.businessName || 'MotoFix Oficina';
  const userName = userProfile?.displayName || userProfile?.email || businessName;

  return (
    <div className="app-shell min-h-screen bg-background-dark text-slate-100 font-display">
      <div className="flex min-h-screen">
        <SidebarNav
          businessName={businessName}
          currentUserName={userName}
          fiscalModuleAvailable={fiscalModuleAvailable}
          isAdmin={isAdmin}
          isMasterAdmin={isMasterAdmin}
          view={view}
          onViewChange={onViewChange}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="lg:hidden">
            <AppHeader
              colorMode={colorMode}
              offlineSyncStatus={offlineSyncStatus}
              isRefreshingData={isRefreshingData}
              lastDataSyncAt={lastDataSyncAt}
              onColorModeChange={onColorModeChange}
              onManualDataSync={onManualDataSync}
              onSignOut={onSignOut}
            />
          </div>

          <div className="hidden lg:block">
            <TopBar
              businessName={businessName}
              colorMode={colorMode}
              offlineSyncStatus={offlineSyncStatus}
              isRefreshingData={isRefreshingData}
              lastDataSyncAt={lastDataSyncAt}
              view={view}
              onColorModeChange={onColorModeChange}
              onManualDataSync={onManualDataSync}
              onSignOut={onSignOut}
            />
          </div>

          <main className="min-w-0 flex-1 overflow-x-hidden px-3 pb-24 pt-4 sm:px-5 lg:px-3 lg:pb-6 lg:pt-3 xl:px-4">
            <div className="mx-auto w-full max-w-5xl space-y-4 lg:max-w-none">
              {collectionListenerIssues.length > 0 ? (
                <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                  <div className="min-w-0">
                    <p className="font-bold">Dados podem estar desatualizados.</p>
                    <p className="truncate text-amber-100/80">
                      Falha ao sincronizar: {collectionListenerIssues.map((issue) => issue.label).join(', ')}
                    </p>
                  </div>
                </div>
              ) : null}
              {children}
            </div>
          </main>
        </div>
      </div>

      <BottomNav
        view={view}
        fiscalModuleAvailable={fiscalModuleAvailable}
        isAdmin={isAdmin}
        isMasterAdmin={isMasterAdmin}
        onViewChange={onViewChange}
      />
    </div>
  );
};
