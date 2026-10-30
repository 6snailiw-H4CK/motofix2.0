import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { initializeApp as initializeAdminApp, deleteApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { Timestamp, getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { initializeApp as initializeClientApp, deleteApp as deleteClientApp } from 'firebase/app';
import { connectAuthEmulator, initializeAuth, inMemoryPersistence, signInWithEmailAndPassword } from 'firebase/auth';
import { collection, connectFirestoreEmulator, doc, getDoc, getDocs, getFirestore as getClientFirestore } from 'firebase/firestore';
import { createPortableImportPlan } from '../src/services/portableImportPlan.ts';
import { decryptPortableBackup, hashPortableBackupSourceSnapshot } from '../src/services/portableBackup.ts';
import { createFirebaseFunctionDestinationAdapter } from '../src/services/backupDestinationAdapter.ts';

const projectId = process.env.GCLOUD_PROJECT || 'motofix-backup-dest-e2e';
const root = process.env.MOTOFIX_BACKUP_E2E_DIR;
assert.ok(root, 'MOTOFIX_BACKUP_E2E_DIR must point to the isolated temporary folder.');
const manifest = JSON.parse(await readFile(join(root, 'e2e-manifest.json'), 'utf8'));
assert.notEqual(manifest.sourceProjectId, projectId);
const archiveText = await readFile(manifest.archivePath, 'utf8');
const fileHash = createHash('sha256').update(archiveText).digest('hex');
assert.equal(fileHash, manifest.fileHash, 'O hash do arquivo salvo deve continuar igual ao registrado na origem.');
const password = 'MotoFix-E2E-recovery-test-2026!';
const payload = await decryptPortableBackup(archiveText, password);
assert.equal(payload.manifest.sourceProjectId, manifest.sourceProjectId);
assert.deepEqual(payload.manifest.counts, manifest.counts);
assert.equal(await hashPortableBackupSourceSnapshot({
  profileSnapshot: payload.data.profileSnapshot, settings: payload.data.settings, collections: payload.data.collections,
}), manifest.remoteSnapshotHash);

const app = initializeAdminApp({ projectId }, `backup-dest-e2e-${Date.now()}`);
const adminAuth = getAdminAuth(app);
const db = getAdminFirestore(app);
const authBase = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
const destinationBase = `http://127.0.0.1:5001/${projectId}/us-central1/backupApi`;
const passwordForAuth = 'MotoFix-E2E-recovery-test-2026!';
const email = `backup-destination-${Date.now()}@example.invalid`;
let clientApp;

const signUp = async () => {
  const response = await fetch(`${authBase}/accounts:signUp?key=fake-api-key`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: passwordForAuth, returnSecureToken: true }),
  });
  const body = await response.json();
  assert.equal(response.ok, true, JSON.stringify(body));
  return body;
};

const signIn = async () => {
  const response = await fetch(`${authBase}/accounts:signInWithPassword?key=fake-api-key`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: passwordForAuth, returnSecureToken: true }),
  });
  const body = await response.json();
  assert.equal(response.ok, true, JSON.stringify(body));
  return body;
};

const serializeFirestore = (value) => {
  if (value === null || value === undefined || typeof value !== 'object') return value;
  if (value instanceof Date) return { __motofixType: 'date', value: value.toISOString() };
  if (Buffer.isBuffer(value)) return { __motofixType: 'bytes', base64: value.toString('base64') };
  if (typeof value.toMillis === 'function' && Number.isFinite(value.seconds)) return { __motofixType: 'timestamp', seconds: value.seconds, nanoseconds: value.nanoseconds };
  if (typeof value.latitude === 'number' && typeof value.longitude === 'number') return { __motofixType: 'geopoint', latitude: value.latitude, longitude: value.longitude };
  if (typeof value.path === 'string' && typeof value.id === 'string') return { __motofixType: 'document-reference', path: value.path };
  if (Array.isArray(value)) return value.map(serializeFirestore);
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, serializeFirestore(child)]));
};

const guardedDestinationFetch = async (url, init) => {
  const parsed = new URL(url);
  assert.equal(parsed.origin, 'http://127.0.0.1:5001', 'Restore may contact only the destination emulator.');
  assert.ok(parsed.pathname.startsWith(`/${projectId}/us-central1/backupApi/`), `A network request escaped to ${parsed.href}`);
  assert.equal(parsed.pathname.includes(manifest.sourceProjectId), false, 'Source Firebase URL is blocked.');
  return fetch(url, init);
};

