import { recordFirestoreReadResult } from '../debug/firestoreDebug';
import { notifyFirestoreReplayMutation } from './firestoreCollectionSync';
import { withFirestoreNetworkSession } from './firestoreNetworkControl';
import { diagnoseFirestoreReplay, type ReplayMutationDiagnostic } from './firestoreReplayDiagnostics';
import {
  auditRawFirestoreOfflineQueue,
  type IndexedDbQueueRead,
  type LocalStorageQueueRead,
  type OfflineQueueStorageAudit,
} from './firestoreOfflineQueueIntegrity';
import { withLocalStateMutation } from './backupLocalStateLock';

export const FIRESTORE_OFFLINE_QUEUE_EVENT = 'motofix:firestore-offline-queue';
export const FIRESTORE_OFFLINE_WRITE_ERROR_EVENT = 'motofix:firestore-offline-write-error';
export const FIRESTORE_OFFLINE_PERSISTENCE_ERROR_EVENT = 'motofix:firestore-offline-persistence-error';
export const FIRESTORE_OFFLINE_TELEMETRY_EVENT = 'motofix:firestore-offline-telemetry';

const WRITE_SETTLE_TIMEOUT_MS = 1200;
const REMOTE_CONFIRMATION_TIMEOUT_MS = 12000;
const READ_FALLBACK_TIMEOUT_MS = 3500;
export const QUEUE_STORAGE_KEY = 'motofix:firestore-offline-queue-state';
const QUEUE_INDEXED_DB_NAME = 'motofix-offline-queue';
const QUEUE_INDEXED_DB_STORE = 'snapshots';
const QUEUE_INDEXED_DB_STATE_KEY = 'firestore-offline-queue-state';

const canUseWindow = () => typeof window !== 'undefined';
const canUseIndexedDb = () => canUseWindow() && typeof window.indexedDB !== 'undefined';

export type FirestoreReplayMutation = {
  operation: 'set' | 'update';
  path: string[];
  data: Record<string, unknown>;
  merge?: boolean;
};

export type FirestoreReplayDescriptor = (
  { version: 1 } & FirestoreReplayMutation
) | {
  version: 1;
  operation: 'batch';
  writes: FirestoreReplayMutation[];
};

type PersistedWrite = {
  id: string;
  context: string;
  ownerId: string | null;
  queuedAt: string;
  status: 'pending' | 'failed';
  lastUpdatedAt: string;
  errorMessage?: string | null;
  replay?: FirestoreReplayDescriptor;
  retryCount: number;
  lastRetryAt?: string | null;
};

type PersistedQueueSnapshot = {
  writes: PersistedWrite[];
  lastQueuedAt: string | null;
  lastSettledAt: string | null;
  lastError: string | null;
  failureCount: number;
  confirmedCount: number;
  retryCount: number;
  persistenceFailureCount: number;
  lastPersistenceError: string | null;
};

export type FirestoreOfflineQueueState = {
  pendingWrites: number;
  failedWrites: number;
  lastQueuedAt: string | null;
  lastSettledAt: string | null;
  lastError: string | null;
  failureCount: number;
  confirmedWrites: number;
  retryCount: number;
  persistenceFailureCount: number;
  lastPersistenceError: string | null;
};

export type FailedFirestoreWrite = {
  id: string;
  context: string;
  ownerId: string | null;
  errorMessage: string | null;
  replayTargets: Array<{ operation: 'set' | 'update'; path: string }>;
  diagnostics: ReplayMutationDiagnostic[];
  queuedAt: string;
  retryCount: number;
  canRetry: boolean;
};

type QueueTelemetryDetail = {
  event: 'write_failed' | 'write_reconciled' | 'retry_started' | 'retry_succeeded' | 'retry_failed' | 'persistence_failed';
  at: string;
  writeId?: string;
  context?: string;
  message?: string;
};

const emptySnapshot = (): PersistedQueueSnapshot => ({
  writes: [],
  lastQueuedAt: null,
  lastSettledAt: null,
  lastError: null,
  failureCount: 0,
  confirmedCount: 0,
  retryCount: 0,
  persistenceFailureCount: 0,
  lastPersistenceError: null,
});

const isReplayMutation = (value: unknown): value is FirestoreReplayMutation => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<FirestoreReplayMutation>;
  return (candidate.operation === 'set' || candidate.operation === 'update')
    && Array.isArray(candidate.path)
    && candidate.path.every((part) => typeof part === 'string' && part.length > 0)
    && Boolean(candidate.data)
    && typeof candidate.data === 'object'
    && !Array.isArray(candidate.data);
};

const isReplayDescriptor = (value: unknown): value is FirestoreReplayDescriptor => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<FirestoreReplayDescriptor>;
  if (candidate.version !== 1) return false;
  if (candidate.operation === 'batch') {
    return Array.isArray(candidate.writes)
      && candidate.writes.length > 0
      && candidate.writes.every(isReplayMutation);
  }
  return isReplayMutation(candidate);
};

const normalizeWrites = (value: unknown): PersistedWrite[] => {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const write = item as Partial<PersistedWrite>;
    if (typeof write.id !== 'string' || typeof write.context !== 'string') return [];
    if (write.status !== 'pending' && write.status !== 'failed') return [];

    const queuedAt = typeof write.queuedAt === 'string' ? write.queuedAt : new Date().toISOString();
    return [{
      id: write.id,
      context: write.context,
      ownerId: typeof write.ownerId === 'string' ? write.ownerId : null,
      queuedAt,
      status: write.status,
      lastUpdatedAt: typeof write.lastUpdatedAt === 'string' ? write.lastUpdatedAt : queuedAt,
      errorMessage: typeof write.errorMessage === 'string' ? write.errorMessage : null,
      replay: isReplayDescriptor(write.replay) ? write.replay : undefined,
      retryCount: Number(write.retryCount) || 0,
      lastRetryAt: typeof write.lastRetryAt === 'string' ? write.lastRetryAt : null,
    }];
  });
};

