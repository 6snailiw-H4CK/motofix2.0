type FirestoreDebugEvent = {
  type: 'listener-create' | 'listener-snapshot' | 'read' | 'preload' | 'sync';
  label: string;
  detail?: Record<string, unknown>;
  at: string;
};

type CollectionReadStats = {
  listenerCreates: number;
  snapshots: number;
  cacheSnapshots: number;
  serverSnapshots: number;
  documentsInSnapshots: number;
  added: number;
  modified: number;
  removed: number;
  estimatedServerReads: number;
  readOperations: number;
};

type DailyReadLog = {
  listenerCreates: number;
  snapshots: number;
  cacheSnapshots: number;
  serverSnapshots: number;
  documentsInSnapshots: number;
  added: number;
  modified: number;
  removed: number;
  estimatedServerReads: number;
  readOperations: number;
  collections: Record<string, CollectionReadStats>;
  events: FirestoreDebugEvent[];
};

type PersistedReadLog = {
  days: Record<string, DailyReadLog>;
};

type FirestoreDebugState = {
  enabled: boolean;
  listenerCreateCount: number;
  listenerSnapshotCount: number;
  readCount: number;
  preloadRunCount: number;
  preloadDurationsMs: number[];
  syncDurationsMs: number[];
  events: FirestoreDebugEvent[];
};

type FirestoreDebugApi = {
  enable: () => void;
  disable: () => void;
  summary: () => Record<string, DailyReadLog>;
  download: () => void;
  clear: () => void;
};

declare global {
  interface Window {
    __motofixFirestoreDebugState?: FirestoreDebugState;
    __motofixFirestoreDebug?: FirestoreDebugApi;
  }
}

export const FIRESTORE_DEBUG_ENABLED_KEY = 'motofix:firestore-debug-enabled';
export const FIRESTORE_READ_LOG_STORAGE_PREFIX = 'motofix:firestore-read-log:v1:';

const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
let listenerSequence = 0;
const listenersWithServerSnapshot = new Set<string>();
const emptyStats = (): CollectionReadStats => ({
  listenerCreates: 0,
  snapshots: 0,
  cacheSnapshots: 0,
  serverSnapshots: 0,
  documentsInSnapshots: 0,
  added: 0,
  modified: 0,
  removed: 0,
  estimatedServerReads: 0,
  readOperations: 0,
});
const emptyDailyLog = (): DailyReadLog => ({
  listenerCreates: 0,
  snapshots: 0,
  cacheSnapshots: 0,
  serverSnapshots: 0,
  documentsInSnapshots: 0,
  added: 0,
  modified: 0,
  removed: 0,
  estimatedServerReads: 0,
  readOperations: 0,
  collections: {},
  events: [],
});
const getLocalDateKey = (date: Date) => (
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
);

const createId = () => (
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
);

const getTabId = () => {
  if (typeof window === 'undefined') return 'server';
  try {
    const existing = window.sessionStorage.getItem(`${FIRESTORE_READ_LOG_STORAGE_PREFIX}tab`);
    if (existing) return existing;
    const created = createId();
    window.sessionStorage.setItem(`${FIRESTORE_READ_LOG_STORAGE_PREFIX}tab`, created);
    return created;
  } catch (error) {
    console.warn('Nao foi possivel identificar a aba para o diagnostico do Firestore:', error);
    return createId();
  }
};

const tabStorageKey = `${FIRESTORE_READ_LOG_STORAGE_PREFIX}${getTabId()}`;

const getState = (): FirestoreDebugState => {
  if (typeof window !== 'undefined') {
    if (!window.__motofixFirestoreDebugState) {
      window.__motofixFirestoreDebugState = {
        enabled: false,
        listenerCreateCount: 0,
        listenerSnapshotCount: 0,
        readCount: 0,
        preloadRunCount: 0,
        preloadDurationsMs: [],
        syncDurationsMs: [],
        events: [],
      };
    }

    const state = window.__motofixFirestoreDebugState;
    state.enabled = isFirestoreDebugEnabled();
    return state;
  }

  return {
    enabled: false,
    listenerCreateCount: 0,
    listenerSnapshotCount: 0,
    readCount: 0,
    preloadRunCount: 0,
    preloadDurationsMs: [],
    syncDurationsMs: [],
    events: [],
  };
};

