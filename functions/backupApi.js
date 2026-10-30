const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const crypto = require('node:crypto');
const { FieldPath, GeoPoint, Timestamp } = require('firebase-admin/firestore');
const { createFirestoreBackupDestinationAdapter } = require('./backupImportDestination');

const FULL_BACKUP_FORMAT = 'motofix-full-backup';
const RESTORE_CONFIRMATION = 'RESTAURAR';
const PAGE_SIZE = 20;
const MAX_RESTORE_DOCUMENTS_PER_REQUEST = 150;
const COLLECTIONS = [
  'clients', 'maintenances', 'warranties', 'appointments', 'expenses', 'products',
  'stock_movements', 'cash_launches', 'message_logs', 'operational_logs',
  'fiscal_companies', 'fiscal_invoices', 'fiscal_logs', 'fiscal_invoice_files',
  'whatsapp_sessions', 'whatsapp_messages', 'whatsapp_contacts', 'whatsapp_automations',
];
const EXCLUDED_COLLECTIONS = ['fiscal_private'];
const RESTORE_COLLECTIONS = [...COLLECTIONS, 'settings'];
const ALLOWED_BROWSER_ORIGINS = new Set([
  'https://appmotofix.web.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  ...(process.env.BACKUP_ALLOWED_ORIGINS || '').split(',').map((origin) => origin.trim()).filter(Boolean),
]);

const applyBackupApiCors = (req, res) => {
  const origin = String(req.headers.origin || '');
  if (!ALLOWED_BROWSER_ORIGINS.has(origin)) return false;
  res.set('Access-Control-Allow-Origin', origin);
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Max-Age', '600');
  res.set('Vary', 'Origin');
  return true;
};

const safeProfile = (profile, uid) => {
  if (!profile) return null;
  const subscription = profile.subscription && typeof profile.subscription === 'object'
    ? profile.subscription
    : {};
  return {
    uid,
    email: typeof profile.email === 'string' ? profile.email : null,
    displayName: typeof profile.displayName === 'string' ? profile.displayName : null,
    role: typeof profile.role === 'string' ? profile.role : null,
    isActive: profile.isActive === true,
    createdAt: serializeFirestoreValue(profile.createdAt),
    subscription: {
      plan: typeof subscription.plan === 'string' ? subscription.plan : null,
      status: typeof subscription.status === 'string' ? subscription.status : null,
      currentPeriodEnd: serializeFirestoreValue(subscription.currentPeriodEnd),
      expiresAt: serializeFirestoreValue(subscription.expiresAt),
      autoRenew: typeof subscription.autoRenew === 'boolean' ? subscription.autoRenew : null,
    },
  };
};

const serializeFirestoreValue = (value) => {
  if (value === null || value === undefined || typeof value !== 'object') return value;
  if (value instanceof Date) return { __motofixType: 'date', value: value.toISOString() };
  if (Buffer.isBuffer(value)) {
    return { __motofixType: 'bytes', base64: value.toString('base64') };
  }
  if (typeof value.toMillis === 'function' && Number.isFinite(value.seconds) && Number.isFinite(value.nanoseconds)) {
    return { __motofixType: 'timestamp', seconds: value.seconds, nanoseconds: value.nanoseconds };
  }
  if (typeof value.latitude === 'number' && typeof value.longitude === 'number') {
    return { __motofixType: 'geopoint', latitude: value.latitude, longitude: value.longitude };
  }
  if (typeof value.path === 'string' && typeof value.id === 'string') {
    return { __motofixType: 'document-reference', path: value.path };
  }
  if (Array.isArray(value)) return value.map(serializeFirestoreValue);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serializeFirestoreValue(item)]));
};

const deserializeFirestoreValue = (value) => {
  if (Array.isArray(value)) return value.map(deserializeFirestoreValue);
  if (!value || typeof value !== 'object') return value;
  if (value.__motofixType === 'timestamp'
    && Number.isInteger(value.seconds)
    && Number.isInteger(value.nanoseconds)) {
    return new Timestamp(value.seconds, value.nanoseconds);
  }
  if (value.__motofixType === 'date' && typeof value.value === 'string') {
    const date = new Date(value.value);
    if (Number.isFinite(date.getTime())) return date;
  }
  if (value.__motofixType === 'bytes' && typeof value.base64 === 'string') {
    return Buffer.from(value.base64, 'base64');
  }
  if (value.__motofixType === 'geopoint'
    && typeof value.latitude === 'number' && typeof value.longitude === 'number') {
    return new GeoPoint(value.latitude, value.longitude);
  }
  if (value.__motofixType === 'document-reference' && typeof value.path === 'string') {
    const segments = value.path.split('/').filter(Boolean);
    if (segments.length % 2 === 0) return admin.firestore().doc(value.path);
    throw new Error('Referência inválida encontrada no arquivo de backup.');
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, deserializeFirestoreValue(item)]));
};

