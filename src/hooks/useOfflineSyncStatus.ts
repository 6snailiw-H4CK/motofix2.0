import { useEffect, useState } from 'react';
import { db, waitForPendingWrites } from '../firebase';
import {
  getFirestoreOfflineQueueState,
  getPendingWriteCheckpoint,
  confirmPendingWriteCheckpoint,
  subscribeFirestoreOfflineQueue,
  type FirestoreOfflineQueueState
} from '../services/firestoreOfflineQueue';
import { getLocalDraftCount, subscribeLocalDrafts } from '../services/localDrafts';

export type OfflineSyncStatus = {
  isOnline: boolean;
  isSyncing: boolean;
  pendingWrites: number;
  localDraftCount: number;
  lastQueuedAt: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  failureCount: number;
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
    if (!isOnline) return;

    let isCurrent = true;
    const pendingWriteCheckpoint = getPendingWriteCheckpoint();
    setIsSyncing(true);

    waitForPendingWrites(db)
      .then(() => {
        if (!isCurrent) return;
        confirmPendingWriteCheckpoint(pendingWriteCheckpoint);
        setLastSyncedAt(new Date().toISOString());
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
    localDraftCount,
    lastQueuedAt: queueState.lastQueuedAt,
    lastSyncedAt: queueState.lastSettledAt || lastSyncedAt,
    lastError: queueState.lastError,
    failureCount: queueState.failureCount,
  };
};
