import backupFieldPolicy from './portableBackupFieldPolicy.json';

const BACKUP_FORMAT = 'motofix-portable-backup';
const BACKUP_VERSION = 1;
const ENCRYPTED_FORMAT = 'motofix-encrypted-backup';
const ENCRYPTED_VERSION = 1;
const PBKDF2_ITERATIONS = 600_000;
const MIN_PASSWORD_LENGTH = 12;
const MAX_BACKUP_CHARS = 300_000_000;
const SUPPORTED_COLLECTION_NAMES = [
  'clients', 'maintenances', 'warranties', 'appointments', 'expenses', 'products',
  'stock_movements', 'cash_launches', 'settings', 'message_logs', 'operational_logs',
  'fiscal_companies', 'fiscal_invoices', 'fiscal_logs', 'fiscal_invoice_files',
  'whatsapp_sessions', 'whatsapp_messages', 'whatsapp_contacts', 'whatsapp_automations',
] as const;
const SUPPORTED_COLLECTIONS = new Set<string>(SUPPORTED_COLLECTION_NAMES);
const RESTORATION_EXCLUSIONS = [
  { id: 'firebase-auth-accounts', reason: 'Contas Firebase Authentication, senhas e fatores de autenticação não são exportados.' },
  { id: 'auth-tokens-and-credentials', reason: 'Campos de credenciais com nomes exatos definidos na política do backup são removidos dos documentos exportados.' },
  { id: 'administrative-privileges', reason: 'Claims, projeções de acesso e campos explícitos de privilégio não são transferidos; campos comerciais como role são preservados.' },
  { id: 'fiscal-private-credentials', reason: 'A coleção fiscal_private é excluída; certificados e credenciais fiscais devem ser configurados novamente.' },
  { id: 'whatsapp-runtime-session-files', reason: 'Arquivos de autenticação/runtime do WhatsApp ficam fora das coleções Firestore e não são copiados.' },
  { id: 'external-storage-objects', reason: 'Arquivos externos ao Firestore (por exemplo, objetos do Cloud Storage) não são copiados por este formato.' },
  { id: 'arbitrary-firestore-subcollections', reason: 'A exportação percorre somente as coleções lógicas explicitamente listadas e settings/config; subcoleções arbitrárias em documentos não são percorridas recursivamente.' },
  { id: 'project-wide-billing-and-admin', reason: 'Billing, configuração do projeto e administração global do Firebase não pertencem ao backup da oficina.' },
  { id: 'offline-replay', reason: 'Pendências locais incluídas em cópia parcial ficam apenas como material de recuperação e não são reaplicadas automaticamente.' },
] as const;

export type BackupCoverageStatus = 'complete' | 'partial' | 'not_assessed';

export type BackupCoverageManifest = {
  status: BackupCoverageStatus;
  includedCollections: string[];
  counts: Record<string, number>;
  excludedComponents: Array<{ id: string; reason: string }>;
  pendingComponents: {
    pendingWrites: number;
    failedWrites: number;
    unknownPendingWrites: number;
    otherOwnerPendingOwners: number;
    otherOwnerFailedWrites: number;
    unknownOwnerFailedWrites: number;
    drafts: number;
    localCashLaunches: number;
    localProducts: number;
  unresolvedConditions: number;
  };
  integrity: { algorithm: 'SHA-256'; status: 'verified' };
  temporalConsistency: {
    method: 'before-after-source-signatures';
    status: 'best-effort-stable';
    globalTransaction: false;
    arbitrarySubcollectionsRecursive: false;
  };
  restoration: {
    authenticationAccounts: false;
    administrativePrivileges: false;
    localRecoveryAutomaticallyApplied: false;
  };
};

export type PortableBackupData = {
  profileSnapshot: Record<string, unknown> | null;
  settings: Record<string, unknown> | null;
  collections: Record<string, Array<Record<string, unknown>>>;
  localRecovery?: Record<string, unknown>;
  excludedCollections?: string[];
  notes?: string[];
};

