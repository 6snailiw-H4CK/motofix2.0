import {
  validatePortableBackupPayload,
  type PortableBackupPayload,
} from './portableBackup';

export const IMPORTABLE_COLLECTIONS = [
  'clients', 'maintenances', 'warranties', 'appointments', 'expenses', 'products',
  'stock_movements', 'cash_launches', 'settings', 'message_logs', 'operational_logs',
  'fiscal_companies', 'fiscal_invoices', 'fiscal_logs', 'fiscal_invoice_files',
  'whatsapp_sessions', 'whatsapp_messages', 'whatsapp_contacts', 'whatsapp_automations',
] as const;
const IMPORT_ORDER: readonly ImportableCollection[] = [
  'clients', 'products', 'settings', 'cash_launches', 'maintenances', 'warranties',
  'appointments', 'expenses', 'stock_movements', 'message_logs', 'operational_logs',
  'fiscal_companies', 'fiscal_invoices', 'fiscal_invoice_files', 'fiscal_logs',
  'whatsapp_sessions', 'whatsapp_contacts', 'whatsapp_messages', 'whatsapp_automations',
];

export type ImportableCollection = typeof IMPORTABLE_COLLECTIONS[number];
export type ImportIssue = {
  severity: 'error' | 'warning';
  code: string;
  collection?: string;
  documentId?: string;
  field?: string;
  message: string;
};
export type PlannedImportDocument = {
  collection: ImportableCollection;
  id: string;
  data: Record<string, unknown>;
};
export type PortableImportPlan = {
  planVersion: 1;
  sourceWorkshopId: string;
  sourceProjectId: string | null;
  destinationProjectId: string;
  destinationUid: string;
  dataSha256: string;
  plannedDataSha256: string;
  generatedAt: string;
  counts: Record<string, number>;
  totalDocuments: number;
  documents: PlannedImportDocument[];
  excludedProfileSnapshot: true;
  excludedLocalRecovery: true;
  issues: ImportIssue[];
  canImport: boolean;
};

const isObject = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (isObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
};

const isPresentId = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

const cloneAndRemap = (
  value: unknown,
  sourceUid: string,
  destinationUid: string,
  path: string,
  issues: ImportIssue[],
): unknown => {
  if (Array.isArray(value)) {
    return value.map((item, index) => cloneAndRemap(item, sourceUid, destinationUid, `${path}[${index}]`, issues));
  }
  if (!isObject(value)) return value;

  if (value.__motofixType === 'document-reference') {
    const refPath = value.path;
    const sourcePrefix = `users/${sourceUid}`;
    const segments = typeof refPath === 'string' ? refPath.split('/').filter(Boolean) : [];
    if (segments.length % 2 !== 0) {
      issues.push({
        severity: 'error', code: 'invalid_document_reference', field: path,
        message: 'Uma referência de documento tem um caminho incompatível com o Firestore.',
      });
      return value;
    }
    if (typeof refPath !== 'string' || !(refPath === sourcePrefix || refPath.startsWith(`${sourcePrefix}/`))) {
      issues.push({
        severity: 'error', code: 'external_document_reference', field: path,
        message: 'Uma referência aponta para fora dos dados da oficina de origem e não pode ser remapeada com segurança.',
      });
      return value;
    }
    return { ...value, path: `users/${destinationUid}${refPath.slice(sourcePrefix.length)}` };
  }

  const mapped: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === 'userId') {
      if (child !== undefined && child !== null && child !== sourceUid) {
        issues.push({
          severity: 'error', code: 'foreign_owner', field: `${path}.${key}`,
          message: 'O documento contém um identificador de proprietário diferente da oficina registrada no manifesto.',
        });
        mapped[key] = child;
      } else if (child === sourceUid) {
        mapped[key] = destinationUid;
      } else {
        mapped[key] = child;
      }
      continue;
    }
    mapped[key] = cloneAndRemap(child, sourceUid, destinationUid, `${path}.${key}`, issues);
  }
  return mapped;
};

const addMissingRefIssue = (
  issues: ImportIssue[],
  source: PlannedImportDocument,
  field: string,
  id: unknown,
  targetCollection: ImportableCollection,
  idSets: Map<string, Set<string>>,
) => {
  if (!isPresentId(id)) return;
  if (!idSets.get(targetCollection)?.has(id)) {
    issues.push({
      severity: 'error', code: 'missing_reference', collection: source.collection,
      documentId: source.id, field,
      message: `A referência não encontra o documento ${targetCollection}/${id} dentro do arquivo.`,
    });
  }
};

