import { AlertTriangle, CloudCheck, CloudOff, CloudUpload, type LucideIcon } from 'lucide-react';
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

const buildPillView = (status: OfflineSyncStatus): PillView | null => {
  if (status.lastError) {
    return {
      icon: AlertTriangle,
      label: 'Erro sync',
      title: status.lastError,
      className: 'border-red-500/30 bg-red-500/10 text-red-200',
    };
  }

  if (!status.isOnline) {
    return {
      icon: CloudOff,
      label: status.pendingWrites > 0 ? `${status.pendingWrites} pendente(s)` : 'Offline',
      title: status.pendingWrites > 0
        ? 'Sem internet. As alteracoes locais serao enviadas quando a conexao voltar.'
        : 'Sem internet. Os dados em cache continuam disponiveis.',
      className: 'border-amber-500/35 bg-amber-500/10 text-amber-100',
    };
  }

  if (status.pendingWrites > 0 || status.isSyncing) {
    return {
      icon: status.pendingWrites > 0 ? CloudUpload : CloudCheck,
      label: status.pendingWrites > 0 ? `${status.pendingWrites} pendente(s)` : 'Sincronizando',
      title: 'Enviando alteracoes locais para o Firestore.',
      className: 'border-sky-500/30 bg-sky-500/10 text-sky-100',
    };
  }

  return null;
};

export const OfflineSyncPill = ({ compact = false, status }: OfflineSyncPillProps) => {
  const view = buildPillView(status);
  if (!view) return null;

  const Icon = view.icon;

  return (
    <div
      aria-live="polite"
      title={view.title}
      className={cn(
        'inline-flex h-9 max-w-full items-center gap-2 rounded-lg border px-2.5 text-xs font-bold shadow-sm',
        view.className
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className={cn('truncate', compact && 'hidden sm:inline')}>
        {view.label}
      </span>
    </div>
  );
};
