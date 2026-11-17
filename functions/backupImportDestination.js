const crypto = require('node:crypto');
const { FieldPath, GeoPoint, Timestamp } = require('firebase-admin/firestore');
const backupFieldPolicy = require('../src/services/portableBackupFieldPolicy.json');

const IMPORT_COLLECTIONS = [
  'clients', 'products', 'settings', 'cash_launches', 'maintenances', 'warranties',
  'appointments', 'expenses', 'stock_movements', 'message_logs', 'operational_logs',
  'fiscal_companies', 'fiscal_invoices', 'fiscal_invoice_files', 'fiscal_logs',
  'whatsapp_sessions', 'whatsapp_contacts', 'whatsapp_messages', 'whatsapp_automations',
];
const MAX_CHUNK_DOCUMENTS = 150;
const MAX_CHUNK_BYTES = 4 * 1024 * 1024;
const MAX_DOCUMENT_BYTES = 900 * 1024;
const IMPORT_LOCK_LEASE_MS = 5 * 60 * 1000;
const normalizePolicySegment = (value) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
const FORBIDDEN_FIELDS = new Set(backupFieldPolicy.sensitiveFieldNames.map(normalizePolicySegment));
const FORBIDDEN_PATHS = Object.fromEntries(Object.entries(backupFieldPolicy.sensitivePathsByCollection)
  .map(([collection, paths]) => [collection, new Set(paths.map((path) => path.split('.').map(normalizePolicySegment).join('.')))]));
const isForbiddenImportField = (collection, pathSegments) => FORBIDDEN_FIELDS.has(normalizePolicySegment(pathSegments.at(-1) || ''))
  || Boolean(FORBIDDEN_PATHS[collection]?.has(pathSegments.map(normalizePolicySegment).join('.')));
const LOCK_DOCUMENT_ID = '_active';

const stableJson = (value) => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
};

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const importDocumentId = (sourceProjectId, sourceUid, targetUid, digest) => sha256([sourceProjectId || '', sourceUid, targetUid, digest].join('\n'));
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isValidId = (value) => typeof value === 'string' && value.length > 0 && value.length <= 1500 && !value.includes('/');

const hasActiveWorkshopAccess = (profile, now = Date.now()) => {
  if (!profile || profile.role !== 'admin' || profile.isActive !== true) return false;
  const manual = profile.manualAccess;
  const projection = profile.accessProjection;
  const expiresAt = manual?.expiresAt;
  const expiry = expiresAt && typeof expiresAt.toMillis === 'function'
    ? expiresAt.toMillis()
    : typeof expiresAt === 'string' ? Date.parse(expiresAt) : null;
  const projectedExpiry = projection?.validUntil && typeof projection.validUntil.toMillis === 'function'
    ? projection.validUntil.toMillis()
    : typeof projection?.validUntil === 'string' ? Date.parse(projection.validUntil) : null;
  return manual?.enabled === true
    && Number.isFinite(expiry)
    && expiry > now
    && projection?.allowed === true
    && projection?.source === 'manual'
    && projectedExpiry === expiry;
};

const inspectRemappedDocument = (value, targetUid, path, issues) => {
  if (Array.isArray(value)) {
    value.forEach((item, index) => inspectRemappedDocument(item, targetUid, `${path}[${index}]`, issues));
    return;
  }
  if (!isObject(value)) return;
  if (value.__motofixType === 'document-reference') {
    if (typeof value.path !== 'string' || !(value.path === `users/${targetUid}` || value.path.startsWith(`users/${targetUid}/`))) {
      issues.push(`${path} contém uma referência fora do namespace do destino.`);
    }
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === 'userId' && child !== targetUid) issues.push(`${path}.${key} não aponta para a oficina autenticada no destino.`);
    inspectRemappedDocument(child, targetUid, `${path}.${key}`, issues);
  }
};

const deserializeFirestoreValue = (value, db) => {
  if (Array.isArray(value)) return value.map((item) => deserializeFirestoreValue(item, db));
  if (!isObject(value)) return value;
  if (value.__motofixType === 'timestamp' && Number.isInteger(value.seconds) && Number.isInteger(value.nanoseconds)) {
    return new Timestamp(value.seconds, value.nanoseconds);
  }
  if (value.__motofixType === 'date' && typeof value.value === 'string') {
    const date = new Date(value.value);
    if (Number.isFinite(date.getTime())) return date;
    throw new Error('Data inválida no plano de importação.');
  }
  if (value.__motofixType === 'bytes' && typeof value.base64 === 'string') return Buffer.from(value.base64, 'base64');
  if (value.__motofixType === 'geopoint' && typeof value.latitude === 'number' && typeof value.longitude === 'number') {
    return new GeoPoint(value.latitude, value.longitude);
  }
  if (value.__motofixType === 'document-reference' && typeof value.path === 'string') {
    const segments = value.path.split('/').filter(Boolean);
    if (segments.length % 2 !== 0 || segments[0] !== 'users') throw new Error('Referência incompatível com o namespace da oficina.');
    return db.doc(value.path);
  }
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, deserializeFirestoreValue(child, db)]));
};

const serializeFirestoreValue = (value) => {
  if (value === null || value === undefined || typeof value !== 'object') return value;
  if (value instanceof Date) return { __motofixType: 'date', value: value.toISOString() };
  if (Buffer.isBuffer(value)) return { __motofixType: 'bytes', base64: value.toString('base64') };
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
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, serializeFirestoreValue(child)]));
};

