import { auth } from '../firebase';
import { exportFirestoreOfflineQueueSnapshot, firestoreOfflineQueueReady, getFirestoreOfflineQueueState, getPendingWriteOwners } from './firestoreOfflineQueue';
import { inspectLocalDraftStorage } from './localDrafts';
import { inspectLocalOperationalStorage } from './localCashLaunchRepository';
import {
  decryptPortableBackup,
  summarizePortableBackup,
  type PortableBackupPayload,
  type PortableBackupSummary,
} from './portableBackup';
import { createStableBackupArchive, readPortableBackupSource } from './portableBackupExport';

type ApiResponse<T> = T & { error?: string };

export type BackupProgress = { stage: string; completed?: number; total?: number };

export type FullBackupPreflight = {
  target: 'empty' | 'existing';
  currentCounts: Record<string, number>;
  conflictCounts: Record<string, number>;
  totalExisting: number;
  mode: 'safe-merge';
  deletesNothing: true;
  warning: string;
};

export type FullBackupRestoreResponse = {
  restoredAt: string;
  restoredByCollection: Record<string, number>;
  restoredTotal: number;
  skippedDocuments: number;
  mode: 'safe-merge';
  verified: boolean;
  verificationConflicts: Record<string, number>;
  target: 'empty' | 'existing';
  preRestoreBackupFilename: string | null;
  notes: string[];
};

export type FullBackupDownloadResult = {
  filename: string;
  summary: PortableBackupSummary;
  complete: boolean;
  incompleteReasons: string[];
};

export type LocalBackupInventory = {
  pendingWrites: number;
  failedWrites: number;
  unknownPendingWrites: number;
  localDrafts: number;
  localCashLaunches: number;
  localProducts: number;
  persistenceIssue: boolean;
  storageReadable: boolean;
  incompleteReasons: string[];
};

export type FullBackupInspection = {
  payload: PortableBackupPayload;
  summary: PortableBackupSummary;
};

const backupBaseUrl = (
  import.meta.env.VITE_BACKUP_API_URL
  || import.meta.env.VITE_DATA_RESET_API_URL
  || import.meta.env.VITE_FISCAL_API_URL
  || import.meta.env.VITE_WHATSAPP_API_URL
  || ''
);

const buildUrl = (path: string) => `${backupBaseUrl}${path}`;
const MAX_RESTORE_REQUEST_BYTES = 4 * 1024 * 1024;
const appVersion = import.meta.env.VITE_APP_VERSION || '2.1.0';

const getAuthHeaders = async (contentType = true) => {
  const user = auth.currentUser;
  if (!user) throw new Error('Entre na conta da oficina antes de acessar o backup.');
  return {
    Authorization: `Bearer ${await user.getIdToken()}`,
    ...(contentType ? { 'Content-Type': 'application/json' } : {}),
  };
};

const readJsonResponse = async <T>(response: Response): Promise<T> => {
  const contentType = response.headers.get('Content-Type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new Error(response.ok
      ? 'O servidor respondeu uma página do app em vez da API de backup. A função de backup ainda precisa ser publicada.'
      : `A API de backup respondeu HTTP ${response.status} sem um erro estruturado.`);
  }
  const payload = await response.json().catch(() => ({})) as ApiResponse<T>;
  if (!response.ok) throw new Error(payload.error || `A API de backup respondeu HTTP ${response.status}.`);
  return payload as T;
};

const getFilename = (response: Response, fallback: string) => {
  const disposition = response.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="?([^";]+)"?/i);
  return match?.[1] || fallback;
};

const downloadText = (contents: string, filename: string) => {
  const objectUrl = URL.createObjectURL(new Blob([contents], { type: 'application/vnd.motofix.backup+json' }));
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
};

const authenticatedGet = async (path: string) => fetch(buildUrl(path), {
  method: 'GET',
  cache: 'no-store',
  headers: await getAuthHeaders(false),
});

