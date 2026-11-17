import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { Timestamp, getFirestore } from 'firebase-admin/firestore';
import { initializeApp as initializeClientApp, deleteApp as deleteClientApp } from 'firebase/app';
import { connectAuthEmulator, initializeAuth, inMemoryPersistence, signInWithEmailAndPassword } from 'firebase/auth';
import { connectFirestoreEmulator, doc as clientDoc, getDoc, getFirestore as getClientFirestore, setDoc } from 'firebase/firestore';
import { createPortableBackupPayload, decryptPortableBackup, encryptPortableBackup } from '../src/services/portableBackup.ts';
import { createPortableImportPlan } from '../src/services/portableImportPlan.ts';
import { createFirebaseFunctionDestinationAdapter } from '../src/services/backupDestinationAdapter.ts';

const destinationProjectId = process.env.GCLOUD_PROJECT || 'motofix-dest-test26';
const sourceProjectId = 'motofix-origin-test26';
const sourceUid = 'source-workshop-uid-test';
const destinationBase = `http://127.0.0.1:5001/${destinationProjectId}/us-central1/backupApi`;
const authBase = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
const destinationApp = initializeApp({ projectId: destinationProjectId }, `destination-${Date.now()}`);
const destinationAuth = getAuth(destinationApp);
const destinationDb = getFirestore(destinationApp);
const sourceApp = initializeApp({ projectId: sourceProjectId }, `source-${Date.now()}`);
const sourceDb = getFirestore(sourceApp);
const password = 'restore-test-password-2026!';
let sourceAppClosed = false;
let destinationClientApp = null;

const signUp = async (email) => {
  const response = await fetch(`${authBase}/accounts:signUp?key=fake-api-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const body = await response.json();
  assert.equal(response.ok, true, JSON.stringify(body));
  return body;
};

const signIn = async (email) => {
  const response = await fetch(`${authBase}/accounts:signInWithPassword?key=fake-api-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const body = await response.json();
  assert.equal(response.ok, true, JSON.stringify(body));
  return body;
};

const serializeFirestore = (value) => {
  if (value === null || value === undefined || typeof value !== 'object') return value;
  if (value instanceof Date) return { __motofixType: 'date', value: value.toISOString() };
  if (Buffer.isBuffer(value)) return { __motofixType: 'bytes', base64: value.toString('base64') };
  if (typeof value.toMillis === 'function' && Number.isFinite(value.seconds)) {
    return { __motofixType: 'timestamp', seconds: value.seconds, nanoseconds: value.nanoseconds };
  }
  if (typeof value.path === 'string' && typeof value.id === 'string') {
    return { __motofixType: 'document-reference', path: value.path };
  }
  if (Array.isArray(value)) return value.map(serializeFirestore);
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, serializeFirestore(child)]));
};

const readCollection = async (userRef, collectionName) => {
  const snapshot = await userRef.collection(collectionName).get();
  return snapshot.docs.map((document) => ({ ...serializeFirestore(document.data()), id: document.id }));
};

const canonicalDestinationDocuments = async (userRef, plan) => Promise.all(plan.documents.map(async ({ collection, id }) => {
  const snapshot = await userRef.collection(collection).doc(id).get();
  assert.equal(snapshot.exists, true, `Documento esperado ausente: ${collection}/${id}`);
  return { collection, id, data: { ...serializeFirestore(snapshot.data()), id: snapshot.id } };
}));

const makeAdminDestination = async (email) => {
  const created = await signUp(email);
  const userRef = destinationDb.collection('users').doc(created.localId);
  const expiresAt = Timestamp.fromMillis(Date.now() + 86_400_000);
  await userRef.set({
    uid: created.localId, role: 'admin', isActive: true,
    manualAccess: { enabled: true, expiresAt },
    accessProjection: { allowed: true, source: 'manual', validUntil: expiresAt },
    destinationMarker: 'preserve-this-profile',
  });
  await destinationAuth.setCustomUserClaims(created.localId, { admin: true, isActive: true });
  const signedIn = await signIn(email);
  const adapter = createFirebaseFunctionDestinationAdapter({
    projectId: destinationProjectId, uid: created.localId,
    getIdToken: async () => signedIn.idToken, emulatorBaseUrl: destinationBase,
  });
  return { user: created, userRef, signedIn, adapter };
};