const hashStoredDocument = (snapshot, collectionName) => {
  const stored = serializeFirestoreValue(snapshot.data() || {});
  stored.id = snapshot.id;
  if (collectionName === 'settings') stored.id = snapshot.id;
  return sha256(stableJson(stored));
};

const validateCountMap = (counts) => isObject(counts)
  && Object.entries(counts).every(([name, count]) => IMPORT_COLLECTIONS.includes(name)
    && Number.isSafeInteger(count) && count >= 0);

const validateImportDocument = (document, collectionName, targetUid) => {
  if (!isObject(document) || !isValidId(document.id)) return 'Documento com ID inválido no lote.';
  if (document.userId !== targetUid) return 'O documento não pertence à oficina autenticada no destino.';
  if (Object.prototype.hasOwnProperty.call(document, 'id') && document.id !== document.id.trim()) return 'O ID do documento contém espaços nas extremidades.';
  if (collectionName === 'settings' && document.id !== 'config') return 'As configurações precisam manter o ID config.';
  if (Buffer.byteLength(stableJson(document), 'utf8') > MAX_DOCUMENT_BYTES) return 'Um documento excede o limite seguro de tamanho para restauração.';

  let visited = 0;
  const inspect = (value, path, depth, pathSegments = []) => {
    visited += 1;
    if (visited > 50000 || depth > 30) return 'A estrutura do documento excede o limite de segurança.';
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return null;
    if (typeof value === 'number') return Number.isFinite(value) ? null : `Número inválido em ${path}.`;
    if (typeof value !== 'object') return `Tipo de valor não suportado em ${path}.`;
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        const issue = inspect(value[index], `${path}[${index}]`, depth + 1, pathSegments);
        if (issue) return issue;
      }
      return null;
    }
    if (value.__motofixType === 'timestamp') {
      return Number.isSafeInteger(value.seconds) && Number.isInteger(value.nanoseconds)
        && value.nanoseconds >= 0 && value.nanoseconds < 1_000_000_000
        ? null : `Timestamp inválido em ${path}.`;
    }
    if (value.__motofixType === 'date') {
      return typeof value.value === 'string' && Number.isFinite(Date.parse(value.value)) ? null : `Data inválida em ${path}.`;
    }
    if (value.__motofixType === 'bytes') {
      return typeof value.base64 === 'string' && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value.base64)
        ? null : `Bytes inválidos em ${path}.`;
    }
    if (value.__motofixType === 'geopoint') {
      return Number.isFinite(value.latitude) && value.latitude >= -90 && value.latitude <= 90
        && Number.isFinite(value.longitude) && value.longitude >= -180 && value.longitude <= 180
        ? null : `Geopoint inválido em ${path}.`;
    }
    if (value.__motofixType === 'document-reference') {
      const segments = typeof value.path === 'string' ? value.path.split('/') : [];
      return (segments.length === 2 && segments[0] === 'users' && segments[1] === targetUid)
        || (segments.length === 4 && segments[0] === 'users' && segments[1] === targetUid
          && IMPORT_COLLECTIONS.includes(segments[2]) && isValidId(segments[3]))
        ? null : `Referência fora do conteúdo permitido em ${path}.`;
    }
    if (!isObject(value)) return `Estrutura inválida em ${path}.`;
    for (const [key, child] of Object.entries(value)) {
      const nextPath = [...pathSegments, key];
      if (isForbiddenImportField(collectionName, nextPath)) return `Campo de credencial, privilégio ou cobrança bloqueado em ${path}.${key}.`;
      if (['__proto__', 'prototype', 'constructor'].includes(key)) return `Chave incompatível em ${path}.`;
      if (Buffer.byteLength(key, 'utf8') > 1500) return `Nome de campo excede o limite em ${path}.`;
      const issue = inspect(child, `${path}.${key}`, depth + 1, nextPath);
      if (issue) return issue;
    }
    return null;
  };
  return inspect(document, `${collectionName}/${document.id}`, 0);
};

const lockLeaseExpiresAt = (now = Date.now()) => Timestamp.fromMillis(now + IMPORT_LOCK_LEASE_MS);
const isLockLeaseExpired = (lock, now = Date.now()) => {
  const millis = lock?.leaseExpiresAt && typeof lock.leaseExpiresAt.toMillis === 'function'
    ? lock.leaseExpiresAt.toMillis() : null;
  return millis === null || millis <= now;
};
const hasCommittedWrites = (session) => Boolean(session
  && (Number(session.documentsWritten) > 0 || Number(session.nextChunkIndex) > 0));
const lockRecoveryMessage = 'Há uma restauração parcial nesta oficina. Reabra o mesmo arquivo .motofix, entre na mesma conta de destino e retome a sessão original. Não apague checkpoints nem documentos manualmente. Se o mesmo arquivo não estiver disponível ou a verificação continuar falhando, interrompa novas importações e peça uma recuperação assistida do destino.';