export type PortableBackupPayload = {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  manifest: {
    format: typeof BACKUP_FORMAT;
    version: typeof BACKUP_VERSION;
    generatedAt: string;
    appVersion: string;
    source: 'firebase';
    sourceProjectId?: string | null;
    workshop: { id: string; name: string | null };
    counts: Record<string, number>;
    coverage?: BackupCoverageManifest;
    dataSha256: string;
    serialization: 'json-with-motofix-firestore-tags-v1';
  };
  data: PortableBackupData;
};

export type PortableBackupSummary = {
  generatedAt: string;
  workshopName: string | null;
  counts: Record<string, number>;
  totalRecords: number;
  notes: string[];
  hasLocalRecovery: boolean;
  coverageStatus?: BackupCoverageStatus;
  excludedComponents?: Array<{ id: string; reason: string }>;
  pendingComponents?: BackupCoverageManifest['pendingComponents'];
};

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = '';
  const stride = 0x8000;
  for (let index = 0; index < bytes.length; index += stride) {
    binary += String.fromCharCode(...bytes.subarray(index, index + stride));
  }
  return btoa(binary);
};

const base64ToBytes = (value: string) => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
};

const toHex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes))
  .map((byte) => byte.toString(16).padStart(2, '0'))
  .join('');

const sha256 = async (bytes: Uint8Array) => toHex(await crypto.subtle.digest('SHA-256', bytes));

const getCrypto = () => {
  if (!globalThis.crypto?.subtle || !globalThis.crypto.getRandomValues) {
    throw new Error('Este navegador não oferece criptografia segura para criar ou validar o backup.');
  }
  return globalThis.crypto;
};

const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).filter((key) => record[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
};

/** Hashes only the source-confirmed Firestore snapshot, excluding browser-local recovery evidence. */
export const hashPortableBackupSourceSnapshot = async (data: Pick<PortableBackupData, 'profileSnapshot' | 'settings' | 'collections'>) => (
  sha256(new TextEncoder().encode(stableJson({
    profileSnapshot: data.profileSnapshot,
    settings: data.settings,
    collections: data.collections,
  })))
);

export const hashPortableBackupData = async (data: PortableBackupData) => (
  sha256(new TextEncoder().encode(stableJson(data)))
);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const isNonNegativeInteger = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;

const normalizePolicySegment = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
const sensitiveBackupFieldNames = new Set(backupFieldPolicy.sensitiveFieldNames.map(normalizePolicySegment));
const sensitiveBackupPaths = Object.fromEntries(Object.entries(backupFieldPolicy.sensitivePathsByCollection)
  .map(([collection, paths]) => [collection, new Set(paths.map((path) => path.split('.').map(normalizePolicySegment).join('.')))])) as Record<string, Set<string>>;

/** Exact names and collection-specific paths only; values are never inspected. */
export const isSensitivePortableBackupField = (collection: string, path: string[]) => {
  const normalizedPath = path.map(normalizePolicySegment).join('.');
  const normalizedKey = normalizePolicySegment(path.at(-1) || '');
  return sensitiveBackupFieldNames.has(normalizedKey)
    || Boolean(sensitiveBackupPaths[collection]?.has(normalizedPath));
};

const stripSensitiveBackupFields = (value: unknown, collection: string, parentPath: string[] = []): unknown => {
  if (Array.isArray(value)) return value.map((item) => stripSensitiveBackupFields(item, collection, parentPath));
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !isSensitivePortableBackupField(collection, [...parentPath, key]))
    .map(([key, item]) => [key, stripSensitiveBackupFields(item, collection, [...parentPath, key])]));
};

const countArray = (value: unknown) => Array.isArray(value) ? value.length : 0;

