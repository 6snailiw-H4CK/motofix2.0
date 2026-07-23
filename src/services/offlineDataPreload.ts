import {
  collection,
  doc,
  documentId,
  getDocFromServer,
  getDocsFromServer,
  limit,
  orderBy,
  query,
  startAfter,
  type CollectionReference,
  type DocumentData,
} from 'firebase/firestore';
import { db } from '../firebase';
import { recordFirestoreRead } from '../debug/firestoreDebug';

export const OFFLINE_DATA_PRELOAD_STORAGE_KEY = 'motofix:offline-data-preload-state';
export const OFFLINE_DATA_PRELOAD_STALE_MS = 24 * 60 * 60 * 1000;

const FAILED_PRELOAD_RETRY_MS = 15 * 60 * 1000;
const PRELOAD_PAGE_SIZE = 200;

const USER_COLLECTIONS_TO_PRELOAD = [
  'clients',
  'maintenances',
  'warranties',
  'appointments',
  'expenses',
  'products',
  'stock_movements',
  'cash_launches',
  'fiscal_companies',
  'fiscal_invoices',
  'fiscal_logs',
  'operational_logs',
  'message_logs',
] as const;

type UserPreloadState = {
  lastAttemptedAt: string | null;
  lastCompletedAt: string | null;
  lastError: string | null;
  failedTargets: string[];
  targetCount: number;
  checkpoints: Record<string, string | null>;
  loadedDocuments: number;
};

type PersistedPreloadState = {
  users: Record<string, UserPreloadState>;
};

type PreloadTarget = {
  key: string;
  label: string;
  load: () => Promise<number>;
};

export type OfflineDataPreloadResult = {
  status: 'success' | 'partial' | 'skipped';
  startedAt: string | null;
  completedAt: string | null;
  failedTargets: string[];
  targetCount: number;
  loadedDocuments: number;
};

const canUseWindow = () => typeof window !== 'undefined';

const isBrowserOnline = () => (
  typeof navigator === 'undefined' ? true : navigator.onLine
);

const emptyUserState = (): UserPreloadState => ({
  lastAttemptedAt: null,
  lastCompletedAt: null,
  lastError: null,
  failedTargets: [],
  targetCount: 0,
  checkpoints: {},
  loadedDocuments: 0,
});

const emptyState = (): PersistedPreloadState => ({ users: {} });

const normalizeUserState = (value: unknown): UserPreloadState => {
  if (!value || typeof value !== 'object') return emptyUserState();
  const candidate = value as Partial<UserPreloadState>;
  return {
    ...emptyUserState(),
    lastAttemptedAt: candidate.lastAttemptedAt || null,
    lastCompletedAt: candidate.lastCompletedAt || null,
    lastError: candidate.lastError || null,
    failedTargets: Array.isArray(candidate.failedTargets)
      ? candidate.failedTargets.filter((target): target is string => typeof target === 'string')
      : [],
    targetCount: Number(candidate.targetCount) || 0,
    checkpoints: candidate.checkpoints && typeof candidate.checkpoints === 'object'
      ? Object.fromEntries(
        Object.entries(candidate.checkpoints).filter((entry): entry is [string, string | null] => (
          typeof entry[0] === 'string' && (typeof entry[1] === 'string' || entry[1] === null)
        ))
      )
      : {},
    loadedDocuments: Number(candidate.loadedDocuments) || 0,
  };
};

