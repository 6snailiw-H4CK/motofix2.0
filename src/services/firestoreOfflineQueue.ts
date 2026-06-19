export const FIRESTORE_OFFLINE_QUEUE_EVENT = 'motofix:firestore-offline-queue';
export const FIRESTORE_OFFLINE_WRITE_ERROR_EVENT = 'motofix:firestore-offline-write-error';

const WRITE_ACK_TIMEOUT_MS = 1200;
const READ_FALLBACK_TIMEOUT_MS = 3500;
const QUEUE_STORAGE_KEY = 'motofix:firestore-offline-queue-state';

const canUseWindow = () => typeof window !== 'undefined';

type PersistedWrite = {
  id: string;
  context: string;
  queuedAt: string;
};

type PersistedQueueSnapshot = {
  writes: PersistedWrite[];
  lastQueuedAt: string | null;
  lastSettledAt: string | null;
  lastError: string | null;
  failureCount: number;
};

export type FirestoreOfflineQueueState = {
  pendingWrites: number;
  lastQueuedAt: string | null;
  lastSettledAt: string | null;
  lastError: string | null;
  failureCount: number;
};

const readPersistedQueue = (): PersistedQueueSnapshot => {
  if (!canUseWindow()) {
    return { writes: [], lastQueuedAt: null, lastSettledAt: null, lastError: null, failureCount: 0 };
  }

  try {
    const raw = window.localStorage.getItem(QUEUE_STORAGE_KEY);
    if (!raw) return { writes: [], lastQueuedAt: null, lastSettledAt: null, lastError: null, failureCount: 0 };
    const parsed = JSON.parse(raw) as Partial<PersistedQueueSnapshot>;
    return {
      writes: Array.isArray(parsed.writes) ? parsed.writes : [],
      lastQueuedAt: parsed.lastQueuedAt || null,
      lastSettledAt: parsed.lastSettledAt || null,
      lastError: parsed.lastError || null,
      failureCount: Number(parsed.failureCount) || 0,
    };
  } catch {
    return { writes: [], lastQueuedAt: null, lastSettledAt: null, lastError: null, failureCount: 0 };
  }
};

let persistedQueue = readPersistedQueue();

let queueState: FirestoreOfflineQueueState = {
  pendingWrites: persistedQueue.writes.length,
  lastQueuedAt: persistedQueue.lastQueuedAt,
  lastSettledAt: persistedQueue.lastSettledAt,
  lastError: persistedQueue.lastError,
  failureCount: persistedQueue.failureCount,
};

const persistQueueState = () => {
  if (!canUseWindow()) return;
  persistedQueue = {
    writes: persistedQueue.writes,
    lastQueuedAt: queueState.lastQueuedAt,
    lastSettledAt: queueState.lastSettledAt,
    lastError: queueState.lastError,
    failureCount: queueState.failureCount,
  };
  try {
    window.localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(persistedQueue));
  } catch (error) {
    console.warn('Nao foi possivel persistir o estado da fila offline:', error);
  }
};

const createWriteId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `write-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

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

const emitWriteError = (context: string, error: unknown) => {
  if (!canUseWindow()) return;
  window.dispatchEvent(new CustomEvent(FIRESTORE_OFFLINE_WRITE_ERROR_EVENT, {
    detail: {
      context,
      message: getErrorMessage(error),
    },
  }));
};

const trackWrite = <T>(writePromise: Promise<T>, context: string) => {
  const writeId = createWriteId();
  const queuedAt = new Date().toISOString();
  persistedQueue.writes.push({ id: writeId, context, queuedAt });
  queueState = {
    ...queueState,
    pendingWrites: persistedQueue.writes.length,
    lastQueuedAt: queuedAt,
  };
  persistQueueState();
  emitQueueState();

  writePromise
    .then(() => {
      persistedQueue.writes = persistedQueue.writes.filter((write) => write.id !== writeId);
      queueState = {
        ...queueState,
        pendingWrites: persistedQueue.writes.length,
        lastSettledAt: new Date().toISOString(),
        lastError: null,
      };
      persistQueueState();
      emitQueueState();
    })
    .catch((error) => {
      persistedQueue.writes = persistedQueue.writes.filter((write) => write.id !== writeId);
      queueState = {
        ...queueState,
        pendingWrites: persistedQueue.writes.length,
        lastSettledAt: new Date().toISOString(),
        lastError: `${context}: ${getErrorMessage(error)}`,
        failureCount: queueState.failureCount + 1,
      };
      persistQueueState();
      emitWriteError(context, error);
      emitQueueState();
    });
};

export async function queueFirestoreWrite<T>(
  operation: () => Promise<T>,
  context = 'Firestore write'
): Promise<T | undefined> {
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

  trackWrite(writePromise, context);

  try {
    const result = await Promise.race([
      writePromise.then((value) => ({ status: 'confirmed' as const, value })),
      new Promise<{ status: 'queued' }>((resolve) => {
        setTimeout(() => resolve({ status: 'queued' }), WRITE_ACK_TIMEOUT_MS);
      }),
    ]);

    if (result.status === 'confirmed') {
      return result.value;
    }

    return undefined;
  } catch (error) {
    throw error;
  }
}

export const queueFirestoreVoidWrite = async (
  operation: () => Promise<void>,
  context?: string
) => {
  await queueFirestoreWrite(operation, context);
};

export const getPendingWriteCheckpoint = () => persistedQueue.writes.map((write) => write.id);

export const confirmPendingWriteCheckpoint = (writeIds: string[]) => {
  if (writeIds.length === 0) return;
  const settledIds = new Set(writeIds);
  persistedQueue.writes = persistedQueue.writes.filter((write) => !settledIds.has(write.id));
  queueState = {
    ...queueState,
    pendingWrites: persistedQueue.writes.length,
    lastSettledAt: new Date().toISOString(),
    lastError: null,
  };
  persistQueueState();
  emitQueueState();
};

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
    return readFromCache();
  }

  try {
    return await Promise.race([
      readFromDefaultSource(),
      new Promise<T>((_, reject) => {
        setTimeout(() => reject(new Error(`${context} timeout after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
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

  return () => {
    window.removeEventListener(FIRESTORE_OFFLINE_QUEUE_EVENT, handleQueueState);
  };
};
