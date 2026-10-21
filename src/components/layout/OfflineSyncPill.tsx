import {
  AlertTriangle,
  CloudCheck,
  CloudOff,
  CloudUpload,
  LoaderCircle,
  Wifi,
  WifiOff,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import type { OfflineSyncStatus } from '../../hooks/useOfflineSyncStatus';

type OfflineSyncPillProps = {
  compact?: boolean;
  status: OfflineSyncStatus;
};

type PillView = {
  icon: LucideIcon;
  label: string;
  title: string;
  className: string;
};

const buildSyncView = (status: OfflineSyncStatus): PillView => {
  if (status.lastPersistenceError) {
    return {
      icon: AlertTriangle,
      label: 'Falha local',
      title: `O navegador não confirmou a gravação durável da fila offline: ${status.lastPersistenceError}`,
      className: 'border-red-500/40 bg-red-500/15 text-red-100',
    };
  }

  if (status.failedWrites > 0) {
    return {
      icon: AlertTriangle,
      label: `${status.failedWrites} NÃO ENVIADO${status.failedWrites === 1 ? '' : 'S'}`,
      title: status.lastError
        ? `${status.lastError} O dispositivo está Online, mas estas gravações não foram aceitas pelo Firebase. Abra Configurações > Sincronização e atividade para ver o caminho e corrigir a causa.`
        : `${status.failedWrites} gravação(ões) não foram aceitas pelo Firebase. Estar Online não significa que os dados foram sincronizados. Abra Configurações > Sincronização e atividade.`,
      className: 'border-red-500/40 bg-red-500/15 text-red-100',
    };
  }

  if (status.isSyncing) {
    return {
      icon: LoaderCircle,
      label: 'Sincronizando',
      title: 'O aplicativo está enviando alterações locais e atualizando os dados no Firebase.',
      className: 'border-sky-500/30 bg-sky-500/10 text-sky-100',
    };
  }

  if (status.pendingWrites > 0 || status.localDraftCount > 0) {
    const details = [
      status.pendingWrites > 0 ? `${status.pendingWrites} gravação(ões)` : '',
      status.localDraftCount > 0 ? `${status.localDraftCount} rascunho(s)` : '',
    ].filter(Boolean).join(' e ');
    return {
      icon: CloudUpload,
      label: status.pendingWrites > 0 ? `${status.pendingWrites} NÃO ENVIADO${status.pendingWrites === 1 ? '' : 'S'}` : `${status.localDraftCount} rascunho(s) local`,
      title: `${details} estão guardados neste aparelho e ainda não foram confirmados no Firebase. Estar Online não significa que foram sincronizados. Use Sincronizar para enviá-los.`,
      className: 'border-amber-500/35 bg-amber-500/10 text-amber-100',
    };
  }

  if (!status.networkEnabled) {
    return {
      icon: CloudOff,
      label: 'Firebase pausado',
      title: 'O navegador pode estar Online, mas o Firebase fica pausado entre sincronizações. A fila está vazia; novas alterações ficarão neste aparelho até você tocar em Sincronizar.',
      className: 'border-slate-500/30 bg-slate-500/10 text-slate-200',
    };
  }

  return {
    icon: CloudCheck,
    label: 'Fila confirmada',
    title: 'Não há gravações aguardando confirmação do Firebase.',
    className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100',
  };
};

export const OfflineSyncPill = ({ compact = false, status }: OfflineSyncPillProps) => {
  const syncView = buildSyncView(status);
  const SyncIcon = syncView.icon;
  const ConnectionIcon = status.isOnline ? Wifi : WifiOff;
  const connectionTitle = status.isOnline
    ? 'O navegador detecta uma conexão de rede. Isso, sozinho, não confirma que as alterações já foram enviadas ao Firebase; confira o estado de sincronização ao lado.'
    : status.pendingWrites > 0 || status.localDraftCount > 0
      ? 'Sem conexão de rede. Alterações pendentes e rascunhos continuam guardados neste aparelho e ainda precisam ser sincronizados quando a conexão voltar.'
      : 'O navegador informa que não há conexão de rede. O aplicativo está usando os dados disponíveis neste aparelho.';

  return (
    <div className="inline-flex max-w-full items-center gap-1.5" aria-live="polite">
      <div
        role="status"
        title={connectionTitle}
        className={cn(
          'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-bold shadow-sm',
          status.isOnline
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
            : 'border-red-500/40 bg-red-500/15 text-red-100',
        )}
      >
        <ConnectionIcon className="h-4 w-4 shrink-0" />
        <span>{status.isOnline ? 'Online' : 'Offline'}</span>
      </div>
      <div
        title={syncView.title}
        className={cn(
          'inline-flex h-9 min-w-0 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-bold shadow-sm',
          syncView.className,
        )}
      >
        <SyncIcon className={cn('h-4 w-4 shrink-0', status.isSyncing && 'animate-spin')} />
        <span className={cn('truncate', compact && 'hidden sm:inline')}>
          {syncView.label}
        </span>
      </div>
    </div>
  );
};