export const isFirestoreDebugEnabled = () => {
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_FIRESTORE_DEBUG === 'true') return true;
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(FIRESTORE_DEBUG_ENABLED_KEY) === 'true';
  } catch (error) {
    console.warn('Nao foi possivel verificar se o diagnostico local do Firestore esta ativado:', error);
    return false;
  }
};

const appendMemoryEvent = (state: FirestoreDebugState, event: FirestoreDebugEvent) => {
  state.events.push(event);
  if (state.events.length > 100) state.events = state.events.slice(-100);
}

const addNumbers = (target: CollectionReadStats, source: Partial<CollectionReadStats>) => {
  (Object.keys(target) as Array<keyof CollectionReadStats>).forEach((key) => {
    target[key] = target[key] + (source[key] || 0);
  });
};

const mergeDailyLogs = (target: DailyReadLog, source: DailyReadLog) => {
  [
    'listenerCreates',
    'snapshots',
    'cacheSnapshots',
    'serverSnapshots',
    'documentsInSnapshots',
    'added',
    'modified',
    'removed',
    'estimatedServerReads',
    'readOperations',
  ].forEach((key) => {
    const numericKey = key as keyof Omit<DailyReadLog, 'collections' | 'events'>;
    target[numericKey] += source[numericKey];
  });
  Object.entries(source.collections).forEach(([label, stats]) => {
    target.collections[label] ||= emptyStats();
    addNumbers(target.collections[label], stats);
  });
  target.events = [...target.events, ...source.events]
    .sort((left, right) => left.at.localeCompare(right.at))
    .slice(-100);
};

const readPersistedLogs = (key: string): PersistedReadLog => {
  if (typeof window === 'undefined') return { days: {} };
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return { days: {} };
    const value = JSON.parse(raw) as Partial<PersistedReadLog>;
    if (!value.days || typeof value.days !== 'object') return { days: {} };
    return { days: value.days as Record<string, DailyReadLog> };
  } catch (error) {
    console.warn('Nao foi possivel ler o log local de diagnostico do Firestore:', error);
    return { days: {} };
  }
};

const getCurrentDailyLog = (date: string) => {
  const days = readPersistedLogs(tabStorageKey).days;
  return days[date] || emptyDailyLog();
};

const persistEvent = (event: FirestoreDebugEvent) => {
  if (typeof window === 'undefined') return;

  const date = getLocalDateKey(new Date(event.at));
  const log = getCurrentDailyLog(date);
  const stats = log.collections[event.label] || emptyStats();
  const detail = event.detail || {};

  if (event.type === 'listener-create') {
    log.listenerCreates += 1;
    stats.listenerCreates += 1;
  } else if (event.type === 'listener-snapshot') {
    const docs = Number(detail.docs) || 0;
    const added = Number(detail.added) || 0;
    const modified = Number(detail.modified) || 0;
    const removed = Number(detail.removed) || 0;
    log.snapshots += 1;
    log.documentsInSnapshots += docs;
    log.added += added;
    log.modified += modified;
    log.removed += removed;
    stats.snapshots += 1;
    stats.documentsInSnapshots += docs;
    stats.added += added;
    stats.modified += modified;
    stats.removed += removed;
    if (detail.fromCache === true) {
      log.cacheSnapshots += 1;
      stats.cacheSnapshots += 1;
    } else if (detail.fromCache === false) {
      log.serverSnapshots += 1;
      stats.serverSnapshots += 1;
      const estimatedReads = Number(detail.estimatedServerReads) || 0;
      log.estimatedServerReads += estimatedReads;
      stats.estimatedServerReads += estimatedReads;
    }
  } else if (event.type === 'read') {
    log.readOperations += 1;
    stats.readOperations += 1;
    const estimatedReads = Number(detail.estimatedServerReads) || 0;
    log.estimatedServerReads += estimatedReads;
    stats.estimatedServerReads += estimatedReads;
  }

  log.collections[event.label] = stats;
  log.events.push(event);
  log.events = log.events.slice(-100);

  const stored = readPersistedLogs(tabStorageKey);
  stored.days[date] = log;
  const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
  Object.keys(stored.days).forEach((day) => {
    if (Date.parse(`${day}T00:00:00`) < cutoff) delete stored.days[day];
  });
  try {
    window.localStorage.setItem(tabStorageKey, JSON.stringify(stored));
  } catch (error) {
    console.warn('Nao foi possivel salvar o log local de diagnostico do Firestore:', error);
  }
};