const accessAllowed = async (_db, uid, profile) => {
  if (!profile || profile.isActive !== true) return false;
  if (uid === 'o5XNtNFwKMQzZj28WfTEiGSFN0A3'
    && profile.role === 'master_admin'
    && profile.ownerAccess?.enabled === true
    && profile.ownerAccess?.permanent === true) return true;

  const access = profile.manualAccess;
  const expiry = access?.enabled === true ? toMillis(access.expiresAt) : null;
  if (expiry === null || expiry <= Date.now()) return false;
  const projectionExpiry = toMillis(profile.accessProjection?.validUntil);
  return profile.accessProjection?.allowed === true
    && profile.accessProjection?.source === 'manual'
    && projectionExpiry === expiry;
};

const toMillis = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const result = Date.parse(value);
    return Number.isFinite(result) ? result : null;
  }
  if (value && typeof value.toMillis === 'function') {
    const result = value.toMillis();
    return Number.isFinite(result) ? result : null;
  }
  if (value && typeof value.toDate === 'function') {
    const result = value.toDate().getTime();
    return Number.isFinite(result) ? result : null;
  }
  return null;
};

const sendError = (res, status, message) => res.status(status).json({ error: message });

const authenticate = async (req, res) => {
  const authorization = String(req.headers.authorization || '');
  if (!authorization.startsWith('Bearer ')) {
    sendError(res, 401, 'Sessão Firebase ausente. Entre novamente para criar ou restaurar o backup.');
    return null;
  }
  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(authorization.slice(7));
  } catch {
    sendError(res, 401, 'A sessão Firebase expirou ou é inválida. Entre novamente.');
    return null;
  }
  const profileSnapshot = await admin.firestore().collection('users').doc(decoded.uid).get();
  const profile = profileSnapshot.exists ? profileSnapshot.data() : null;
  if (!(await accessAllowed(admin.firestore(), decoded.uid, profile))) {
    sendError(res, 403, 'A conta não possui acesso ativo ao MotoFix para executar backup ou restauração.');
    return null;
  }
  return { uid: decoded.uid, profile, claims: decoded };
};

const assertDestinationWorkshopAdmin = (user, res) => {
  if (user.claims.admin !== true || user.profile.role !== 'admin' || user.profile.isActive !== true) {
    sendError(res, 403, 'A restauração exige um administrador ativo autenticado no projeto Firebase de destino.');
    return false;
  }
  return true;
};

const createDestinationAdapter = (user) => createFirestoreBackupDestinationAdapter({
  db: admin.firestore(),
  projectId: process.env.GCLOUD_PROJECT || admin.app().options.projectId,
  uid: user.uid,
  actorUid: user.uid,
});

const safeDoc = (snapshot) => ({
  ...serializeFirestoreValue(snapshot.data() || {}),
  id: snapshot.id,
});

