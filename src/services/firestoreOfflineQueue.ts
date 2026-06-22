export const FIRESTORE_OFFLINE_QUEUE_EVENT = 'motofix:firestore-offline-queue';
export const FIRESTORE_OFFLINE_WRITE_ERROR_EVENT = 'motofix:firestore-offline-write-error';
export const FIRESTORE_OFFLINE_PERSISTENCE_ERROR_EVENT = 'motofix:firestore-offline-persistence-error';
export const FIRESTORE_OFFLINE_TELEMETRY_EVENT = 'motofix:firestore-offline-telemetry';

const WRITE_SETTLE_TIMEOUT_MS = 1200;
const REMOTE_CONFIRMATION_TIMEOUT_MS = 12000;
const READ_FALLBACK_TIMEOUT_MS = 3500;
export const QUEUE_STORAGE_KEY = 'motofix:firestore-offline-queue-state';

const canUseWindow = () => typeof window !== 'undefined';

export type FirestoreReplayDescriptor = {
  version: 1;
  operation: 'set' | 'update';
  path: string[];
  data: Record<string, unknown>;
  merge?: boolean;
};

type PersistedWrite = {
  id: string;
  context: string;
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
  errorMessage: string | null;
  queuedAt: string;
  retryCount: number;
  canRetry: boolean;
};

