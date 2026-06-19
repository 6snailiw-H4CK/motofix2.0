export const FIRESTORE_OFFLINE_QUEUE_EVENT = 'motofix:firestore-offline-queue';
export const FIRESTORE_OFFLINE_WRITE_ERROR_EVENT = 'motofix:firestore-offline-write-error';

const WRITE_ACK_TIMEOUT_MS = 1200;
const READ_FALLBACK_TIMEOUT_MS = 3500;

export type FirestoreOfflineQueueState = {
  pendingWrites: number;
  lastQueuedAt: string | null;
  lastSettledAt: string | null;
  lastError: string | null;
};

let queueState: FirestoreOfflineQueueState = {
  pendingWrites: 0,
  lastQueuedAt: null,
  lastSettledAt: null,
  lastError: null,
};

const canUseWindow = () => typeof window !== 'undefined';

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
  queueState = {
    ...queueState,
    pendingWrites: queueState.pendingWrites + 1,
    lastQueuedAt: new Date().toISOString(),
  };
  emitQueueState();

  writePromise
    .then(() => {
      queueState = {
        ...queueState,
        pendingWrites: Math.max(0, queueState.pendingWrites - 1),
        lastSettledAt: new Date().toISOString(),
        lastError: null,
      };
      emitQueueState();
    })
    .catch((error) => {
      queueState = {
        ...queueState,
        pendingWrites: Math.max(0, queueState.pendingWrites - 1),
        lastSettledAt: new Date().toISOString(),
        lastError: `${context}: ${getErrorMessage(error)}`,
      };
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
    };
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