const run = async () => {
  const created = await signUp();
  const destinationUid = created.localId;
  const userRef = db.collection('users').doc(destinationUid);
  const expiry = Timestamp.fromMillis(Date.now() + 7 * 86_400_000);
  const destinationProfile = {
    uid: destinationUid, email, role: 'admin', isActive: true,
    manualAccess: { enabled: true, expiresAt: expiry },
    accessProjection: { allowed: true, source: 'manual', validUntil: expiry },
    destinationMarker: 'keep-destination-identity',
  };
  await userRef.set(destinationProfile);
  await adminAuth.setCustomUserClaims(destinationUid, { admin: true, isActive: true });
  const signedIn = await signIn();
  const claims = JSON.parse(Buffer.from(signedIn.idToken.split('.')[1], 'base64url').toString('utf8'));
  assert.equal(claims.aud, projectId);
  assert.equal(claims.admin, true);

  const plan = await createPortableImportPlan(payload, { projectId, uid: destinationUid });
  assert.equal(plan.canImport, true, JSON.stringify(plan.issues));
  assert.equal(plan.sourceProjectId, manifest.sourceProjectId);
  assert.equal(plan.destinationProjectId, projectId);
  assert.equal(plan.excludedProfileSnapshot, true);
  assert.equal(plan.excludedLocalRecovery, true);
  const expectedTotal = Object.values(manifest.counts).reduce((sum, count) => sum + count, 0);
  assert.equal(plan.totalDocuments, expectedTotal);

  let originAttempts = 0;
  const adapter = createFirebaseFunctionDestinationAdapter({
    projectId, uid: destinationUid, getIdToken: async () => signedIn.idToken,
    emulatorBaseUrl: destinationBase,
    fetchImpl: async (url, init) => {
      try { return await guardedDestinationFetch(url, init); }
      catch (error) { originAttempts += 1; throw error; }
    },
  });
  const preflight = await adapter.inspect(plan);
  assert.equal(preflight.destinationAuthorized, true);
  assert.equal(preflight.targetEmpty, true);
  assert.equal(preflight.importable, true);
  assert.equal(preflight.writesPerformed, false);
  const result = await adapter.import(plan, 'IMPORTAR NO DESTINO');
  assert.equal(result.status, 'completed');
  assert.equal(result.verified, true);
  assert.equal(result.documentsVerified, expectedTotal);
  assert.equal(originAttempts, 0, 'The destination importer did not attempt to contact the source project.');

  const actualDocuments = [];
  for (const { collection: collectionName, id, data } of plan.documents) {
    const snapshot = await userRef.collection(collectionName).doc(id).get();
    assert.equal(snapshot.exists, true, `Documento não recuperado: ${collectionName}/${id}`);
    const actual = { ...serializeFirestore(snapshot.data() || {}), id: snapshot.id };
    assert.deepEqual(actual, data, `Conteúdo divergente após remapeamento: ${collectionName}/${id}`);
    actualDocuments.push({ collection: collectionName, id, data: actual });
  }
  assert.equal(actualDocuments.length, plan.totalDocuments);

  const order = (await userRef.collection('cash_launches').doc('os-paid').get()).data();
  assert.deepEqual(order.paymentEntries, [{ method: 'Débito', amount: 80 }, { method: 'Crédito', amount: 120.75 }]);
  assert.equal(order.date.toMillis(), Date.parse('2026-10-21T12:30:00.000Z'));
  assert.equal((await userRef.collection('expenses').doc('expense-1').get()).data().amount, 53.4);
  assert.equal((await userRef.collection('cash_launches').doc('os-pending').get()).data().status, 'Pendente');
  assert.equal((await userRef.collection('cash_launches').doc('os-cancelled').get()).data().status, 'Cancelado');
  assert.equal((await userRef.collection('stock_movements').doc('movement-1').get()).data().sourceRef.path, `users/${destinationUid}/cash_launches/os-paid`);
  assert.equal((await userRef.collection('settings').doc('config').get()).data().businessName, 'Oficina E2E');
  assert.equal((await userRef.collection('operational_logs').doc('log-1').get()).data().action, 'O.S. finalizada');
  const profileAfter = (await userRef.get()).data();
  assert.equal(profileAfter.destinationMarker, 'keep-destination-identity');
  assert.equal(profileAfter.role, 'admin');
  assert.equal(profileAfter.ownerAccess, undefined, 'Backup data must not confer source owner privileges.');

  // Client SDK reads are the destination-app smoke check for the business modules.
  clientApp = initializeClientApp({
    projectId, apiKey: 'fake-api-key', authDomain: `${projectId}.firebaseapp.com`, appId: '1:123456:web:abcdef123456',
  }, `backup-dest-client-${Date.now()}`);
  const clientAuth = initializeAuth(clientApp, { persistence: inMemoryPersistence });
  connectAuthEmulator(clientAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const clientDb = getClientFirestore(clientApp);
  connectFirestoreEmulator(clientDb, '127.0.0.1', 8080);
  await signInWithEmailAndPassword(clientAuth, email, passwordForAuth);
  const moduleCollections = ['clients', 'maintenances', 'cash_launches', 'products', 'appointments', 'expenses', 'warranties', 'stock_movements', 'operational_logs', 'fiscal_invoices', 'whatsapp_contacts'];
  const moduleCounts = {};
  for (const collectionName of moduleCollections) {
    const snapshot = await getDocs(collection(clientDb, 'users', destinationUid, collectionName));
    moduleCounts[collectionName] = snapshot.size;
    assert.equal(snapshot.size, manifest.counts[collectionName] || 0, `Leitura de módulo divergente: ${collectionName}`);
  }
  const settings = await getDoc(doc(clientDb, 'users', destinationUid, 'settings', 'config'));
  assert.equal(settings.exists(), true);
  assert.equal(settings.data().businessName, 'Oficina E2E');

  const audit = (await userRef.collection('backup_imports').get()).docs.find((item) => item.id !== '_active')?.data();
  assert.equal(audit?.status, 'completed');
  assert.equal(audit?.permissionsImported, false);
  console.log(`PASS destino independente: ${result.documentsVerified} documentos comparados; ${moduleCollections.length} módulos consultados pelo SDK cliente; projeto de origem ${manifest.sourceProjectId} inacessível ao adaptador.`);
  console.log(`Módulos: ${JSON.stringify(moduleCounts)}`);
};

try {
  await run();
} finally {
  if (clientApp) await deleteClientApp(clientApp).catch(() => {});
  await deleteApp(app).catch(() => {});
}