const makePendingComponentCounts = (localRecovery: Record<string, unknown> | undefined) => {
  const writes = localRecovery?.queue;
  const typedWrites = Array.isArray(writes) ? writes.filter(isRecord) : [];
  const drafts = localRecovery?.drafts;
  const localCashLaunches = localRecovery?.localCashLaunches;
  const localProducts = localRecovery?.localProducts;
  const unknownPending = localRecovery?.sourceStorage;
  const coverage = localRecovery?.coverage;
  const incompleteReasons = isRecord(coverage) ? coverage.incompleteReasons : null;
  return {
    pendingWrites: Array.isArray(writes) ? typedWrites.filter((write) => write.status === 'pending').length : 0,
    failedWrites: Array.isArray(writes) ? typedWrites.filter((write) => write.status === 'failed').length : 0,
    unknownPendingWrites: isRecord(unknownPending) && isNonNegativeInteger(unknownPending.unknownPendingWriteCount)
      ? unknownPending.unknownPendingWriteCount
      : 0,
    otherOwnerPendingOwners: isRecord(unknownPending) && isNonNegativeInteger(unknownPending.otherOwnerPendingOwnerCount)
      ? unknownPending.otherOwnerPendingOwnerCount
      : 0,
    otherOwnerFailedWrites: isRecord(unknownPending) && isNonNegativeInteger(unknownPending.otherOwnerFailedWriteCount)
      ? unknownPending.otherOwnerFailedWriteCount
      : 0,
    unknownOwnerFailedWrites: isRecord(unknownPending) && isNonNegativeInteger(unknownPending.unknownOwnerFailedWriteCount)
      ? unknownPending.unknownOwnerFailedWriteCount
      : 0,
    drafts: countArray(drafts),
    localCashLaunches: countArray(localCashLaunches),
    localProducts: countArray(localProducts),
    unresolvedConditions: countArray(incompleteReasons),
  };
};