const validateReferences = (documents: PlannedImportDocument[], issues: ImportIssue[]) => {
  const idSets = new Map<string, Set<string>>();
  for (const collection of IMPORTABLE_COLLECTIONS) idSets.set(collection, new Set());
  for (const document of documents) idSets.get(document.collection)?.add(document.id);

  for (const document of documents) {
    const data = document.data;
    const inspectDocumentReferences = (value: unknown, path: string) => {
      if (Array.isArray(value)) {
        value.forEach((item, index) => inspectDocumentReferences(item, `${path}[${index}]`));
        return;
      }
      if (!isObject(value)) return;
      if (value.__motofixType === 'document-reference') {
        const segments = typeof value.path === 'string' ? value.path.split('/').filter(Boolean) : [];
        if (segments.length === 2 && segments[0] === 'users' && segments[1] === document.data.userId) return;
        if (segments.length !== 4 || segments[0] !== 'users' || segments[1] !== document.data.userId
          || !(IMPORTABLE_COLLECTIONS as readonly string[]).includes(segments[2])
          || !idSets.get(segments[2])?.has(segments[3])) {
          issues.push({
            severity: 'error', code: 'broken_document_reference', collection: document.collection,
            documentId: document.id, field: path,
            message: 'Uma referência de documento não aponta para um registro incluído no plano de restauração.',
          });
        }
        return;
      }
      Object.entries(value).forEach(([key, child]) => inspectDocumentReferences(child, `${path}.${key}`));
    };
    inspectDocumentReferences(data, document.collection + '/' + document.id);
    if (document.collection === 'maintenances') {
      addMissingRefIssue(issues, document, 'clientId', data.clientId, 'clients', idSets);
    }
    if (document.collection === 'appointments') {
      addMissingRefIssue(issues, document, 'clientId', data.clientId, 'clients', idSets);
    }
    if (document.collection === 'cash_launches') {
      addMissingRefIssue(issues, document, 'clientId', data.clientId, 'clients', idSets);
      if (Array.isArray(data.items)) {
        data.items.forEach((item, index) => {
          if (isObject(item)) addMissingRefIssue(issues, document, `items[${index}].productId`, item.productId, 'products', idSets);
        });
      }
      addMissingRefIssue(issues, document, 'stockMovementId', data.stockMovementId, 'stock_movements', idSets);
    }
    if (document.collection === 'stock_movements') {
      addMissingRefIssue(issues, document, 'cashLaunchId', data.cashLaunchId, 'cash_launches', idSets);
      if (isPresentId(data.productId)) addMissingRefIssue(issues, document, 'productId', data.productId, 'products', idSets);
      if (Array.isArray(data.productIds)) data.productIds.forEach((id, index) => addMissingRefIssue(issues, document, `productIds[${index}]`, id, 'products', idSets));
      if (isObject(data.changes)) {
        Object.keys(data.changes).forEach((id) => addMissingRefIssue(issues, document, `changes.${id}`, id, 'products', idSets));
      }
    }
    if (document.collection === 'warranties') {
      addMissingRefIssue(issues, document, 'clientId', data.clientId, 'clients', idSets);
      addMissingRefIssue(issues, document, 'cashLaunchId', data.cashLaunchId, 'cash_launches', idSets);
    }
    if (document.collection === 'fiscal_invoices') {
      addMissingRefIssue(issues, document, 'companyId', data.companyId, 'fiscal_companies', idSets);
      addMissingRefIssue(issues, document, 'cashLaunchId', data.cashLaunchId, 'cash_launches', idSets);
    }
    if (document.collection === 'fiscal_logs') {
      addMissingRefIssue(issues, document, 'companyId', data.companyId, 'fiscal_companies', idSets);
      addMissingRefIssue(issues, document, 'invoiceId', data.invoiceId, 'fiscal_invoices', idSets);
    }
    if (document.collection === 'fiscal_invoice_files') {
      addMissingRefIssue(issues, document, 'invoiceId', data.invoiceId, 'fiscal_invoices', idSets);
    }
    if (document.collection === 'message_logs') {
      addMissingRefIssue(issues, document, 'clientId', data.clientId, 'clients', idSets);
    }
  }

  const movementById = new Map(documents
    .filter((document) => document.collection === 'stock_movements')
    .map((document) => [document.id, document.data]));
  for (const document of documents.filter((item) => item.collection === 'cash_launches')) {
    const movementId = document.data.stockMovementId;
    if (!isPresentId(movementId)) continue;
    const movement = movementById.get(movementId);
    if (!movement) continue;
    if (movement.cashLaunchId !== undefined && movement.cashLaunchId !== document.id) {
      issues.push({
        severity: 'error', code: 'mismatched_stock_link', collection: document.collection,
        documentId: document.id, field: 'stockMovementId',
        message: 'A movimentação de estoque aponta para outra ordem de serviço.',
      });
    }
    if (document.data.stockMovementBatchId && movement.batchId !== document.data.stockMovementBatchId) {
      issues.push({
        severity: 'error', code: 'mismatched_stock_batch', collection: document.collection,
        documentId: document.id, field: 'stockMovementBatchId',
        message: 'O lote da movimentação de estoque não corresponde ao vínculo salvo na O.S.',
      });
    }
  }
};

