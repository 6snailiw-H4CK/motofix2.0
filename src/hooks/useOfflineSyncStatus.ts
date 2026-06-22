import { useEffect, useState } from 'react';
import { toast as sonnerToast } from 'sonner';
import { db, waitForPendingWrites } from '../firebase';
import {
  getFirestoreOfflineQueueState,
  getPendingWriteCheckpoint,
  confirmPendingWriteCheckpointRemotely,
  FIRESTORE_OFFLINE_PERSISTENCE_ERROR_EVENT,
  subscribeFirestoreOfflineQueue,
  type FirestoreOfflineQueueState
} from '../services/firestoreOfflineQueue';
import { getLocalDraftCount, subscribeLocalDrafts } from '../services/localDrafts';

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
};

const getIsOnline = () => (
  typeof navigator === 'undefined' ? true : navigator.onLine
);

export const useOfflineSyncStatus = (): OfflineSyncStatus => {
  const [isOnline, setIsOnline] = useState(getIsOnline);
  const [queueState, setQueueState] = useState<FirestoreOfflineQueueState>(getFirestoreOfflineQueueState);
  const [localDraftCount, setLocalDraftCount] = useState(getLocalDraftCount);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

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

  useEffect(() => subscribeLocalDrafts(setLocalDraftCount), []);

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

  useEffect(() => {
    if (!isOnline) return;

    let isCurrent = true;
    const pendingWriteCheckpoint = getPendingWriteCheckpoint();
    if (pendingWriteCheckpoint.length === 0) {
      setIsSyncing(false);
      return;
    }
    setIsSyncing(true);

    confirmPendingWriteCheckpointRemotely(pendingWriteCheckpoint, () => waitForPendingWrites(db))
      .then((confirmed) => {
        if (!isCurrent) return;
        if (confirmed) setLastSyncedAt(new Date().toISOString());
      })
      .catch((error) => {
        if (!isCurrent) return;
        console.warn('Falha ao aguardar sincronizacao pendente do Firestore:', error);
      })
      .finally(() => {
        if (!isCurrent) return;
        setIsSyncing(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [isOnline, queueState.lastQueuedAt, queueState.pendingWrites]);

  return {
    isOnline,
    isSyncing,
    pendingWrites: queueState.pendingWrites,
    failedWrites: queueState.failedWrites,
    confirmedWrites: queueState.confirmedWrites,
    localDraftCount,
    lastQueuedAt: queueState.lastQueuedAt,
    lastSyncedAt: queueState.lastSettledAt || lastSyncedAt,
    lastError: queueState.lastError,
    failureCount: queueState.failureCount,
    retryCount: queueState.retryCount,
    persistenceFailureCount: queueState.persistenceFailureCount,
    lastPersistenceError: queueState.lastPersistenceError,
  };
};