const countChunks = (plan) => {
  const counts = new Map();
  for (const document of plan.documents) counts.set(document.collection, (counts.get(document.collection) || 0) + 1);
  return [...counts.values()].reduce((sum, count) => sum + Math.ceil(count / 150), 0);
};

const request = async (path, token, body) => fetch(`${destinationBase}/api/backup/import${path}`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const run = async () => {
  const sourceRef = sourceDb.collection('users').doc(sourceUid);
  await Promise.all([
    sourceRef.collection('clients').doc('client-1').set({
      id: 'client-1', userId: sourceUid, name: 'Cliente de origem', deletedAt: null,
      role: 'mechanic', adminRoleLabel: 'service advisor', tokenizedDescription: 'commercial note',
    }),
    sourceRef.collection('clients').doc('client-old').set({ id: 'client-old', userId: sourceUid, name: 'Cliente arquivado', deletedAt: Timestamp.fromMillis(1_700_000_000_000) }),
    sourceRef.collection('products').doc('product-1').set({ id: 'product-1', userId: sourceUid, description: 'Óleo', stockQuantity: 3 }),
    sourceRef.collection('cash_launches').doc('os-paid').set({
      id: 'os-paid', userId: sourceUid, clientId: 'client-1', status: 'Finalizado', statusPagamento: 'Pago',
      paymentEntries: [{ method: 'Pix', amount: 25 }, { method: 'Crédito', amount: 10 }],
      stockMovementId: 'movement-1', stockMovementBatchId: 'batch-1',
    }),
    sourceRef.collection('cash_launches').doc('os-cancelled').set({ id: 'os-cancelled', userId: sourceUid, clientId: 'client-old', status: 'Cancelado', items: [] }),
    sourceRef.collection('stock_movements').doc('movement-1').set({
      id: 'movement-1', userId: sourceUid, cashLaunchId: 'os-paid', batchId: 'batch-1',
      productIds: ['product-1'], changes: { 'product-1': { productId: 'product-1', quantity: 1 } },
      sourceRef: sourceRef.collection('cash_launches').doc('os-paid'),
    }),
    sourceRef.collection('settings').doc('config').set({ id: 'config', userId: sourceUid, businessName: 'Oficina de origem' }),
  ]);

  const user = await signUp(`destination-admin-${Date.now()}@example.invalid`);
  const destinationUid = user.localId;
  const destinationUserRef = destinationDb.collection('users').doc(destinationUid);
  const expiresAt = Timestamp.fromMillis(Date.now() + 86_400_000);
  const destinationProfile = {
    uid: destinationUid,
    role: 'admin',
    isActive: true,
    manualAccess: { enabled: true, expiresAt },
    accessProjection: {
      allowed: true, source: 'manual', validUntil: expiresAt,
      policyVersion: 'access-v1', reason: 'manual_entitlement',
    },
    destinationMarker: 'preserve-this-profile',
  };
  await destinationUserRef.set(destinationProfile);
  await destinationAuth.setCustomUserClaims(destinationUid, { admin: true, isActive: true });
  const signedIn = await signIn(user.email);
  assert.equal(signedIn.localId, destinationUid);
  const claims = JSON.parse(Buffer.from(signedIn.idToken.split('.')[1], 'base64url').toString('utf8'));
  assert.equal(claims.aud, destinationProjectId);
  assert.equal(claims.admin, true);

  const sourceCollections = {
    clients: await readCollection(sourceRef, 'clients'),
    products: await readCollection(sourceRef, 'products'),
    cash_launches: await readCollection(sourceRef, 'cash_launches'),
    stock_movements: await readCollection(sourceRef, 'stock_movements'),
  };
  const sourceSettingsSnapshot = await sourceRef.collection('settings').doc('config').get();
  const portable = await createPortableBackupPayload({
    profileSnapshot: { uid: sourceUid, role: 'master_admin', ownerAccess: { enabled: true, permanent: true }, accessProjection: { allowed: true } },
    settings: { ...serializeFirestore(sourceSettingsSnapshot.data()), id: 'config' },
    collections: sourceCollections,
    localRecovery: { draft: { userId: sourceUid, localOnly: true } },
    excludedCollections: ['fiscal_private'],
    notes: ['Arquivado e cancelado também incluídos.'],
  }, sourceUid, '2.1.0', '2026-10-24T12:00:00.000Z', sourceProjectId);
  const encryptedFile = await encryptPortableBackup(portable, password);
  await deleteApp(sourceApp);
  sourceAppClosed = true;

  // The source app is closed before validation, preflight, or destination writes.
  const importedPayload = await decryptPortableBackup(encryptedFile, password);
  const plan = await createPortableImportPlan(importedPayload, { projectId: destinationProjectId, uid: destinationUid });
  assert.equal(plan.canImport, true, JSON.stringify(plan.issues));
  assert.equal(plan.sourceProjectId, sourceProjectId);
  assert.equal(plan.destinationProjectId, destinationProjectId);
  assert.notEqual(plan.sourceProjectId, plan.destinationProjectId);
  assert.equal(plan.excludedProfileSnapshot, true);
  assert.equal(plan.excludedLocalRecovery, true);
  const plannedClient = plan.documents.find((document) => document.collection === 'clients' && document.id === 'client-1');
  assert.equal(plannedClient.data.role, 'mechanic');
  assert.equal(plannedClient.data.adminRoleLabel, 'service advisor');
  assert.equal(plannedClient.data.tokenizedDescription, 'commercial note');

  const adapter = createFirebaseFunctionDestinationAdapter({
    projectId: destinationProjectId,
    uid: destinationUid,
    getIdToken: async () => signedIn.idToken,
    emulatorBaseUrl: destinationBase,
  });
  const preflight = await adapter.inspect(plan);
  assert.equal(preflight.writesPerformed, false);
  assert.equal(preflight.destinationAuthorized, true);
  assert.equal(preflight.targetEmpty, true);
  assert.equal((await destinationUserRef.collection('backup_imports').get()).size, 0, 'O plano de importação não grava sessão nem dados.');
  assert.equal((await destinationUserRef.collection('clients').get()).size, 0);

  let simulatedInterruption = false;
  await assert.rejects(adapter.import(plan, 'IMPORTAR NO DESTINO', (progress) => {
    if (!simulatedInterruption && progress.completed === 1) {
      simulatedInterruption = true;
      throw new Error('simulated interruption after committed checkpoint');
    }
  }), /simulated interruption/);
  const afterInterruption = await adapter.inspect(plan);
  assert.equal(afterInterruption.targetEmpty, false);
  assert.equal(afterInterruption.resumable, true);
  assert.equal(afterInterruption.importable, true, 'Uma sessão com checkpoint permite retomada após gravar parte dos dados.');
  const lockRef = destinationUserRef.collection('backup_imports').doc('_active');
  const partialLock = (await lockRef.get()).data();
  assert.equal(partialLock.status, 'running');
  assert.ok(partialLock.importId);
  await lockRef.update({ leaseExpiresAt: Timestamp.fromMillis(Date.now() - 60_000) });
  const blockedPartialPreflight = await adapter.inspect(plan);
  assert.equal(blockedPartialPreflight.importable, true, 'A sessão original retoma mesmo após expirar o prazo do bloqueio.');
  assert.equal(blockedPartialPreflight.recoveryRequired, false);
  const resumedResult = await adapter.import(plan, 'IMPORTAR NO DESTINO');
  assert.equal(resumedResult.status, 'completed');
  assert.equal(resumedResult.verified, true);
  assert.equal(resumedResult.documentsVerified, plan.totalDocuments);
  const repeatedResult = await adapter.import(plan, 'IMPORTAR NO DESTINO');
  assert.equal(repeatedResult.status, 'completed', 'Repetir o mesmo backup deve ser idempotente.');
  assert.equal(repeatedResult.verifiedPlanSha256, plan.plannedDataSha256, 'A repetição confirma o hash do plano importado.');

  const completeDestinationSnapshot = await canonicalDestinationDocuments(destinationUserRef, plan);
  assert.deepEqual(completeDestinationSnapshot, plan.documents.map(({ collection, id, data }) => ({ collection, id, data })), 'Cada documento restaurado corresponde integralmente ao plano remapeado.');
  console.log('PASS: destino vazio, retomada após interrupção, repetição idempotente e igualdade integral do plano.');

  // The exact same encrypted archive is reusable in a different empty workshop.
  const secondDestination = await makeAdminDestination(`destination-admin-second-${Date.now()}@example.invalid`);
  const secondPlan = await createPortableImportPlan(importedPayload, {
    projectId: destinationProjectId, uid: secondDestination.user.localId,
  });
  assert.equal(secondPlan.canImport, true);
  const secondResult = await secondDestination.adapter.import(secondPlan, 'IMPORTAR NO DESTINO');
  assert.equal(secondResult.status, 'completed');
  assert.equal(secondResult.verifiedPlanSha256, secondPlan.plannedDataSha256);
  const secondContent = await canonicalDestinationDocuments(secondDestination.userRef, secondPlan);
  assert.deepEqual(secondContent, secondPlan.documents.map(({ collection, id, data }) => ({ collection, id, data })), 'O arquivo reutilizado preserva conteúdo e relacionamentos com o UID remapeado.');
  assert.equal((await secondDestination.userRef.collection('clients').get()).size, 2);
  console.log('PASS: o mesmo .motofix foi restaurado em uma segunda oficina vazia sem conexão com a origem.');

  // Hold the first request after its server-side chunk commit, then try a
  // different archive/session against the same workshop while its lock is live.
  const concurrentDestination = await makeAdminDestination(`destination-admin-concurrent-${Date.now()}@example.invalid`);
  const concurrentPlan = await createPortableImportPlan(importedPayload, {
    projectId: destinationProjectId, uid: concurrentDestination.user.localId,
  });
  const competingData = structuredClone(importedPayload.data);
  competingData.collections.clients = competingData.collections.clients.map((client) => client.id === 'client-1'
    ? { ...client, name: 'Conteúdo da sessão concorrente' }
    : client);
  const competingPayload = await createPortableBackupPayload(competingData, sourceUid, '2.1.0', '2026-10-24T14:00:00.000Z', sourceProjectId);
  const competingPlan = await createPortableImportPlan(competingPayload, {
    projectId: destinationProjectId, uid: concurrentDestination.user.localId,
  });
  let releaseChunk;
  let signalChunk;
  const chunkObserved = new Promise((resolve) => { signalChunk = resolve; });
  const chunkGate = new Promise((resolve) => { releaseChunk = resolve; });
  let gated = false;
  const gatedAdapter = createFirebaseFunctionDestinationAdapter({
    projectId: destinationProjectId,
    uid: concurrentDestination.user.localId,
    getIdToken: async () => concurrentDestination.signedIn.idToken,
    emulatorBaseUrl: destinationBase,
    fetchImpl: async (url, init) => {
      const response = await fetch(url, init);
      if (!gated && new URL(url).pathname.endsWith('/chunk')) {
        gated = true;
        signalChunk();
        await chunkGate;
      }
      return response;
    },
  });
  const concurrentImport = gatedAdapter.import(concurrentPlan, 'IMPORTAR NO DESTINO');
  try {
    await chunkObserved;
    const concurrentPreflight = await concurrentDestination.adapter.inspect(competingPlan);
    assert.equal(concurrentPreflight.importable, false, 'Uma segunda sessão precisa ser bloqueada enquanto a primeira está ativa.');
    assert.ok(concurrentPreflight.activeImportId);
    await assert.rejects(
      concurrentDestination.adapter.import(competingPlan, 'IMPORTAR NO DESTINO'),
      /outra sessão|retome|destino/i,
      'O servidor deve recusar a sessão concorrente, não apenas esconder o botão na interface.',
    );
  } finally {
    releaseChunk();
  }
  const concurrentResult = await concurrentImport;
  assert.equal(concurrentResult.status, 'completed');
  assert.equal(concurrentResult.verified, true);
  console.log('PASS: uma sessão diferente foi bloqueada durante uma importação ativa; a sessão original concluiu e verificou os dados.');

  // Mutate a committed business document immediately before server read-back.
  const divergentDestination = await makeAdminDestination(`destination-admin-divergent-${Date.now()}@example.invalid`);
  const divergentPlan = await createPortableImportPlan(importedPayload, {
    projectId: destinationProjectId, uid: divergentDestination.user.localId,
  });
  let injectedDivergence = false;
  const divergenceAdapter = createFirebaseFunctionDestinationAdapter({
    projectId: destinationProjectId,
    uid: divergentDestination.user.localId,
    getIdToken: async () => divergentDestination.signedIn.idToken,
    emulatorBaseUrl: destinationBase,
    fetchImpl: async (url, init) => {
      if (!injectedDivergence && new URL(url).pathname.endsWith('/finalize')) {
        injectedDivergence = true;
        await divergentDestination.userRef.collection('clients').doc('client-1').update({ name: 'Divergência injetada no teste' });
      }
      return fetch(url, init);
    },
  });
  await assert.rejects(
    divergenceAdapter.import(divergentPlan, 'IMPORTAR NO DESTINO'),
    /verifica|igualdade integral|conteúdo/i,
    'A restauração deve falhar se o conteúdo no destino divergir do plano esperado.',
  );
  assert.equal(injectedDivergence, true);
  const divergentSessions = (await divergentDestination.userRef.collection('backup_imports').get()).docs
    .filter((item) => item.id !== '_active');
  assert.ok(divergentSessions.some((item) => ['verification_failed', 'recovery_required'].includes(item.data().status)));
  console.log('PASS: divergência posterior à gravação foi detectada na verificação final e a sessão ficou protegida para recuperação.');

  const conflictingData = structuredClone(importedPayload.data);
  conflictingData.collections.clients = conflictingData.collections.clients.map((client) => client.id === 'client-1'
    ? { ...client, name: 'Alteração incompatível no arquivo' }
    : client);
  const conflictingPayload = await createPortableBackupPayload(
    conflictingData,
    sourceUid,
    '2.1.0',
    '2026-10-24T13:00:00.000Z',
    sourceProjectId,
  );
  const conflictingPlan = await createPortableImportPlan(conflictingPayload, {
    projectId: destinationProjectId,
    uid: destinationUid,
  });
  const conflictPreflight = await adapter.inspect(conflictingPlan);
  assert.equal(conflictPreflight.importable, false, 'Um arquivo diferente não pode misturar ou sobrescrever os dados existentes.');
  await assert.rejects(adapter.import(conflictingPlan, 'IMPORTAR NO DESTINO'), /contém dados|conflito/i);
  assert.equal((await destinationUserRef.collection('clients').doc('client-1').get()).data().name, 'Cliente de origem');

  const importedClients = await destinationUserRef.collection('clients').get();
  assert.equal(importedClients.size, 2);
  assert.ok(importedClients.docs.find((item) => item.id === 'client-old').data().deletedAt, 'Histórico de exclusão lógica foi preservado.');
  const importedPaid = (await destinationUserRef.collection('cash_launches').doc('os-paid').get()).data();
  assert.equal(importedPaid.status, 'Finalizado');
  assert.equal(importedPaid.paymentEntries.length, 2);
  assert.equal(importedPaid.userId, destinationUid);
  const importedCancelled = (await destinationUserRef.collection('cash_launches').doc('os-cancelled').get()).data();
  assert.equal(importedCancelled.status, 'Cancelado');
  const importedMovement = (await destinationUserRef.collection('stock_movements').doc('movement-1').get()).data();
  assert.equal(importedMovement.userId, destinationUid);
  assert.equal(importedMovement.sourceRef.path, `users/${destinationUid}/cash_launches/os-paid`);
  const importedSettings = (await destinationUserRef.collection('settings').doc('config').get()).data();
  assert.equal(importedSettings.businessName, 'Oficina de origem');
  assert.equal(importedSettings.userId, destinationUid);
  assert.equal((await destinationUserRef.collection('clients').get()).size, 2, 'A repetição não duplicou documentos.');

  const destinationProfileAfter = (await destinationUserRef.get()).data();
  assert.equal(destinationProfileAfter.role, 'admin');
  assert.equal(destinationProfileAfter.destinationMarker, 'preserve-this-profile');
  assert.equal(destinationProfileAfter.ownerAccess, undefined, 'O perfil e os privilégios do backup não foram importados.');
  assert.equal(destinationProfileAfter.accessProjection.allowed, true);
  assert.equal((await destinationUserRef.collection('backup_imports').get()).size, 1);
  const audit = (await destinationUserRef.collection('backup_imports').get()).docs[0].data();
  assert.equal(audit.sourceWorkshopId, sourceUid);
  assert.equal(audit.sourceProjectId, sourceProjectId);
  assert.equal(audit.destinationProjectId, destinationProjectId);
  assert.equal(audit.destinationUid, destinationUid);
  assert.equal(audit.actorUid, destinationUid);
  assert.equal(audit.status, 'completed');
  assert.equal(audit.profileSnapshotImported, false);
  assert.equal(audit.permissionsImported, false);

  // Exercise destination Firestore rules using the Firebase client SDK, not Admin SDK.
  destinationClientApp = initializeClientApp({
    projectId: destinationProjectId,
    apiKey: 'fake-api-key',
    authDomain: destinationProjectId + '.firebaseapp.com',
    appId: '1:123456789:web:abcdef123456',
  }, 'rules-client-' + Date.now());
  const clientAuth = initializeAuth(destinationClientApp, { persistence: inMemoryPersistence });
  connectAuthEmulator(clientAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const clientDb = getClientFirestore(destinationClientApp);
  connectFirestoreEmulator(clientDb, '127.0.0.1', 8080);
  const signedInClient = await signInWithEmailAndPassword(clientAuth, user.email, password);
  await signedInClient.user.getIdToken(true);
  const ownClientSnapshot = await getDoc(clientDoc(clientDb, 'users', destinationUid, 'clients', 'client-1'));
  assert.equal(ownClientSnapshot.exists(), true, 'A conta do destino pode ler os dados restaurados pelas regras atuais.');
  assert.equal(ownClientSnapshot.data().userId, destinationUid);
  const foreignClientPath = clientDoc(clientDb, 'users', 'another-workshop-test', 'clients', 'private-client');
  await destinationDb.doc('users/another-workshop-test/clients/private-client').set({ userId: 'another-workshop-test', name: 'private' });
  await assert.rejects(getDoc(foreignClientPath), (error) => error.code === 'permission-denied', 'A identidade de destino não pode ler outra oficina.');
  await assert.rejects(
    setDoc(clientDoc(clientDb, 'users', 'another-workshop-test', 'clients', 'injected'), { userId: 'another-workshop-test', name: 'injected' }),
    (error) => error.code === 'permission-denied',
    'A identidade de destino não pode gravar diretamente em outra oficina.',
  );

  const corsPreflight = await fetch(destinationBase + '/api/backup/import/plan', {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://appmotofix.web.app',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'authorization,content-type',
    },
  });
  assert.equal(corsPreflight.status, 204);
  assert.equal(corsPreflight.headers.get('access-control-allow-origin'), 'https://appmotofix.web.app', 'A API permite a origem oficial sem wildcard.');
  const deniedCors = await fetch(destinationBase + '/api/backup/import/plan', {
    method: 'OPTIONS',
    headers: { Origin: 'https://untrusted.example', 'Access-Control-Request-Method': 'POST' },
  });
  assert.equal(deniedCors.headers.get('access-control-allow-origin'), null, 'A API não libera CORS para origens arbitrárias.');

  const deniedUser = await signUp(`destination-nonadmin-${Date.now()}@example.invalid`);
  const deniedExpiry = Timestamp.fromMillis(Date.now() + 86_400_000);
  await destinationDb.collection('users').doc(deniedUser.localId).set({
    uid: deniedUser.localId, role: 'user', isActive: true,
    manualAccess: { enabled: true, expiresAt: deniedExpiry },
    accessProjection: { allowed: true, source: 'manual', validUntil: deniedExpiry },
  });
  const deniedSignedIn = await signIn(deniedUser.email);
  const deniedPlanResponse = await request('/plan', deniedSignedIn.idToken, {
    sourceWorkshopId: sourceUid, sourceProjectId, dataSha256: plan.dataSha256, counts: plan.counts,
  });
  assert.equal(deniedPlanResponse.status, 403, 'Identidade sem perfil/claim de admin no destino não pode planejar importação.');

  const unknownCollectionAdmin = await signUp('destination-unknown-' + Date.now() + '@example.invalid');
  const unknownExpiry = Timestamp.fromMillis(Date.now() + 86_400_000);
  const unknownDestinationRef = destinationDb.collection('users').doc(unknownCollectionAdmin.localId);
  await unknownDestinationRef.set({
    uid: unknownCollectionAdmin.localId,
    role: 'admin',
    isActive: true,
    manualAccess: { enabled: true, expiresAt: unknownExpiry },
    accessProjection: { allowed: true, source: 'manual', validUntil: unknownExpiry },
  });
  await destinationAuth.setCustomUserClaims(unknownCollectionAdmin.localId, { admin: true });
  const unknownSignedIn = await signIn(unknownCollectionAdmin.email);
  await unknownDestinationRef.collection('legacy_collection').doc('legacy-record').set({ retained: true });
  const unknownAdapter = createFirebaseFunctionDestinationAdapter({
    projectId: destinationProjectId,
    uid: unknownCollectionAdmin.localId,
    getIdToken: async () => unknownSignedIn.idToken,
    emulatorBaseUrl: destinationBase,
  });
  const unknownDestinationPlan = await createPortableImportPlan(importedPayload, {
    projectId: destinationProjectId,
    uid: unknownCollectionAdmin.localId,
  });
  const unknownPreflight = await unknownAdapter.inspect(unknownDestinationPlan);
  assert.equal(unknownPreflight.importable, false, 'Uma coleção inesperada com dados também impede mistura.');
  assert.equal(unknownPreflight.otherCollectionCounts.legacy_collection, 1);

  const forbiddenChunk = await request('/chunk', signedIn.idToken, {
    importId: 'a'.repeat(64), sourceWorkshopId: sourceUid, sourceProjectId, dataSha256: plan.dataSha256,
    chunkIndex: 0, collection: 'clients', documents: [{ id: 'forbidden', userId: destinationUid, ownerAccess: { permanent: true } }],
  });
  assert.equal(forbiddenChunk.status, 400, 'A API rejeita campos de privilégio no lote de negócio.');
  console.log(`Cross-project backup import emulator test passed: ${sourceProjectId} -> ${destinationProjectId}; ${plan.totalDocuments} verified documents.`);
};

try {
  await run();
} finally {
  if (!sourceAppClosed) await deleteApp(sourceApp).catch(() => {});
  if (destinationClientApp) await deleteClientApp(destinationClientApp).catch(() => {});
  await deleteApp(destinationApp);
}
