import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { Timestamp, getFirestore } from 'firebase-admin/firestore';
import { createStableBackupArchive } from '../src/services/portableBackupExport.ts';
import { readPortableBackupSource } from '../src/services/portableBackupExport.ts';
import { decryptPortableBackup, hashPortableBackupSourceSnapshot } from '../src/services/portableBackup.ts';

const projectId = process.env.GCLOUD_PROJECT || 'motofix-backup-origin-e2e';
const destinationProjectId = 'motofix-backup-dest-e2e';
const root = process.env.MOTOFIX_BACKUP_E2E_DIR;
assert.ok(root, 'MOTOFIX_BACKUP_E2E_DIR must point to an isolated temporary folder.');
await mkdir(root, { recursive: true });
const app = initializeApp({ projectId }, `backup-origin-e2e-${Date.now()}`);
const auth = getAuth(app);
const db = getFirestore(app);
const functionBase = `http://127.0.0.1:5001/${projectId}/us-central1/backupApi`;
const apiBase = `${functionBase}`;
const authBase = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
const password = 'MotoFix-E2E-recovery-test-2026!';
const email = `backup-origin-${Date.now()}@example.invalid`;

const signUp = async () => {
  const response = await fetch(`${authBase}/accounts:signUp?key=fake-api-key`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const body = await response.json();
  assert.equal(response.ok, true, JSON.stringify(body));
  return body;
};

const signInWithCustomToken = async (customToken) => {
  const response = await fetch(`${authBase}/accounts:signInWithCustomToken?key=fake-api-key`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  });
  const body = await response.json();
  assert.equal(response.ok, true, JSON.stringify(body));
  return body;
};

const guardedSourceFetch = async (url, init) => {
  const parsed = new URL(url);
  assert.equal(parsed.origin, 'http://127.0.0.1:5001', 'Export may contact only the source Functions emulator.');
  assert.ok(parsed.pathname.startsWith(`/${projectId}/us-central1/backupApi/`), `Unexpected source URL: ${parsed.pathname}`);
  return fetch(url, init);
};

const readSignature = async (idToken) => {
  const response = await guardedSourceFetch(`${apiBase}/api/backup/full?signature=1`, {
    headers: { Authorization: `Bearer ${idToken}` }, cache: 'no-store',
  });
  const body = await response.json();
  assert.equal(response.ok, true, JSON.stringify(body));
  return body.dataSha256;
};

const makeLocalEvidence = async () => ({
  evidence: {
    queue: [], drafts: [], localCashLaunches: [], localProducts: [],
    sourceStorage: { offlineQueue: 'synthetic empty E2E snapshot', queuePersistenceHealthy: true, draftsReadable: true },
  },
  incompleteReasons: [],
  unsafeToExport: false,
});

const serializeFirestore = (value) => {
  if (value === null || value === undefined || typeof value !== 'object') return value;
  if (value instanceof Date) return { __motofixType: 'date', value: value.toISOString() };
  if (Buffer.isBuffer(value)) return { __motofixType: 'bytes', base64: value.toString('base64') };
  if (typeof value.toMillis === 'function' && Number.isFinite(value.seconds) && Number.isFinite(value.nanoseconds)) return { __motofixType: 'timestamp', seconds: value.seconds, nanoseconds: value.nanoseconds };
  if (typeof value.latitude === 'number' && typeof value.longitude === 'number') return { __motofixType: 'geopoint', latitude: value.latitude, longitude: value.longitude };
  if (typeof value.path === 'string' && typeof value.id === 'string') return { __motofixType: 'document-reference', path: value.path };
  if (Array.isArray(value)) return value.map(serializeFirestore);
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, serializeFirestore(child)]));
};

const collectionNames = [
  'clients', 'maintenances', 'warranties', 'appointments', 'expenses', 'products', 'stock_movements',
  'cash_launches', 'message_logs', 'operational_logs', 'fiscal_companies', 'fiscal_invoices', 'fiscal_logs',
  'fiscal_invoice_files', 'whatsapp_sessions', 'whatsapp_messages', 'whatsapp_contacts', 'whatsapp_automations',
];