const recordEvent = (event: FirestoreDebugEvent) => {
  if (!isFirestoreDebugEnabled()) return;
  const state = getState();
  appendMemoryEvent(state, event);
  persistEvent(event);
  console.info('[motofix][firestore-debug]', event.type, event.label, event.detail || {});
};

export const recordFirestoreListenerCreate = (label: string, detail?: Record<string, unknown>) => {
  const listenerId = `listener-${++listenerSequence}`;
  const state = getState();
  if (!state.enabled) return listenerId;

  state.listenerCreateCount += 1;
  recordEvent({ type: 'listener-create', label, detail, at: new Date().toISOString() });
  return listenerId;
};

export const recordFirestoreSnapshot = (
  label: string,
  detail?: Record<string, unknown>,
  listenerId?: string,
) => {
  const state = getState();
  if (!state.enabled) return;

  const fromCache = detail?.fromCache;
  const docs = Number(detail?.docs) || 0;
  let estimatedServerReads = 0;
  if (fromCache === false) {
    if (listenerId && !listenersWithServerSnapshot.has(listenerId)) {
      estimatedServerReads = docs;
      listenersWithServerSnapshot.add(listenerId);
    } else {
      estimatedServerReads = (Number(detail?.added) || 0) + (Number(detail?.modified) || 0);
    }
  }
  state.listenerSnapshotCount += 1;
  recordEvent({
    type: 'listener-snapshot',
    label,
    detail: { ...detail, estimatedServerReads },
    at: new Date().toISOString(),
  });
};

export const recordFirestoreRead = (label: string, detail?: Record<string, unknown>) => {
  const state = getState();
  if (!state.enabled) return;

  state.readCount += 1;
  const docs = Number(detail?.docs) || 0;
  const estimatedServerReads = detail?.fromCache === false ? docs : 0;
  recordEvent({
    type: 'read',
    label,
    detail: { ...detail, estimatedServerReads },
    at: new Date().toISOString(),
  });
};

export const recordFirestoreReadResult = (
  label: string,
  snapshot: unknown,
) => {
  const result = snapshot as {
    docs?: readonly unknown[];
    size?: number;
    exists?: () => boolean;
    metadata?: { fromCache?: boolean };
  };
  const docs = Array.isArray(result?.docs)
    ? result.docs.length
    : typeof result?.exists === 'function' && result.exists()
      ? 1
      : 0;
  recordFirestoreRead(label, {
    docs,
    fromCache: result?.metadata?.fromCache,
  });
};

export const trackFirestoreRead = async <T,>(
  label: string,
  operation: Promise<T>,
): Promise<T> => {
  const result = await operation;
  recordFirestoreReadResult(label, result);
  return result;
};

export const getFirestoreSnapshotReadDetails = (snapshot: unknown): Record<string, unknown> => {
  const result = snapshot as {
    docs?: readonly unknown[];
    size?: number;
    exists?: () => boolean;
    metadata?: { fromCache?: boolean };
    docChanges?: () => readonly { type: string }[];
  };
  const changes = result?.docChanges?.() || [];
  return {
    docs: Array.isArray(result?.docs)
      ? result.docs.length
      : typeof result?.exists === 'function' && result.exists()
        ? 1
        : 0,
    fromCache: result?.metadata?.fromCache,
    added: changes.filter((change) => change.type === 'added').length,
    modified: changes.filter((change) => change.type === 'modified').length,
    removed: changes.filter((change) => change.type === 'removed').length,
  };
};