export const createPortableImportPlan = async (
  payload: PortableBackupPayload,
  destination: { projectId: string; uid: string },
): Promise<PortableImportPlan> => {
  const validated = await validatePortableBackupPayload(payload);
  const issues: ImportIssue[] = [];
  const documents: PlannedImportDocument[] = [];
  const sourceUid = validated.manifest.workshop.id;
  const sourceProjectId = validated.manifest.sourceProjectId || null;
  const destinationProjectId = destination.projectId.trim();
  const destinationUid = destination.uid.trim();
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(sourceUid)) {
    issues.push({ severity: 'error', code: 'invalid_source_workshop', message: 'A identidade da oficina de origem no manifesto é inválida.' });
  }
  if (sourceProjectId && !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(sourceProjectId)) {
    issues.push({ severity: 'error', code: 'invalid_source_project', message: 'O ID do projeto Firebase de origem no manifesto é inválido.' });
  }
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(destinationProjectId)) {
    issues.push({ severity: 'error', code: 'invalid_destination_project', message: 'O ID do projeto Firebase de destino é inválido.' });
  }
  if (!/^[A-Za-z0-9_-]{6,128}$/.test(destinationUid)) {
    issues.push({ severity: 'error', code: 'invalid_destination_uid', message: 'A identidade autenticada no destino é inválida.' });
  }
  const profileUid = validated.data.profileSnapshot?.uid;
  if (profileUid !== undefined && profileUid !== sourceUid) {
    issues.push({ severity: 'error', code: 'source_identity_mismatch', message: 'O perfil do arquivo não corresponde à identidade de origem declarada no manifesto.' });
  }

  for (const [collectionName, records] of Object.entries(validated.data.collections)) {
    if (!(IMPORTABLE_COLLECTIONS as readonly string[]).includes(collectionName) || collectionName === 'settings') {
      issues.push({ severity: 'error', code: 'unsupported_collection', collection: collectionName, message: 'A coleção não faz parte do esquema de importação permitido.' });
      continue;
    }
    for (const record of records) {
      const id = record.id;
      if (!isPresentId(id) || id.includes('/')) {
        issues.push({ severity: 'error', code: 'invalid_document_id', collection: collectionName, message: 'O documento tem um ID incompatível com o destino.' });
        continue;
      }
      const remapped = cloneAndRemap(record, sourceUid, destinationUid, `${collectionName}/${id}`, issues);
      if (isObject(remapped)) {
        remapped.id = id;
        remapped.userId = destinationUid;
        documents.push({ collection: collectionName as ImportableCollection, id, data: remapped });
      }
    }
  }
  if (validated.data.settings) {
    const source = validated.data.settings;
    const id = typeof source.id === 'string' ? source.id : 'config';
    if (id !== 'config') {
      issues.push({ severity: 'error', code: 'invalid_settings_id', collection: 'settings', documentId: id, message: 'O documento de configurações precisa manter o ID config.' });
    } else {
      const remapped = cloneAndRemap(source, sourceUid, destinationUid, 'settings/config', issues);
      if (isObject(remapped)) {
        remapped.id = 'config';
        remapped.userId = destinationUid;
        documents.push({ collection: 'settings', id: 'config', data: remapped });
      }
    }
  }

  for (const document of documents) {
    const inspectForbidden = (value: unknown, path: string) => {
      if (Array.isArray(value)) {
        value.forEach((child, index) => inspectForbidden(child, `${path}[${index}]`));
        return;
      }
      if (!isObject(value)) return;
      for (const [key, child] of Object.entries(value)) {
        if (['role', 'admin', 'master_admin', 'isAdmin', 'isMasterAdmin', 'claims', 'customClaims', 'accessProjection', 'manualAccess', 'ownerAccess', 'billing', 'stripeCustomerId', 'stripeSubscriptionId', 'paymentMethodId'].includes(key)) {
        issues.push({
          severity: 'error', code: 'privileged_field', collection: document.collection,
          documentId: document.id, field: `${path}.${key}`,
          message: 'O documento contém um campo de identidade, permissão ou cobrança que não é transferido por este fluxo.',
        });
        } else {
          inspectForbidden(child, `${path}.${key}`);
        }
      }
    };
    inspectForbidden(document.data, document.collection + '/' + document.id);
  }
  validateReferences(documents, issues);
  documents.sort((left, right) => IMPORT_ORDER.indexOf(left.collection) - IMPORT_ORDER.indexOf(right.collection)
    || left.id.localeCompare(right.id));

  const counts = Object.fromEntries(IMPORTABLE_COLLECTIONS.map((collectionName) => [
    collectionName,
    documents.filter((document) => document.collection === collectionName).length,
  ]));
  const canonicalDocuments = documents.map(({ collection, id, data }) => ({ collection, id, data }));
  const plannedDataSha256 = Array.from(new Uint8Array(await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(stableJson(canonicalDocuments)),
  ))).map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return {
    planVersion: 1,
    sourceWorkshopId: sourceUid,
    sourceProjectId,
    destinationProjectId,
    destinationUid,
    dataSha256: validated.manifest.dataSha256,
    plannedDataSha256,
    generatedAt: new Date().toISOString(),
    counts,
    totalDocuments: documents.length,
    documents,
    excludedProfileSnapshot: true,
    excludedLocalRecovery: true,
    issues,
    canImport: issues.every((issue) => issue.severity !== 'error'),
  };
};
