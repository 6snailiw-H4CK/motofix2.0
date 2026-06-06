import type { ReactNode } from 'react';
import { AppHeader } from './AppHeader';
import { BottomNav } from './BottomNav';
import { SidebarNav } from './SidebarNav';
import { TopBar } from './TopBar';
import type { AppView, ColorMode, Settings, UserProfile } from '../../types';

type AppShellProps = {
  alertCount: number;
  children: ReactNode;
  colorMode: ColorMode;
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
              view={view}
              onColorModeChange={onColorModeChange}
              onRequestNotifications={onRequestNotifications}
              onSettingsClick={() => onViewChange('settings')}
              onSignOut={onSignOut}
            />
          </div>

          <main className="min-w-0 flex-1 px-3 pb-24 pt-4 sm:px-5 lg:px-5 lg:pb-8 xl:px-6">
            <div className="mx-auto w-full max-w-5xl space-y-5 lg:max-w-none">
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