const createFirestoreBackupDestinationAdapter = ({ db, projectId, uid, actorUid = uid }) => {
  if (!db || !projectId || !uid) throw new Error('O adaptador Firestore precisa de projeto, usuário e banco de destino.');
  const userRef = db.collection('users').doc(uid);
  const importsRef = userRef.collection('backup_imports');
  const lockRef = importsRef.doc(LOCK_DOCUMENT_ID);

  const getDestinationProfile = async () => {
    const snapshot = await userRef.get();
    return snapshot.exists ? snapshot.data() : null;
  };

  const assertEmptyDestination = async () => {
    const counts = {};
    const otherCollectionCounts = {};
    let totalExisting = 0;
    for (const name of IMPORT_COLLECTIONS) {
      const result = await userRef.collection(name).count().get();
      counts[name] = result.data().count;
      totalExisting += counts[name];
    }
    const knownCollections = new Set([...IMPORT_COLLECTIONS, 'backup_imports']);
    const subcollections = await userRef.listCollections();
    for (const collectionRef of subcollections) {
      if (knownCollections.has(collectionRef.id)) continue;
      const result = await collectionRef.count().get();
      otherCollectionCounts[collectionRef.id] = result.data().count;
      totalExisting += result.data().count;
    }
    return { counts, otherCollectionCounts, totalExisting };
  };

  const preflight = async ({ sourceWorkshopId, sourceProjectId = null, dataSha256, plannedDataSha256, counts }) => {
    if (typeof sourceWorkshopId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(sourceWorkshopId)
      || (sourceProjectId !== null && !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(sourceProjectId))
      || !/^[a-f0-9]{64}$/i.test(dataSha256 || '') || !/^[a-f0-9]{64}$/i.test(plannedDataSha256 || '')
      || !validateCountMap(counts)) {
      throw Object.assign(new Error('Manifesto do plano de importação inválido.'), { status: 400 });
    }
    const { counts: destinationCounts, otherCollectionCounts, totalExisting } = await assertEmptyDestination();
    const profile = await getDestinationProfile();
    const importId = importDocumentId(sourceProjectId, sourceWorkshopId, uid, dataSha256);
    const [sessionSnapshot, lockSnapshot] = await Promise.all([importsRef.doc(importId).get(), lockRef.get()]);
    const session = sessionSnapshot.exists ? sessionSnapshot.data() : null;
    const activeLock = lockSnapshot.exists ? lockSnapshot.data() : null;
    const sessionMatches = Boolean(session
      && session.sourceWorkshopId === sourceWorkshopId
      && session.sourceProjectId === sourceProjectId
      && session.dataSha256 === dataSha256
      && (!session.plannedDataSha256 || session.plannedDataSha256 === plannedDataSha256)
      && session.destinationUid === uid
      && session.destinationProjectId === projectId
      && session.actorUid === actorUid
      && stableJson(session.expectedCounts) === stableJson(counts));
    const resumable = sessionMatches && (session?.status === 'completed'
      ? session.plannedDataSha256 === plannedDataSha256 && session.verifiedPlanSha256 === plannedDataSha256
      : ['running', 'interrupted', 'verifying'].includes(session?.status));
    const sameLockOwner = Boolean(activeLock && activeLock.importId === importId && activeLock.actorUid === actorUid);
    let staleLockCanBeReleased = false;
    let staleLockSessionStatus = null;
    if (activeLock && activeLock.importId !== importId && isLockLeaseExpired(activeLock)) {
      const staleSessionSnapshot = await importsRef.doc(activeLock.importId).get();
      const staleSession = staleSessionSnapshot.exists ? staleSessionSnapshot.data() : null;
      staleLockSessionStatus = staleSession?.status || null;
      if (staleSession && !hasCommittedWrites(staleSession)
        && ['running', 'interrupted', 'abandoned_no_writes'].includes(staleSession.status)) {
        const checkpointSnapshot = await importsRef.doc(activeLock.importId).collection('chunks').limit(1).get();
        staleLockCanBeReleased = checkpointSnapshot.empty && totalExisting === 0;
      }
    }
    const blockedByDifferentSession = Boolean(activeLock && !sameLockOwner && !staleLockCanBeReleased);
    const recoveryRequired = Boolean(blockedByDifferentSession
      || (sessionMatches && ['verification_failed', 'recovery_required'].includes(session.status)));
    const recoveryMessage = recoveryRequired
      ? lockRecoveryMessage
      : blockedByDifferentSession ? 'Outra sessão está usando o destino. Aguarde ou retome o arquivo que iniciou a restauração.' : null;
    return {
      sourceWorkshopId,
      sourceProjectId,
      destinationProjectId: projectId,
      destinationUid: uid,
      destinationAdminUid: actorUid,
      destinationAuthorized: hasActiveWorkshopAccess(profile),
      targetEmpty: totalExisting === 0,
      destinationCounts,
      otherCollectionCounts,
      totalExisting,
      importable: hasActiveWorkshopAccess(profile) && !recoveryRequired && !blockedByDifferentSession
        && (totalExisting === 0 || resumable),
      resumable,
      existingImportStatus: sessionMatches ? session.status : null,
      activeImportId: activeLock?.importId || null,
      lockExpiresAt: activeLock?.leaseExpiresAt?.toDate?.().toISOString?.() || null,
      lockSessionStatus: staleLockSessionStatus || activeLock?.status || null,
      recoveryRequired,
      recoveryMessage,
      staleLockCanBeReleased,
      writesPerformed: false,
      profileAndPermissionsWillBeImported: false,
    };
  };

  const start = async ({ sourceWorkshopId, sourceProjectId = null, dataSha256, plannedDataSha256, counts, totalChunks, confirmation }) => {
    if (confirmation !== 'IMPORTAR NO DESTINO') throw Object.assign(new Error('Confirmação de destino inválida.'), { status: 400 });
    if (typeof totalChunks !== 'number' || !Number.isSafeInteger(totalChunks) || totalChunks < 0 || totalChunks > 20000) {
      throw Object.assign(new Error('Quantidade de lotes inválida.'), { status: 400 });
    }
    const check = await preflight({ sourceWorkshopId, sourceProjectId, dataSha256, plannedDataSha256, counts });
    if (!check.destinationAuthorized) throw Object.assign(new Error('A identidade autenticada não é administradora ativa da oficina de destino.'), { status: 403 });
    if (check.recoveryRequired) throw Object.assign(new Error(check.recoveryMessage || lockRecoveryMessage), { status: 409 });
    const importId = importDocumentId(sourceProjectId, sourceWorkshopId, uid, dataSha256);
    const sessionRef = importsRef.doc(importId);
    const destinationCollections = (await userRef.listCollections()).filter((collectionRef) => collectionRef.id !== 'backup_imports');
    const started = await db.runTransaction(async (transaction) => {
      const [activeLockSnapshot, sessionSnapshot] = await transaction.getAll(lockRef, sessionRef);
      const activeLock = activeLockSnapshot.exists ? activeLockSnapshot.data() : null;
      const session = sessionSnapshot.exists ? sessionSnapshot.data() : null;
      const collectionProbes = await Promise.all(destinationCollections.map((collectionRef) => transaction.get(collectionRef.limit(1))));
      const destinationEmpty = collectionProbes.every((snapshot) => snapshot.empty);
      const nowMs = Date.now();
      const now = Timestamp.fromMillis(nowMs);
      let abandonedSessionRef = null;

      if (session && (session.sourceWorkshopId !== sourceWorkshopId || session.sourceProjectId !== sourceProjectId
        || session.dataSha256 !== dataSha256 || (session.plannedDataSha256 && session.plannedDataSha256 !== plannedDataSha256)
        || session.destinationUid !== uid || session.destinationProjectId !== projectId || session.actorUid !== actorUid
        || stableJson(session.expectedCounts) !== stableJson(counts) || session.expectedChunks !== totalChunks)) {
        return { error: 'Já existe uma sessão de importação incompatível com este arquivo.', status: 409 };
      }
      if (session?.status === 'completed' && (!session.plannedDataSha256 || session.verifiedPlanSha256 !== plannedDataSha256)) {
        return { error: 'Esta sessão foi concluída por uma versão anterior e não contém prova integral do plano remapeado. Não será repetida automaticamente para evitar afirmar uma verificação que não foi feita.', status: 409, recoveryRequired: true };
      }
      if (session && ['verification_failed', 'recovery_required'].includes(session.status)) {
        return { error: lockRecoveryMessage, status: 409, recoveryRequired: true };
      }
      if (activeLock && activeLock.importId !== importId) {
        const oldSessionRef = importsRef.doc(activeLock.importId);
        const oldSessionSnapshot = await transaction.get(oldSessionRef);
        const oldSession = oldSessionSnapshot.exists ? oldSessionSnapshot.data() : null;
        const leaseExpired = isLockLeaseExpired(activeLock, nowMs);
        let oldHasCheckpoints = true;
        if (oldSession && !hasCommittedWrites(oldSession) && leaseExpired) {
          const checkpoints = await transaction.get(oldSessionRef.collection('chunks').limit(1));
          oldHasCheckpoints = !checkpoints.empty;
        }
        const safelyAbandoned = Boolean(leaseExpired && oldSession && !hasCommittedWrites(oldSession)
          && !oldHasCheckpoints && destinationEmpty
          && ['running', 'interrupted', 'abandoned_no_writes'].includes(oldSession.status));
        if (!safelyAbandoned) {
          if (leaseExpired && (hasCommittedWrites(oldSession) || !oldSession || oldHasCheckpoints)) {
            transaction.update(lockRef, { status: 'recovery_required', updatedAt: now });
            if (oldSessionSnapshot.exists) transaction.update(oldSessionRef, { status: 'recovery_required', updatedAt: now });
            return { error: lockRecoveryMessage, status: 409, recoveryRequired: true };
          }
          return { error: 'Outra sessão está usando o destino. Retome a sessão original antes de iniciar um arquivo diferente.', status: 409 };
        }
        abandonedSessionRef = oldSessionRef;
      }

      if (session) {
        if (!destinationEmpty && !hasCommittedWrites(session)) {
          return { error: 'O destino contém dados que não pertencem a checkpoints desta sessão. Nenhuma restauração foi iniciada.', status: 409 };
        }
        if (session.status === 'completed') {
          return {
            importId, status: 'completed', nextChunkIndex: session.nextChunkIndex,
            expectedChunks: session.expectedChunks, documentsWritten: session.documentsWritten, resumed: true,
          };
        }
        let writtenCounts = session.writtenCounts;
        if (!isObject(writtenCounts)) {
          const priorChunks = await transaction.get(sessionRef.collection('chunks').orderBy('chunkIndex', 'asc'));
          writtenCounts = Object.fromEntries(IMPORT_COLLECTIONS.map((name) => [name, 0]));
          for (const checkpoint of priorChunks.docs) {
            const receipt = checkpoint.data();
            if (IMPORT_COLLECTIONS.includes(receipt.collection) && Number.isSafeInteger(receipt.count)) {
              writtenCounts[receipt.collection] += receipt.count;
            }
          }
        }
        if (abandonedSessionRef) transaction.update(abandonedSessionRef, { status: 'abandoned_no_writes', abandonedAt: now, updatedAt: now });
        const status = session.status === 'interrupted' ? (totalChunks === 0 ? 'verifying' : 'running') : session.status;
        transaction.update(sessionRef, { status, plannedDataSha256, writtenCounts, updatedAt: now });
        transaction.set(lockRef, {
          importId, sourceProjectId, sourceWorkshopId, dataSha256, plannedDataSha256,
          destinationProjectId: projectId, destinationUid: uid, actorUid,
          status, leaseExpiresAt: lockLeaseExpiresAt(nowMs), updatedAt: now,
        });
        return {
          importId, status, nextChunkIndex: session.nextChunkIndex,
          expectedChunks: session.expectedChunks, documentsWritten: session.documentsWritten, resumed: true,
        };
      }
      if (!destinationEmpty) return { error: 'A oficina de destino contém dados. Esta importação exige um destino vazio para impedir mistura ou sobrescrita.', status: 409 };
      if (abandonedSessionRef) transaction.update(abandonedSessionRef, { status: 'abandoned_no_writes', abandonedAt: now, updatedAt: now });

      const status = totalChunks === 0 ? 'verifying' : 'running';
      transaction.create(sessionRef, {
        importId, status, sourceWorkshopId, sourceProjectId, destinationProjectId: projectId,
        destinationUid: uid, actorUid, dataSha256, plannedDataSha256, expectedCounts: counts,
        writtenCounts: Object.fromEntries(IMPORT_COLLECTIONS.map((name) => [name, 0])),
        expectedDocuments: Object.values(counts).reduce((sum, count) => sum + count, 0),
        expectedChunks: totalChunks, nextChunkIndex: 0, documentsWritten: 0,
        createdAt: now, updatedAt: now, profileSnapshotImported: false, permissionsImported: false,
      });
      transaction.create(lockRef, {
        importId, sourceProjectId, sourceWorkshopId, dataSha256, plannedDataSha256,
        destinationProjectId: projectId, destinationUid: uid, actorUid, status,
        leaseExpiresAt: lockLeaseExpiresAt(nowMs), updatedAt: now,
      });
      return { importId, status, nextChunkIndex: 0, expectedChunks: totalChunks, documentsWritten: 0, resumed: false };
    });
    if (started.error) throw Object.assign(new Error(started.error), { status: started.status || 409, recoveryRequired: started.recoveryRequired === true });
    return started;
  };

  const writeChunk = async ({ importId, sourceWorkshopId, sourceProjectId = null, dataSha256, chunkIndex, collection: collectionName, documents }) => {
    if (!/^[a-f0-9]{64}$/i.test(importId || '') || !/^[a-f0-9]{64}$/i.test(dataSha256 || '')
      || !Number.isSafeInteger(chunkIndex) || chunkIndex < 0 || !IMPORT_COLLECTIONS.includes(collectionName)
      || !Array.isArray(documents) || documents.length < 1 || documents.length > MAX_CHUNK_DOCUMENTS
      || Buffer.byteLength(JSON.stringify(documents), 'utf8') > MAX_CHUNK_BYTES) {
      throw Object.assign(new Error('Lote de importação inválido ou acima do limite.'), { status: 400 });
    }
    const ids = new Set();
    for (const document of documents) {
      const issue = validateImportDocument(document, collectionName, uid);
      if (issue) throw Object.assign(new Error(issue), { status: 400 });
      const ownershipIssues = [];
      inspectRemappedDocument(document, uid, `${collectionName}/${document.id}`, ownershipIssues);
      if (ownershipIssues.length) throw Object.assign(new Error(ownershipIssues[0]), { status: 400 });
      if (ids.has(document.id)) throw Object.assign(new Error('O lote contém IDs repetidos.'), { status: 400 });
      ids.add(document.id);
    }
    const chunkHash = sha256(stableJson({ collection: collectionName, documents }));
    const sessionRef = userRef.collection('backup_imports').doc(importId);
    const chunkRef = sessionRef.collection('chunks').doc(String(chunkIndex).padStart(8, '0'));
    const refs = documents.map((document) => userRef.collection(collectionName).doc(document.id));

    return db.runTransaction(async (transaction) => {
      const [sessionSnapshot, chunkSnapshot, lockSnapshot, ...documentSnapshots] = await transaction.getAll(sessionRef, chunkRef, lockRef, ...refs);
      if (!sessionSnapshot.exists) throw Object.assign(new Error('Sessão de importação não encontrada.'), { status: 404 });
      const session = sessionSnapshot.data();
      if (session.status !== 'running' || session.sourceWorkshopId !== sourceWorkshopId || session.sourceProjectId !== sourceProjectId || session.dataSha256 !== dataSha256
        || session.destinationUid !== uid || session.destinationProjectId !== projectId || session.actorUid !== actorUid) {
        const mismatch = [
          session.status !== 'running' ? 'status' : null,
          session.sourceWorkshopId !== sourceWorkshopId ? 'source' : null,
          session.sourceProjectId !== sourceProjectId ? 'source_project' : null,
          session.dataSha256 !== dataSha256 ? 'digest' : null,
          session.destinationUid !== uid ? 'destination_uid' : null,
          session.destinationProjectId !== projectId ? 'destination_project' : null,
          session.actorUid !== actorUid ? 'actor' : null,
        ].filter(Boolean).join(',');
        throw Object.assign(new Error(`Sessão não pode aceitar o lote (verificação: ${mismatch || 'indeterminada'}).`), { status: 409 });
      }
      if (session.importId !== importId || !session.plannedDataSha256 || !session.expectedCounts
        || (lockSnapshot.exists && (lockSnapshot.data().importId !== importId || lockSnapshot.data().actorUid !== actorUid))) {
        throw Object.assign(new Error(lockRecoveryMessage), { status: 409 });
      }
      const now = Timestamp.now();
      const nowMs = now.toMillis();
      if (chunkSnapshot.exists) {
        if (chunkSnapshot.data().chunkHash !== chunkHash) throw Object.assign(new Error('Este lote já foi gravado com outro conteúdo.'), { status: 409 });
        transaction.set(lockRef, {
          importId, sourceProjectId, sourceWorkshopId, dataSha256,
          plannedDataSha256: session.plannedDataSha256, destinationProjectId: projectId,
          destinationUid: uid, actorUid, status: 'running',
          leaseExpiresAt: lockLeaseExpiresAt(nowMs), updatedAt: now,
        });
        return { importId, chunkIndex, restored: documents.length, duplicate: true, nextChunkIndex: session.nextChunkIndex };
      }
      if (chunkIndex !== session.nextChunkIndex) throw Object.assign(new Error(`A retomada deve continuar no lote ${session.nextChunkIndex}.`), { status: 409 });
      if (chunkIndex >= session.expectedChunks) throw Object.assign(new Error('O lote excede a quantidade prevista na sessão.'), { status: 400 });
      const alreadyWrittenForCollection = Number(session.writtenCounts?.[collectionName] || 0);
      if (alreadyWrittenForCollection + documents.length > Number(session.expectedCounts?.[collectionName] || 0)) {
        throw Object.assign(new Error(`O lote excede a quantidade planejada para ${collectionName}.`), { status: 409 });
      }
      if (documents.some((_, index) => documentSnapshots[index].exists)) {
        throw Object.assign(new Error('Foi detectado conflito de ID no destino após a pré-validação. Nenhum documento deste lote foi gravado.'), { status: 409 });
      }

      for (let index = 0; index < documents.length; index += 1) {
        const raw = { ...documents[index] };
        const id = raw.id;
        let data = { ...raw, userId: uid };
        if (collectionName === 'settings') delete data.id;
        transaction.create(refs[index], deserializeFirestoreValue(data, db));
      }
      transaction.create(chunkRef, {
        chunkIndex,
        collection: collectionName,
        chunkHash,
        documentIds: documents.map((document) => document.id),
        documentHashes: Object.fromEntries(documents.map((document) => [document.id, sha256(stableJson(document))])),
        count: documents.length,
        committedAt: Timestamp.now(),
      });
      const writtenCounts = { ...session.writtenCounts, [collectionName]: alreadyWrittenForCollection + documents.length };
      transaction.update(sessionRef, {
        nextChunkIndex: chunkIndex + 1,
        documentsWritten: session.documentsWritten + documents.length,
        writtenCounts,
        updatedAt: now,
      });
      transaction.set(lockRef, {
        importId, sourceProjectId, sourceWorkshopId, dataSha256,
        plannedDataSha256: session.plannedDataSha256, destinationProjectId: projectId,
        destinationUid: uid, actorUid, status: 'running',
        leaseExpiresAt: lockLeaseExpiresAt(nowMs), updatedAt: now,
      });
      return { importId, chunkIndex, restored: documents.length, duplicate: false, nextChunkIndex: chunkIndex + 1 };
    });
  };

  const finalize = async ({ importId, sourceWorkshopId, sourceProjectId = null, dataSha256, plannedDataSha256 }) => {
    if (!/^[a-f0-9]{64}$/i.test(importId || '') || !/^[a-f0-9]{64}$/i.test(dataSha256 || '')
      || !/^[a-f0-9]{64}$/i.test(plannedDataSha256 || '')) {
      throw Object.assign(new Error('Identificadores de verificação da restauração inválidos.'), { status: 400 });
    }
    const sessionRef = importsRef.doc(importId);
    const begin = await db.runTransaction(async (transaction) => {
      const [sessionSnapshot, lockSnapshot] = await transaction.getAll(sessionRef, lockRef);
      if (!sessionSnapshot.exists) return { error: 'Sessão de importação não encontrada.', statusCode: 404 };
      const session = sessionSnapshot.data();
      if (session.sourceWorkshopId !== sourceWorkshopId || session.sourceProjectId !== sourceProjectId
        || session.dataSha256 !== dataSha256 || session.plannedDataSha256 !== plannedDataSha256
        || session.destinationUid !== uid || session.destinationProjectId !== projectId || session.actorUid !== actorUid) {
        return { error: 'Sessão não pertence à identidade autenticada ou ao plano de destino atual.', statusCode: 403 };
      }
      if (session.status === 'completed') {
        if (lockSnapshot.exists && lockSnapshot.data().importId === importId) transaction.delete(lockRef);
        return { completed: true, session };
      }
      if (['verification_failed', 'recovery_required'].includes(session.status)) {
        return { recoveryRequired: true, session };
      }
      if (!['running', 'interrupted', 'verifying'].includes(session.status)) {
        return { error: 'A sessão não está em um estado que permita verificação.', statusCode: 409 };
      }
      if (lockSnapshot.exists && (lockSnapshot.data().importId !== importId || lockSnapshot.data().actorUid !== actorUid)) {
        return { error: lockRecoveryMessage, statusCode: 409, recoveryRequired: true };
      }
      const now = Timestamp.now();
      if (session.nextChunkIndex !== session.expectedChunks || session.documentsWritten !== session.expectedDocuments
        || IMPORT_COLLECTIONS.some((name) => Number(session.writtenCounts?.[name] || 0) !== Number(session.expectedCounts?.[name] || 0))) {
        transaction.update(sessionRef, { status: 'interrupted', updatedAt: now });
        transaction.set(lockRef, {
          importId, sourceProjectId, sourceWorkshopId, dataSha256, plannedDataSha256,
          destinationProjectId: projectId, destinationUid: uid, actorUid, status: 'interrupted',
          leaseExpiresAt: lockLeaseExpiresAt(now.toMillis()), updatedAt: now,
        });
        return { interrupted: true, session };
      }
      transaction.update(sessionRef, { status: 'verifying', updatedAt: now });
      transaction.set(lockRef, {
        importId, sourceProjectId, sourceWorkshopId, dataSha256, plannedDataSha256,
        destinationProjectId: projectId, destinationUid: uid, actorUid, status: 'verifying',
        leaseExpiresAt: lockLeaseExpiresAt(now.toMillis()), updatedAt: now,
      });
      return { session: { ...session, status: 'verifying' } };
    });
    if (begin.error) throw Object.assign(new Error(begin.error), { status: begin.statusCode || 409, recoveryRequired: begin.recoveryRequired === true });
    if (begin.completed) return {
      importId, status: 'completed', verified: true,
      documentsVerified: begin.session.documentsVerified || 0, mismatchCount: 0,
      verifiedPlanSha256: begin.session.verifiedPlanSha256 || null, resumed: true,
    };
    if (begin.recoveryRequired) {
      return { importId, status: 'recovery_required', verified: false, documentsVerified: 0, mismatchCount: 0, recoveryRequired: true, recoveryMessage: lockRecoveryMessage };
    }
    if (begin.interrupted) {
      return { importId, status: 'interrupted', verified: false, documentsVerified: 0, mismatchCount: 0, recoveryRequired: false, recoveryMessage: 'A sessão pode ser retomada com o mesmo arquivo .motofix e a mesma conta de destino.' };
    }
    const session = begin.session;
    const chunksSnapshot = await sessionRef.collection('chunks').orderBy('chunkIndex', 'asc').get();
    if (chunksSnapshot.size !== session.expectedChunks) {
      const now = Timestamp.now();
      await db.runTransaction(async (transaction) => {
        const [freshSession, freshLock] = await transaction.getAll(sessionRef, lockRef);
        if (freshSession.exists && freshLock.exists && freshLock.data().importId === importId) {
          transaction.update(sessionRef, { status: 'interrupted', updatedAt: now });
          transaction.update(lockRef, { status: 'interrupted', leaseExpiresAt: lockLeaseExpiresAt(now.toMillis()), updatedAt: now });
        }
      });
      return { importId, status: 'interrupted', verified: false, documentsVerified: 0, mismatchCount: 1, recoveryRequired: false, recoveryMessage: 'Falta um checkpoint. Retome com o mesmo arquivo .motofix; não remova os dados locais desta sessão.' };
    }

    const mismatches = [];
    const restoredCounts = Object.fromEntries(IMPORT_COLLECTIONS.map((name) => [name, 0]));
    const canonicalDocuments = [];
    const restoredPaths = new Set([`users/${uid}`]);
    let verifiedCount = 0;
    for (let index = 0; index < chunksSnapshot.docs.length; index += 1) {
      const chunk = chunksSnapshot.docs[index];
      const receipt = chunk.data();
      const collectionName = receipt.collection;
      if (receipt.chunkIndex !== index || !IMPORT_COLLECTIONS.includes(collectionName)
        || !Array.isArray(receipt.documentIds) || receipt.documentIds.length !== receipt.count
        || !isObject(receipt.documentHashes)) {
        mismatches.push('checkpoint');
        continue;
      }
      restoredCounts[collectionName] += receipt.count;
      const snapshots = await db.getAll(...receipt.documentIds.map((id) => userRef.collection(collectionName).doc(id)));
      for (const snapshot of snapshots) {
        const expectedHash = receipt.documentHashes[snapshot.id];
        if (!snapshot.exists || snapshot.data()?.userId !== uid || hashStoredDocument(snapshot, collectionName) !== expectedHash) {
          mismatches.push(`${collectionName}/${snapshot.id}`);
        } else {
          const data = serializeFirestoreValue(snapshot.data() || {});
          data.id = snapshot.id;
          canonicalDocuments.push({ collection: collectionName, id: snapshot.id, data });
          restoredPaths.add(`users/${uid}/${collectionName}/${snapshot.id}`);
          verifiedCount += 1;
        }
      }
    }
    const actualCollectionCounts = {};
    for (const name of IMPORT_COLLECTIONS) {
      const result = await userRef.collection(name).count().get();
      actualCollectionCounts[name] = result.data().count;
    }
    const countsMatch = IMPORT_COLLECTIONS.every((name) => restoredCounts[name] === (session.expectedCounts[name] || 0)
      && actualCollectionCounts[name] === (session.expectedCounts[name] || 0));
    if (!countsMatch) mismatches.push('collection-counts');
    if (sha256(stableJson(canonicalDocuments)) !== plannedDataSha256) mismatches.push('planned-content-digest');

    const addKnownDocument = (collectionName, id, source) => {
      if (typeof id !== 'string' || !id) return;
      if (!restoredPaths.has(`users/${uid}/${collectionName}/${id}`)) mismatches.push(`broken-reference:${source}`);
    };
    const inspectReferences = (value, source) => {
      if (Array.isArray(value)) { value.forEach((child, index) => inspectReferences(child, `${source}[${index}]`)); return; }
      if (!isObject(value)) return;
      if (value.__motofixType === 'document-reference') {
        if (!restoredPaths.has(value.path)) mismatches.push(`broken-document-reference:${source}`);
        return;
      }
      for (const [key, child] of Object.entries(value)) inspectReferences(child, `${source}.${key}`);
    };
    for (const item of canonicalDocuments) {
      const data = item.data;
      inspectReferences(data, `${item.collection}/${item.id}`);
      if (['maintenances', 'appointments', 'warranties', 'message_logs'].includes(item.collection)) addKnownDocument('clients', data.clientId, `${item.collection}/${item.id}.clientId`);
      if (item.collection === 'cash_launches') {
        addKnownDocument('clients', data.clientId, `${item.collection}/${item.id}.clientId`);
        addKnownDocument('stock_movements', data.stockMovementId, `${item.collection}/${item.id}.stockMovementId`);
        if (Array.isArray(data.items)) data.items.forEach((line, index) => addKnownDocument('products', line?.productId, `${item.collection}/${item.id}.items[${index}].productId`));
      }
      if (item.collection === 'stock_movements') {
        addKnownDocument('cash_launches', data.cashLaunchId, `${item.collection}/${item.id}.cashLaunchId`);
        addKnownDocument('products', data.productId, `${item.collection}/${item.id}.productId`);
        if (Array.isArray(data.productIds)) data.productIds.forEach((id) => addKnownDocument('products', id, `${item.collection}/${item.id}.productIds`));
        if (isObject(data.changes)) Object.keys(data.changes).forEach((id) => addKnownDocument('products', id, `${item.collection}/${item.id}.changes`));
      }
      if (item.collection === 'warranties') addKnownDocument('cash_launches', data.cashLaunchId, `${item.collection}/${item.id}.cashLaunchId`);
      if (item.collection === 'fiscal_invoices') {
        addKnownDocument('fiscal_companies', data.companyId, `${item.collection}/${item.id}.companyId`);
        addKnownDocument('cash_launches', data.cashLaunchId, `${item.collection}/${item.id}.cashLaunchId`);
      }
      if (item.collection === 'fiscal_logs') {
        addKnownDocument('fiscal_companies', data.companyId, `${item.collection}/${item.id}.companyId`);
        addKnownDocument('fiscal_invoices', data.invoiceId, `${item.collection}/${item.id}.invoiceId`);
      }
      if (item.collection === 'fiscal_invoice_files') addKnownDocument('fiscal_invoices', data.invoiceId, `${item.collection}/${item.id}.invoiceId`);
    }

    if (mismatches.length || verifiedCount !== session.expectedDocuments) {
      const now = Timestamp.now();
      await db.runTransaction(async (transaction) => {
        const [freshSession, freshLock] = await transaction.getAll(sessionRef, lockRef);
        if (freshSession.exists && freshLock.exists && freshLock.data().importId === importId) {
          transaction.update(sessionRef, { status: 'verification_failed', verificationMismatchCount: mismatches.length, updatedAt: now });
          transaction.update(lockRef, { status: 'recovery_required', recoveryRequired: true, leaseExpiresAt: lockLeaseExpiresAt(now.toMillis()), updatedAt: now });
        }
      });
      return {
        importId, status: 'verification_failed', verified: false, documentsVerified: verifiedCount,
        mismatchCount: mismatches.length, recoveryRequired: true, recoveryMessage: lockRecoveryMessage,
      };
    }

    const completion = await db.runTransaction(async (transaction) => {
      const [freshSession, freshLock] = await transaction.getAll(sessionRef, lockRef);
      if (!freshSession.exists) return { error: 'Sessão de importação não encontrada durante o encerramento.' };
      if (freshSession.data().status === 'completed') return { completed: true };
      if (freshSession.data().status !== 'verifying' || (freshLock.exists && freshLock.data().importId !== importId)) {
        return { error: lockRecoveryMessage };
      }
      const now = Timestamp.now();
      transaction.update(sessionRef, {
        status: 'completed', completedAt: now, updatedAt: now,
        documentsVerified: verifiedCount, verificationMismatchCount: 0,
        verifiedPlanSha256: plannedDataSha256,
      });
      if (freshLock.exists) transaction.delete(lockRef);
      return { completed: true };
    });
    if (completion.error) throw Object.assign(new Error(completion.error), { status: 409 });
    return {
      importId, status: 'completed', verified: true, documentsVerified: verifiedCount,
      mismatchCount: 0, verifiedPlanSha256: plannedDataSha256,
    };
  };

  return { preflight, start, writeChunk, finalize };
};

module.exports = {
  IMPORT_COLLECTIONS,
  MAX_CHUNK_DOCUMENTS,
  MAX_CHUNK_BYTES,
  createFirestoreBackupDestinationAdapter,
  hasActiveWorkshopAccess,
};
