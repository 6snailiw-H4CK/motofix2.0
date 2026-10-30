import {
  collection,
  doc,
  getDocFromCache,
  getDocsFromCache,
  limit,
  orderBy,
  query,
} from 'firebase/firestore';
import { db } from '../firebase';
import { allUserCollectionKeys } from '../hooks/userCollectionScopes';
import { getLastFirestoreSyncAt } from './firestoreNetworkControl';
import { exportFirestoreOfflineQueueSnapshot } from './firestoreOfflineQueue';
import { getLocalDraftSummaries, listLocalDrafts } from './localDrafts';
import { OFFLINE_DATA_PRELOAD_STORAGE_KEY } from './offlineDataPreload';
import { getLocalCashLaunches, getLocalProducts } from './localCashLaunchRepository';

export const LOCAL_BACKUP_STATUS_EVENT = 'motofix:pwa-local-backup-status';
export const LOCAL_BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

const DIRECTORY_DB_NAME = 'motofix-local-backup';
const DIRECTORY_STORE_NAME = 'directories';
const LAST_BACKUP_STORAGE_PREFIX = 'motofix:pwa-local-backup:last:';

type WritableFileHandle = {
  createWritable: () => Promise<{
    write: (data: string | Blob) => Promise<void>;
    close: () => Promise<void>;
    abort?: () => Promise<void>;
  }>;
};

type BackupDirectoryHandle = {
  name: string;
  getFileHandle: (name: string, options?: { create?: boolean }) => Promise<WritableFileHandle>;
  queryPermission?: (options: { mode: 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (options: { mode: 'readwrite' }) => Promise<PermissionState>;
};

type FileSystemWindow = Window & {
  showDirectoryPicker?: (options?: { id?: string; mode?: 'readwrite'; startIn?: string }) => Promise<BackupDirectoryHandle>;
};

export type PwaLocalBackupStatus = {
  supported: boolean;
  configured: boolean;
  directoryName: string | null;
  lastBackupAt: string | null;
  lastFilename: string | null;
  lastResult: 'success' | 'partial' | 'error' | null;
  lastMessage: string | null;
};

type BackupCollectionMap = Record<string, Array<Record<string, unknown>>>;

const canUseWindow = () => typeof window !== 'undefined';

const emitBackupStatus = (userId: string) => {
  if (!canUseWindow()) return;
  window.dispatchEvent(new CustomEvent(LOCAL_BACKUP_STATUS_EVENT, {
    detail: { userId, status: getPwaLocalBackupStatus(userId) },
  }));
};

const readLastBackupStatus = (userId: string) => {
  if (!canUseWindow()) return {};
  try {
    const raw = window.localStorage.getItem(`${LAST_BACKUP_STORAGE_PREFIX}${userId}`);
    return raw ? JSON.parse(raw) as Partial<PwaLocalBackupStatus> : {};
  } catch {
    return {};
  }
};

const writeLastBackupStatus = (userId: string, patch: Partial<PwaLocalBackupStatus>) => {
  try {
    const current = readLastBackupStatus(userId);
    window.localStorage.setItem(`${LAST_BACKUP_STORAGE_PREFIX}${userId}`, JSON.stringify({ ...current, ...patch }));
  } catch {
    // The archive itself is more important than its convenience status marker.
  }
  emitBackupStatus(userId);
};

const openDirectoryDatabase = () => new Promise<IDBDatabase>((resolve, reject) => {
  if (!canUseWindow() || !window.indexedDB) {
    reject(new Error('O navegador não oferece armazenamento local para a pasta de backup.'));
    return;
  }
  const request = window.indexedDB.open(DIRECTORY_DB_NAME, 1);
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(DIRECTORY_STORE_NAME)) {
      request.result.createObjectStore(DIRECTORY_STORE_NAME);
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error('Não foi possível abrir as configurações locais do backup.'));
  request.onblocked = () => reject(new Error('O armazenamento do backup está bloqueado por outra aba.'));
});

const storeDirectoryHandle = async (userId: string, handle: BackupDirectoryHandle) => {
  const database = await openDirectoryDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(DIRECTORY_STORE_NAME, 'readwrite');
    transaction.objectStore(DIRECTORY_STORE_NAME).put(handle, userId);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Não foi possível salvar a pasta escolhida.'));
    transaction.onabort = () => reject(transaction.error || new Error('A configuração da pasta foi cancelada.'));
  });
  database.close();
};