export const recordFirestorePreload = (label: string, durationMs: number, detail?: Record<string, unknown>) => {
  const state = getState();
  if (!state.enabled) return;

  state.preloadRunCount += 1;
  state.preloadDurationsMs.push(durationMs);
  if (state.preloadDurationsMs.length > 20) state.preloadDurationsMs = state.preloadDurationsMs.slice(-20);

  recordEvent({
    type: 'preload',
    label,
    detail: { durationMs, ...detail },
    at: new Date().toISOString(),
  });
};

export const recordFirestoreSync = (label: string, durationMs: number, detail?: Record<string, unknown>) => {
  const state = getState();
  if (!state.enabled) return;

  state.syncDurationsMs.push(durationMs);
  if (state.syncDurationsMs.length > 20) state.syncDurationsMs = state.syncDurationsMs.slice(-20);

  recordEvent({
    type: 'sync',
    label,
    detail: { durationMs, ...detail },
    at: new Date().toISOString(),
  });
};

export const getFirestoreDebugSnapshot = () => {
  const state = getState();
  const days: Record<string, DailyReadLog> = {};
  if (typeof window !== 'undefined') {
    try {
      for (let index = 0; index < window.localStorage.length; index += 1) {
        const key = window.localStorage.key(index);
        if (!key?.startsWith(FIRESTORE_READ_LOG_STORAGE_PREFIX) || key.endsWith(':tab')) continue;
        const persisted = readPersistedLogs(key);
        Object.entries(persisted.days).forEach(([date, dailyLog]) => {
          days[date] ||= emptyDailyLog();
          mergeDailyLogs(days[date], dailyLog);
        });
      }
    } catch (error) {
      console.warn('Nao foi possivel reunir os logs locais do Firestore:', error);
    }
  }

  return {
    ...state,
    events: [...state.events],
    preloadDurationsMs: [...state.preloadDurationsMs],
    syncDurationsMs: [...state.syncDurationsMs],
    days,
  };
};

const installDebugApi = () => {
  if (typeof window === 'undefined' || window.__motofixFirestoreDebug) return;
  window.__motofixFirestoreDebug = {
    enable: () => {
      window.localStorage.setItem(FIRESTORE_DEBUG_ENABLED_KEY, 'true');
      console.info('Diagnostico local do Firestore ativado. Recarregue a pagina para iniciar o registro.');
    },
    disable: () => {
      window.localStorage.removeItem(FIRESTORE_DEBUG_ENABLED_KEY);
      console.info('Diagnostico local do Firestore desativado.');
    },
    summary: () => getFirestoreDebugSnapshot().days,
    download: () => {
      const contents = JSON.stringify(getFirestoreDebugSnapshot().days, null, 2);
      const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'motofix-firestore-read-log.json';
      link.click();
      URL.revokeObjectURL(url);
    },
    clear: () => {
      const keysToRemove: string[] = [];
      for (let index = 0; index < window.localStorage.length; index += 1) {
        const key = window.localStorage.key(index);
        if (key?.startsWith(FIRESTORE_READ_LOG_STORAGE_PREFIX) && !key.endsWith(':tab')) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => window.localStorage.removeItem(key));
      window.__motofixFirestoreDebugState = undefined;
    },
  };
};

installDebugApi();

export const measureFirestoreOperation = <T>(label: string, operation: () => T, detail?: Record<string, unknown>) => {
  const startedAt = nowMs();
  try {
    return operation();
  } finally {
    const durationMs = nowMs() - startedAt;
    if (isFirestoreDebugEnabled()) recordFirestoreSync(label, durationMs, detail);
  }
};
