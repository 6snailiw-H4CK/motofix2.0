import {
  assertBackupSizeWithinLimit,
  createPortableBackupPayload,
  encryptPortableBackup,
  hashPortableBackupSourceSnapshot,
  portableBackupFormat,
  summarizePortableBackup,
  type PortableBackupData,
  type PortableBackupPayload,
  type PortableBackupSummary,
} from './portableBackup';
import { validateBackupSourceProject } from './backupEndpoint';

export type RemoteBackupSnapshot = {
  data: Omit<PortableBackupData, 'localRecovery'>;
  workshopId: string;
  exportedAt: string;
  sourceProjectId: string | null;
};

export type ReadPortableBackupSourceOptions = {
  apiBaseUrl: string;
  expectedProjectId: string;
  getAuthHeaders: () => Promise<Record<string, string>>;
  fetchImpl?: typeof fetch;
  pageSize?: number;
  onProgress?: (progress: StableBackupExportProgress) => void;
};

export type LocalBackupRecoverySnapshot = {
  evidence: Record<string, unknown>;
  incompleteReasons: string[];
  unsafeToExport: boolean;
};

export type StableBackupExportProgress = { stage: string; completed?: number; total?: number };

export type CreateStableBackupArchiveOptions = {
  password: string;
  appVersion: string;
  filenamePrefix?: string;
  allowIncompleteLocalRecovery?: boolean;
  readRemoteSnapshot: () => Promise<RemoteBackupSnapshot>;
  readRemoteSignature: () => Promise<string>;
  readLocalRecovery: () => Promise<LocalBackupRecoverySnapshot>;
  onProgress?: (progress: StableBackupExportProgress) => void;
};

export type StableBackupArchive = {
  filename: string;
  encrypted: string;
  payload: PortableBackupPayload;
  summary: PortableBackupSummary;
  complete: boolean;
  incompleteReasons: string[];
};