const validateNewCoverage = (manifest: Record<string, unknown>, data: Record<string, unknown>, actualCounts: Record<string, number>) => {
  if (manifest.coverage === undefined) return; // Keep reading existing v1 files.
  const coverage = manifest.coverage;
  if (!isRecord(coverage)
    || !['complete', 'partial', 'not_assessed'].includes(String(coverage.status))
    || !Array.isArray(coverage.includedCollections)
    || !isRecord(coverage.counts)
    || !Array.isArray(coverage.excludedComponents)
    || !isRecord(coverage.pendingComponents)
    || !isRecord(coverage.integrity)
    || coverage.integrity.algorithm !== 'SHA-256'
    || coverage.integrity.status !== 'verified'
    || (coverage.temporalConsistency !== undefined && (!isRecord(coverage.temporalConsistency)
      || coverage.temporalConsistency.method !== 'before-after-source-signatures'
      || coverage.temporalConsistency.status !== 'best-effort-stable'
      || coverage.temporalConsistency.globalTransaction !== false
      || coverage.temporalConsistency.arbitrarySubcollectionsRecursive !== false))
    || !isRecord(coverage.restoration)
    || coverage.restoration.authenticationAccounts !== false
    || coverage.restoration.administrativePrivileges !== false
    || coverage.restoration.localRecoveryAutomaticallyApplied !== false) {
    throw new Error('A seção de cobertura do manifesto está inválida.');
  }

  const expectedCollections = [...SUPPORTED_COLLECTION_NAMES].sort();
  const includedCollections = coverage.includedCollections as unknown[];
  if (includedCollections.some((name) => typeof name !== 'string')
    || new Set(includedCollections).size !== includedCollections.length
    || stableJson([...includedCollections].sort()) !== stableJson(expectedCollections)) {
    throw new Error('A lista de coleções incluídas não cobre exatamente o esquema de backup suportado.');
  }

  const counts = coverage.counts as Record<string, unknown>;
  const manifestCounts = manifest.counts as Record<string, unknown>;
  for (const name of SUPPORTED_COLLECTION_NAMES) {
    if (!isNonNegativeInteger(counts[name]) || counts[name] !== actualCounts[name]
      || manifestCounts[name] !== counts[name]) {
      throw new Error(`A cobertura ou contagem da coleção ${name} está ausente ou divergente.`);
    }
  }
  if (Object.keys(counts).length !== SUPPORTED_COLLECTION_NAMES.length
    || Object.keys(manifestCounts).length !== SUPPORTED_COLLECTION_NAMES.length) {
    throw new Error('O manifesto deve registrar todas as coleções, inclusive as vazias, sem itens extras.');
  }

  const pending = coverage.pendingComponents as Record<string, unknown>;
  for (const key of [
    'pendingWrites', 'failedWrites', 'unknownPendingWrites', 'otherOwnerPendingOwners',
    'otherOwnerFailedWrites', 'unknownOwnerFailedWrites', 'drafts', 'localCashLaunches',
    'localProducts', 'unresolvedConditions',
  ]) {
    if (!isNonNegativeInteger(pending[key])) throw new Error(`A contagem de pendências ${key} está inválida.`);
  }
  const hasUnresolvedLocalData = Object.values(pending).some((count) => Number(count) > 0);
  if ((coverage.status === 'complete' && hasUnresolvedLocalData)
    || (coverage.status === 'partial' && !hasUnresolvedLocalData)) {
    throw new Error('O estado de cobertura não corresponde às pendências locais declaradas.');
  }
  if (coverage.status === 'complete' && data.localRecovery !== undefined
    && (!isRecord(data.localRecovery) || !isRecord(data.localRecovery.coverage)
      || data.localRecovery.coverage.complete !== true)) {
    throw new Error('O manifesto declara cobertura completa, mas a verificação local não confirma isso.');
  }

  const exclusions = coverage.excludedComponents as unknown[];
  const exclusionIds = exclusions.filter(isRecord).map((item) => item.id);
  const expectedExclusionIds = RESTORATION_EXCLUSIONS.map((item) => item.id);
  if (exclusions.some((item) => !isRecord(item) || typeof item.id !== 'string' || typeof item.reason !== 'string')
    || stableJson([...exclusionIds].sort()) !== stableJson([...expectedExclusionIds].sort())) {
    throw new Error('A lista de componentes excluídos está incompleta ou inválida.');
  }
  if (coverage.status !== 'not_assessed'
    && (typeof manifest.sourceProjectId !== 'string'
      || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(manifest.sourceProjectId))) {
    throw new Error('O manifesto de cobertura não identifica um projeto Firebase de origem válido.');
  }
};