const loadDirectoryHandle = async (userId: string) => {
  const database = await openDirectoryDatabase();
  const handle = await new Promise<BackupDirectoryHandle | null>((resolve, reject) => {
    const transaction = database.transaction(DIRECTORY_STORE_NAME, 'readonly');
    const request = transaction.objectStore(DIRECTORY_STORE_NAME).get(userId);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error('Não foi possível recuperar a pasta escolhida.'));
  });
  database.close();
  return handle;
};

const getPermission = async (handle: BackupDirectoryHandle, request = false) => {
  if (request && handle.requestPermission) return handle.requestPermission({ mode: 'readwrite' });
  if (handle.queryPermission) return handle.queryPermission({ mode: 'readwrite' });
  return 'prompt' as PermissionState;
};

export const getPwaLocalBackupStatus = (userId: string): PwaLocalBackupStatus => {
  const stored = readLastBackupStatus(userId);
  return {
    supported: canUseWindow() && typeof (window as FileSystemWindow).showDirectoryPicker === 'function',
    configured: Boolean(stored.configured),
    directoryName: typeof stored.directoryName === 'string' ? stored.directoryName : null,
    lastBackupAt: typeof stored.lastBackupAt === 'string' ? stored.lastBackupAt : null,
    lastFilename: typeof stored.lastFilename === 'string' ? stored.lastFilename : null,
    lastResult: stored.lastResult === 'success' || stored.lastResult === 'partial' || stored.lastResult === 'error'
      ? stored.lastResult
      : null,
    lastMessage: typeof stored.lastMessage === 'string' ? stored.lastMessage : null,
  };
};

export const subscribePwaLocalBackupStatus = (
  userId: string,
  listener: (status: PwaLocalBackupStatus) => void,
) => {
  if (!canUseWindow()) return () => undefined;
  const handle = (event: Event) => {
    const detail = (event as CustomEvent<{ userId?: string; status?: PwaLocalBackupStatus }>).detail;
    if (detail?.userId === userId && detail.status) listener(detail.status);
  };
  window.addEventListener(LOCAL_BACKUP_STATUS_EVENT, handle);
  listener(getPwaLocalBackupStatus(userId));
  return () => window.removeEventListener(LOCAL_BACKUP_STATUS_EVENT, handle);
};

export const choosePwaLocalBackupDirectory = async (userId: string) => {
  if (!userId) throw new Error('Entre na conta antes de configurar o backup local.');
  const picker = (window as FileSystemWindow).showDirectoryPicker;
  if (!picker) {
    throw new Error('Este navegador não permite gravar automaticamente em uma pasta. Use Chrome ou Edge atualizado.');
  }

  const handle = await picker({ id: 'motofix-local-backups', mode: 'readwrite', startIn: 'documents' });
  const permission = await getPermission(handle, true);
  if (permission !== 'granted') {
    throw new Error('O acesso de gravação à pasta não foi autorizado.');
  }
  await storeDirectoryHandle(userId, handle);
  writeLastBackupStatus(userId, {
    configured: true,
    directoryName: handle.name,
    lastMessage: 'Pasta configurada. O primeiro arquivo será salvo após a próxima sincronização completa.',
  });
  return getPwaLocalBackupStatus(userId);
};

const parsePreloadState = (userId: string) => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(OFFLINE_DATA_PRELOAD_STORAGE_KEY) || '{}') as {
      users?: Record<string, { lastCompletedAt?: string | null; failedTargets?: string[]; checkpoints?: Record<string, string | null> }>;
    };
    return parsed.users?.[userId] || null;
  } catch {
    return null;
  }
};