const normalizePersistedSnapshot = (value: unknown): PersistedQueueSnapshot => {
  if (!value || typeof value !== 'object') return emptySnapshot();
  const parsed = value as Partial<PersistedQueueSnapshot>;
  return {
    writes: normalizeWrites(parsed.writes),
    lastQueuedAt: parsed.lastQueuedAt || null,
    lastSettledAt: parsed.lastSettledAt || null,
    lastError: parsed.lastError || null,
    failureCount: Number(parsed.failureCount) || 0,
    confirmedCount: Number(parsed.confirmedCount) || 0,
    retryCount: Number(parsed.retryCount) || 0,
    persistenceFailureCount: Number(parsed.persistenceFailureCount) || 0,
    lastPersistenceError: parsed.lastPersistenceError || null,
  };
};

let queueDatabasePromise: Promise<IDBDatabase> | null = null;

const openQueueDatabase = () => {
  if (!canUseIndexedDb()) {
    return Promise.reject(new Error('IndexedDB indisponivel.'));
  }

  if (!queueDatabasePromise) {
    queueDatabasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = window.indexedDB.open(QUEUE_INDEXED_DB_NAME, 1);

      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(QUEUE_INDEXED_DB_STORE)) {
          database.createObjectStore(QUEUE_INDEXED_DB_STORE);
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Falha ao abrir IndexedDB.'));
      request.onblocked = () => reject(new Error('IndexedDB bloqueado por outra aba.'));
    });
  }

  return queueDatabasePromise;
};

const readRawQueueFromLocalStorage = (): LocalStorageQueueRead => {
  if (!canUseWindow()) return { status: 'unavailable' };
  try {
    return { status: 'available', raw: window.localStorage.getItem(QUEUE_STORAGE_KEY) };
  } catch {
    return { status: 'unreadable' };
  }
};

/** Reads an existing IndexedDB database using a readonly transaction; never creates/upgrades one. */
const readRawQueueFromIndexedDb = async (): Promise<IndexedDbQueueRead> => {
  if (!canUseIndexedDb()) return { status: 'unavailable' };
  const databasesApi = (window.indexedDB as IDBFactory & { databases?: () => Promise<Array<{ name?: string }>> }).databases;
  if (typeof databasesApi !== 'function') return { status: 'unavailable' };

  let databases: Array<{ name?: string }>;
  try {
    databases = await databasesApi.call(window.indexedDB);
  } catch {
    return { status: 'unreadable' };
  }
  if (!databases.some((database) => database.name === QUEUE_INDEXED_DB_NAME)) {
    return { status: 'available', databaseExists: false, raw: null };
  }

  return new Promise<IndexedDbQueueRead>((resolve) => {
    let settled = false;
    let sawUpgrade = false;
    const finish = (result: IndexedDbQueueRead, database?: IDBDatabase) => {
      if (settled) return;
      settled = true;
      database?.close();
      resolve(result);
    };
    let request: IDBOpenDBRequest;
    try {
      request = window.indexedDB.open(QUEUE_INDEXED_DB_NAME);
    } catch {
      finish({ status: 'unreadable' });
      return;
    }
    request.onupgradeneeded = () => {
      sawUpgrade = true;
      try { request.transaction?.abort(); } catch { /* abort an unexpected upgrade without creating the store */ }
    };
    request.onerror = () => finish({ status: 'unreadable' });
    request.onblocked = () => finish({ status: 'unreadable' });
    request.onsuccess = () => {
      const database = request.result;
      if (sawUpgrade || !database.objectStoreNames.contains(QUEUE_INDEXED_DB_STORE)) {
        finish({ status: 'unreadable' }, database);
        return;
      }
      try {
        const transaction = database.transaction(QUEUE_INDEXED_DB_STORE, 'readonly');
        const getRequest = transaction.objectStore(QUEUE_INDEXED_DB_STORE).get(QUEUE_INDEXED_DB_STATE_KEY);
        let value: unknown | null = null;
        getRequest.onsuccess = () => { value = getRequest.result ?? null; };
        getRequest.onerror = () => finish({ status: 'unreadable' }, database);
        transaction.oncomplete = () => finish({ status: 'available', databaseExists: true, raw: value }, database);
        transaction.onerror = () => finish({ status: 'unreadable' }, database);
        transaction.onabort = () => finish({ status: 'unreadable' }, database);
      } catch {
        finish({ status: 'unreadable' }, database);
      }
    };
  });
};

const writePersistedQueueToIndexedDb = async (snapshot: PersistedQueueSnapshot) => {
  if (!canUseIndexedDb()) return;
  const database = await openQueueDatabase();
  const serializedSnapshot = JSON.parse(JSON.stringify(snapshot)) as PersistedQueueSnapshot;

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(QUEUE_INDEXED_DB_STORE, 'readwrite');
    const store = transaction.objectStore(QUEUE_INDEXED_DB_STORE);
    const request = store.put(serializedSnapshot, QUEUE_INDEXED_DB_STATE_KEY);

    request.onerror = () => reject(request.error || new Error('Falha ao salvar fila offline no IndexedDB.'));
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error || new Error('Persistencia da fila offline abortada.'));
  });
};

const parseTime = (value: string | null | undefined) => {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
};

const getActiveWriteError = (writes: PersistedWrite[]) => {
  const latestFailure = writes
    .filter((write) => write.status === 'failed')
    .sort((left, right) => parseTime(right.lastUpdatedAt) - parseTime(left.lastUpdatedAt))[0];
  if (!latestFailure) return null;
  return `${latestFailure.context}: ${latestFailure.errorMessage || 'Falha ao gravar no Firestore.'}`;
};

let persistedQueue = emptySnapshot();

const buildQueueState = (snapshot: PersistedQueueSnapshot): FirestoreOfflineQueueState => ({
  pendingWrites: snapshot.writes.filter((write) => write.status === 'pending').length,
  failedWrites: snapshot.writes.filter((write) => write.status === 'failed').length,
  lastQueuedAt: snapshot.lastQueuedAt,
  lastSettledAt: snapshot.lastSettledAt,
  lastError: getActiveWriteError(snapshot.writes),
  failureCount: snapshot.failureCount,
  confirmedWrites: snapshot.confirmedCount,
  retryCount: snapshot.retryCount,
  persistenceFailureCount: snapshot.persistenceFailureCount,
  lastPersistenceError: snapshot.lastPersistenceError,
});

