import React, { useEffect, useState } from 'react';
import { toast as sonnerToast } from 'sonner';
import {
  FIRESTORE_OFFLINE_QUEUE_EVENT,
  getFailedWrites,
  retryFailedWrite,
  type FailedFirestoreWrite,
} from '../../services/firestoreOfflineQueue';

export const FailedWritesPanel: React.FC = () => {
  const [failed, setFailed] = useState<FailedFirestoreWrite[]>([]);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => setFailed(getFailedWrites());
    const updateOnline = () => setIsOnline(navigator.onLine);
    refresh();
    window.addEventListener(FIRESTORE_OFFLINE_QUEUE_EVENT, refresh);
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    return () => {
      window.removeEventListener(FIRESTORE_OFFLINE_QUEUE_EVENT, refresh);
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
    };
  }, []);

  const handleRetry = async (write: FailedFirestoreWrite) => {
    setRetryingId(write.id);
    try {
      await retryFailedWrite(write.id);
      sonnerToast.success('Escrita confirmada pelo servidor.');
    } catch (error) {
      sonnerToast.error(error instanceof Error ? error.message : 'Falha ao reexecutar escrita.');
    } finally {
      setRetryingId(null);
    }
  };

  if (failed.length === 0) return null;

  return (
    <div className="mt-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-amber-200">Falhas na fila</p>
          <h4 className="mt-1 text-sm font-bold text-white">Alteracoes que precisam de atencao</h4>
        </div>
        <div className="text-xs text-amber-200">{failed.length} item(s)</div>
      </div>

      <div className="mt-3 space-y-2">
        {failed.slice(0, 12).map((write) => {
          const canRetryNow = write.canRetry && isOnline && retryingId === null;
          return (
            <div key={write.id} className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-lg border border-amber-600/20 bg-amber-900/10 p-3 text-xs">
              <div className="min-w-0">
                <div className="font-bold text-amber-100">{write.context}</div>
                <div className="mt-1 break-words text-amber-200/80">{write.errorMessage}</div>
                <div className="mt-1 text-[10px] text-amber-100/60">
                  {write.retryCount > 0 ? `${write.retryCount} tentativa(s). ` : ''}
                  {write.canRetry ? 'Retry seguro disponivel.' : 'Revise os dados e repita a acao na tela de origem.'}
                </div>
              </div>
              <button
                type="button"
                disabled={!canRetryNow}
                onClick={() => void handleRetry(write)}
                className="inline-flex h-8 items-center justify-center rounded-md bg-amber-500/20 px-3 text-xs font-bold text-amber-200 enabled:hover:bg-amber-500/30 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {retryingId === write.id ? 'Tentando...' : write.canRetry ? (isOnline ? 'Tentar novamente' : 'Sem conexao') : 'Correcao manual'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