const readCachedCollections = async (userId: string) => {
  const collections: BackupCollectionMap = {};
  const missingCollections: string[] = [];

  for (const collectionName of allUserCollectionKeys) {
    try {
      if (collectionName === 'settings') {
        const snapshot = await getDocFromCache(doc(db, 'users', userId, 'settings', 'config'));
        collections.settings = snapshot.exists()
          ? [{ ...snapshot.data(), id: snapshot.id } as Record<string, unknown>]
          : [];
        continue;
      }

      const collectionRef = collection(db, 'users', userId, collectionName);
      const snapshot = collectionName === 'operational_logs'
        ? await getDocsFromCache(query(collectionRef, orderBy('timestamp', 'desc'), limit(50)))
        : await getDocsFromCache(collectionRef);
      collections[collectionName] = snapshot.docs.map((item) => ({ ...item.data(), id: item.id }));
    } catch {
      collections[collectionName] = [];
      missingCollections.push(collectionName);
    }
  }

  try {
    const stockSnapshot = await getDocsFromCache(collection(db, 'users', userId, 'stock_movements'));
    collections.stock_movements = stockSnapshot.docs.map((item) => ({ ...item.data(), id: item.id }));
  } catch {
    collections.stock_movements = [];
    missingCollections.push('stock_movements');
  }

  return { collections, missingCollections };
};

const readProfileSnapshot = async (userId: string) => {
  try {
    const snapshot = await getDocFromCache(doc(db, 'users', userId));
    return snapshot.exists() ? snapshot.data() : null;
  } catch {
    return null;
  }
};

const getDailyFilename = (date: Date) => {
  const day = date.toISOString().slice(0, 10);
  return `motofix-pwa-${day}.json`;
};

const createBackupPayload = async (userId: string) => {
  const [cached, profileSnapshot, offlineQueue] = await Promise.all([
    readCachedCollections(userId),
    readProfileSnapshot(userId),
    exportFirestoreOfflineQueueSnapshot(userId),
  ]);
  const allDrafts = listLocalDrafts().filter((draft) => draft.key.startsWith(`${userId}:`));
  const preload = parsePreloadState(userId);
  const unresolvedMovementPreload = !preload?.lastCompletedAt
    || (preload.failedTargets?.length || 0) > 0
    || Object.values(preload.checkpoints || {}).some(Boolean);
  const queuePending = offlineQueue.writes.some((write) => write.status === 'pending');
  const queueFailed = offlineQueue.writes.some((write) => write.status === 'failed');
  const lastFullFirebaseSyncAt = getLastFirestoreSyncAt(userId);
  const collections = cached.collections;
  const notes = [
    'Cópia local criada a partir do cache Firestore deste navegador; não foi feita leitura adicional no servidor para gerar o arquivo.',
    'A coleção operational_logs segue o limite de 50 registros usado pelo aplicativo; o histórico anterior não é incluído nesta cópia PWA.',
    'O arquivo inclui a fila offline e os rascunhos locais identificados para esta conta.',
    'Arquivos binários externos, como anexos armazenados no Firebase Storage, não são copiados por esta rotina PWA.',
  ];
  if (cached.missingCollections.length > 0) notes.push(`Coleções ausentes no cache: ${cached.missingCollections.join(', ')}.`);
  if (!lastFullFirebaseSyncAt) notes.push('Este navegador ainda não registrou uma sincronização completa confirmada com o Firebase.');
  if (unresolvedMovementPreload) notes.push('O cache de movimentações de estoque pode estar incompleto; a preparação offline ainda não concluiu todas as páginas.');
  if (queuePending || queueFailed) notes.push('Existem gravações locais pendentes ou recusadas; elas estão incluídas na fila deste arquivo e ainda não são dados confirmados no Firebase.');

  const body = {
    format: 'motofix-pwa-local-snapshot',
    version: 1,
    exportedAt: new Date().toISOString(),
    lastFullFirebaseSyncAt,
    owner: { uid: userId },
    profileSnapshot,
    collections,
    counts: Object.fromEntries(Object.entries(collections).map(([name, records]) => [name, records.length])),
    localState: {
      queue: offlineQueue,
      drafts: allDrafts,
      localCashLaunches: getLocalCashLaunches().filter((item) => item.userId === userId),
      localProducts: getLocalProducts().filter((item) => item.userId === userId),
    },
    completeness: {
      completeCacheCollections: cached.missingCollections.length === 0,
      operationalLogHistoryComplete: false,
      hasConfirmedFullFirebaseSync: Boolean(lastFullFirebaseSyncAt),
      stockMovementPreloadComplete: !unresolvedMovementPreload,
      pendingWrites: offlineQueue.writes.filter((write) => write.status === 'pending').length,
      failedWrites: offlineQueue.writes.filter((write) => write.status === 'failed').length,
      localDrafts: allDrafts.length,
    },
    notes,
  };
  const json = JSON.stringify(body, null, 2);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(json));
  const checksum = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return {
    payload: { ...body, integrity: { algorithm: 'SHA-256', checksum } },
    partial: true,
  };
};

