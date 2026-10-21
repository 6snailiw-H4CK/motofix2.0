export const FIRESTORE_COLLECTION_SYNC_INTERVAL_MS = 4 * 60 * 60 * 1000;
export const FIRESTORE_COLLECTION_FULL_AUDIT_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;
const SYNC_STATE_STORAGE_KEY = 'motofix:firestore-collection-sync:v1';
const SYNC_FAILURE_STORAGE_KEY = 'motofix:firestore-collection-sync-failures:v1';
const MUTATION_EVENT = 'motofix:firestore-local-collection-mutation';
const MUTATION_CHANNEL = 'motofix-firestore-local-mutations';
const LOCK_LEASE_MS = 2 * 60 * 1000;

export type FirestoreCollectionSyncRecord = {
  completedAt: string;
  documentCount: number;
  /** Timestamp checkpoint for incremental queries; absent means a full baseline is required. */
  changeCursor?: string;
  /** Periodic full reconciliation catches legacy clients and hard deletes. */
  lastFullSyncAt?: string;
};

type PersistedSyncState = Record<string, Record<string, FirestoreCollectionSyncRecord>>;
type PersistedSyncFailures = Record<string, Record<string, { retryAfter: string; message: string }>>;
const inMemorySyncRecords = new Map<string, FirestoreCollectionSyncRecord>();
const inMemorySyncFailures = new Map<string, { retryAfter: string; message: string }>();

export type FirestoreLocalMutation = {
  userId: string;
  collections: string[];
};

const canUseWindow = () => typeof window !== 'undefined';