let queueState = buildQueueState(persistedQueue);
let queueStorageAudit: OfflineQueueStorageAudit = {
  status: 'unavailable', safeToUse: false, hasDivergence: false,
  localStorageEntryCount: null, indexedDbEntryCount: null,
  invalidEntryCount: 0, unknownEntryCount: 0, duplicateIdCount: 0,
  issues: ['queue_storage_audit_pending'],
};
let resolveQueueReady: () => void = () => {};
export const firestoreOfflineQueueReady = new Promise<void>((resolve) => {
  resolveQueueReady = resolve;
});

const queueStorageSafetyMessage = () => `A fila offline está preservada, mas sua consistência não pode ser confirmada (${queueStorageAudit.status}). Não é seguro alterar, reenviar ou limpar essa fila até investigação manual.`;

const assertQueueStorageSafe = () => {
  if (!canUseWindow()) return;
  if (!queueStorageAudit.safeToUse) throw new Error(queueStorageSafetyMessage());
};

/** Caller must hold MOTOFIX_LOCAL_STATE_LOCK. Reads both raw mirrors before normalization. */
const refreshQueueFromRawUnlocked = async () => {
  const [localStorageRead, indexedDbRead] = await Promise.all([
    Promise.resolve(readRawQueueFromLocalStorage()),
    readRawQueueFromIndexedDb(),
  ]);
  queueStorageAudit = auditRawFirestoreOfflineQueue(localStorageRead, indexedDbRead);
  if (!queueStorageAudit.safeToUse) {
    queueState = { ...queueState, lastPersistenceError: queueStorageSafetyMessage() };
    throw new Error(queueStorageSafetyMessage());
  }
  const localRaw = localStorageRead.status === 'available' && localStorageRead.raw !== null
    ? JSON.parse(localStorageRead.raw) as unknown : null;
  const indexedDbRaw = indexedDbRead.status === 'available' && indexedDbRead.databaseExists
    ? indexedDbRead.raw : null;
  const selectedRaw = indexedDbRaw ?? localRaw;
  persistedQueue = selectedRaw === null ? emptySnapshot() : normalizePersistedSnapshot(selectedRaw);
  queueState = buildQueueState(persistedQueue);
};

export const getFirestoreOfflineQueueStorageAudit = (): OfflineQueueStorageAudit => ({
  ...queueStorageAudit,
  issues: [...queueStorageAudit.issues],
});

const getErrorMessage = (error: unknown) => (
  error instanceof Error ? error.message : String(error)
);

const isQuotaLikeError = (error: unknown) => {
  const message = getErrorMessage(error).toLowerCase();
  return message.includes('429')
    || message.includes('resource-exhausted')
    || message.includes('quota exceeded')
    || message.includes('too many requests');
};

const requiresManualWriteReview = (message: string | null | undefined) => (
  /parte do lote|documento j[aá] existe|n[aã]o podem ser comparados|documento que deveria ser atualizado n[aã]o existe/i.test(message || '')
);

export const getFirestoreOfflineQueueState = (): FirestoreOfflineQueueState => ({
  ...queueState,
});

const emitQueueState = () => {
  if (!canUseWindow()) return;
  window.dispatchEvent(new CustomEvent(FIRESTORE_OFFLINE_QUEUE_EVENT, {
    detail: getFirestoreOfflineQueueState(),
  }));
};

const emitTelemetry = (detail: Omit<QueueTelemetryDetail, 'at'>) => {
  if (!canUseWindow()) return;
  window.dispatchEvent(new CustomEvent(FIRESTORE_OFFLINE_TELEMETRY_EVENT, {
    detail: { ...detail, at: new Date().toISOString() } satisfies QueueTelemetryDetail,
  }));
};

const emitWriteError = (context: string, error: unknown) => {
  if (!canUseWindow()) return;
  window.dispatchEvent(new CustomEvent(FIRESTORE_OFFLINE_WRITE_ERROR_EVENT, {
    detail: { context, message: getErrorMessage(error) },
  }));
};

const markPersistenceFailed = (message: string, error?: unknown) => {
  queueState = {
    ...queueState,
    persistenceFailureCount: queueState.persistenceFailureCount + 1,
    lastPersistenceError: message,
    lastError: getActiveWriteError(persistedQueue.writes),
  };
  persistedQueue = {
    ...persistedQueue,
    persistenceFailureCount: queueState.persistenceFailureCount,
    lastPersistenceError: message,
    lastError: queueState.lastError,
  };
  console.warn('Nao foi possivel persistir o estado da fila offline:', error || message);
  window.dispatchEvent(new CustomEvent(FIRESTORE_OFFLINE_PERSISTENCE_ERROR_EVENT, {
    detail: { message },
  }));
  emitTelemetry({ event: 'persistence_failed', message });
  emitQueueState();
};

const markPersistenceRecovered = () => {
  if (!queueState.lastPersistenceError) return;
  queueState = {
    ...queueState,
    lastPersistenceError: null,
    lastError: getActiveWriteError(persistedQueue.writes),
  };
  persistedQueue = {
    ...persistedQueue,
    lastPersistenceError: null,
    lastError: queueState.lastError,
  };
  emitQueueState();
};