const readLocalRecovery = async (userId: string) => {
  await firestoreOfflineQueueReady;
  const queue = await exportFirestoreOfflineQueueSnapshot(userId);
  const queueState = getFirestoreOfflineQueueState();
  const pendingOwners = getPendingWriteOwners();
  const draftAudit = inspectLocalDraftStorage();
  const operationalAudit = inspectLocalOperationalStorage();
  const drafts = draftAudit.records.filter((draft) => draft.key.startsWith(`${userId}:`));
  const otherOwnerDrafts = draftAudit.records.filter((draft) => !draft.key.startsWith(`${userId}:`)).length;
  const localCashLaunches = operationalAudit.cashLaunches.filter((item) => item.userId === userId);
  const localProducts = operationalAudit.products.filter((item) => item.userId === userId);
  const unownedLocalRecords = [...operationalAudit.cashLaunches, ...operationalAudit.products]
    .filter((item) => !item.userId).length;
  const otherOwnerLocalRecords = [...operationalAudit.cashLaunches, ...operationalAudit.products]
    .filter((item) => Boolean(item.userId) && item.userId !== userId).length;
  const pendingWrites = queue.writes.filter((write) => write.status === 'pending').length;
  const failedWrites = queue.writes.filter((write) => write.status === 'failed').length;
  const incompleteReasons: string[] = [];
  if (pendingWrites > 0) incompleteReasons.push(`${pendingWrites} gravação(ões) pendente(s) na fila offline`);
  if (failedWrites > 0) incompleteReasons.push(`${failedWrites} gravação(ões) recusada(s) na fila offline`);
  if (pendingOwners.unknownCount > 0) incompleteReasons.push(`${pendingOwners.unknownCount} gravação(ões) pendente(s) sem oficina identificada`);
  if (unownedLocalRecords > 0) incompleteReasons.push(`${unownedLocalRecords} registro(s) local(is) sem oficina identificada`);
  if (otherOwnerLocalRecords > 0) incompleteReasons.push(`${otherOwnerLocalRecords} registro(s) local(is) pertencem a outra oficina neste navegador`);
  if (drafts.length > 0) incompleteReasons.push(`${drafts.length} rascunho(s) local(is) não sincronizado(s)`);
  if (otherOwnerDrafts > 0) incompleteReasons.push(`${otherOwnerDrafts} rascunho(s) local(is) pertencem a outra oficina neste navegador`);
  if (localCashLaunches.length > 0) incompleteReasons.push(`${localCashLaunches.length} lançamento(s) local(is) de caixa aguardando revisão`);
  if (localProducts.length > 0) incompleteReasons.push(`${localProducts.length} produto(s) local(is) aguardando revisão`);
  const persistenceIssue = Boolean(queueState.lastPersistenceError);
  if (persistenceIssue) incompleteReasons.push('falha ativa ao persistir a fila no armazenamento do navegador');
  if (!draftAudit.readable) incompleteReasons.push('um ou mais rascunhos não puderam ser lidos');
  if (!operationalAudit.readable) incompleteReasons.push('dados locais de O.S./estoque estão ilegíveis ou malformados');
  const localStorageAvailable = typeof window !== 'undefined' && (() => { try { return Boolean(window.localStorage); } catch { return false; } })();
  if (!localStorageAvailable) incompleteReasons.push('localStorage indisponível para conferir rascunhos e registros locais');
  const storageReadable = draftAudit.readable && operationalAudit.readable && localStorageAvailable && !persistenceIssue;
  const evidence = {
    sourceStorage: {
      offlineQueue: 'snapshot serializado após hidratação do IndexedDB e espelho localStorage',
      queuePersistenceHealthy: !persistenceIssue,
      draftsReadable: draftAudit.readable,
      malformedDraftCount: draftAudit.malformedCount,
      otherOwnerDraftCount: otherOwnerDrafts,
      malformedOperationalRecordCount: operationalAudit.malformedCount,
      unownedLocalRecordCount: unownedLocalRecords,
      otherOwnerLocalRecordCount: otherOwnerLocalRecords,
      localStorageAvailable,
      indexedDbAvailable: typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined',
    },
    queue: queue.writes,
    drafts,
    localCashLaunches,
    localProducts,
    note: 'Fila, rascunhos e itens locais são preservados apenas como material de recuperação; a restauração entre projetos não os reaplica automaticamente.',
  };
  return { evidence, incompleteReasons, unsafeToExport: !storageReadable };
};

const readRemoteSignature = async () => {
  const response = await authenticatedGet('/api/backup/full?signature=1');
  const result = await readJsonResponse<{ dataSha256: string }>(response);
  return result.dataSha256;
};

const buildEncryptedArchive = async (
  password: string,
  onProgress?: (progress: BackupProgress) => void,
  filenamePrefix = 'motofix-backup',
  allowIncompleteLocalRecovery = false,
) => {
  const userId = auth.currentUser?.uid;
  if (!userId) throw new Error('Entre na conta da oficina antes de criar o backup.');
  return createStableBackupArchive({
    password,
    appVersion,
    filenamePrefix,
    allowIncompleteLocalRecovery,
    readRemoteSignature,
    readRemoteSnapshot: () => readPortableBackupSource({
      apiBaseUrl: backupBaseUrl,
      getAuthHeaders: () => getAuthHeaders(false),
      onProgress,
    }),
    readLocalRecovery: () => readLocalRecovery(userId),
    onProgress,
  });
};