const readPreloadState = (): PersistedPreloadState => {
  if (!canUseWindow()) return emptyState();

  try {
    const raw = window.localStorage.getItem(OFFLINE_DATA_PRELOAD_STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<PersistedPreloadState>;
    if (!parsed.users || typeof parsed.users !== 'object') return emptyState();
    return {
      users: Object.fromEntries(
        Object.entries(parsed.users).map(([userId, userState]) => [userId, normalizeUserState(userState)])
      ),
    };
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
  patch: Partial<UserPreloadState>
) => {
  const state = readPreloadState();
  state.users[userId] = {
    ...emptyUserState(),
    ...state.users[userId],
    ...patch,
  };
  writePreloadState(state);
};

const updateCheckpoint = (userId: string, targetKey: string, documentId: string | null) => {
  const current = getUserPreloadState(userId) || emptyUserState();
  updateUserPreloadState(userId, {
    checkpoints: {
      ...current.checkpoints,
      [targetKey]: documentId,
    },
  });
};

const clearCompletedCheckpoints = (userId: string) => {
  updateUserPreloadState(userId, { checkpoints: {} });
};

const getAgeMs = (value: string | null | undefined, now = Date.now()) => {
  if (!value) return Number.POSITIVE_INFINITY;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? now - time : Number.POSITIVE_INFINITY;
};

const getErrorMessage = (error: unknown) => (
  error instanceof Error ? error.message : String(error)
);

const yieldToBrowser = () => new Promise((resolve) => {
  setTimeout(resolve, 0);
});

const preloadCollectionPages = async (
  userId: string,
  targetKey: string,
  collectionRef: CollectionReference<DocumentData>
) => {
  let checkpoint = getUserPreloadState(userId)?.checkpoints?.[targetKey] || null;
  let loadedDocuments = 0;

  while (true) {
    const pageQuery = checkpoint
      ? query(collectionRef, orderBy(documentId()), startAfter(checkpoint), limit(PRELOAD_PAGE_SIZE))
      : query(collectionRef, orderBy(documentId()), limit(PRELOAD_PAGE_SIZE));
    const snapshot = await getDocsFromServer(pageQuery);
    recordFirestoreRead(`preload:${targetKey}`, { userId, size: snapshot.size });

    if (snapshot.empty) {
      updateCheckpoint(userId, targetKey, null);
      return loadedDocuments;
    }

    loadedDocuments += snapshot.size;
    const lastDocumentId = snapshot.docs[snapshot.docs.length - 1].id;

    if (snapshot.size < PRELOAD_PAGE_SIZE) {
      updateCheckpoint(userId, targetKey, null);
      return loadedDocuments;
    }

    checkpoint = lastDocumentId;
    updateCheckpoint(userId, targetKey, checkpoint);
    await yieldToBrowser();
  }
};

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
      loadedDocuments: 0,
    };
  }

  const startedAt = new Date().toISOString();
  updateUserPreloadState(userId, {
    lastAttemptedAt: startedAt,
    lastError: null,
    failedTargets: [],
    loadedDocuments: 0,
  });

  const targets: PreloadTarget[] = [
    {
      key: 'profile',
      label: 'Perfil do usuario',
      load: async () => {
        const snapshot = await getDocFromServer(doc(db, 'users', userId));
        recordFirestoreRead('preload:profile', { userId });
        return snapshot.exists() ? 1 : 0;
      },
    },
    {
      key: 'settings',
      label: 'Configuracoes',
      load: async () => {
        const snapshot = await getDocFromServer(doc(db, 'users', userId, 'settings', 'config'));
        recordFirestoreRead('preload:settings', { userId });
        return snapshot.exists() ? 1 : 0;
      },
    },
    ...USER_COLLECTIONS_TO_PRELOAD.map((collectionName) => ({
      key: `collection:${collectionName}`,
      label: collectionName,
      load: () => preloadCollectionPages(
        userId,
        `collection:${collectionName}`,
        collection(db, 'users', userId, collectionName)
      ),
    })),
    ...(includeAdminUsers
      ? [{
        key: 'admin-users',
        label: 'Usuarios administrativos',
        load: () => preloadCollectionPages(userId, 'admin-users', collection(db, 'users')),
      }]
      : []),
  ];

  const failedTargets: string[] = [];
  let loadedDocuments = 0;

  for (const target of targets) {
    try {
      loadedDocuments += await target.load();
    } catch (error) {
      failedTargets.push(`${target.label}: ${getErrorMessage(error)}`);
    }
  }

  const completedAt = new Date().toISOString();
  if (failedTargets.length === 0) {
    clearCompletedCheckpoints(userId);
  }

  updateUserPreloadState(userId, {
    lastCompletedAt: completedAt,
    lastError: failedTargets[0] || null,
    failedTargets,
    targetCount: targets.length,
    loadedDocuments,
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
    loadedDocuments,
  };
};
