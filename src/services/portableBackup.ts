const BACKUP_FORMAT = 'motofix-portable-backup';
const BACKUP_VERSION = 1;
const ENCRYPTED_FORMAT = 'motofix-encrypted-backup';
const ENCRYPTED_VERSION = 1;
const PBKDF2_ITERATIONS = 600_000;
const MIN_PASSWORD_LENGTH = 12;
const MAX_BACKUP_CHARS = 300_000_000;
const SUPPORTED_COLLECTIONS = new Set([
  'clients', 'maintenances', 'warranties', 'appointments', 'expenses', 'products',
  'stock_movements', 'cash_launches', 'settings', 'message_logs', 'operational_logs',
  'fiscal_companies', 'fiscal_invoices', 'fiscal_logs', 'fiscal_invoice_files',
  'whatsapp_sessions', 'whatsapp_messages', 'whatsapp_contacts', 'whatsapp_automations',
]);

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

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

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
  if (data.settings) actualCounts.settings = 1;

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
  const collections = Object.fromEntries(Object.entries(source.collections).map(([name, records]) => [name, records]));
  const counts = Object.fromEntries(Object.entries(collections).map(([name, records]) => [name, records.length]));
  if (source.settings) counts.settings = 1;
  const data: PortableBackupData = {
    profileSnapshot: source.profileSnapshot,
    settings: source.settings,
    collections,
    ...(source.localRecovery ? { localRecovery: source.localRecovery } : {}),
    excludedCollections: source.excludedCollections || [],
    notes: source.notes || [],
  };
  const dataSha256 = await sha256(new TextEncoder().encode(stableJson(data)));
  const workshopName = typeof source.settings?.businessName === 'string'
    ? source.settings.businessName
    : typeof source.settings?.companyName === 'string'
      ? source.settings.companyName
      : typeof source.settings?.name === 'string' ? source.settings.name : null;

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    manifest: {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      generatedAt,
      appVersion,
      source: 'firebase',
      ...(sourceProjectId ? { sourceProjectId } : {}),
      workshop: { id: workshopId, name: workshopName },
      counts,
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
  const salt = cryptoApi.getRandomValues(new Uint8Array(16));
  const iv = cryptoApi.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
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
  return `${JSON.stringify(envelope)}\n`;
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
});

export const portableBackupFormat = {
  format: BACKUP_FORMAT,
  version: BACKUP_VERSION,
  encryptedFormat: ENCRYPTED_FORMAT,
  encryptedVersion: ENCRYPTED_VERSION,
  iterations: PBKDF2_ITERATIONS,
  minimumPasswordLength: MIN_PASSWORD_LENGTH,
};
