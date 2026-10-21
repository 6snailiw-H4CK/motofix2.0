import { LoaderCircle, LogOut, Moon, RefreshCw, Sun } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { ColorMode } from '../../types';
import type { OfflineSyncStatus } from '../../hooks/useOfflineSyncStatus';
import { OfflineSyncPill } from './OfflineSyncPill';

type AppHeaderProps = {
  colorMode: ColorMode;
  offlineSyncStatus: OfflineSyncStatus;
  isRefreshingData: boolean;
  lastDataSyncAt: string | null;
  onColorModeChange: (mode: ColorMode) => void;
  onManualDataSync: () => void;
  onSignOut: () => void;
};

export const AppHeader = ({
  colorMode,
  offlineSyncStatus,
  isRefreshingData,
  lastDataSyncAt,
  onColorModeChange,
  onManualDataSync,
  onSignOut,
}: AppHeaderProps) => (
  <header className="app-header sticky top-0 z-50 flex items-center justify-between border-b border-primary/10 bg-background-dark/80 px-4 py-3 backdrop-blur-md">
    <div className="flex items-center gap-2">
      <img src="/motofix-icon.svg" alt="MotoFix" className="h-9 w-9 rounded-lg shadow-lg shadow-primary/20" />
      <h1 className="text-lg font-bold tracking-tight">MotoFix</h1>
    </div>
    <div className="flex items-center gap-2">
      <OfflineSyncPill compact status={offlineSyncStatus} />
      <button
        type="button"
        onClick={onManualDataSync}
         disabled={isRefreshingData || offlineSyncStatus.isSyncing || !offlineSyncStatus.isOnline}
         aria-label="Enviar todas as alterações locais e atualizar a tela atual"
        title={lastDataSyncAt
          ? `Enviar as alterações locais e atualizar esta tela. Última sincronização completa: ${new Date(lastDataSyncAt).toLocaleString('pt-BR')}`
          : 'Enviar as alterações locais e atualizar os dados desta tela'}
        className="grid h-9 w-9 place-items-center rounded-lg border border-slate-800 bg-slate-950/60 text-slate-400 transition-colors hover:border-primary/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
          {isRefreshingData || offlineSyncStatus.isSyncing
          ? <LoaderCircle className="h-4 w-4 animate-spin" />
          : <RefreshCw className="h-4 w-4" />}
      </button>
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
        onClick={onSignOut}
        aria-label="Sair"
        className="p-1.5 rounded-full hover:bg-red-500/10 transition-colors text-red-500"
      >
        <LogOut className="w-4.5 h-4.5" />
      </button>
    </div>
  </header>
);
