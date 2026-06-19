import { Bell, Bike, LogOut, Moon, Settings as SettingsIcon, Sun } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { ColorMode } from '../../types';
import type { OfflineSyncStatus } from '../../hooks/useOfflineSyncStatus';
import { OfflineSyncPill } from './OfflineSyncPill';

type AppHeaderProps = {
  colorMode: ColorMode;
  alertCount: number;
  offlineSyncStatus: OfflineSyncStatus;
  onColorModeChange: (mode: ColorMode) => void;
  onRequestNotifications: () => void;
  onSettingsClick: () => void;
  onSignOut: () => void;
};

export const AppHeader = ({
  colorMode,
  alertCount,
  offlineSyncStatus,
  onColorModeChange,
  onRequestNotifications,
  onSettingsClick,
  onSignOut,
}: AppHeaderProps) => (
  <header className="app-header sticky top-0 z-50 flex items-center justify-between border-b border-primary/10 bg-background-dark/80 px-4 py-3 backdrop-blur-md">
    <div className="flex items-center gap-2">
      <div className="bg-primary/20 p-1.5 rounded-lg">
        <Bike className="text-primary w-5 h-5" />
      </div>
      <h1 className="text-lg font-bold tracking-tight">MotoFix</h1>
    </div>
    <div className="flex items-center gap-2">
      <OfflineSyncPill compact status={offlineSyncStatus} />
      <button
        type="button"
        onClick={() => onColorModeChange('dark')}
        aria-label="Modo escuro"
        className={cn(
          'p-1.5 rounded-full hover:bg-slate-800 transition-colors',
          colorMode === 'dark' ? 'bg-primary/10 text-white' : 'text-slate-400'
        )}
      >
        <Moon className="w-4.5 h-4.5" />
      </button>
      <button
        type="button"
        onClick={() => onColorModeChange('light')}
        aria-label="Modo claro"
        className={cn(
          'p-1.5 rounded-full hover:bg-slate-800 transition-colors',
          colorMode === 'light' ? 'bg-primary/10 text-white' : 'text-slate-400'
        )}
      >
        <Sun className="w-4.5 h-4.5" />
      </button>
      <button
        type="button"
        onClick={onRequestNotifications}
        aria-label="Notificacoes"
        className="relative p-1.5 rounded-full hover:bg-slate-800 transition-colors text-slate-400"
      >
        <Bell className="w-4.5 h-4.5 text-primary" />
        {alertCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full px-1.5">
            {alertCount}
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={onSettingsClick}
        aria-label="Ajustes"
        className="p-1.5 rounded-full hover:bg-slate-800 transition-colors text-slate-400"
      >
        <SettingsIcon className="w-4.5 h-4.5" />
      </button>
      <button
        type="button"
        onClick={onSignOut}
        aria-label="Sair"
        className="p-1.5 rounded-full hover:bg-red-500/10 transition-colors text-red-500"
      >
        <LogOut className="w-4.5 h-4.5" />
      </button>
    </div>
  </header>
);