const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    // JSON responses omit undefined object properties; mirror that behavior so
    // client hashes match server snapshots before and after serialization.
    return `{${Object.keys(record).filter((key) => record[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
};

const assertSha256 = (value: string) => {
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error('O servidor não forneceu uma assinatura válida do estado do Firebase.');
};

const EXPECTED_EXPORT_COLLECTIONS = portableBackupFormat.includedCollections
  .filter((name) => name !== 'settings')
  .sort();

function assertCompleteCollectionList(collectionNames: unknown): asserts collectionNames is string[] {
  if (!Array.isArray(collectionNames)
    || collectionNames.some((name) => typeof name !== 'string')
    || new Set(collectionNames).size !== collectionNames.length
    || JSON.stringify([...collectionNames].sort()) !== JSON.stringify(EXPECTED_EXPORT_COLLECTIONS)) {
    throw new Error('A API de backup não informou exatamente todas as coleções comerciais suportadas. Exportação interrompida para evitar um arquivo incompleto.');
  }
}

const readJsonResponse = async <T,>(response: Response): Promise<T> => {
  const contentType = response.headers.get('Content-Type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new Error(response.ok
      ? 'O servidor respondeu uma página do app em vez da API de backup.'
      : `A API de backup respondeu HTTP ${response.status} sem um erro estruturado.`);
  }
  const payload = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || `A API de backup respondeu HTTP ${response.status}.`);
  return payload as T;
};

/** Reads the paginated source data through the actual authenticated backup API contract. */
export const readPortableBackupSource = async ({
  apiBaseUrl,
  expectedProjectId,
  getAuthHeaders,
  fetchImpl = fetch,
  pageSize = 20,
  onProgress,
}: ReadPortableBackupSourceOptions): Promise<RemoteBackupSnapshot> => {
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(expectedProjectId || '')) {
    throw new Error('O ID do projeto Firebase do aplicativo não está configurado corretamente. Nenhum backup foi solicitado.');
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('O backup geral precisa de conexão para ler todas as coleções confirmadas no Firebase.');
  }
  const request = async (path: string) => fetchImpl(`${apiBaseUrl}${path}`, {
    method: 'GET', cache: 'no-store', headers: await getAuthHeaders(),
  });
  const meta = await readJsonResponse<{
    format: string; version: number; exportedAt: string; sourceProjectId?: string | null;
    owner: { uid: string }; profileSnapshot: Record<string, unknown> | null;
    settings: Record<string, unknown> | null; collections: string[];
    excludedCollections: string[]; notes: string[];
  }>(await request('/api/backup/full?meta=1'));
  if (meta.format !== 'motofix-full-backup' || meta.version !== 2 || !Array.isArray(meta.collections)
    || !meta.owner || typeof meta.owner.uid !== 'string') {
    throw new Error('A resposta do servidor não corresponde ao contrato de backup esperado.');
  }
  assertCompleteCollectionList(meta.collections);
  validateBackupSourceProject(meta.sourceProjectId, expectedProjectId);
  if (!Array.isArray(meta.excludedCollections) || !meta.excludedCollections.includes('fiscal_private')) {
    throw new Error('A API não confirmou a exclusão da coleção de credenciais fiscais. Exportação interrompida.');
  }

  const collections: PortableBackupData['collections'] = {};
  let completedCollections = 0;
  for (const collectionName of meta.collections) {
    const records: Array<Record<string, unknown>> = [];
    let cursor: string | null = null;
    do {
      const params = new URLSearchParams({ collection: collectionName, limit: String(pageSize) });
      if (cursor) params.set('cursor', cursor);
      const page = await readJsonResponse<{ collection: string; documents: Array<Record<string, unknown>>; nextCursor: string | null }>(
        await request(`/api/backup/full?${params.toString()}`),
      );
      if (page.collection !== collectionName || !Array.isArray(page.documents)) {
        throw new Error(`A API retornou uma página inválida da coleção ${collectionName}.`);
      }
      if (page.documents.some((document) => !document || typeof document !== 'object' || Array.isArray(document))) {
        throw new Error(`A API retornou documentos inválidos na coleção ${collectionName}.`);
      }
      if (page.nextCursor !== null && (typeof page.nextCursor !== 'string' || !page.nextCursor)) {
        throw new Error(`A API retornou um cursor inválido na coleção ${collectionName}.`);
      }
      if (page.nextCursor && (page.nextCursor === cursor || records.length === 0 && page.documents.length === 0)) {
        throw new Error(`A paginação da coleção ${collectionName} não avançou. Exportação interrompida para evitar repetição ou omissão de documentos.`);
      }
      records.push(...page.documents);
      cursor = page.nextCursor;
      onProgress?.({ stage: `Lendo ${collectionName}`, completed: records.length });
    } while (cursor);
    collections[collectionName] = records;
    completedCollections += 1;
    onProgress?.({ stage: `Coleções lidas: ${completedCollections}/${meta.collections.length}`, completed: completedCollections, total: meta.collections.length });
  }

  const data: Omit<PortableBackupData, 'localRecovery'> = {
    profileSnapshot: meta.profileSnapshot,
    settings: meta.settings,
    collections,
    excludedCollections: meta.excludedCollections,
    notes: meta.notes,
  };
  return { data, workshopId: meta.owner.uid, exportedAt: meta.exportedAt, sourceProjectId: meta.sourceProjectId || null };
};

/**
 * Builds the same archive used by the PWA export action, with before/after
 * source and local-state checks. Firestore has no read transaction spanning
 * these collections, so this detects observable drift but cannot promise an
 * atomic point-in-time snapshot.
 */
export const createStableBackupArchive = async ({
  password,
  appVersion,
  filenamePrefix = 'motofix-backup',
  allowIncompleteLocalRecovery = false,
  readRemoteSnapshot,
  readRemoteSignature,
  readLocalRecovery,
  onProgress,
}: CreateStableBackupArchiveOptions): Promise<StableBackupArchive> => {
  onProgress?.({ stage: 'Conferindo o estado inicial do Firebase e do aparelho.' });
  const [sourceSignatureBefore, localBefore] = await Promise.all([
    readRemoteSignature(),
    readLocalRecovery(),
  ]);
  assertSha256(sourceSignatureBefore);
  if (localBefore.unsafeToExport) {
    throw new Error('Não foi possível ler com segurança toda a fila e os rascunhos locais. Corrija o armazenamento do navegador antes de gerar o arquivo.');
  }
  if (typeof localBefore.evidence !== 'object' || localBefore.evidence === null) {
    throw new Error('Não foi possível identificar os dados locais pendentes com segurança. Nenhum arquivo foi gerado.');
  }

  onProgress?.({ stage: 'Lendo os dados confirmados do Firebase.' });
  const remote = await readRemoteSnapshot();
  assertCompleteCollectionList(Object.keys(remote.data.collections));
  if (typeof remote.sourceProjectId !== 'string' || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(remote.sourceProjectId)) {
    throw new Error('Não foi possível confirmar o projeto Firebase de origem. Nenhum backup foi gerado.');
  }
  onProgress?.({ stage: 'Conferindo novamente a estabilidade dos dados.' });
  const [sourceSignatureAfter, localAfter] = await Promise.all([
    readRemoteSignature(),
    readLocalRecovery(),
  ]);
  assertSha256(sourceSignatureAfter);
  if (localAfter.unsafeToExport) {
    throw new Error('O armazenamento local deixou de ser legível durante a exportação. Nenhum arquivo foi gerado.');
  }
  if (typeof localAfter.evidence !== 'object' || localAfter.evidence === null) {
    throw new Error('Não foi possível confirmar o estado local após a leitura. Nenhum arquivo foi gerado.');
  }

  const exportedSourceSignature = await hashPortableBackupSourceSnapshot(remote.data);
  if (sourceSignatureBefore !== sourceSignatureAfter || sourceSignatureBefore !== exportedSourceSignature) {
    const sourceChanged = sourceSignatureBefore !== sourceSignatureAfter;
    const pageReadMismatch = sourceSignatureBefore !== exportedSourceSignature;
    throw new Error(`Os dados do Firebase mudaram durante a exportação. Nenhum arquivo foi gerado; tente novamente após concluir as alterações. (assinatura inicial/final divergente: ${sourceChanged ? 'sim' : 'não'}; dados paginados divergentes: ${pageReadMismatch ? 'sim' : 'não'})`);
  }
  if (stableJson(localBefore.evidence) !== stableJson(localAfter.evidence)) {
    throw new Error('A fila ou os rascunhos locais mudaram durante a exportação. Nenhum arquivo foi gerado; tente novamente.');
  }

  const incompleteReasons = Array.from(new Set([
    ...localBefore.incompleteReasons,
    ...localAfter.incompleteReasons,
  ]));
  if (incompleteReasons.length > 0 && !allowIncompleteLocalRecovery) {
    throw new Error(`Backup completo bloqueado: há alterações locais que não estão confirmadas no Firebase (${incompleteReasons.join('; ')}). Nenhuma fila foi sincronizada ou apagada. Resolva as pendências; se não for possível, escolha explicitamente gerar uma cópia parcial de recuperação.`);
  }

  const localRecovery = {
    ...localBefore.evidence,
    coverage: {
      complete: incompleteReasons.length === 0,
      classification: 'recovery-material-only',
      incompleteReasons,
      reminder: 'Fila, rascunhos e dados locais são preservados como material de recuperação. A restauração entre projetos não os reaplica automaticamente.',
    },
  };
  const data: PortableBackupData = {
    ...remote.data,
    localRecovery,
    notes: [
      ...(remote.data.notes || []),
      ...(incompleteReasons.length > 0
        ? [`COBERTURA PARCIAL: ${incompleteReasons.join('; ')}. O arquivo não representa todas as alterações locais confirmadas.`]
        : []),
      'A fila offline e os rascunhos foram incluídos apenas como material de recuperação; não são reexecutados na restauração.',
      'Contas de autenticação, tokens, credenciais, privilégios administrativos, estado de cobrança e dados de projeto são excluídos.',
    ],
  };
  onProgress?.({ stage: 'Validando e criptografando o arquivo portátil.' });
  const payload = await createPortableBackupPayload(
    data,
    remote.workshopId,
    appVersion,
    remote.exportedAt,
    remote.sourceProjectId,
  );
  const encrypted = await encryptPortableBackup(payload, password);
  assertBackupSizeWithinLimit(new TextEncoder().encode(encrypted).byteLength);
  const date = new Date().toISOString().slice(0, 10);
  const effectiveComplete = incompleteReasons.length === 0;
  return {
    filename: `${filenamePrefix}${effectiveComplete ? '' : '-parcial'}-${date}.motofix`,
    encrypted,
    payload,
    summary: summarizePortableBackup(payload),
    complete: effectiveComplete,
    incompleteReasons,
  };
};
