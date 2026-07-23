type FirestoreDebugEvent = {
  type: 'listener-create' | 'listener-snapshot' | 'read' | 'preload' | 'sync';
  label: string;
  detail?: Record<string, unknown>;
  at: string;
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

declare global {
  interface Window {
    __motofixFirestoreDebugState?: FirestoreDebugState;
  }
}

const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

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
    if (state.enabled !== isFirestoreDebugEnabled()) {
      state.enabled = isFirestoreDebugEnabled();
    }
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
  if (typeof import.meta === 'undefined') return false;
  return import.meta.env?.VITE_FIRESTORE_DEBUG === 'true';
};

const pushEvent = (state: FirestoreDebugState, event: FirestoreDebugEvent) => {
  state.events.push(event);
  if (state.events.length > 40) {
    state.events = state.events.slice(-40);
  }
};

const logEvent = (event: FirestoreDebugEvent) => {
  if (!isFirestoreDebugEnabled()) return;
  console.info('[motofix][firestore-debug]', event.type, event.label, event.detail || {});
};

export const recordFirestoreListenerCreate = (label: string, detail?: Record<string, unknown>) => {
  const state = getState();
  if (!state.enabled) return;

  state.listenerCreateCount += 1;
  const event = { type: 'listener-create' as const, label, detail, at: new Date().toISOString() };
  pushEvent(state, event);
  logEvent(event);
};

export const recordFirestoreSnapshot = (label: string, detail?: Record<string, unknown>) => {
  const state = getState();
  if (!state.enabled) return;

  state.listenerSnapshotCount += 1;
  const event = { type: 'listener-snapshot' as const, label, detail, at: new Date().toISOString() };
  pushEvent(state, event);
  logEvent(event);
};

export const recordFirestoreRead = (label: string, detail?: Record<string, unknown>) => {
  const state = getState();
  if (!state.enabled) return;

  state.readCount += 1;
  const event = { type: 'read' as const, label, detail, at: new Date().toISOString() };
  pushEvent(state, event);
  logEvent(event);
};

export const recordFirestorePreload = (label: string, durationMs: number, detail?: Record<string, unknown>) => {
  const state = getState();
  if (!state.enabled) return;

  state.preloadRunCount += 1;
  state.preloadDurationsMs.push(durationMs);
  if (state.preloadDurationsMs.length > 20) {
    state.preloadDurationsMs = state.preloadDurationsMs.slice(-20);
  }

  const event = { type: 'preload' as const, label, detail: { durationMs, ...detail }, at: new Date().toISOString() };
  pushEvent(state, event);
  logEvent(event);
};

export const recordFirestoreSync = (label: string, durationMs: number, detail?: Record<string, unknown>) => {
  const state = getState();
  if (!state.enabled) return;

  state.syncDurationsMs.push(durationMs);
  if (state.syncDurationsMs.length > 20) {
    state.syncDurationsMs = state.syncDurationsMs.slice(-20);
  }

  const event = { type: 'sync' as const, label, detail: { durationMs, ...detail }, at: new Date().toISOString() };
  pushEvent(state, event);
  logEvent(event);
};

export const getFirestoreDebugSnapshot = () => {
  const state = getState();
  return {
    ...state,
    events: [...state.events],
    preloadDurationsMs: [...state.preloadDurationsMs],
    syncDurationsMs: [...state.syncDurationsMs],
  };
};

export const measureFirestoreOperation = <T>(label: string, operation: () => T, detail?: Record<string, unknown>) => {
  const startedAt = nowMs();
  try {
    return operation();
  } finally {
    const durationMs = nowMs() - startedAt;
    if (isFirestoreDebugEnabled()) {
      recordFirestoreSync(label, durationMs, detail);
    }
  }
};
