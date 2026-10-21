import { useEffect, useRef, useState } from 'react';
import { toast as sonnerToast } from 'sonner';
import {
  getFirestoreOfflineQueueState,
  FIRESTORE_OFFLINE_PERSISTENCE_ERROR_EVENT,
  subscribeFirestoreOfflineQueue,
  type FirestoreOfflineQueueState
} from '../services/firestoreOfflineQueue';
import { getLocalDraftCount, subscribeLocalDrafts } from '../services/localDrafts';
import {
  getFirestoreNetworkState,
  subscribeFirestoreNetworkState,
  type FirestoreNetworkState,
} from '../services/firestoreNetworkControl';

export type OfflineSyncStatus = {
  isOnline: boolean;
  isSyncing: boolean;
  pendingWrites: number;
  failedWrites: number;
  confirmedWrites: number;
  localDraftCount: number;
  lastQueuedAt: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  failureCount: number;
  retryCount: number;
  persistenceFailureCount: number;
  lastPersistenceError: string | null;
  networkEnabled: boolean;
};

const getIsOnline = () => (
  typeof navigator === 'undefined' ? true : navigator.onLine
);

export const useOfflineSyncStatus = (): OfflineSyncStatus => {
  const [isOnline, setIsOnline] = useState(getIsOnline);
  const [queueState, setQueueState] = useState<FirestoreOfflineQueueState>(getFirestoreOfflineQueueState);
  const [localDraftCount, setLocalDraftCount] = useState(getLocalDraftCount);
  const [networkState, setNetworkState] = useState<FirestoreNetworkState>(getFirestoreNetworkState);
  const lastPendingCount = useRef(queueState.pendingWrites);
  const lastPendingNoticeAt = useRef(0);

  useEffect(() => {
    const updateOnlineStatus = () => setIsOnline(getIsOnline());

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    updateOnlineStatus();

    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
    };
  }, []);

  useEffect(() => subscribeFirestoreOfflineQueue(setQueueState), []);

  useEffect(() => {
    if (queueState.pendingWrites > lastPendingCount.current) {
      const now = Date.now();
      if (now - lastPendingNoticeAt.current > 5000) {
        sonnerToast.warning('Alteração guardada neste aparelho, ainda sem confirmação do Firebase.', {
          description: 'Online indica conexão à internet. Toque em Sincronizar para enviar e confirmar os dados.',
          duration: 9000,
        });
        lastPendingNoticeAt.current = now;
      }
    }
    lastPendingCount.current = queueState.pendingWrites;
  }, [queueState.pendingWrites]);

  useEffect(() => subscribeLocalDrafts(setLocalDraftCount), []);

  useEffect(() => subscribeFirestoreNetworkState(setNetworkState), []);

  useEffect(() => {
    const notifyPersistenceFailure = (event: Event) => {
      const message = (event as CustomEvent<{ message?: string }>).detail?.message;
      sonnerToast.error('Nao foi possivel guardar a fila offline neste navegador.', {
        description: message || 'Mantenha esta aba aberta e verifique o armazenamento do navegador.',
      });
    };
    window.addEventListener(FIRESTORE_OFFLINE_PERSISTENCE_ERROR_EVENT, notifyPersistenceFailure);
    return () => window.removeEventListener(FIRESTORE_OFFLINE_PERSISTENCE_ERROR_EVENT, notifyPersistenceFailure);
  }, []);

  return {
    isOnline,
    isSyncing: networkState.syncing,
    pendingWrites: queueState.pendingWrites,
    failedWrites: queueState.failedWrites,
    confirmedWrites: queueState.confirmedWrites,
    localDraftCount,
    lastQueuedAt: queueState.lastQueuedAt,
    lastSyncedAt: queueState.lastSettledAt || networkState.lastSyncAt,
    lastError: queueState.lastError,
    failureCount: queueState.failureCount,
    retryCount: queueState.retryCount,
    persistenceFailureCount: queueState.persistenceFailureCount,
    lastPersistenceError: queueState.lastPersistenceError,
    networkEnabled: networkState.networkEnabled,
  };
};