const writeBackupFile = async (handle: BackupDirectoryHandle, filename: string, contents: string) => {
  const file = await handle.getFileHandle(filename, { create: true });
  const writable = await file.createWritable();
  try {
    await writable.write(new Blob([contents], { type: 'application/json;charset=utf-8' }));
    await writable.close();
  } catch (error) {
    if (writable.abort) await writable.abort().catch(() => undefined);
    throw error;
  }
};

export const createPwaLocalBackup = async (userId: string, options: { automatic?: boolean } = {}) => {
  if (!userId) throw new Error('Entre na conta antes de criar o backup local.');
  const directory = await loadDirectoryHandle(userId);
  if (!directory) throw new Error('Escolha uma pasta local para os backups nas Configurações.');

  const currentStatus = getPwaLocalBackupStatus(userId);
  if (options.automatic && currentStatus.lastBackupAt
    && Date.now() - Date.parse(currentStatus.lastBackupAt) < LOCAL_BACKUP_INTERVAL_MS) {
    return { skipped: true, status: currentStatus };
  }

  const permission = await getPermission(directory);
  if (permission !== 'granted') {
    writeLastBackupStatus(userId, {
      configured: true,
      directoryName: directory.name,
      lastResult: 'error',
      lastMessage: 'O navegador precisa que você autorize novamente o acesso à pasta selecionada.',
    });
    throw new Error('O navegador precisa que você autorize novamente o acesso à pasta selecionada.');
  }

  const { payload, partial } = await createBackupPayload(userId);
  const filename = getDailyFilename(new Date());
  await writeBackupFile(directory, filename, JSON.stringify(payload, null, 2));
  writeLastBackupStatus(userId, {
    configured: true,
    directoryName: directory.name,
    lastBackupAt: new Date().toISOString(),
    lastFilename: filename,
    lastResult: partial ? 'partial' : 'success',
    lastMessage: partial
      ? 'Arquivo salvo, mas a cópia está parcial. Confira as pendências de cobertura indicadas dentro do JSON.'
      : 'Arquivo salvo na pasta local. A coleção de logs contém os últimos 50 registros do cache do app.',
  });
  return { skipped: false, filename, partial, status: getPwaLocalBackupStatus(userId) };
};

export const createAutomaticPwaLocalBackup = async (userId: string) => {
  try {
    return await createPwaLocalBackup(userId, { automatic: true });
  } catch (error) {
    writeLastBackupStatus(userId, {
      configured: getPwaLocalBackupStatus(userId).configured,
      lastResult: 'error',
      lastMessage: error instanceof Error ? error.message : 'Não foi possível gravar o backup automático.',
    });
    return null;
  }
};