const parseBackupFile = async (file: File, password: string) => {
  if (!file.name.toLowerCase().endsWith('.motofix')) {
    throw new Error('Selecione um arquivo .motofix criptografado. Arquivos JSON antigos não são aceitos nesta restauração segura.');
  }
  if (!file.size || file.size > 300 * 1024 * 1024) {
    throw new Error('O arquivo está vazio ou excede o limite de 300 MB desta versão.');
  }
  return decryptPortableBackup(await file.text(), password);
};

const getIdsByCollection = (payload: PortableBackupPayload) => Object.fromEntries([
  ...Object.entries(payload.data.collections).map(([name, records]) => [name, records.map((record) => record.id)]),
  ['settings', payload.data.settings ? [String(payload.data.settings.id || 'config')] : []],
]);

const callPreflight = async (payload: PortableBackupPayload): Promise<FullBackupPreflight> => {
  const response = await fetch(buildUrl('/api/backup/full/preflight'), {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify({ sourceWorkshopId: payload.manifest.workshop.id, ids: getIdsByCollection(payload) }),
  });
  return readJsonResponse<FullBackupPreflight>(response);
};

const restoreChunks = async (
  payload: PortableBackupPayload,
  onProgress?: (progress: BackupProgress) => void,
) => {
  const collections = Object.entries(payload.data.collections);
  if (payload.data.settings) collections.push(['settings', [payload.data.settings]]);
  const total = collections.reduce((sum, [, records]) => sum + records.length, 0);
  const restoredByCollection: Record<string, number> = {};
  let restoredTotal = 0;

  for (const [collectionName, records] of collections) {
    let chunk: Array<Record<string, unknown>> = [];
    let chunkBytes = 2;
    const commitChunk = async () => {
      if (!chunk.length) return;
      const response = await fetch(buildUrl('/api/backup/full/restore-chunk'), {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          confirmation: 'RESTAURAR',
          sourceWorkshopId: payload.manifest.workshop.id,
          collection: collectionName,
          documents: chunk,
        }),
      });
      const result = await readJsonResponse<{ restored: number; collection: string }>(response);
      if (result.collection !== collectionName || result.restored !== chunk.length) {
        throw new Error(`A confirmação do lote ${collectionName} não confere; a restauração pode estar parcial.`);
      }
      restoredByCollection[collectionName] = (restoredByCollection[collectionName] || 0) + result.restored;
      restoredTotal += result.restored;
      onProgress?.({ stage: `Restaurando ${collectionName}`, completed: restoredTotal, total });
      chunk = [];
      chunkBytes = 2;
    };

    for (const record of records) {
      const recordBytes = new TextEncoder().encode(JSON.stringify(record)).byteLength + 1;
      if (chunk.length && (chunkBytes + recordBytes > MAX_RESTORE_REQUEST_BYTES || chunk.length >= 150)) {
        await commitChunk();
      }
      chunk.push(record);
      chunkBytes += recordBytes;
    }
    await commitChunk();
  }
  return { restoredByCollection, restoredTotal };
};

