import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';

const projectId = process.env.GCLOUD_PROJECT || 'motofix-portable-backup-test';
const app = initializeApp({ projectId }, `backup-integration-${Date.now()}`);
const auth = getAuth(app);
const db = getFirestore(app);
const functionBase = `http://127.0.0.1:5001/${projectId}/us-central1/backupApi`;
const apiBase = `${functionBase}/api/backup`;
const authBase = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';

const signUp = async () => {
  const email = `backup-test-${Date.now()}@example.invalid`;
  const response = await fetch(`${authBase}/accounts:signUp?key=fake-api-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password: 'portable-backup-test-password',
      returnSecureToken: true,
    }),
  });
  const result = await response.json();
  assert.equal(response.ok, true, JSON.stringify(result));
  return { ...result, email };
};

const signInWithCustomToken = async (customToken) => {
  const response = await fetch(`${authBase}/accounts:signInWithCustomToken?key=fake-api-key`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  });
  const result = await response.json();
  assert.equal(response.ok, true, JSON.stringify(result));
  return result;
};

const request = async (path, idToken, init = {}) => fetch(`${apiBase}${path}`, {
  ...init,
  headers: {
    ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    Authorization: `Bearer ${idToken}`,
    ...init.headers,
  },
});

const readJson = async (response) => {
  const text = await response.text();
  let result;
  try { result = JSON.parse(text); } catch { throw new Error(`Expected JSON response, got HTTP ${response.status}: ${text.slice(0, 300)}`); }
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${JSON.stringify(result)}`);
  return result;
};

