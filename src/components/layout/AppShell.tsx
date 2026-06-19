import type { ReactNode } from 'react';
import { AppHeader } from './AppHeader';
import { BottomNav } from './BottomNav';
import { SidebarNav } from './SidebarNav';
import { TopBar } from './TopBar';
import type { AppView, ColorMode, Settings, UserProfile } from '../../types';
import type { OfflineSyncStatus } from '../../hooks/useOfflineSyncStatus';

type AppShellProps = {
  alertCount: number;
  children: ReactNode;
  colorMode: ColorMode;
  offlineSyncStatus: OfflineSyncStatus;
  settings: Settings;
  userProfile: UserProfile | null;
  view: AppView;
  onColorModeChange: (mode: ColorMode) => void;
  onRequestNotifications: () => void;
  onSignOut: () => void;
  onViewChange: (view: AppView) => void;
};

export const AppShell = ({
  alertCount,
  children,
  colorMode,
  offlineSyncStatus,
  settings,
  userProfile,
  view,
  onColorModeChange,
  onRequestNotifications,
  onSignOut,
  onViewChange,
}: AppShellProps) => {
  const isAdmin = userProfile?.role === 'admin';
  const businessName = settings.businessName || 'MotoFix Oficina';
  const userName = userProfile?.displayName || userProfile?.email || businessName;

  return (
    <div className="app-shell min-h-screen bg-background-dark text-slate-100 font-display">
      <div className="flex min-h-screen">
        <SidebarNav
          businessName={businessName}
          currentUserName={userName}
          isAdmin={isAdmin}
          view={view}
          onViewChange={onViewChange}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="lg:hidden">
            <AppHeader
              alertCount={alertCount}
              colorMode={colorMode}
              offlineSyncStatus={offlineSyncStatus}
              onColorModeChange={onColorModeChange}
              onRequestNotifications={onRequestNotifications}
              onSettingsClick={() => onViewChange('settings')}
              onSignOut={onSignOut}
            />
          </div>

          <div className="hidden lg:block">
            <TopBar
              alertCount={alertCount}
              businessName={businessName}
              colorMode={colorMode}
              offlineSyncStatus={offlineSyncStatus}
              view={view}
              onColorModeChange={onColorModeChange}
              onRequestNotifications={onRequestNotifications}
              onSettingsClick={() => onViewChange('settings')}
              onSignOut={onSignOut}
            />
          </div>

          <main className="min-w-0 flex-1 overflow-x-hidden px-3 pb-24 pt-4 sm:px-5 lg:px-3 lg:pb-6 lg:pt-3 xl:px-4">
            <div className="mx-auto w-full max-w-5xl space-y-4 lg:max-w-none">
              {children}
            </div>
          </main>
        </div>
      </div>

      <BottomNav
        view={view}
        isAdmin={isAdmin}
        onViewChange={onViewChange}
      />
    </div>
  );
};