/** Caller must hold MOTOFIX_LOCAL_STATE_LOCK for the entire mutation and persistence. */
const persistQueueStateUnlocked = async () => {
  if (!canUseWindow() || !queueStorageAudit.safeToUse) return;
  queueState = { ...queueState, lastPersistenceError: null };
  persistedQueue = {
    ...persistedQueue,
    lastQueuedAt: queueState.lastQueuedAt,
    lastSettledAt: queueState.lastSettledAt,
    lastError: queueState.lastError,
    failureCount: queueState.failureCount,
    confirmedCount: queueState.confirmedWrites,
    retryCount: queueState.retryCount,
    persistenceFailureCount: queueState.persistenceFailureCount,
    lastPersistenceError: queueState.lastPersistenceError,
  };

  let localStorageError: unknown = null;
  try {
    window.localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(persistedQueue));
  } catch (error) {
    localStorageError = error;
  }

  if (!canUseIndexedDb()) {
    if (localStorageError) {
      markPersistenceFailed(getErrorMessage(localStorageError), localStorageError);
    } else {
      markPersistenceRecovered();
    }
    return;
  }

  try {
    await writePersistedQueueToIndexedDb(JSON.parse(JSON.stringify(persistedQueue)) as PersistedQueueSnapshot);
    if (localStorageError) {
      const message = `IndexedDB foi salvo, mas o espelho LocalStorage falhou: ${getErrorMessage(localStorageError)}`;
      markPersistenceFailed(message, localStorageError);
      return;
    }
    markPersistenceRecovered();
  } catch (indexedDbError) {
    const message = localStorageError
      ? `IndexedDB: ${getErrorMessage(indexedDbError)}; localStorage: ${getErrorMessage(localStorageError)}`
      : `IndexedDB: ${getErrorMessage(indexedDbError)}`;
    markPersistenceFailed(message, indexedDbError);
  }
};

const persistQueueStateAndWait = async () => {
  if (!canUseWindow()) return;
  assertQueueStorageSafe();

  await persistQueueStateUnlocked();
  if (queueState.lastPersistenceError) throw new Error(queueState.lastPersistenceError);
};