const stableJson = (value) => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    // The API's JSON serialization drops undefined object properties.
    return `{${Object.keys(value).filter((key) => value[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
};

const readSourceSnapshot = async (uid, profile) => {
  const userRef = admin.firestore().collection('users').doc(uid);
  const settingsSnapshot = await userRef.collection('settings').doc('config').get();
  const collections = {};
  for (const collectionName of COLLECTIONS) {
    const snapshot = await userRef.collection(collectionName).orderBy(FieldPath.documentId()).get();
    collections[collectionName] = snapshot.docs.map(safeDoc);
  }
  return {
    profileSnapshot: safeProfile(profile, uid),
    settings: settingsSnapshot.exists ? safeDoc(settingsSnapshot) : null,
    collections,
  };
};

const handleSourceSignature = async (res, uid, profile) => {
  // This route is intentionally called only as part of an explicit full backup.
  // Its extra reads provide a before/after stability check, not an atomic snapshot.
  const sourceSnapshot = await readSourceSnapshot(uid, profile);
  const dataSha256 = crypto.createHash('sha256').update(stableJson(sourceSnapshot)).digest('hex');
  return res.status(200).json({ dataSha256, counts: Object.fromEntries([
    ...Object.entries(sourceSnapshot.collections).map(([name, documents]) => [name, documents.length]),
    ['settings', sourceSnapshot.settings ? 1 : 0],
  ]) });
};

const handleMeta = async (res, uid, profile) => {
  const userRef = admin.firestore().collection('users').doc(uid);
  const settingsSnapshot = await userRef.collection('settings').doc('config').get();
  const settings = settingsSnapshot.exists ? safeDoc(settingsSnapshot) : null;
  return res.status(200).json({
    format: FULL_BACKUP_FORMAT,
    version: 2,
    exportedAt: new Date().toISOString(),
    sourceProjectId: process.env.GCLOUD_PROJECT || admin.app().options.projectId || null,
    owner: { uid },
    profileSnapshot: safeProfile(profile, uid),
    settings,
    collections: COLLECTIONS,
    excludedCollections: EXCLUDED_COLLECTIONS,
    notes: [
      'O arquivo exporta os documentos atuais, inclusive os marcados como excluídos logicamente, cancelados ou arquivados.',
      'A coleção fiscal_private, que pode conter credenciais privadas de integração, é excluída e deve ser configurada novamente em outra instalação.',
      'Os anexos encontrados nesta versão estão embutidos nos documentos exportados. Nenhuma integração de Firebase Storage foi encontrada no código do MotoFix.',
      'Contas de Firebase Authentication, senhas, claims, funções administrativas globais e estado de cobrança não são restaurados pelo arquivo da oficina.',
    ],
  });
};

const handleCollectionPage = async (res, uid, collectionName, cursor) => {
  if (!COLLECTIONS.includes(collectionName)) return sendError(res, 400, 'Coleção não permitida para exportação.');
  const collectionRef = admin.firestore().collection('users').doc(uid).collection(collectionName);
  let query = collectionRef.orderBy(FieldPath.documentId()).limit(PAGE_SIZE);
  if (cursor) query = query.startAfter(cursor);
  const snapshot = await query.get();
  const documents = snapshot.docs.map(safeDoc);
  return res.status(200).json({
    collection: collectionName,
    documents,
    nextCursor: snapshot.size === PAGE_SIZE ? snapshot.docs[snapshot.docs.length - 1].id : null,
  });
};

const validateIdList = (ids) => Array.isArray(ids)
  && ids.length <= 100000
  && ids.every((id) => typeof id === 'string' && id.length > 0 && id.length <= 1500 && !id.includes('/'));

const handlePreflight = async (req, res, uid) => {
  if (req.body?.sourceWorkshopId !== uid) return sendError(res, 409, 'O backup pertence a outra oficina/conta. A migração entre oficinas não está habilitada.');
  const input = req.body && req.body.ids && typeof req.body.ids === 'object' ? req.body.ids : null;
  if (!input) return sendError(res, 400, 'Resumo de restauração inválido.');
  const currentCounts = {};
  const conflictCounts = {};
  const db = admin.firestore();
  for (const collectionName of RESTORE_COLLECTIONS) {
    const ids = input[collectionName] || [];
    if (!validateIdList(ids)) return sendError(res, 400, `Lista de identificadores inválida em ${collectionName}.`);
    const ref = db.collection('users').doc(uid).collection(collectionName);
    const countSnapshot = await ref.count().get();
    currentCounts[collectionName] = countSnapshot.data().count;
    let conflicts = 0;
    for (let offset = 0; offset < ids.length; offset += 300) {
      const refs = ids.slice(offset, offset + 300).map((id) => ref.doc(id));
      if (!refs.length) continue;
      const snapshots = await db.getAll(...refs);
      conflicts += snapshots.filter((snapshot) => snapshot.exists).length;
    }
    conflictCounts[collectionName] = conflicts;
  }
  const totalExisting = Object.values(currentCounts).reduce((sum, count) => sum + count, 0);
  return res.status(200).json({
    target: totalExisting === 0 ? 'empty' : 'existing',
    currentCounts,
    conflictCounts,
    totalExisting,
    mode: 'safe-merge',
    deletesNothing: true,
    warning: 'IDs do backup que já existirem serão substituídos; documentos extras no destino serão preservados.',
  });
};

const handleRestoreChunk = async (req, res, uid) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const collectionName = body.collection;
  const documents = body.documents;
  if (body.confirmation !== RESTORE_CONFIRMATION) return sendError(res, 400, 'Confirmação de restauração inválida.');
  if (body.sourceWorkshopId !== uid) return sendError(res, 409, 'O backup pertence a outra oficina/conta. A migração entre oficinas não está habilitada.');
  if (!RESTORE_COLLECTIONS.includes(collectionName)) return sendError(res, 400, 'Coleção não permitida para restauração.');
  if (!Array.isArray(documents) || documents.length > MAX_RESTORE_DOCUMENTS_PER_REQUEST) {
    return sendError(res, 400, 'Lote de restauração inválido ou acima do limite.');
  }
  const db = admin.firestore();
  const batch = db.batch();
  const ids = new Set();
  for (const raw of documents) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)
      || typeof raw.id !== 'string' || !raw.id || raw.id.includes('/') || raw.id.length > 1500) {
      return sendError(res, 400, 'Documento ou identificador inválido no lote.');
    }
    if (ids.has(raw.id)) return sendError(res, 400, 'O lote contém identificadores repetidos.');
    if (collectionName === 'settings' && raw.id !== 'config') return sendError(res, 400, 'A configuração precisa manter o identificador config.');
    ids.add(raw.id);
    const data = { ...raw };
    if (collectionName === 'settings') delete data.id;
    else data.id = raw.id;
    if (collectionName !== 'settings') data.userId = uid;
    const reference = db.collection('users').doc(uid).collection(collectionName).doc(raw.id);
    batch.set(reference, deserializeFirestoreValue(data));
  }
  await batch.commit();
  return res.status(200).json({ restored: documents.length, collection: collectionName });
};

exports.backupApi = onRequest({
  region: 'us-central1',
  memory: '1GiB',
  timeoutSeconds: 540,
  maxInstances: 3,
  cors: false,
}, async (req, res) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Cache-Control', 'no-store');
  applyBackupApiCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    const user = await authenticate(req, res);
    if (!user) return;
    const pathname = String(req.path || '');
    if (pathname.endsWith('/import/plan') || pathname.endsWith('/import/start')
      || pathname.endsWith('/import/chunk') || pathname.endsWith('/import/finalize')) {
      if (req.method !== 'POST') return sendError(res, 405, 'Método não permitido.');
      if (!assertDestinationWorkshopAdmin(user, res)) return;
      const adapter = createDestinationAdapter(user);
      if (pathname.endsWith('/import/plan')) {
        const result = await adapter.preflight(req.body || {});
        return res.status(200).json(result);
      }
      if (pathname.endsWith('/import/start')) {
        const result = await adapter.start(req.body || {});
        return res.status(200).json(result);
      }
      if (pathname.endsWith('/import/chunk')) {
        const result = await adapter.writeChunk(req.body || {});
        return res.status(200).json(result);
      }
      const result = await adapter.finalize(req.body || {});
      return res.status(200).json(result);
    }
    if (req.method === 'GET' && pathname.endsWith('/full') && req.query.meta === '1') {
      return await handleMeta(res, user.uid, user.profile);
    }
    if (req.method === 'GET' && pathname.endsWith('/full') && req.query.signature === '1') {
      return await handleSourceSignature(res, user.uid, user.profile);
    }
    if (req.method === 'GET' && pathname.endsWith('/full') && typeof req.query.collection === 'string') {
      return await handleCollectionPage(res, user.uid, req.query.collection, typeof req.query.cursor === 'string' ? req.query.cursor : null);
    }
    if (req.method === 'POST' && pathname.endsWith('/full/preflight')) return await handlePreflight(req, res, user.uid);
    if (req.method === 'POST' && pathname.endsWith('/full/restore-chunk')) return await handleRestoreChunk(req, res, user.uid);
    return sendError(res, 404, 'Rota de backup não encontrada.');
  } catch (error) {
    if (Number.isInteger(error && error.status) && error.status >= 400 && error.status < 500) {
      return sendError(res, error.status, String(error.message || 'A solicitação foi recusada.'));
    }
    const detail = process.env.FUNCTIONS_EMULATOR === 'true'
      ? String(error && error.message ? error.message : 'internal').slice(0, 180)
      : error && error.code ? error.code : 'internal';
    console.error('MotoFix backup API failed:', error && error.name ? error.name : 'Error', detail);
    return sendError(res, 500, 'A operação de backup falhou. Nenhum sucesso foi confirmado; confira a conexão e tente novamente.');
  }
});