export const validatePortableBackupPayload = async (value: unknown): Promise<PortableBackupPayload> => {
  if (!isRecord(value) || value.format !== BACKUP_FORMAT || value.version !== BACKUP_VERSION) {
    throw new Error('Formato ou versão do backup não são compatíveis com esta versão do MotoFix.');
  }

  const manifest = value.manifest;
  const data = value.data;
  if (!isRecord(manifest) || !isRecord(data) || !isRecord(data.collections)) {
    throw new Error('O backup está incompleto: manifesto ou dados não encontrados.');
  }
  if (manifest.format !== BACKUP_FORMAT || manifest.version !== BACKUP_VERSION
    || typeof manifest.generatedAt !== 'string'
    || typeof manifest.dataSha256 !== 'string'
    || typeof manifest.appVersion !== 'string'
    || manifest.source !== 'firebase'
    || !isRecord(manifest.counts)
    || !isRecord(manifest.workshop)
    || typeof manifest.workshop.id !== 'string'
    || !(typeof manifest.workshop.name === 'string' || manifest.workshop.name === null)
    || (manifest.sourceProjectId !== undefined
      && !(typeof manifest.sourceProjectId === 'string' || manifest.sourceProjectId === null))) {
    throw new Error('O manifesto do backup está inválido.');
  }
  if (Object.prototype.hasOwnProperty.call(data.collections, 'fiscal_private')) {
    throw new Error('O arquivo contém a coleção privada de credenciais fiscais e foi bloqueado.');
  }

  const actualCounts: Record<string, number> = {};
  for (const [collectionName, documents] of Object.entries(data.collections)) {
    if (!SUPPORTED_COLLECTIONS.has(collectionName) || collectionName === 'settings') {
      throw new Error(`A coleção ${collectionName} não é permitida neste formato de backup.`);
    }
    if (!Array.isArray(documents) || !documents.every(isRecord)) {
      throw new Error(`A estrutura da coleção ${collectionName} está inválida.`);
    }
    const documentIds = new Set<string>();
    for (const document of documents) {
      if (typeof document.id !== 'string' || !document.id || document.id.includes('/')) {
        throw new Error(`Foi encontrado um identificador inválido na coleção ${collectionName}.`);
      }
      if (documentIds.has(document.id)) {
        throw new Error(`O backup contém IDs repetidos na coleção ${collectionName}.`);
      }
      documentIds.add(document.id);
    }
    actualCounts[collectionName] = documents.length;
  }
  actualCounts.settings = data.settings ? 1 : 0;

  const expectedCounts = manifest.counts as Record<string, unknown>;
  for (const [collectionName, count] of Object.entries(expectedCounts)) {
    if (!SUPPORTED_COLLECTIONS.has(collectionName) || !Number.isSafeInteger(count) || Number(count) < 0
      || (actualCounts[collectionName] || 0) !== count) {
      throw new Error(`A contagem da coleção ${collectionName} não confere com o manifesto.`);
    }
  }
  for (const collectionName of Object.keys(actualCounts)) {
    if (!(collectionName in expectedCounts)) throw new Error(`A contagem da coleção ${collectionName} está ausente do manifesto.`);
  }
  validateNewCoverage(manifest, data, actualCounts);
  if (data.settings !== null && !isRecord(data.settings)) throw new Error('A estrutura das configurações da oficina está inválida.');
  if (data.profileSnapshot !== null && !isRecord(data.profileSnapshot)) throw new Error('O perfil da oficina está inválido.');

  const digestInput = new TextEncoder().encode(stableJson(data));
  if (await sha256(digestInput) !== manifest.dataSha256) {
    throw new Error('A verificação de integridade dos dados falhou. O backup pode estar corrompido ou alterado.');
  }

  return value as unknown as PortableBackupPayload;
};

const deriveKey = async (password: string, salt: Uint8Array) => {
  const cryptoApi = getCrypto();
  const material = await cryptoApi.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return cryptoApi.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
};