type QueueTelemetryDetail = {
  event: 'write_failed' | 'retry_started' | 'retry_succeeded' | 'retry_failed' | 'persistence_failed';
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

const isReplayDescriptor = (value: unknown): value is FirestoreReplayDescriptor => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<FirestoreReplayDescriptor>;
  return candidate.version === 1
    && (candidate.operation === 'set' || candidate.operation === 'update')
    && Array.isArray(candidate.path)
    && candidate.path.every((part) => typeof part === 'string' && part.length > 0)
    && Boolean(candidate.data)
    && typeof candidate.data === 'object'
    && !Array.isArray(candidate.data);
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

const readPersistedQueue = (): PersistedQueueSnapshot => {
  if (!canUseWindow()) return emptySnapshot();

  try {
    const raw = window.localStorage.getItem(QUEUE_STORAGE_KEY);
    if (!raw) return emptySnapshot();
    const parsed = JSON.parse(raw) as Partial<PersistedQueueSnapshot>;
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
  } catch (error) {
    console.warn('Nao foi possivel ler o estado da fila offline:', error);
    return emptySnapshot();
  }
};

let persistedQueue = readPersistedQueue();

const buildQueueState = (snapshot: PersistedQueueSnapshot): FirestoreOfflineQueueState => ({
  pendingWrites: snapshot.writes.filter((write) => write.status === 'pending').length,
  failedWrites: snapshot.writes.filter((write) => write.status === 'failed').length,
  lastQueuedAt: snapshot.lastQueuedAt,
  lastSettledAt: snapshot.lastSettledAt,
  lastError: snapshot.lastError,
  failureCount: snapshot.failureCount,
  confirmedWrites: snapshot.confirmedCount,
  retryCount: snapshot.retryCount,
  persistenceFailureCount: snapshot.persistenceFailureCount,
  lastPersistenceError: snapshot.lastPersistenceError,
});

let queueState = buildQueueState(persistedQueue);

const getErrorMessage = (error: unknown) => (
  error instanceof Error ? error.message : String(error)
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

const persistQueueState = () => {
  if (!canUseWindow()) return;
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

  try {
    window.localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(persistedQueue));
  } catch (error) {
    const message = getErrorMessage(error);
    queueState = {
      ...queueState,
      persistenceFailureCount: queueState.persistenceFailureCount + 1,
      lastPersistenceError: message,
      lastError: `Persistencia da fila: ${message}`,
    };
    console.warn('Nao foi possivel persistir o estado da fila offline:', error);
    window.dispatchEvent(new CustomEvent(FIRESTORE_OFFLINE_PERSISTENCE_ERROR_EVENT, {
      detail: { message },
    }));
    emitTelemetry({ event: 'persistence_failed', message });
    emitQueueState();
  }
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

const markWriteFailed = (writeId: string, context: string, error: unknown) => {
  const message = getErrorMessage(error);
  const failedWrite = persistedQueue.writes.find((write) => write.id === writeId);
  if (failedWrite) {
    failedWrite.status = 'failed';
    failedWrite.lastUpdatedAt = new Date().toISOString();
    failedWrite.errorMessage = message;
  }
  refreshCounts();
  queueState = {
    ...queueState,
    lastSettledAt: new Date().toISOString(),
    lastError: `${context}: ${message}`,
    failureCount: queueState.failureCount + 1,
  };
  persistQueueState();
  emitWriteError(context, error);
  emitTelemetry({ event: 'write_failed', writeId, context, message });
  emitQueueState();
};

const trackWrite = <T>(
  writePromise: Promise<T>,
  context: string,
  replay?: FirestoreReplayDescriptor
) => {
  const writeId = createWriteId();
  const queuedAt = new Date().toISOString();
  persistedQueue.writes.push({
    id: writeId,
    context,
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
  persistQueueState();
  emitQueueState();

  writePromise
    .then(() => {
      const trackedWrite = persistedQueue.writes.find((write) => write.id === writeId);
      if (!trackedWrite || trackedWrite.status !== 'pending') return;

      persistedQueue.writes = persistedQueue.writes.filter((write) => write.id !== writeId);
      refreshCounts();
      queueState = {
        ...queueState,
        lastSettledAt: new Date().toISOString(),
        lastError: persistedQueue.writes.find((write) => write.status === 'failed')?.errorMessage || null,
        confirmedWrites: queueState.confirmedWrites + 1,
      };
      persistQueueState();
      emitQueueState();
    })
    .catch((error) => markWriteFailed(writeId, context, error));

  return writeId;
};

type QueuedWriteResult<T> = {
  writeId: string;
  status: 'settled' | 'queued';
  value?: T;
};

export const createFirestoreReplayDescriptor = (
  operation: FirestoreReplayDescriptor['operation'],
  path: string[],
  data: Record<string, unknown>,
  merge = false
): FirestoreReplayDescriptor => ({ version: 1, operation, path, data, merge });

export async function queueFirestoreWrite<T>(
  operation: () => Promise<T>,
  context = 'Firestore write',
  replay?: FirestoreReplayDescriptor
): Promise<QueuedWriteResult<T>> {
  let writePromise: Promise<T>;

  try {
    writePromise = operation();
  } catch (error) {
    queueState = {
      ...queueState,
      lastError: `${context}: ${getErrorMessage(error)}`,
      failureCount: queueState.failureCount + 1,
    };
    persistQueueState();
    emitWriteError(context, error);
    emitQueueState();
    throw error;
  }

  const writeId = trackWrite(writePromise, context, replay);
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
  replay?: FirestoreReplayDescriptor
) => {
  await queueFirestoreWrite(operation, context, replay);
};

export const getPendingWriteCheckpoint = () => persistedQueue.writes
  .filter((write) => write.status === 'pending')
  .map((write) => write.id);

export const confirmPendingWriteCheckpoint = (writeIds: string[]) => {
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
    lastError: persistedQueue.writes.find((write) => write.status === 'failed')?.errorMessage || null,
    confirmedWrites: queueState.confirmedWrites + confirmedCount,
  };
  persistQueueState();
  emitQueueState();
};

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
    confirmPendingWriteCheckpoint(writeIds);
    return true;
  } catch {
    return false;
  }
}

export const getFailedWrites = (): FailedFirestoreWrite[] => persistedQueue.writes
  .filter((write) => write.status === 'failed')
  .map((write) => ({
    id: write.id,
    context: write.context,
    errorMessage: write.errorMessage || null,
    queuedAt: write.queuedAt,
    retryCount: write.retryCount,
    canRetry: Boolean(write.replay),
  }));

const validateReplayPath = (path: string[]) => {
  const validDocumentPath = path.length >= 2 && path.length % 2 === 0;
  if (!validDocumentPath || path[0] !== 'users') {
    throw new Error('Destino de retry invalido.');
  }
};

const replayFirestoreWrite = async (descriptor: FirestoreReplayDescriptor) => {
  validateReplayPath(descriptor.path);
  const replayModule = await import('./firestoreWriteReplay');
  await replayModule.replayFirestoreWrite(descriptor);
};

const completeRetriedWrite = (writeId: string, context: string) => {
  const trackedWrite = persistedQueue.writes.find((write) => write.id === writeId);
  if (!trackedWrite) return;

  persistedQueue.writes = persistedQueue.writes.filter((write) => write.id !== writeId);
  refreshCounts();
  queueState = {
    ...queueState,
    lastSettledAt: new Date().toISOString(),
    lastError: persistedQueue.writes.find((write) => write.status === 'failed')?.errorMessage || null,
    confirmedWrites: queueState.confirmedWrites + 1,
  };
  persistQueueState();
  emitTelemetry({ event: 'retry_succeeded', writeId, context });
  emitQueueState();
};

export async function retryFailedWrite(writeId: string): Promise<void> {
  const failedWrite = persistedQueue.writes.find(
    (write) => write.id === writeId && write.status === 'failed'
  );
  if (!failedWrite) throw new Error('Escrita com falha nao encontrada.');
  if (!failedWrite.replay) throw new Error('Esta operacao exige correcao manual e nao pode ser repetida com seguranca.');
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('Conecte-se a internet para tentar novamente.');
  }

  const retryStartedAt = new Date().toISOString();
  failedWrite.status = 'pending';
  failedWrite.lastUpdatedAt = retryStartedAt;
  failedWrite.lastRetryAt = retryStartedAt;
  failedWrite.retryCount += 1;
  failedWrite.errorMessage = null;
  refreshCounts();
  queueState = { ...queueState, retryCount: queueState.retryCount + 1 };
  persistQueueState();
  emitTelemetry({ event: 'retry_started', writeId, context: failedWrite.context });
  emitQueueState();

  const replayPromise = replayFirestoreWrite(failedWrite.replay);
  try {
    await withTimeout(
      replayPromise,
      REMOTE_CONFIRMATION_TIMEOUT_MS,
      'Tempo limite ao repetir a escrita no Firestore.'
    );
    completeRetriedWrite(writeId, failedWrite.context);
  } catch (error) {
    const message = getErrorMessage(error);
    const failed = persistedQueue.writes.find((write) => write.id === writeId);
    if (failed) {
      failed.status = 'failed';
      failed.lastUpdatedAt = new Date().toISOString();
      failed.errorMessage = message;
    }
    refreshCounts();
    queueState = {
      ...queueState,
      lastSettledAt: new Date().toISOString(),
      lastError: `${failedWrite.context}: ${message}`,
      failureCount: queueState.failureCount + 1,
    };
    persistQueueState();
    emitWriteError(failedWrite.context, error);
    emitTelemetry({ event: 'retry_failed', writeId, context: failedWrite.context, message });
    emitQueueState();

    if (message === 'Tempo limite ao repetir a escrita no Firestore.') {
      void replayPromise.then(() => {
        const timedOutWrite = persistedQueue.writes.find((write) => write.id === writeId);
        if (timedOutWrite?.lastRetryAt === retryStartedAt) {
          completeRetriedWrite(writeId, failedWrite.context);
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
  if (isBrowserOffline()) return readFromCache();

  try {
    return await withTimeout(
      readFromDefaultSource(),
      timeoutMs,
      `${context} timeout after ${timeoutMs}ms`
    );
  } catch (defaultReadError) {
    try {
      return await readFromCache();
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

if (canUseWindow()) {
  window.addEventListener('storage', (event) => {
    if (event.key !== QUEUE_STORAGE_KEY) return;
    persistedQueue = readPersistedQueue();
    queueState = buildQueueState(persistedQueue);
    emitQueueState();
  });
}
