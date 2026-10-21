import React, { useEffect, useState } from 'react';
import { toast as sonnerToast } from 'sonner';
import {
  FIRESTORE_OFFLINE_QUEUE_EVENT,
  getFailedWrites,
  retryFailedWrite,
  type FailedFirestoreWrite,
} from '../../services/firestoreOfflineQueue';

type FailedWritesPanelProps = {
  currentUserId: string | null;
};

export const FailedWritesPanel: React.FC<FailedWritesPanelProps> = ({ currentUserId }) => {
  const [failed, setFailed] = useState<FailedFirestoreWrite[]>([]);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => setFailed(getFailedWrites(currentUserId));
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
  }, [currentUserId]);

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
          const permissionDenied = /permission-denied|missing or insufficient permissions/i.test(write.errorMessage || '');
          return (
            <div key={write.id} className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-lg border border-amber-600/20 bg-amber-900/10 p-3 text-xs">
              <div className="min-w-0">
                <div className="font-bold text-amber-100">{write.context}</div>
                <div className="mt-1 break-words text-amber-200/80">{write.errorMessage}</div>
                {write.replayTargets.length > 0 ? (
                  <div className="mt-1 space-y-0.5 text-[10px] text-amber-100/70">
                    {write.replayTargets.slice(0, 6).map((target, index) => (
                      <div key={`${target.operation}-${target.path}-${index}`} className="break-all">
                        Firebase: {target.operation.toUpperCase()} {target.path}
                      </div>
                    ))}
                    {write.replayTargets.length > 6 ? <div>e mais {write.replayTargets.length - 6} documento(s)</div> : null}
                  </div>
                ) : null}
                {write.diagnostics.length > 0 ? (
                  <details
                    open={permissionDenied}
                    className="mt-2 rounded-md border border-slate-600/50 bg-slate-950/40 p-2 text-[10px] text-slate-200"
                  >
                    <summary className="cursor-pointer font-bold text-slate-100">
                      Diagnóstico seguro: campos, tipos e regras
                    </summary>
                    <p className="mt-1 text-slate-300/80">
                      Exibe apenas nomes, tipos e limites; nenhum valor pessoal é mostrado. A comparação é local e não substitui a avaliação do Firebase.
                    </p>
                    <div className="mt-2 space-y-2">
                      {write.diagnostics.map((diagnostic, targetIndex) => (
                        <section
                          key={`${diagnostic.path}-${targetIndex}`}
                          className="rounded border border-slate-700/70 p-2"
                        >
                          <div className="font-semibold text-slate-100">
                            {diagnostic.operation.toUpperCase()} {diagnostic.path.split('/')[2] || 'destino desconhecido'}
                          </div>
                          <div className="mt-1 break-words leading-relaxed text-slate-300">
                            Campos ({diagnostic.fields.length}):{' '}
                            {diagnostic.fields.length > 0
                              ? diagnostic.fields.map((field) => `${field.name} — ${field.type}${field.note ? ` (${field.note})` : ''}`).join('; ')
                              : 'payload indisponível'}
                          </div>
                          {diagnostic.violations.length > 0 ? (
                            <div className="mt-2">
                              <div className="font-bold text-red-200">Possíveis violações encontradas localmente</div>
                              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-red-100/90">
                                {diagnostic.violations.map((violation, index) => (
                                  <li key={`${targetIndex}-violation-${index}`}>{violation}</li>
                                ))}
                              </ul>
                            </div>
                          ) : (
                            <p className="mt-2 text-emerald-200">Nenhuma violação de campo detectada pelo validador local.</p>
                          )}
                          {diagnostic.limitations.length > 0 ? (
                            <ul className="mt-2 list-disc space-y-0.5 pl-4 text-slate-400">
                              {diagnostic.limitations.map((limitation, index) => (
                                <li key={`${targetIndex}-limitation-${index}`}>{limitation}</li>
                              ))}
                            </ul>
                          ) : null}
                        </section>
                      ))}
                    </div>
                  </details>
                ) : null}
                {permissionDenied ? (
                  <div className="mt-2 rounded-md border border-red-500/20 bg-red-950/20 p-2 text-[10px] leading-relaxed text-red-100/90">
                    Esta mensagem indica rejeição pelas regras do Firestore, não erro de cota. Em um lote, a recusa de qualquer documento cancela todas as gravações do lote. O diagnóstico acima aponta incompatibilidades de campos detectáveis neste aparelho; o Firebase ainda confere o perfil e o estado atual dos documentos.
                  </div>
                ) : null}
                <div className="mt-1 text-[10px] text-amber-100/60">
                  {write.retryCount > 0 ? `${write.retryCount} tentativa(s). ` : ''}
                  {write.canRetry ? 'O servidor será conferido antes de qualquer reenvio.' : 'Revise os dados e repita a acao na tela de origem.'}
                </div>
              </div>
              <button
                type="button"
                disabled={!canRetryNow}
                onClick={() => void handleRetry(write)}
                className="inline-flex h-8 items-center justify-center rounded-md bg-amber-500/20 px-3 text-xs font-bold text-amber-200 enabled:hover:bg-amber-500/30 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {retryingId === write.id ? 'Verificando...' : write.canRetry ? (isOnline ? 'Verificar e sincronizar' : 'Sem conexao') : 'Correcao manual'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