const readSyncState = (): PersistedSyncState => {
  if (!canUseWindow()) return {};
  try {
    const raw = window.localStorage.getItem(SYNC_STATE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed as PersistedSyncState : {};
  } catch {
    return {};
  }
};

const readSyncFailures = (): PersistedSyncFailures => {
  if (!canUseWindow()) return {};
  try {
    const raw = window.localStorage.getItem(SYNC_FAILURE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed as PersistedSyncFailures : {};
  } catch {
    return {};
  }
};

export const getFirestoreCollectionSyncFailure = (userId: string, collectionName: string) => {
  const key = `${userId}:${collectionName}`;
  const memoryFailure = inMemorySyncFailures.get(key);
  const persistedFailure = readSyncFailures()[userId]?.[collectionName];
  if (!persistedFailure) return memoryFailure || null;
  if (!memoryFailure || Date.parse(persistedFailure.retryAfter) >= Date.parse(memoryFailure.retryAfter)) {
    inMemorySyncFailures.set(key, persistedFailure);
    return persistedFailure;
  }
  return memoryFailure;
};

export const isFirestoreCollectionSyncBackedOff = (userId: string, collectionName: string, now = Date.now()) => {
  const failure = getFirestoreCollectionSyncFailure(userId, collectionName);
  return Boolean(failure && Date.parse(failure.retryAfter) > now);
};

export const markFirestoreCollectionSyncFailure = (
  userId: string,
  collectionName: string,
  error: unknown
) => {
  const message = error instanceof Error ? error.message : String(error);
  const quotaFailure = /429|resource-exhausted|quota exceeded|too many requests/i.test(message);
  const retryAfter = new Date(Date.now() + (quotaFailure ? 60 : 15) * 60 * 1000).toISOString();
  const failure = { retryAfter, message };
  inMemorySyncFailures.set(`${userId}:${collectionName}`, failure);
  if (!canUseWindow()) return;
  const failures = readSyncFailures();
  failures[userId] = { ...failures[userId], [collectionName]: failure };
  try {
    window.localStorage.setItem(SYNC_FAILURE_STORAGE_KEY, JSON.stringify(failures));
  } catch {
    // The in-memory retry backoff still protects this app session.
  }
};

export const clearFirestoreCollectionSyncFailure = (userId: string, collectionName: string) => {
  inMemorySyncFailures.delete(`${userId}:${collectionName}`);
  if (!canUseWindow()) return;
  const failures = readSyncFailures();
  const userFailures = failures[userId];
  if (!userFailures?.[collectionName]) return;
  delete userFailures[collectionName];
  if (Object.keys(userFailures).length === 0) delete failures[userId];
  try {
    window.localStorage.setItem(SYNC_FAILURE_STORAGE_KEY, JSON.stringify(failures));
  } catch {
    // Ignore storage errors; the current session's memory state is already cleared.
  }
};

export const getFirestoreCollectionSyncRecord = (
  userId: string,
  collectionName: string
): FirestoreCollectionSyncRecord | null => {
  const memoryRecord = inMemorySyncRecords.get(`${userId}:${collectionName}`);
  const record = readSyncState()[userId]?.[collectionName];
  if ((!record || typeof record.completedAt !== 'string') && memoryRecord) return memoryRecord;
  if (!record || typeof record.completedAt !== 'string') return null;
  const completedAt = Date.parse(record.completedAt);
  if (!Number.isFinite(completedAt)) return null;
  const persistedRecord = {
    completedAt: record.completedAt,
    documentCount: Math.max(0, Number(record.documentCount) || 0),
    ...(typeof record.changeCursor === 'string' && Number.isFinite(Date.parse(record.changeCursor))
      ? { changeCursor: record.changeCursor }
      : {}),
    ...(typeof record.lastFullSyncAt === 'string' && Number.isFinite(Date.parse(record.lastFullSyncAt))
      ? { lastFullSyncAt: record.lastFullSyncAt }
      : {}),
  };
  if (!memoryRecord || Date.parse(persistedRecord.completedAt) >= Date.parse(memoryRecord.completedAt)) {
    inMemorySyncRecords.set(`${userId}:${collectionName}`, persistedRecord);
    return persistedRecord;
  }
  return memoryRecord;
};

export const saveFirestoreCollectionSyncRecord = (
  userId: string,
  collectionName: string,
  record: FirestoreCollectionSyncRecord
) => {
  inMemorySyncRecords.set(`${userId}:${collectionName}`, record);
  if (!canUseWindow()) return;
  const state = readSyncState();
  state[userId] = {
    ...state[userId],
    [collectionName]: record,
  };
  try {
    window.localStorage.setItem(SYNC_STATE_STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('Nao foi possivel guardar o horario de sincronizacao local:', error);
  }
};

export const isFirestoreCollectionSyncDue = (
  userId: string,
  collectionName: string,
  cachedDocumentCount: number,
  now = Date.now()
) => {
  const record = getFirestoreCollectionSyncRecord(userId, collectionName);
  if (!record) return true;
  if (now - Date.parse(record.completedAt) >= FIRESTORE_COLLECTION_SYNC_INTERVAL_MS) return true;

  // Detect a cleared/evicted Firestore cache without treating new local writes as stale.
  return record.documentCount > 0 && cachedDocumentCount < record.documentCount;
};

export const isFirestoreCollectionFullAuditDue = (
  record: FirestoreCollectionSyncRecord | null,
  now = Date.now()
) => !record?.lastFullSyncAt
  || now - Date.parse(record.lastFullSyncAt) >= FIRESTORE_COLLECTION_FULL_AUDIT_INTERVAL_MS;

export const FIRESTORE_INCREMENTAL_SYNC_OVERLAP_MS = 2 * 60 * 1000;

export const getFirestoreIncrementalSyncStart = (
  record: FirestoreCollectionSyncRecord | null,
  syncStartedAt: string
) => {
  if (!record?.changeCursor) return null;
  const cursorTime = Date.parse(record.changeCursor);
  const syncStartTime = Date.parse(syncStartedAt);
  if (!Number.isFinite(cursorTime) || !Number.isFinite(syncStartTime)) return null;
  // A small overlap protects against client clock skew and writes that commit while a sync is running.
  return new Date(Math.max(0, Math.min(cursorTime, syncStartTime) - FIRESTORE_INCREMENTAL_SYNC_OVERLAP_MS)).toISOString();
};

const broadcastMutation = (detail: FirestoreLocalMutation) => {
  if (!canUseWindow()) return;
  window.dispatchEvent(new CustomEvent<FirestoreLocalMutation>(MUTATION_EVENT, { detail }));
  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel(MUTATION_CHANNEL);
    channel.postMessage(detail);
    channel.close();
  }
};

export const notifyFirestoreLocalCollectionsChanged = (
  userId: string,
  collections: Iterable<string>
) => {
  const uniqueCollections = Array.from(new Set(Array.from(collections).filter(Boolean)));
  if (!userId || uniqueCollections.length === 0) return;
  broadcastMutation({ userId, collections: uniqueCollections });
};

const mutationCollectionsFromReplay = (descriptor: unknown): FirestoreLocalMutation[] => {
  if (!descriptor || typeof descriptor !== 'object') return [];
  const candidate = descriptor as {
    operation?: string;
    path?: unknown;
    writes?: Array<{ path?: unknown }>;
  };
  const mutations = candidate.operation === 'batch'
    ? candidate.writes || []
    : [candidate];
  const collectionsByUser = new Map<string, Set<string>>();
  mutations.forEach((mutation) => {
    const path = Array.isArray(mutation.path) ? mutation.path : [];
    if (path.length < 4 || path[0] !== 'users') return;
    const userId = String(path[1] || '');
    const collectionName = String(path[2] || '');
    if (!userId || !collectionName) return;
    const collections = collectionsByUser.get(userId) || new Set<string>();
    collections.add(collectionName);
    collectionsByUser.set(userId, collections);
  });
  return Array.from(collectionsByUser, ([userId, collections]) => ({
    userId,
    collections: Array.from(collections),
  }));
};

export const notifyFirestoreReplayMutation = (descriptor: unknown) => {
  mutationCollectionsFromReplay(descriptor).forEach(({ userId, collections }) => {
    notifyFirestoreLocalCollectionsChanged(userId, collections);
  });
};

export const subscribeFirestoreLocalCollectionMutations = (
  listener: (mutation: FirestoreLocalMutation) => void
) => {
  if (!canUseWindow()) return () => undefined;
  const handleMutation = (event: Event) => {
    const detail = (event as CustomEvent<FirestoreLocalMutation>).detail;
    if (detail?.userId && Array.isArray(detail.collections)) listener(detail);
  };
  window.addEventListener(MUTATION_EVENT, handleMutation);

  const channel = typeof BroadcastChannel === 'undefined'
    ? null
    : new BroadcastChannel(MUTATION_CHANNEL);
  channel?.addEventListener('message', (event: MessageEvent<FirestoreLocalMutation>) => {
    if (event.data?.userId && Array.isArray(event.data.collections)) listener(event.data);
  });

  return () => {
    window.removeEventListener(MUTATION_EVENT, handleMutation);
    channel?.close();
  };
};

export const withFirestoreCollectionSyncLock = async <T,>(
  userId: string,
  collectionName: string,
  task: () => Promise<T>
): Promise<{ acquired: boolean; value?: T }> => {
  const lockName = `motofix-firestore-sync:${userId}:${collectionName}`;
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (locks?.request) {
    return locks.request(lockName, { mode: 'exclusive', ifAvailable: true }, async (lock) => {
      if (!lock) return { acquired: false };
      return { acquired: true, value: await task() };
    });
  }

  if (!canUseWindow()) return { acquired: true, value: await task() };
  const leaseKey = `${SYNC_STATE_STORAGE_KEY}:lock:${userId}:${collectionName}`;
  const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try {
    const rawLease = window.localStorage.getItem(leaseKey);
    const lease = rawLease ? JSON.parse(rawLease) as { token?: string; expiresAt?: number } : null;
    if (lease?.expiresAt && lease.expiresAt > Date.now()) return { acquired: false };
    window.localStorage.setItem(leaseKey, JSON.stringify({ token, expiresAt: Date.now() + LOCK_LEASE_MS }));
    const confirmed = JSON.parse(window.localStorage.getItem(leaseKey) || 'null') as { token?: string } | null;
    if (confirmed?.token !== token) return { acquired: false };
  } catch {
    return { acquired: true, value: await task() };
  }

  try {
    return { acquired: true, value: await task() };
  } finally {
    try {
      const lease = JSON.parse(window.localStorage.getItem(leaseKey) || 'null') as { token?: string } | null;
      if (lease?.token === token) window.localStorage.removeItem(leaseKey);
    } catch {
      // Ignore unavailable localStorage cleanup; the lease expires automatically.
    }
  }
};