const assertPassword = (password: string) => {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Use uma senha de pelo menos ${MIN_PASSWORD_LENGTH} caracteres para proteger o arquivo.`);
  }
};

export const createPortableBackupPayload = async (
  source: PortableBackupData,
  workshopId: string,
  appVersion: string,
  generatedAt = new Date().toISOString(),
  sourceProjectId: string | null = null,
): Promise<PortableBackupPayload> => {
  const unknownCollections = Object.keys(source.collections).filter((name) => !SUPPORTED_COLLECTIONS.has(name) || name === 'settings');
  if (unknownCollections.length > 0) {
    throw new Error(`Coleção não permitida no backup: ${unknownCollections.join(', ')}.`);
  }
  const collections = Object.fromEntries(SUPPORTED_COLLECTION_NAMES
    .filter((name) => name !== 'settings')
    .map((name) => [name, Array.isArray(source.collections[name])
      ? stripSensitiveBackupFields(source.collections[name], name) as Array<Record<string, unknown>>
      : []]));
  const safeSettings = source.settings ? stripSensitiveBackupFields(source.settings, 'settings') as Record<string, unknown> : null;
  const safeLocalRecovery = source.localRecovery
    ? stripSensitiveBackupFields(source.localRecovery, 'localRecovery') as Record<string, unknown>
    : undefined;
  const counts = Object.fromEntries(SUPPORTED_COLLECTION_NAMES.map((name) => [
    name,
    name === 'settings' ? (safeSettings ? 1 : 0) : collections[name].length,
  ]));
  const data: PortableBackupData = {
    // Authentication/profile role data is intentionally omitted. The source workshop ID
    // remains in the manifest solely to preserve business ownership mapping on restore.
    profileSnapshot: null,
    settings: safeSettings,
    collections,
    ...(safeLocalRecovery ? { localRecovery: safeLocalRecovery } : {}),
    excludedCollections: source.excludedCollections || [],
    notes: source.notes || [],
  };
  const dataSha256 = await hashPortableBackupData(data);
  const workshopName = typeof safeSettings?.businessName === 'string'
    ? safeSettings.businessName
    : typeof safeSettings?.companyName === 'string'
      ? safeSettings.companyName
      : typeof safeSettings?.name === 'string' ? safeSettings.name : null;
  const localRecoveryCoverage = isRecord(safeLocalRecovery?.coverage) ? safeLocalRecovery.coverage : null;
  const coverageStatus: BackupCoverageStatus = localRecoveryCoverage?.complete === true
    ? 'complete'
    : localRecoveryCoverage?.complete === false ? 'partial' : 'not_assessed';
  const pendingComponents = makePendingComponentCounts(safeLocalRecovery);

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    manifest: {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      generatedAt,
      appVersion,
      source: 'firebase',
      sourceProjectId,
      workshop: { id: workshopId, name: workshopName },
      counts,
      coverage: {
        status: coverageStatus,
        includedCollections: [...SUPPORTED_COLLECTION_NAMES],
        counts,
        excludedComponents: RESTORATION_EXCLUSIONS.map((item) => ({ ...item })),
        pendingComponents,
        integrity: { algorithm: 'SHA-256', status: 'verified' },
        temporalConsistency: {
          method: 'before-after-source-signatures',
          status: 'best-effort-stable',
          globalTransaction: false,
          arbitrarySubcollectionsRecursive: false,
        },
        restoration: {
          authenticationAccounts: false,
          administrativePrivileges: false,
          localRecoveryAutomaticallyApplied: false,
        },
      },
      dataSha256,
      serialization: 'json-with-motofix-firestore-tags-v1',
    },
    data,
  };
};

export const encryptPortableBackup = async (payload: PortableBackupPayload, password: string) => {
  assertPassword(password);
  await validatePortableBackupPayload(payload);
  const cryptoApi = getCrypto();
  const plaintextText = JSON.stringify(payload);
  const plaintext = new TextEncoder().encode(plaintextText);
  const ciphertextBase64Length = 4 * Math.ceil((plaintext.byteLength + 16) / 3);
  const envelopeWithoutCiphertext = JSON.stringify({
    format: ENCRYPTED_FORMAT,
    version: ENCRYPTED_VERSION,
    cipher: 'AES-256-GCM',
    kdf: 'PBKDF2-SHA-256',
    iterations: PBKDF2_ITERATIONS,
    salt: '0'.repeat(24),
    iv: '0'.repeat(16),
    ciphertextSha256: '0'.repeat(64),
    ciphertext: '',
  }).length + 1;
  assertBackupSizeWithinLimit(envelopeWithoutCiphertext + ciphertextBase64Length);
  const salt = cryptoApi.getRandomValues(new Uint8Array(16));
  const iv = cryptoApi.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const ciphertext = new Uint8Array(await cryptoApi.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext));
  const ciphertextSha256 = await sha256(ciphertext);
  const envelope = {
    format: ENCRYPTED_FORMAT,
    version: ENCRYPTED_VERSION,
    cipher: 'AES-256-GCM',
    kdf: 'PBKDF2-SHA-256',
    iterations: PBKDF2_ITERATIONS,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertextSha256,
    ciphertext: bytesToBase64(ciphertext),
  };
  const encrypted = `${JSON.stringify(envelope)}\n`;
  assertBackupSizeWithinLimit(encrypted.length);
  return encrypted;
};

export const assertBackupSizeWithinLimit = (size: number, max = MAX_BACKUP_CHARS) => {
  if (!Number.isSafeInteger(size) || size < 0 || !Number.isSafeInteger(max) || max < 0) {
    throw new Error('O tamanho informado para o arquivo de backup é inválido.');
  }
  if (size > max) throw new Error('O arquivo excede o limite suportado de 300 MB por esta versão do MotoFix. Nenhum arquivo foi disponibilizado.');
};

export const decryptPortableBackup = async (fileContents: string, password: string) => {
  assertPassword(password);
  if (fileContents.length > MAX_BACKUP_CHARS) throw new Error('O arquivo excede o limite suportado por esta versão.');
  let envelope: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(fileContents);
    if (!isRecord(parsed)) throw new Error('invalid');
    envelope = parsed;
  } catch {
    throw new Error('Arquivo inválido. Selecione um backup .motofix criado pelo MotoFix.');
  }
  if (envelope.format !== ENCRYPTED_FORMAT || envelope.version !== ENCRYPTED_VERSION
    || envelope.cipher !== 'AES-256-GCM' || envelope.kdf !== 'PBKDF2-SHA-256'
    || envelope.iterations !== PBKDF2_ITERATIONS
    || typeof envelope.salt !== 'string' || typeof envelope.iv !== 'string'
    || typeof envelope.ciphertext !== 'string' || typeof envelope.ciphertextSha256 !== 'string') {
    throw new Error('Este não é um backup criptografado MotoFix compatível.');
  }

  try {
    const ciphertext = base64ToBytes(envelope.ciphertext);
    if (await sha256(ciphertext) !== envelope.ciphertextSha256) {
      throw new Error('A verificação de integridade do arquivo falhou.');
    }
    const key = await deriveKey(password, base64ToBytes(envelope.salt));
    const plaintext = await getCrypto().subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(envelope.iv) }, key, ciphertext,
    );
    const parsed: unknown = JSON.parse(new TextDecoder().decode(plaintext));
    return await validatePortableBackupPayload(parsed);
  } catch (error) {
    if (error instanceof Error && /integridade|versão|estrutura|coleção|IDs|identificador|contagem|manifesto|privada/i.test(error.message)) {
      throw error;
    }
    throw new Error('Não foi possível abrir o backup. Confira a senha e se o arquivo não foi danificado.');
  }
};

export const summarizePortableBackup = (payload: PortableBackupPayload): PortableBackupSummary => ({
  generatedAt: payload.manifest.generatedAt,
  workshopName: payload.manifest.workshop.name,
  counts: payload.manifest.counts,
  totalRecords: Object.values(payload.manifest.counts).reduce((sum, count) => sum + count, 0),
  notes: payload.data.notes || [],
  hasLocalRecovery: Boolean(payload.data.localRecovery),
  ...(payload.manifest.coverage ? {
    coverageStatus: payload.manifest.coverage.status,
    excludedComponents: payload.manifest.coverage.excludedComponents,
    pendingComponents: payload.manifest.coverage.pendingComponents,
  } : {}),
});

export const portableBackupFormat = {
  format: BACKUP_FORMAT,
  version: BACKUP_VERSION,
  encryptedFormat: ENCRYPTED_FORMAT,
  encryptedVersion: ENCRYPTED_VERSION,
  iterations: PBKDF2_ITERATIONS,
  minimumPasswordLength: MIN_PASSWORD_LENGTH,
  maximumFileSizeBytes: MAX_BACKUP_CHARS,
  includedCollections: [...SUPPORTED_COLLECTION_NAMES],
};