const createWriteId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `write-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const refreshCounts = () => {
  queueState = {
    ...queueState,
    pendingWrites: persistedQueue.writes.filter((write) => write.status === 'pending').length,
    failedWrites: persistedQueue.writes.filter((write) => write.status === 'failed').length,
  };
};

const markWriteFailed = async (writeId: string, context: string, error: unknown) => withLocalStateMutation(async () => {
  await refreshQueueFromRawUnlocked();
  const message = getErrorMessage(error);
  const failedWrite = persistedQueue.writes.find((write) => write.id === writeId);
  const isQuotaError = isQuotaLikeError(error);
  if (failedWrite) {
    failedWrite.status = 'failed';
    failedWrite.lastUpdatedAt = new Date().toISOString();
    failedWrite.errorMessage = message;
  }
  refreshCounts();
  queueState = {
    ...queueState,
    lastSettledAt: new Date().toISOString(),
    lastError: getActiveWriteError(persistedQueue.writes),
    failureCount: queueState.failureCount + 1,
  };
  await persistQueueStateUnlocked();
  if (!isQuotaError) emitWriteError(context, error);
  emitTelemetry({ event: 'write_failed', writeId, context, message });
  emitQueueState();
});

const trackWrite = async (
  context: string,
  replay?: FirestoreReplayDescriptor,
  explicitOwnerId?: string,
): Promise<string> => withLocalStateMutation(async () => {
  await refreshQueueFromRawUnlocked();
  const writeId = createWriteId();
  const queuedAt = new Date().toISOString();
  const replayOwnerId = replay?.operation === 'batch'
    ? replay.writes[0]?.path[1]
    : replay?.path[1];
  persistedQueue.writes.push({
    id: writeId,
    context,
    ownerId: explicitOwnerId || replayOwnerId || null,
    queuedAt,
    status: 'pending',
    lastUpdatedAt: queuedAt,
    errorMessage: null,
    replay,
    retryCount: 0,
    lastRetryAt: null,
  });
  refreshCounts();
  queueState = { ...queueState, lastQueuedAt: queuedAt };
  await persistQueueStateUnlocked();
  emitQueueState();
  return writeId;
});

const settleTrackedWrite = async (writeId: string) => withLocalStateMutation(async () => {
  await refreshQueueFromRawUnlocked();
  const trackedWrite = persistedQueue.writes.find((write) => write.id === writeId);
  if (!trackedWrite || trackedWrite.status !== 'pending') return;
  persistedQueue.writes = persistedQueue.writes.filter((write) => write.id !== writeId);
  refreshCounts();
  queueState = {
    ...queueState,
    lastSettledAt: new Date().toISOString(),
    lastError: getActiveWriteError(persistedQueue.writes),
    confirmedWrites: queueState.confirmedWrites + 1,
  };
  await persistQueueStateUnlocked();
  emitQueueState();
});

type QueuedWriteResult<T> = {
  writeId: string;
  status: 'settled' | 'queued';
  value?: T;
};

export const createFirestoreReplayDescriptor = (
  operation: FirestoreReplayMutation['operation'],
  path: string[],
  data: Record<string, unknown>,
  merge = false
): FirestoreReplayDescriptor => ({ version: 1, operation, path, data, merge });

export const createFirestoreBatchReplayDescriptor = (
  writes: FirestoreReplayMutation[]
): FirestoreReplayDescriptor => ({ version: 1, operation: 'batch', writes });

export async function queueFirestoreWrite<T>(
  operation: () => Promise<T>,
  context = 'Firestore write',
  replay?: FirestoreReplayDescriptor,
  ownerId?: string,
): Promise<QueuedWriteResult<T>> {
  await firestoreOfflineQueueReady;
  assertQueueStorageSafe();
  const writeId = await trackWrite(context, replay, ownerId);
  let writePromise: Promise<T>;

  try {
    writePromise = operation();
  } catch (error) {
    await markWriteFailed(writeId, context, error);
    throw error;
  }

  writePromise.then(
    () => settleTrackedWrite(writeId),
    async (error) => {
      await markWriteFailed(writeId, context, error);
      // Firestore rolls optimistic cache writes back on rejection; refresh the in-memory view from that cache.
      notifyFirestoreReplayMutation(replay);
    },
  );
  notifyFirestoreReplayMutation(replay);
  const result = await Promise.race([
    writePromise.then((value) => ({ status: 'settled' as const, value })),
    new Promise<{ status: 'queued' }>((resolve) => {
      setTimeout(() => resolve({ status: 'queued' }), WRITE_SETTLE_TIMEOUT_MS);
    }),
  ]);

  return result.status === 'settled'
    ? { writeId, status: 'settled', value: result.value }
    : { writeId, status: 'queued' };
}

export const queueFirestoreVoidWrite = async (
  operation: () => Promise<void>,
  context?: string,
  replay?: FirestoreReplayDescriptor,
  ownerId?: string,
) => {
  return queueFirestoreWrite(operation, context, replay, ownerId);
};

export const getPendingWriteCheckpoint = () => persistedQueue.writes
  .filter((write) => write.status === 'pending')
  .map((write) => write.id);

export const getPendingWriteOwners = () => {
  const pending = persistedQueue.writes.filter((write) => write.status === 'pending');
  return {
    userIds: Array.from(new Set(pending.map((write) => write.ownerId).filter((ownerId): ownerId is string => Boolean(ownerId)))),
    unknownCount: pending.filter((write) => !write.ownerId).length,
  };
};

export const getFailedWriteCheckpoint = (userId: string) => persistedQueue.writes
  .filter((write) => {
    if (write.status !== 'failed' || !write.replay || requiresManualWriteReview(write.errorMessage)) return false;
    const mutations = write.replay.operation === 'batch' ? write.replay.writes : [write.replay];
    const replayOwners = Array.from(new Set(mutations.map((mutation) => mutation.path[1]).filter(Boolean)));
    return replayOwners.length === 1
      && replayOwners[0] === userId
      && (!write.ownerId || write.ownerId === userId);
  })
  .map((write) => write.id);

export const confirmPendingWriteCheckpoint = async (writeIds: string[]) => withLocalStateMutation(async () => {
  await refreshQueueFromRawUnlocked();
  assertQueueStorageSafe();
  if (writeIds.length === 0) return;
  const settledIds = new Set(writeIds);
  const confirmedCount = persistedQueue.writes.filter(
    (write) => write.status === 'pending' && settledIds.has(write.id)
  ).length;

  persistedQueue.writes = persistedQueue.writes.filter(
    (write) => !(write.status === 'pending' && settledIds.has(write.id))
  );
  refreshCounts();
  queueState = {
    ...queueState,
    lastSettledAt: new Date().toISOString(),
    lastError: getActiveWriteError(persistedQueue.writes),
    confirmedWrites: queueState.confirmedWrites + confirmedCount,
  };
  await persistQueueStateUnlocked();
  emitQueueState();
});

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

export async function confirmPendingWriteCheckpointRemotely(
  writeIds: string[],
  waitForRemoteWrites: () => Promise<void>,
  timeoutMs = REMOTE_CONFIRMATION_TIMEOUT_MS
): Promise<boolean> {
  await firestoreOfflineQueueReady;
  await withLocalStateMutation(refreshQueueFromRawUnlocked);
  assertQueueStorageSafe();
  if (writeIds.length === 0) return true;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;

  try {
    await withTimeout(
      waitForRemoteWrites(),
      timeoutMs,
      'Tempo limite ao aguardar confirmacao remota do Firestore.'
    );
    const hasFailedWrite = persistedQueue.writes.some(
      (write) => writeIds.includes(write.id) && write.status === 'failed'
    );
    if (hasFailedWrite) return false;
    await confirmPendingWriteCheckpoint(writeIds);
    return true;
  } catch {
    return false;
  }
}

export const getFailedWrites = (currentUserId?: string | null): FailedFirestoreWrite[] => persistedQueue.writes
  .filter((write) => write.status === 'failed')
  .map((write) => {
    const mutations = write.replay
      ? (write.replay.operation === 'batch' ? write.replay.writes : [write.replay])
      : [];
    return {
      id: write.id,
      context: write.context,
      ownerId: write.ownerId,
      errorMessage: write.errorMessage || null,
      replayTargets: mutations.map((mutation) => ({
        operation: mutation.operation,
        path: mutation.path.join('/'),
      })),
      diagnostics: diagnoseFirestoreReplay(mutations, currentUserId),
      queuedAt: write.queuedAt,
      retryCount: write.retryCount,
      canRetry: Boolean(write.replay) && !requiresManualWriteReview(write.errorMessage),
    };
  });

/** Returns a serializable copy of the durable queue for local recovery archives. */
export const readAuditedFirestoreOfflineQueueSnapshot = async (userId: string) => {
  const [localStorageRead, indexedDbRead] = await Promise.all([
    Promise.resolve(readRawQueueFromLocalStorage()),
    readRawQueueFromIndexedDb(),
  ]);
  const audit = auditRawFirestoreOfflineQueue(localStorageRead, indexedDbRead);
  if (!audit.safeToUse) return { audit, queue: null, allWrites: [] as PersistedWrite[] };
  const localRaw = localStorageRead.status === 'available' && localStorageRead.raw !== null
    ? JSON.parse(localStorageRead.raw) as unknown : null;
  const indexedDbRaw = indexedDbRead.status === 'available' && indexedDbRead.databaseExists
    ? indexedDbRead.raw : null;
  const selectedRaw = indexedDbRaw ?? localRaw;
  const snapshot = selectedRaw === null ? emptySnapshot() : normalizePersistedSnapshot(selectedRaw);
  const belongsToUser = (write: PersistedWrite) => {
    if (write.ownerId === userId) return true;
    const mutations = write.replay
      ? (write.replay.operation === 'batch' ? write.replay.writes : [write.replay])
      : [];
    return mutations.some((mutation) => mutation.path[1] === userId);
  };
  return {
    audit,
    allWrites: JSON.parse(JSON.stringify(snapshot.writes)) as PersistedWrite[],
    queue: JSON.parse(JSON.stringify({
      ...snapshot,
      writes: snapshot.writes.filter(belongsToUser),
    })) as PersistedQueueSnapshot,
  };
};

export const exportFirestoreOfflineQueueSnapshot = async (userId: string) => {
  await firestoreOfflineQueueReady;
  const result = await readAuditedFirestoreOfflineQueueSnapshot(userId);
  if (!result.audit.safeToUse || !result.queue) throw new Error(queueStorageSafetyMessage());
  return result.queue;
};

export const discardFailedFirestoreWrites = async (
  writeIds: string[],
  currentUserId: string | null,
): Promise<number> => {
  await firestoreOfflineQueueReady;
  if (!currentUserId) throw new Error('Entre na conta da oficina para limpar as falhas locais.');

  return withLocalStateMutation(async () => {
  await refreshQueueFromRawUnlocked();
  assertQueueStorageSafe();

  const requestedIds = new Set(writeIds.filter((writeId) => typeof writeId === 'string' && writeId.length > 0));
  const removedWrites = persistedQueue.writes.filter((write) => (
    requestedIds.has(write.id)
    && write.status === 'failed'
    && write.ownerId === currentUserId
  ));
  if (removedWrites.length === 0) return 0;

  const removedIds = new Set(removedWrites.map((write) => write.id));
  persistedQueue = {
    ...persistedQueue,
    writes: persistedQueue.writes.filter((write) => !removedIds.has(write.id)),
  };
  refreshCounts();
  queueState = {
    ...queueState,
    lastError: getActiveWriteError(persistedQueue.writes),
  };

  try {
    await persistQueueStateAndWait();
  } catch (error) {
    // Restore only the failed entries this action removed, preserving any
    // other queue writes that may have appeared while persistence was pending.
    const restoredWrites = new Map(persistedQueue.writes.map((write) => [write.id, write]));
    removedWrites.forEach((write) => {
      if (!restoredWrites.has(write.id)) restoredWrites.set(write.id, write);
    });
    persistedQueue = {
      ...persistedQueue,
      writes: Array.from(restoredWrites.values()),
    };
    refreshCounts();
    queueState = {
      ...queueState,
      lastError: getActiveWriteError(persistedQueue.writes),
    };
    await persistQueueStateUnlocked();
    emitQueueState();
    throw new Error('Não foi possível salvar a limpeza no armazenamento local. As falhas foram restauradas na fila.');
  }

  emitQueueState();
  return removedWrites.length;
  });
};

const validateReplayPath = (path: string[]) => {
  const validDocumentPath = path.length >= 2 && path.length % 2 === 0;
  if (!validDocumentPath || path[0] !== 'users') {
    throw new Error('Destino de retry invalido.');
  }
};

const validateReplayDescriptor = (descriptor: FirestoreReplayDescriptor) => {
  if (descriptor.operation === 'batch') {
    if (descriptor.writes.length === 0) {
      throw new Error('Batch de retry vazio.');
    }
    descriptor.writes.forEach((write) => validateReplayPath(write.path));
    return;
  }

  validateReplayPath(descriptor.path);
};

const replayFirestoreWrite = async (descriptor: FirestoreReplayDescriptor) => {
  validateReplayDescriptor(descriptor);
  const replayModule = await import('./firestoreWriteReplay');
  await replayModule.replayFirestoreWrite(descriptor);
  notifyFirestoreReplayMutation(descriptor);
};

const completeRetriedWrite = async (writeId: string, context: string) => withLocalStateMutation(async () => {
  await refreshQueueFromRawUnlocked();
  const trackedWrite = persistedQueue.writes.find((write) => write.id === writeId);
  if (!trackedWrite) return;

  persistedQueue.writes = persistedQueue.writes.filter((write) => write.id !== writeId);
  refreshCounts();
  queueState = {
    ...queueState,
    lastSettledAt: new Date().toISOString(),
    lastError: getActiveWriteError(persistedQueue.writes),
    confirmedWrites: queueState.confirmedWrites + 1,
  };
  await persistQueueStateUnlocked();
  emitTelemetry({ event: 'retry_succeeded', writeId, context });
  emitQueueState();
});

const completeReconciledWrite = async (writeId: string, context: string) => withLocalStateMutation(async () => {
  await refreshQueueFromRawUnlocked();
  const trackedWrite = persistedQueue.writes.find((write) => write.id === writeId);
  if (!trackedWrite) return;

  persistedQueue.writes = persistedQueue.writes.filter((write) => write.id !== writeId);
  refreshCounts();
  queueState = {
    ...queueState,
    lastSettledAt: new Date().toISOString(),
    lastError: getActiveWriteError(persistedQueue.writes),
    confirmedWrites: queueState.confirmedWrites + 1,
  };
  await persistQueueStateUnlocked();
  emitTelemetry({ event: 'write_reconciled', writeId, context });
  emitQueueState();
});

const replayOwnerIds = (descriptor: FirestoreReplayDescriptor) => {
  const mutations = descriptor.operation === 'batch' ? descriptor.writes : [descriptor];
  return Array.from(new Set(mutations.map((mutation) => mutation.path[1]).filter(Boolean)));
};

const inspectReplayRemotely = async (descriptor: FirestoreReplayDescriptor, queuedAt?: string) => {
  const replayModule = await import('./firestoreWriteReplay');
  return replayModule.inspectFirestoreReplay(descriptor, queuedAt);
};

/**
 * Reconcile restored checkpoints and failed writes explicitly included in a
 * manual sync. Server state is checked before retrying to prevent duplicate
 * application of stale creates and stock batches.
 */
export async function reconcilePendingWriteCheckpointRemotely(
  writeIds: string[],
  userId: string,
  waitForRemoteWrites: () => Promise<void>,
  timeoutMs = REMOTE_CONFIRMATION_TIMEOUT_MS,
): Promise<{ confirmed: number; failed: number; pending: number }> {
  await firestoreOfflineQueueReady;
  await withLocalStateMutation(refreshQueueFromRawUnlocked);
  assertQueueStorageSafe();
  if (writeIds.length === 0) return { confirmed: 0, failed: 0, pending: 0 };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { confirmed: 0, failed: 0, pending: writeIds.length };
  }

  try {
    await withTimeout(
      waitForRemoteWrites(),
      timeoutMs,
      'Tempo limite ao aguardar a resposta do Firestore para as alteracoes locais.',
    );
  } catch {
    return {
      confirmed: 0,
      failed: 0,
      pending: writeIds.filter((id) => (
        persistedQueue.writes.some((write) => write.id === id && write.status === 'pending')
      )).length,
    };
  }

  let confirmed = 0;
  let failed = 0;

  for (const writeId of writeIds) {
    const pendingWrite = persistedQueue.writes.find(
      (write) => write.id === writeId && (write.status === 'pending' || write.status === 'failed')
    );
    if (!pendingWrite) continue;

    const descriptor = pendingWrite.replay;
    const ownerIds = descriptor ? replayOwnerIds(descriptor) : [];
    if (!descriptor) {
      await markWriteFailed(
        writeId,
        pendingWrite.context,
        new Error('Esta alteracao antiga nao possui dados suficientes para reenvio seguro. Revise o registro na tela de origem.'),
      );
      failed += 1;
      continue;
    }
    if (ownerIds.length !== 1 || ownerIds[0] !== userId || (pendingWrite.ownerId && pendingWrite.ownerId !== userId)) {
      await markWriteFailed(
        writeId,
        pendingWrite.context,
        new Error('A alteracao pendente pertence a outra conta ou nao tem um proprietario seguro para sincronizar.'),
      );
      failed += 1;
      continue;
    }

    let replayPromise: Promise<void> | null = null;
    try {
      const inspection = await withTimeout(
        inspectReplayRemotely(descriptor, pendingWrite.queuedAt),
        timeoutMs,
        'Tempo limite ao conferir a alteracao no Firestore.',
      );
      if (inspection.status === 'already-applied') {
        notifyFirestoreReplayMutation(descriptor);
        await completeReconciledWrite(writeId, pendingWrite.context);
        confirmed += 1;
        continue;
      }
      if (inspection.status === 'conflict') throw new Error(inspection.reason);

      await withLocalStateMutation(async () => {
        await refreshQueueFromRawUnlocked();
        const currentWrite = persistedQueue.writes.find((write) => write.id === writeId);
        if (!currentWrite) return;
        if (currentWrite.status === 'failed') {
          currentWrite.retryCount += 1;
          currentWrite.lastRetryAt = new Date().toISOString();
          queueState = { ...queueState, retryCount: queueState.retryCount + 1 };
        }
        currentWrite.status = 'pending';
        currentWrite.lastUpdatedAt = new Date().toISOString();
        currentWrite.errorMessage = null;
        refreshCounts();
        await persistQueueStateUnlocked();
      });

      replayPromise = withTimeout(
        replayFirestoreWrite(descriptor),
        timeoutMs,
        'Tempo limite ao confirmar individualmente esta alteracao no Firestore.',
      );
      await replayPromise;
      await completeReconciledWrite(writeId, pendingWrite.context);
      confirmed += 1;
    } catch (error) {
      await markWriteFailed(writeId, pendingWrite.context, error);
      failed += 1;
      const failedSnapshot = persistedQueue.writes.find((write) => write.id === writeId);
      const failedAt = failedSnapshot?.lastUpdatedAt;
      if (replayPromise && failedAt && /Tempo limite/.test(getErrorMessage(error))) {
        void replayPromise.then(async () => {
          const timedOutWrite = persistedQueue.writes.find((write) => write.id === writeId);
          if (timedOutWrite?.status === 'failed' && timedOutWrite.lastUpdatedAt === failedAt) {
          await completeReconciledWrite(writeId, pendingWrite.context);
          }
        }).catch(() => undefined);
      }
    }
  }

  const pending = writeIds.filter((id) => (
    persistedQueue.writes.some((write) => write.id === id && write.status === 'pending')
  )).length;
  return { confirmed, failed, pending };
}

export async function retryFailedWrite(writeId: string): Promise<void> {
  await firestoreOfflineQueueReady;
  const failedWrite = await withLocalStateMutation(async () => {
    await refreshQueueFromRawUnlocked();
    assertQueueStorageSafe();
    const found = persistedQueue.writes.find((write) => write.id === writeId && write.status === 'failed');
    if (!found) return null;
    if (!found.replay) throw new Error('Esta operacao exige correcao manual e nao pode ser repetida com seguranca.');
    const ownerId = found.replay.operation === 'batch' ? found.replay.writes[0]?.path[1] : found.replay.path[1];
    if (!ownerId) throw new Error('Não foi possível identificar a conta dona desta gravação.');
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('Conecte-se a internet para tentar novamente.');
    const retryStartedAt = new Date().toISOString();
    found.status = 'pending';
    found.lastUpdatedAt = retryStartedAt;
    found.lastRetryAt = retryStartedAt;
    found.retryCount += 1;
    found.errorMessage = null;
    refreshCounts();
    queueState = { ...queueState, lastError: getActiveWriteError(persistedQueue.writes), retryCount: queueState.retryCount + 1 };
    await persistQueueStateUnlocked();
    emitTelemetry({ event: 'retry_started', writeId, context: found.context });
    emitQueueState();
    return { ...found, replay: JSON.parse(JSON.stringify(found.replay)) as FirestoreReplayDescriptor };
  });
  if (!failedWrite) throw new Error('Escrita com falha nao encontrada.');
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('Conecte-se a internet para tentar novamente.');
  }
  const ownerId = failedWrite.replay.operation === 'batch'
    ? failedWrite.replay.writes[0]?.path[1]
    : failedWrite.replay.path[1];
  if (!ownerId) throw new Error('Não foi possível identificar a conta dona desta gravação.');

  const retryStartedAt = failedWrite.lastRetryAt || new Date().toISOString();

  let replayPromise: Promise<void> | null = null;
  try {
    const descriptor = failedWrite.replay as FirestoreReplayDescriptor;
    let alreadyApplied = false;
    replayPromise = withFirestoreNetworkSession(ownerId, async () => {
      const inspection = await withTimeout(
        inspectReplayRemotely(descriptor, failedWrite.queuedAt),
        REMOTE_CONFIRMATION_TIMEOUT_MS,
        'Tempo limite ao conferir a alteracao no Firestore.'
      );
      if (inspection.status === 'already-applied') {
        alreadyApplied = true;
        notifyFirestoreReplayMutation(descriptor);
        return;
      }
      if (inspection.status === 'conflict') throw new Error(inspection.reason);
      await withTimeout(
        replayFirestoreWrite(descriptor),
        REMOTE_CONFIRMATION_TIMEOUT_MS,
        'Tempo limite ao repetir a escrita no Firestore.'
      );
    });
    await replayPromise;
    if (alreadyApplied) await completeReconciledWrite(writeId, failedWrite.context);
    else await completeRetriedWrite(writeId, failedWrite.context);
  } catch (error) {
    const message = getErrorMessage(error);
    await withLocalStateMutation(async () => {
      await refreshQueueFromRawUnlocked();
      const failed = persistedQueue.writes.find((write) => write.id === writeId);
      if (failed) {
        failed.status = 'failed';
        failed.lastUpdatedAt = new Date().toISOString();
        failed.errorMessage = message;
      }
      refreshCounts();
      queueState = { ...queueState, lastSettledAt: new Date().toISOString(), lastError: getActiveWriteError(persistedQueue.writes), failureCount: queueState.failureCount + 1 };
      await persistQueueStateUnlocked();
    });
    emitWriteError(failedWrite.context, error);
    emitTelemetry({ event: 'retry_failed', writeId, context: failedWrite.context, message });
    emitQueueState();
    if (message === 'Tempo limite ao repetir a escrita no Firestore.' && replayPromise) {
      void replayPromise.then(async () => {
        const timedOutWrite = persistedQueue.writes.find((write) => write.id === writeId);
        if (timedOutWrite?.lastRetryAt === retryStartedAt) {
          await completeRetriedWrite(writeId, failedWrite.context);
        }
      }).catch(() => undefined);
    }
    throw error;
  }
}

const isBrowserOffline = () => (
  typeof navigator !== 'undefined' && navigator.onLine === false
);

export async function readFirestoreWithCacheFallback<T>(
  readFromDefaultSource: () => Promise<T>,
  readFromCache: () => Promise<T>,
  context = 'Firestore read',
  timeoutMs = READ_FALLBACK_TIMEOUT_MS
): Promise<T> {
  if (isBrowserOffline()) {
    const cachedResult = await readFromCache();
    recordFirestoreReadResult(context, cachedResult);
    return cachedResult;
  }

  try {
    const result = await withTimeout(
      readFromDefaultSource(),
      timeoutMs,
      `${context} timeout after ${timeoutMs}ms`
    );
    recordFirestoreReadResult(context, result);
    return result;
  } catch (defaultReadError) {
    try {
      const cachedResult = await readFromCache();
      recordFirestoreReadResult(context, cachedResult);
      return cachedResult;
    } catch (cacheReadError) {
      console.warn(`${context} failed in default and cache sources:`, defaultReadError, cacheReadError);
      throw defaultReadError;
    }
  }
}

export const subscribeFirestoreOfflineQueue = (
  listener: (state: FirestoreOfflineQueueState) => void
) => {
  if (!canUseWindow()) return () => {};

  const handleQueueState = (event: Event) => {
    listener((event as CustomEvent<FirestoreOfflineQueueState>).detail);
  };

  window.addEventListener(FIRESTORE_OFFLINE_QUEUE_EVENT, handleQueueState);
  listener(getFirestoreOfflineQueueState());

  return () => window.removeEventListener(FIRESTORE_OFFLINE_QUEUE_EVENT, handleQueueState);
};

const refreshFirestoreOfflineQueueStorageAuditUnlocked = async (): Promise<OfflineQueueStorageAudit> => {
  try {
    await refreshQueueFromRawUnlocked();
  } catch {
    // refreshQueueFromRawUnlocked already records the precise raw-read result
    // (including divergence, malformed, or unknown entries); do not erase it.
    if (queueStorageAudit.issues.includes('queue_storage_audit_pending')) {
      queueStorageAudit = {
        status: 'unreadable', safeToUse: false, hasDivergence: false,
        localStorageEntryCount: null, indexedDbEntryCount: null,
        invalidEntryCount: 0, unknownEntryCount: 0, duplicateIdCount: 0,
        issues: ['queue_storage_audit_failed'],
      };
    }
    queueState = { ...queueState, lastPersistenceError: queueStorageSafetyMessage() };
  }
  emitQueueState();
  return getFirestoreOfflineQueueStorageAudit();
};

export const refreshFirestoreOfflineQueueStorageAudit = async (): Promise<OfflineQueueStorageAudit> => (
  withLocalStateMutation(refreshFirestoreOfflineQueueStorageAuditUnlocked)
);

const hydrateQueueFromIndexedDb = async () => {
  try {
    await refreshFirestoreOfflineQueueStorageAudit();
  } catch {
    // Keep all persisted bytes untouched if the audit itself cannot complete.
    if (queueStorageAudit.issues.includes('queue_storage_audit_pending')) {
      queueStorageAudit = {
        status: 'unreadable', safeToUse: false, hasDivergence: false,
        localStorageEntryCount: null, indexedDbEntryCount: null,
        invalidEntryCount: 0, unknownEntryCount: 0, duplicateIdCount: 0,
        issues: ['queue_storage_audit_failed'],
      };
    }
    queueState = { ...queueState, lastPersistenceError: queueStorageSafetyMessage() };
  } finally {
    resolveQueueReady();
  }
};

if (canUseWindow()) {
  void hydrateQueueFromIndexedDb();

  window.addEventListener('storage', (event) => {
    if (event.key !== QUEUE_STORAGE_KEY) return;
    // Cross-tab changes are audited read-only. Never merge one mirror over the other.
    void refreshFirestoreOfflineQueueStorageAudit();
  });
} else {
  resolveQueueReady();
}