export const systemBackupApi = {
  async inspectLocalBackupState(userId: string): Promise<LocalBackupInventory> {
    const snapshot = await readLocalRecovery(userId);
    const evidence = snapshot.evidence;
    const queue = Array.isArray(evidence.queue) ? evidence.queue as Array<{ status?: string }> : [];
    const drafts = Array.isArray(evidence.drafts) ? evidence.drafts : [];
    const localCashLaunches = Array.isArray(evidence.localCashLaunches) ? evidence.localCashLaunches : [];
    const localProducts = Array.isArray(evidence.localProducts) ? evidence.localProducts : [];
    const storage = evidence.sourceStorage as Record<string, unknown>;
    return {
      pendingWrites: queue.filter((write) => write.status === 'pending').length,
      failedWrites: queue.filter((write) => write.status === 'failed').length,
      unknownPendingWrites: getPendingWriteOwners().unknownCount,
      localDrafts: drafts.length,
      localCashLaunches: localCashLaunches.length,
      localProducts: localProducts.length,
      persistenceIssue: storage.queuePersistenceHealthy !== true,
      storageReadable: !snapshot.unsafeToExport,
      incompleteReasons: snapshot.incompleteReasons,
    };
  },

  async downloadFullBackup(
    password: string,
    onProgress?: (progress: BackupProgress) => void,
    allowIncompleteLocalRecovery = false,
  ): Promise<FullBackupDownloadResult> {
    const result = await buildEncryptedArchive(password, onProgress, 'motofix-backup', allowIncompleteLocalRecovery);
    downloadText(result.encrypted, result.filename);
    return { filename: result.filename, summary: result.summary, complete: result.complete, incompleteReasons: result.incompleteReasons };
  },

  async inspectFullBackup(file: File, password: string): Promise<FullBackupInspection> {
    const payload = await parseBackupFile(file, password);
    return { payload, summary: summarizePortableBackup(payload) };
  },

  async preflightFullBackup(payload: PortableBackupPayload) {
    const userId = auth.currentUser?.uid;
    if (!userId) throw new Error('Entre na conta da oficina antes de validar a restauração.');
    if (payload.manifest.workshop.id !== userId) {
      throw new Error('Este arquivo pertence a outra oficina/conta. Para evitar misturar dados, a restauração entre contas fica bloqueada nesta versão.');
    }
    return callPreflight(payload);
  },

  async prepareRestoreSafetyBackup(
    file: File,
    password: string,
    onProgress?: (progress: BackupProgress) => void,
  ) {
    const payload = await parseBackupFile(file, password);
    const userId = auth.currentUser?.uid;
    if (!userId || payload.manifest.workshop.id !== userId) {
      throw new Error('A cópia de segurança só pode ser preparada para a mesma oficina/conta do arquivo.');
    }
    const preflight = await callPreflight(payload);
    if (preflight.target !== 'existing') {
      throw new Error('O destino está vazio; não é necessário criar uma cópia anterior. Valide novamente antes de restaurar.');
    }
    const current = await buildEncryptedArchive(password, onProgress, 'motofix-seguranca-pre-restauracao');
    downloadText(current.encrypted, current.filename);
    return { filename: current.filename, summary: current.summary, complete: current.complete, incompleteReasons: current.incompleteReasons };
  },

  async restoreFullBackup(
    file: File,
    password: string,
    confirmation: string,
    safetyBackupFilename: string | null,
    onProgress?: (progress: BackupProgress) => void,
  ): Promise<FullBackupRestoreResponse> {
    if (confirmation !== 'RESTAURAR') throw new Error('Digite RESTAURAR para confirmar a operação.');
    const payload = await parseBackupFile(file, password);
    const currentUserId = auth.currentUser?.uid;
    if (!currentUserId) throw new Error('Entre na conta da oficina antes de restaurar o backup.');
    if (payload.manifest.workshop.id !== currentUserId) {
      throw new Error('Este arquivo pertence a outra oficina/conta. A restauração entre contas precisa de um procedimento explícito de migração e fica bloqueada nesta versão.');
    }
    const preflight = await callPreflight(payload);
    if (preflight.target === 'existing') {
      if (!safetyBackupFilename?.startsWith('motofix-seguranca-pre-restauracao-')
        || !safetyBackupFilename.endsWith('.motofix')) {
        throw new Error('Baixe e confirme a cópia criptografada da base atual antes de iniciar a restauração.');
      }
    } else if (safetyBackupFilename) {
      throw new Error('O estado do destino mudou desde a validação. Valide o arquivo novamente.');
    }

    const restored = await restoreChunks(payload, onProgress);
    onProgress?.({ stage: 'Verificando os registros recuperados no Firebase.' });
    const after = await callPreflight(payload);
    const expectedIds = getIdsByCollection(payload) as Record<string, string[]>;
    const verificationConflicts: Record<string, number> = {};
    let verified = true;
    for (const [name, ids] of Object.entries(expectedIds)) {
      const found = after.conflictCounts[name] || 0;
      verificationConflicts[name] = found;
      if (found !== ids.length) verified = false;
    }

    return {
      restoredAt: new Date().toISOString(),
      restoredByCollection: restored.restoredByCollection,
      restoredTotal: restored.restoredTotal,
      skippedDocuments: 0,
      mode: 'safe-merge',
      verified,
      verificationConflicts,
      target: preflight.target,
      preRestoreBackupFilename: safetyBackupFilename,
      notes: [
        'Restauração em modo mesclagem: documentos com o mesmo ID foram gravados; documentos extras no destino não foram apagados.',
        ...(safetyBackupFilename ? [`Cópia criptografada anterior baixada como ${safetyBackupFilename}.`] : []),
        ...(!verified ? ['A verificação final encontrou documentos ausentes ou não confirmados; não considere a restauração concluída.'] : []),
      ],
    };
  },
};