const run = async () => {
  const signedIn = await signUp();
  const uid = signedIn.localId;
  const idToken = (await signInWithCustomToken(await auth.createCustomToken(uid, { admin: true }))).idToken;
  const idTokenClaims = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString('utf8'));
  assert.equal(idTokenClaims.admin, true, `Admin custom claim should be present: ${JSON.stringify(idTokenClaims)}`);
  const userRef = db.collection('users').doc(uid);
  const expiry = Timestamp.fromMillis(Date.now() + 86_400_000);
  await userRef.set({
    email: signedIn.email,
    displayName: 'Backup test',
    role: 'admin',
    isActive: true,
    manualAccess: { enabled: true, expiresAt: expiry },
    accessProjection: {
      allowed: true,
      source: 'manual',
      validUntil: expiry,
      policyVersion: 'access-v1',
      reason: 'manual_entitlement',
    },
    billing: { stripeCustomerId: 'must-not-be-exported' },
  });

  const clients = userRef.collection('clients');
  const orders = userRef.collection('cash_launches');
  const products = userRef.collection('products');
  const movements = userRef.collection('stock_movements');
  await Promise.all([
    clients.doc('client-1').set({ id: 'client-1', name: 'Cliente de teste', userId: uid, deletedAt: null }),
    clients.doc('client-extra').set({ id: 'client-extra', name: 'Preservar no destino', deletedAt: Timestamp.now(), userId: uid }),
    orders.doc('os-open').set({ id: 'os-open', clientId: 'client-1', status: 'Pendente', isInvoiced: false, userId: uid }),
    orders.doc('os-paid').set({ id: 'os-paid', clientId: 'client-1', status: 'Finalizada', statusPagamento: 'Pago', paymentEntries: [{ method: 'Débito', amount: 4 }, { method: 'Crédito', amount: 6 }], userId: uid }),
    orders.doc('os-cancelled').set({ id: 'os-cancelled', clientId: 'client-1', status: 'Cancelada', userId: uid }),
    products.doc('product-1').set({ id: 'product-1', name: 'Óleo teste', stock: 4, userId: uid }),
    movements.doc('movement-1').set({ id: 'movement-1', cashLaunchId: 'os-paid', productId: 'product-1', quantity: 1, userId: uid }),
    userRef.collection('settings').doc('config').set({ businessName: 'Oficina de teste', address: 'Rua teste', userId: uid }),
    userRef.collection('operational_logs').doc('log-1').set({ id: 'log-1', action: 'os_finalizada', timestamp: Timestamp.now(), userId: uid }),
    userRef.collection('fiscal_invoice_files').doc('file-1').set({ id: 'file-1', invoiceId: 'invoice-1', contentBase64: 'dGVzdC1maWxl', userId: uid }),
    userRef.collection('fiscal_private').doc('secret').set({ apiToken: 'must-not-be-exported' }),
  ]);

  const noAuth = await request('/full?meta=1', '');
  assert.equal(noAuth.status, 401, 'A API precisa exigir autenticação Firebase.');

  const metaResponse = await request('/full?meta=1', idToken);
  assert.equal(metaResponse.status, 200, await metaResponse.clone().text());
  const meta = await readJson(metaResponse);
  assert.equal(meta.version, 2);
  assert.equal(meta.settings.businessName, 'Oficina de teste');
  assert.equal(meta.collections.includes('cash_launches'), true);
  assert.equal(meta.excludedCollections.includes('fiscal_private'), true);
  assert.equal(JSON.stringify(meta).includes('must-not-be-exported'), false);
  assert.equal(JSON.stringify(meta.profileSnapshot).includes('stripeCustomerId'), false);

  const crossOfficeExport = await request(`/full?meta=1&workshopId=another-test-office`, idToken);
  assert.equal(crossOfficeExport.status, 403, 'Um administrador não pode escolher outra oficina como origem.');

  const createAccount = async ({ email, role, isActive = true, access = true, claims = {}, uid: fixedUid }) => {
    const created = fixedUid
      ? await auth.createUser({ uid: fixedUid, email, password: 'backup-test-password' })
      : (await fetch(`${authBase}/accounts:signUp?key=fake-api-key`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'backup-test-password', returnSecureToken: true }),
      }).then((response) => response.json()));
    const accountUid = fixedUid || created.localId;
    const expiryForAccount = Timestamp.fromMillis(Date.now() + 86_400_000);
    await db.collection('users').doc(accountUid).set({
      role, isActive,
      manualAccess: { enabled: access, expiresAt: expiryForAccount },
      accessProjection: access ? { allowed: true, source: 'manual', validUntil: expiryForAccount } : { allowed: false, source: 'none', validUntil: null },
      ...(role === 'master_admin' ? { ownerAccess: { enabled: true, permanent: true } } : {}),
    });
    const tokenBody = await signInWithCustomToken(await auth.createCustomToken(accountUid, claims));
    return { uid: accountUid, idToken: tokenBody.idToken };
  };

  const ordinaryUser = await createAccount({
    email: `backup-common-${Date.now()}@example.invalid`, role: 'employee', claims: {},
  });
  assert.equal((await request('/full?meta=1', ordinaryUser.idToken)).status, 403, 'Usuário ativo sem papel admin não exporta.');
  const disabledAdmin = await createAccount({
    email: `backup-disabled-${Date.now()}@example.invalid`, role: 'admin', isActive: false, claims: { admin: true },
  });
  assert.equal((await request('/full?meta=1', disabledAdmin.idToken)).status, 403, 'Perfil desativado não exporta.');
  const noEntitlementAdmin = await createAccount({
    email: `backup-no-access-${Date.now()}@example.invalid`, role: 'admin', access: false, claims: { admin: true },
  });
  assert.equal((await request('/full?meta=1', noEntitlementAdmin.idToken)).status, 403, 'Administrador sem acesso vigente não exporta.');
  const owner = await createAccount({
    uid: 'o5XNtNFwKMQzZj28WfTEiGSFN0A3',
    email: `backup-owner-${Date.now()}@example.invalid`, role: 'master_admin', access: false,
    claims: { admin: true, master_admin: true, motofix_owner: true },
  });
  const ownerMeta = await request('/full?meta=1', owner.idToken);
  assert.equal(ownerMeta.status, 200, 'Proprietário permanente já autorizado deve conseguir exportar.');

  const sourceSignatureBefore = await readJson(await request('/full?signature=1', idToken));
  assert.match(sourceSignatureBefore.dataSha256, /^[a-f0-9]{64}$/);
  assert.equal(sourceSignatureBefore.counts.clients, 2);
  await clients.doc('client-1').update({ name: 'Cliente editado durante teste de estabilidade' });
  const sourceSignatureAfter = await readJson(await request('/full?signature=1', idToken));
  assert.notEqual(sourceSignatureAfter.dataSha256, sourceSignatureBefore.dataSha256, 'A assinatura precisa detectar uma edição entre leituras.');
  await clients.doc('client-1').update({ name: 'Cliente de teste' });

  const clientsPageResponse = await request('/full?collection=clients', idToken);
  assert.equal(clientsPageResponse.status, 200);
  const clientsPage = await readJson(clientsPageResponse);
  assert.equal(clientsPage.documents.length, 2);
  assert.deepEqual(clientsPage.documents.map((record) => record.id).sort(), ['client-1', 'client-extra']);
  assert.ok(clientsPage.documents.find((record) => record.id === 'client-extra').deletedAt, 'Registros excluídos logicamente também são exportados.');
  const orderPageResponse = await request('/full?collection=cash_launches', idToken);
  assert.equal(orderPageResponse.status, 200);
  const orderPage = await readJson(orderPageResponse);
  assert.deepEqual(orderPage.documents.map((record) => record.status).sort(), ['Cancelada', 'Finalizada', 'Pendente']);
  assert.equal(orderPage.documents.find((record) => record.id === 'os-paid').paymentEntries.length, 2);
  const attachmentPage = await readJson(await request('/full?collection=fiscal_invoice_files', idToken));
  assert.equal(attachmentPage.documents[0].contentBase64, 'dGVzdC1maWxl');

  const ids = Object.fromEntries(meta.collections.map((name) => [name, []]));
  ids.clients = ['client-1'];
  ids.cash_launches = ['os-open', 'os-paid', 'os-cancelled'];
  ids.products = ['product-1'];
  ids.stock_movements = ['movement-1'];
  ids.settings = ['config'];
  const crossOfficePreflight = await request('/full/preflight', idToken, {
    method: 'POST', body: JSON.stringify({ sourceWorkshopId: 'another-workshop', ids }),
  });
  assert.equal(crossOfficePreflight.status, 409, 'O servidor bloqueia restauração cruzada entre oficinas.');
  const preflightResponse = await request('/full/preflight', idToken, {
    method: 'POST', body: JSON.stringify({ sourceWorkshopId: uid, ids }),
  });
  assert.equal(preflightResponse.status, 200);
  const preflight = await readJson(preflightResponse);
  assert.equal(preflight.target, 'existing');
  assert.equal(preflight.deletesNothing, true);
  assert.equal(preflight.conflictCounts.clients, 1);
  assert.equal(preflight.currentCounts.clients, 2);

  const restoreRecord = {
    id: 'client-1',
    name: 'Restaurado pelo arquivo',
    userId: 'source-user-must-be-replaced',
    createdAt: { __motofixType: 'timestamp', seconds: 1_800_000_000, nanoseconds: 0 },
  };
  const restoreBody = JSON.stringify({ confirmation: 'RESTAURAR', sourceWorkshopId: uid, collection: 'clients', documents: [restoreRecord] });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const restoreResponse = await request('/full/restore-chunk', idToken, { method: 'POST', body: restoreBody });
    assert.equal(restoreResponse.status, 200);
    assert.equal((await readJson(restoreResponse)).restored, 1);
  }
  const restored = (await clients.doc('client-1').get()).data();
  assert.equal(restored.name, 'Restaurado pelo arquivo');
  assert.equal(restored.userId, uid);
  assert.equal(restored.id, 'client-1');
  assert.equal(restored.createdAt.toMillis(), 1_800_000_000_000);
  assert.equal((await clients.doc('client-extra').get()).exists, true, 'Documentos extras não devem ser apagados.');
  const blockedCrossOfficeRestore = await request('/full/restore-chunk', idToken, {
    method: 'POST', body: JSON.stringify({ confirmation: 'RESTAURAR', sourceWorkshopId: 'another-workshop', collection: 'clients', documents: [restoreRecord] }),
  });
  assert.equal(blockedCrossOfficeRestore.status, 409, 'O servidor bloqueia lote de restauração de outra oficina.');

  const invalid = await request('/full/restore-chunk', idToken, {
    method: 'POST', body: JSON.stringify({ confirmation: 'RESTAURAR', sourceWorkshopId: uid, collection: 'clients', documents: [{ id: '../invalid' }] }),
  });
  assert.equal(invalid.status, 400, 'IDs de caminho inválidos precisam ser recusados.');
  console.log('Backup Function emulator integration passed: admin and owner allowed; common, disabled, no-entitlement, and cross-office requests denied.');
};

try {
  await run();
} finally {
  await deleteApp(app);
}
