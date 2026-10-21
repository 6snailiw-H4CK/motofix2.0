import { disableNetwork, enableNetwork } from 'firebase/firestore';
import { db, firestoreOfflineReady, waitForPendingWrites } from '../firebase';

export const FIRESTORE_SYNC_INTERVAL_MS = 4 * 60 * 60 * 1000;
export const FIRESTORE_NETWORK_STATE_EVENT = 'motofix:firestore-network-state';
const SYNC_SESSION_STORAGE_KEY = 'motofix:firestore-sync-session:v1';
const INITIAL_SYNC_DEFERRED_STORAGE_KEY = 'motofix:firestore-initial-sync-deferred:v1';

type SyncSessionStorage = Record<string, string>;

export type FirestoreNetworkState = {
  networkEnabled: boolean;
  syncing: boolean;
  lastSyncAt: string | null;
};

export const canMarkFirestoreSyncCompleted = (result: {
  failedCollections: number;
  pendingWrites: number;
  failedWrites: number;
}) => result.failedCollections === 0
  && result.pendingWrites === 0
  && result.failedWrites === 0;

let networkEnabled = false;
let syncing = false;
let sessionTail: Promise<void> = Promise.resolve();
let activeUserId: string | null = null;

const canUseWindow = () => typeof window !== 'undefined';

const readSyncSessionStorage = (): SyncSessionStorage => {
  if (!canUseWindow()) return {};
  try {
    const raw = window.localStorage.getItem(SYNC_SESSION_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed as SyncSessionStorage : {};
  } catch {
    return {};
  }
};

export const getLastFirestoreSyncAt = (userId: string) => {
  const value = readSyncSessionStorage()[userId];
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
};

export const isFirestoreSyncDue = (userId: string, now = Date.now()) => {
  const lastSyncAt = getLastFirestoreSyncAt(userId);
  if (lastSyncAt) return now - Date.parse(lastSyncAt) >= FIRESTORE_SYNC_INTERVAL_MS;
  let deferredAt: string | null = null;
  if (canUseWindow()) {
    try {
      const deferred = JSON.parse(window.localStorage.getItem(INITIAL_SYNC_DEFERRED_STORAGE_KEY) || '{}');
      deferredAt = typeof deferred?.[userId] === 'string' ? deferred[userId] : null;
    } catch {
      deferredAt = null;
    }
  }
  const deferredTimestamp = deferredAt ? Date.parse(deferredAt) : Number.NaN;
  return !Number.isFinite(deferredTimestamp) || now - deferredTimestamp >= FIRESTORE_SYNC_INTERVAL_MS;
};

export const deferInitialFirestoreSync = (userId: string, deferredAt = new Date().toISOString()) => {
  if (!userId || !canUseWindow()) return;
  try {
    const deferred = JSON.parse(window.localStorage.getItem(INITIAL_SYNC_DEFERRED_STORAGE_KEY) || '{}');
    if (typeof deferred?.[userId] === 'string') return;
    deferred[userId] = deferredAt;
    window.localStorage.setItem(INITIAL_SYNC_DEFERRED_STORAGE_KEY, JSON.stringify(deferred));
  } catch (error) {
    console.warn('Nao foi possivel agendar a primeira sincronizacao:', error);
  }
};

export const markFirestoreSyncCompleted = (userId: string, completedAt = new Date().toISOString()) => {
  if (!userId) return;
  const state = readSyncSessionStorage();
  state[userId] = completedAt;
  try {
    window.localStorage.setItem(SYNC_SESSION_STORAGE_KEY, JSON.stringify(state));
    const deferred = JSON.parse(window.localStorage.getItem(INITIAL_SYNC_DEFERRED_STORAGE_KEY) || '{}');
    delete deferred[userId];
    window.localStorage.setItem(INITIAL_SYNC_DEFERRED_STORAGE_KEY, JSON.stringify(deferred));
  } catch (error) {
    console.warn('Nao foi possivel salvar o horario da sincronizacao:', error);
  }
  activeUserId = userId;
  emitNetworkState();
};

const getCurrentState = (): FirestoreNetworkState => ({
  networkEnabled,
  syncing,
  lastSyncAt: activeUserId ? getLastFirestoreSyncAt(activeUserId) : null,
});

const emitNetworkState = () => {
  if (!canUseWindow()) return;
  window.dispatchEvent(new CustomEvent<FirestoreNetworkState>(FIRESTORE_NETWORK_STATE_EVENT, {
    detail: getCurrentState(),
  }));
};

export const getFirestoreNetworkState = getCurrentState;

export const subscribeFirestoreNetworkState = (
  listener: (state: FirestoreNetworkState) => void
) => {
  if (!canUseWindow()) return () => undefined;
  const handleState = (event: Event) => {
    listener((event as CustomEvent<FirestoreNetworkState>).detail);
  };
  window.addEventListener(FIRESTORE_NETWORK_STATE_EVENT, handleState);
  listener(getCurrentState());
  return () => window.removeEventListener(FIRESTORE_NETWORK_STATE_EVENT, handleState);
};

export const isFirestoreNetworkEnabled = () => networkEnabled;

/**
 * Opens Firestore only for one deliberate synchronization task. SDK-persisted
 * offline writes are acknowledged while the gate is open; all exits close the
 * connection again, including errors and permission denials.
 */
export const withFirestoreNetworkSession = async <T,>(
  userId: string,
  task: () => Promise<T>
): Promise<T> => {
  const previousSession = sessionTail;
  let releaseSession = () => undefined;
  sessionTail = new Promise<void>((resolve) => { releaseSession = resolve; });
  await previousSession;

  try {
    await firestoreOfflineReady;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new Error('Sem conexao. A sincronizacao sera feita quando a internet estiver disponivel.');
    }

    activeUserId = userId || activeUserId;
    syncing = true;
    await enableNetwork(db);
    networkEnabled = true;
    emitNetworkState();

    // Existing local mutations are submitted before reading the cloud snapshot.
    // A rejected write remains visible in the durable failed-write queue.
    await waitForPendingWrites(db).catch(() => undefined);
    return await task();
  } finally {
    try {
      if (networkEnabled) await waitForPendingWrites(db).catch(() => undefined);
    } finally {
      await disableNetwork(db).catch((error) => {
        console.error('Nao foi possivel retornar o Firestore ao modo local:', error);
      });
      networkEnabled = false;
      syncing = false;
      emitNetworkState();
      releaseSession();
    }
  }
};
