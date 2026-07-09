import { collection, doc, getDocFromServer, getDocsFromServer } from 'firebase/firestore';
import { db } from '../firebase';

export const OFFLINE_DATA_PRELOAD_STORAGE_KEY = 'motofix:offline-data-preload-state';
export const OFFLINE_DATA_PRELOAD_STALE_MS = 24 * 60 * 60 * 1000;

const FAILED_PRELOAD_RETRY_MS = 15 * 60 * 1000;

const USER_COLLECTIONS_TO_PRELOAD = [
  'clients',
  'maintenances',
  'warranties',
  'appointments',
  'expenses',
  'products',
  'cash_launches',
  'fiscal_companies',
  'fiscal_invoices',
  'fiscal_logs',
  'operational_logs',
  'message_logs',
] as const;

type PersistedPreloadState = {
  users: Record<string, {
    lastAttemptedAt: string | null;
    lastCompletedAt: string | null;
    lastError: string | null;
    failedTargets: string[];
    targetCount: number;
  }>;
};

export type OfflineDataPreloadResult = {
  status: 'success' | 'partial' | 'skipped';
  startedAt: string | null;
  completedAt: string | null;
  failedTargets: string[];
  targetCount: number;
};

const canUseWindow = () => typeof window !== 'undefined';

const isBrowserOnline = () => (
  typeof navigator === 'undefined' ? true : navigator.onLine
);

const emptyState = (): PersistedPreloadState => ({ users: {} });

const readPreloadState = (): PersistedPreloadState => {
  if (!canUseWindow()) return emptyState();

  try {
    const raw = window.localStorage.getItem(OFFLINE_DATA_PRELOAD_STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<PersistedPreloadState>;
    return parsed.users && typeof parsed.users === 'object'
      ? { users: parsed.users }
      : emptyState();
  } catch (error) {
    console.warn('Nao foi possivel ler o estado da pre-carga offline:', error);
    return emptyState();
  }
};

const writePreloadState = (state: PersistedPreloadState) => {
  if (!canUseWindow()) return;

  try {
    window.localStorage.setItem(OFFLINE_DATA_PRELOAD_STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('Nao foi possivel salvar o estado da pre-carga offline:', error);
  }
};

const getUserPreloadState = (userId: string) => readPreloadState().users[userId];

const updateUserPreloadState = (
  userId: string,
  patch: Partial<PersistedPreloadState['users'][string]>
) => {
  const state = readPreloadState();
  state.users[userId] = {
    lastAttemptedAt: null,
    lastCompletedAt: null,
    lastError: null,
    failedTargets: [],
    targetCount: 0,
    ...state.users[userId],
    ...patch,
  };
  writePreloadState(state);
};

const getAgeMs = (value: string | null | undefined, now = Date.now()) => {
  if (!value) return Number.POSITIVE_INFINITY;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? now - time : Number.POSITIVE_INFINITY;
};

const getErrorMessage = (error: unknown) => (
  error instanceof Error ? error.message : String(error)
);

export const shouldPreloadOfflineData = (
  userId: string,
  staleAfterMs = OFFLINE_DATA_PRELOAD_STALE_MS,
  now = Date.now()
) => {
  if (!isBrowserOnline()) return false;

  const state = getUserPreloadState(userId);
  if (!state) return true;

  const attemptAge = getAgeMs(state.lastAttemptedAt, now);
  if (Array.isArray(state.failedTargets) && state.failedTargets.length > 0) {
    return attemptAge >= FAILED_PRELOAD_RETRY_MS;
  }

  const completedAge = getAgeMs(state.lastCompletedAt, now);
  if (completedAge < staleAfterMs) return false;

  return attemptAge >= FAILED_PRELOAD_RETRY_MS;
};

export const preloadUserOfflineData = async ({
  userId,
  includeAdminUsers = false,
}: {
  userId: string;
  includeAdminUsers?: boolean;
}): Promise<OfflineDataPreloadResult> => {
  if (!isBrowserOnline()) {
    return {
      status: 'skipped',
      startedAt: null,
      completedAt: null,
      failedTargets: [],
      targetCount: 0,
    };
  }

  const startedAt = new Date().toISOString();
  updateUserPreloadState(userId, {
    lastAttemptedAt: startedAt,
    lastError: null,
    failedTargets: [],
  });

  const targets = [
    {
      label: 'Perfil do usuario',
      load: () => getDocFromServer(doc(db, 'users', userId)),
    },
    {
      label: 'Configuracoes',
      load: () => getDocFromServer(doc(db, 'users', userId, 'settings', 'config')),
    },
    ...USER_COLLECTIONS_TO_PRELOAD.map((collectionName) => ({
      label: collectionName,
      load: () => getDocsFromServer(collection(db, 'users', userId, collectionName)),
    })),
    ...(includeAdminUsers
      ? [{
        label: 'Usuarios administrativos',
        load: () => getDocsFromServer(collection(db, 'users')),
      }]
      : []),
  ];

  const results = await Promise.allSettled(targets.map((target) => target.load()));
  const failedTargets = results.flatMap((result, index) => (
    result.status === 'rejected'
      ? [`${targets[index].label}: ${getErrorMessage(result.reason)}`]
      : []
  ));
  const completedAt = new Date().toISOString();

  updateUserPreloadState(userId, {
    lastCompletedAt: completedAt,
    lastError: failedTargets[0] || null,
    failedTargets,
    targetCount: targets.length,
  });

  if (failedTargets.length > 0) {
    console.warn('Pre-carga offline concluiu com falhas parciais:', failedTargets);
  }

  return {
    status: failedTargets.length > 0 ? 'partial' : 'success',
    startedAt,
    completedAt,
    failedTargets,
    targetCount: targets.length,
  };
};