const readAdminSnapshot = async (userRef, sourceUid, sourceEmail) => {
  const settingsSnapshot = await userRef.collection('settings').doc('config').get();
  const collections = {};
  for (const name of collectionNames) {
    const snapshot = await userRef.collection(name).orderBy('__name__').get();
    collections[name] = snapshot.docs.map((document) => ({ ...serializeFirestore(document.data()), id: document.id }));
  }
  return {
    profileSnapshot: {
      uid: sourceUid, email: sourceEmail, displayName: 'MotoFix E2E source', role: 'admin', isActive: true,
      subscription: { plan: null, status: null, autoRenew: null },
    },
    settings: settingsSnapshot.exists ? { ...serializeFirestore(settingsSnapshot.data()), id: settingsSnapshot.id } : null,
    collections,
  };
};

const run = async () => {
  const signedUp = await signUp();
  const sourceUid = signedUp.localId;
  const userRef = db.collection('users').doc(sourceUid);
  const expiry = Timestamp.fromMillis(Date.now() + 7 * 86_400_000);
  await userRef.set({
    uid: sourceUid, email, displayName: 'MotoFix E2E source', role: 'admin', isActive: true,
    manualAccess: { enabled: true, expiresAt: expiry },
    accessProjection: { allowed: true, source: 'manual', validUntil: expiry },
    ownerAccess: { permanent: true },
  });
  await auth.setCustomUserClaims(sourceUid, { admin: true });

  const stamp = (day) => Timestamp.fromDate(new Date(`2026-10-${String(day).padStart(2, '0')}T12:30:00.000Z`));
  await Promise.all([
    userRef.collection('settings').doc('config').set({ id: 'config', userId: sourceUid, businessName: 'Oficina E2E', businessPhone: '5511999990000', oilTypes: ['10W40'], serviceTypes: ['Revisão'] }),
    userRef.collection('clients').doc('client-1').set({ id: 'client-1', userId: sourceUid, name: 'Cliente Fictício E2E', contact: '11999990000', bikeModel: 'Moto E2E', vehiclePlate: 'ABC1D23', createdAt: stamp(1), recurrenceDays: 90, status: 'OK', notes: 'fixture para teste de recuperação' }),
    userRef.collection('clients').doc('client-1').collection('unlisted-private-subcollection').doc('should-not-export').set({ id: 'should-not-export', note: 'subcoleção fora do inventário explícito' }),
    userRef.collection('clients').doc('client-archived').set({ id: 'client-archived', userId: sourceUid, name: 'Cliente Arquivado E2E', createdAt: stamp(2), deletedAt: stamp(20), returnArchived: true }),
    userRef.collection('products').doc('product-1').set({ id: 'product-1', userId: sourceUid, description: 'Óleo 10W40 E2E', salePrice: 42.5, stockQuantity: 8, trackStock: true, variations: [{ id: 'var-1', name: '1 litro', stockQuantity: 8 }] }),
    userRef.collection('cash_launches').doc('os-pending').set({ id: 'os-pending', userId: sourceUid, clientId: 'client-1', clientName: 'Cliente Fictício E2E', status: 'Pendente', openingDate: '2026-10-22', expectedDate: '2026-10-24', merchandiseTotal: 42.5, servicesTotal: 75, total: 117.5, statusPagamento: 'Pendente', items: [{ productId: 'product-1', variationId: 'var-1', quantity: 1, unitPrice: 42.5 }] }),
    userRef.collection('cash_launches').doc('os-paid').set({ id: 'os-paid', userId: sourceUid, clientId: 'client-1', status: 'Finalizado', statusPagamento: 'Pago', date: stamp(21), total: 200.75, paidAt: stamp(21), paymentEntries: [{ method: 'Débito', amount: 80 }, { method: 'Crédito', amount: 120.75 }], stockMovementId: 'movement-1', stockMovementBatchId: 'batch-1' }),
    userRef.collection('cash_launches').doc('os-cancelled').set({ id: 'os-cancelled', userId: sourceUid, clientId: 'client-archived', status: 'Cancelado', statusPagamento: 'Pendente', total: 31.9, cancelledAt: stamp(22) }),
    userRef.collection('stock_movements').doc('movement-1').set({ id: 'movement-1', userId: sourceUid, cashLaunchId: 'os-paid', batchId: 'batch-1', quantity: 2, productId: 'product-1', sourceRef: userRef.collection('cash_launches').doc('os-paid') }),
    userRef.collection('maintenances').doc('maintenance-1').set({ id: 'maintenance-1', userId: sourceUid, clientId: 'client-1', serviceType: 'Revisão', serviceValue: 75, date: stamp(21), nextMaintenanceDate: stamp(30), createdAt: stamp(21) }),
    userRef.collection('appointments').doc('appointment-1').set({ id: 'appointment-1', userId: sourceUid, clientId: 'client-1', clientName: 'Cliente Fictício E2E', date: stamp(25), status: 'Agendado', service: 'Revisão' }),
    userRef.collection('expenses').doc('expense-1').set({ id: 'expense-1', userId: sourceUid, supplier: 'Fornecedor E2E', description: 'Compra teste ainda em aberto', amount: 53.4, paymentMethod: 'Crédito', accountingVersion: 1, date: stamp(22), dueDate: stamp(30), settlementEntries: [] }),
    userRef.collection('expenses').doc('expense-partial').set({ id: 'expense-partial', userId: sourceUid, supplier: 'Fornecedor E2E', description: 'Compra teste parcialmente liquidada', amount: 150.75, paymentMethod: 'Credito', accountingVersion: 1, date: stamp(22), dueDate: stamp(30), settlementEntries: [{ id: 'settlement-partial-1', amount: 60.25, method: 'Debito', settledAt: stamp(25) }] }),
    userRef.collection('expenses').doc('expense-settled').set({ id: 'expense-settled', userId: sourceUid, supplier: 'Fornecedor E2E', description: 'Compra teste totalmente liquidada', amount: 89.9, paymentMethod: 'Credito', accountingVersion: 1, date: stamp(22), dueDate: stamp(30), settlementEntries: [{ id: 'settlement-paid-1', amount: 55.5, method: 'Pix', settledAt: stamp(25) }, { id: 'settlement-paid-2', amount: 34.4, method: 'Dinheiro', settledAt: stamp(26) }] }),
    userRef.collection('warranties').doc('warranty-1').set({ id: 'warranty-1', userId: sourceUid, clientId: 'client-1', cashLaunchId: 'os-paid', startsAt: stamp(21), endsAt: stamp(30), status: 'Ativa' }),
    userRef.collection('message_logs').doc('message-1').set({ id: 'message-1', userId: sourceUid, clientId: 'client-1', sentAt: stamp(22), status: 'sent', template: 'retorno' }),
    userRef.collection('operational_logs').doc('log-1').set({ id: 'log-1', userId: sourceUid, action: 'O.S. finalizada', createdAt: stamp(21), fields: ['status', 'paymentEntries'] }),
    userRef.collection('fiscal_companies').doc('fiscal-company-1').set({ id: 'fiscal-company-1', userId: sourceUid, name: 'Empresa fiscal E2E', enabled: false }),
    userRef.collection('fiscal_invoices').doc('invoice-1').set({ id: 'invoice-1', userId: sourceUid, cashLaunchId: 'os-paid', status: 'rascunho', total: 200.75, issuedAt: stamp(21) }),
    userRef.collection('fiscal_logs').doc('fiscal-log-1').set({ id: 'fiscal-log-1', userId: sourceUid, action: 'invoice-created', createdAt: stamp(21) }),
    userRef.collection('fiscal_invoice_files').doc('invoice-file-1').set({ id: 'invoice-file-1', userId: sourceUid, invoiceId: 'invoice-1', filename: 'danfe-e2e.xml', contentBase64: Buffer.from('<xml>e2e</xml>').toString('base64') }),
    userRef.collection('whatsapp_sessions').doc('wa-session-1').set({ id: 'wa-session-1', userId: sourceUid, state: 'disconnected' }),
    userRef.collection('whatsapp_messages').doc('wa-message-1').set({ id: 'wa-message-1', userId: sourceUid, clientId: 'client-1', sentAt: stamp(22), content: 'mensagem fictícia' }),
    userRef.collection('whatsapp_contacts').doc('wa-contact-1').set({ id: 'wa-contact-1', userId: sourceUid, clientId: 'client-1', name: 'Cliente Fictício E2E' }),
  ]);

  const idToken = (await signInWithCustomToken(await auth.createCustomToken(sourceUid, { admin: true }))).idToken;
  const headers = async () => ({ Authorization: `Bearer ${idToken}` });
  const readRemoteSnapshot = async () => {
    const snapshot = await readPortableBackupSource({ apiBaseUrl: apiBase, expectedProjectId: projectId, getAuthHeaders: headers, fetchImpl: guardedSourceFetch, pageSize: 7 });
    const direct = await readAdminSnapshot(userRef, sourceUid, email);
    for (const name of collectionNames) assert.deepEqual(snapshot.data.collections[name], direct.collections[name], `API page content differs from direct source read in ${name}`);
    assert.deepEqual(snapshot.data.settings, direct.settings, 'Settings returned from API must match the source document.');
    assert.deepEqual(snapshot.data.profileSnapshot, direct.profileSnapshot, 'Sanitized profile returned from API must match direct source profile.');
    const apiHash = await hashPortableBackupSourceSnapshot(snapshot.data);
    const directHash = await hashPortableBackupSourceSnapshot(direct);
    const signature = await readSignature(idToken);
    assert.equal(signature, directHash, 'Server signature must match the direct source snapshot.');
    assert.equal(apiHash, directHash, 'All paginated source records must match the direct source snapshot.');
    return snapshot;
  };
  const archive = await createStableBackupArchive({
    password,
    appVersion: '2.1.0-e2e',
    readRemoteSignature: () => readSignature(idToken),
    readRemoteSnapshot,
    readLocalRecovery: makeLocalEvidence,
  });
  assert.equal(archive.complete, true);
  assert.equal(archive.payload.manifest.coverage.temporalConsistency.globalTransaction, false);
  assert.equal(archive.payload.manifest.coverage.temporalConsistency.method, 'before-after-source-signatures');
  assert.equal(archive.payload.manifest.coverage.excludedComponents.some((item) => item.id === 'arbitrary-firestore-subcollections'), true);
  assert.equal(archive.payload.data.collections.whatsapp_automations.length, 0, 'An empty logical collection must remain explicitly covered.');
  assert.equal(JSON.stringify(archive.payload).includes('should-not-export'), false, 'Unlisted Firestore subcollections must not be traversed or packaged.');
  const archivePath = join(root, 'motofix-recovery-e2e.motofix');
  await writeFile(archivePath, archive.encrypted, { encoding: 'utf8', flag: 'wx' });
  const fileHash = createHash('sha256').update(await readFile(archivePath)).digest('hex');
  const reopened = await decryptPortableBackup(await readFile(archivePath, 'utf8'), password);
  assert.deepEqual(reopened, archive.payload);
  assert.equal(await hashPortableBackupSourceSnapshot({
    profileSnapshot: reopened.data.profileSnapshot,
    settings: reopened.data.settings,
    collections: reopened.data.collections,
  }), await hashPortableBackupSourceSnapshot(archive.payload.data));
  const manifest = {
    archivePath,
    fileHash,
    sourceProjectId: projectId,
    destinationProjectId,
    sourceUid,
    generatedAt: reopened.manifest.generatedAt,
    counts: reopened.manifest.counts,
    temporalConsistency: reopened.manifest.coverage.temporalConsistency,
    remoteSnapshotHash: await hashPortableBackupSourceSnapshot({
      profileSnapshot: reopened.data.profileSnapshot,
      settings: reopened.data.settings,
      collections: reopened.data.collections,
    }),
  };
  await writeFile(join(root, 'e2e-manifest.json'), JSON.stringify(manifest, null, 2), { encoding: 'utf8', flag: 'wx' });
  console.log(`PASS origem: exportação autenticada pelas páginas reais, arquivo em disco, SHA-256 ${fileHash}, ${Object.values(manifest.counts).reduce((sum, value) => sum + value, 0)} documentos esperados, coleção vazia e subcoleção arbitrária excluída.`);
};

try {
  await run();
} finally {
  await deleteApp(app).catch(() => {});
}
