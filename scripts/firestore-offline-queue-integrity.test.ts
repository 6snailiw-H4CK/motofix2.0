import test from 'node:test';
import assert from 'node:assert/strict';
import {
  auditRawFirestoreOfflineQueue,
  type IndexedDbQueueRead,
  type LocalStorageQueueRead,
} from '../src/services/firestoreOfflineQueueIntegrity';

const validSnapshot = (writes: Array<Record<string, unknown>> = []) => ({
  writes,
  lastQueuedAt: null,
  lastSettledAt: null,
  lastError: null,
  failureCount: 0,
  confirmedCount: 0,
  retryCount: 0,
  persistenceFailureCount: 0,
  lastPersistenceError: null,
});
const local = (value: unknown): LocalStorageQueueRead => ({ status: 'available', raw: value === null ? null : JSON.stringify(value) });
const idb = (value: unknown, databaseExists = value !== null): IndexedDbQueueRead => ({ status: 'available', databaseExists, raw: value });

test('identifica espelhos vazios ou consistentes sem alterar as entradas originais', () => {
  const snapshot = validSnapshot([{ id: 'fixture-write', context: 'fake', queuedAt: '2026-01-01T00:00:00.000Z', status: 'pending', retryCount: 0 }]);
  const localRaw = JSON.stringify(snapshot);
  const before = structuredClone(snapshot);
  const result = auditRawFirestoreOfflineQueue({ status: 'available', raw: localRaw }, idb(snapshot));
  assert.equal(result.status, 'valid');
  assert.equal(result.safeToUse, true);
  assert.equal(result.localStorageEntryCount, 1);
  assert.equal(result.indexedDbEntryCount, 1);
  assert.deepEqual(snapshot, before);
  assert.equal(localRaw, JSON.stringify(snapshot));
});

test('entrada LocalStorage malformada bloqueia e não substitui os bytes originais', () => {
  const raw = '{"writes":[{"id":"fixture"';
  const before = raw;
  const result = auditRawFirestoreOfflineQueue({ status: 'available', raw }, idb(null, false));
  assert.equal(result.status, 'invalid');
  assert.equal(result.safeToUse, false);
  assert.ok(result.issues.includes('local_storage_queue_json_invalid'));
  assert.equal(raw, before);
});

test('entrada malformada dentro da fila é contada como inválida', () => {
  const snapshot = validSnapshot([{ context: 'fake', queuedAt: 'today', status: 'pending' }]);
  const before = structuredClone(snapshot);
  const result = auditRawFirestoreOfflineQueue(local(snapshot), idb(snapshot));
  assert.equal(result.status, 'invalid');
  assert.equal(result.invalidEntryCount, 2);
  assert.equal(result.safeToUse, false);
  assert.deepEqual(snapshot, before);
});

test('entrada desconhecida é distinguida e impede normalização/uso', () => {
  const snapshot = validSnapshot([{ id: 'fixture-write', context: 'fake', queuedAt: 'today', status: 'pending', retryCount: 0, futurePayload: { retain: true } }]);
  const result = auditRawFirestoreOfflineQueue(local(snapshot), idb(snapshot));
  assert.equal(result.status, 'unknown');
  assert.equal(result.unknownEntryCount, 2);
  assert.equal(result.safeToUse, false);
  assert.deepEqual(snapshot.writes[0].futurePayload, { retain: true });
});

test('estado e operação desconhecidos são distinguidos de estrutura malformada', () => {
  const snapshot = validSnapshot([{
    id: 'future-write', context: 'fixture', queuedAt: 'today', status: 'retrying', retryCount: 0,
    replay: { version: 1, operation: 'delete', path: ['users', 'fixture', 'clients', 'x'], data: {} },
  }]);
  const result = auditRawFirestoreOfflineQueue(local(snapshot), idb(snapshot));
  assert.equal(result.status, 'unknown');
  assert.equal(result.invalidEntryCount, 0);
  assert.ok(result.unknownEntryCount >= 2);
});

test('divergência entre IndexedDB e LocalStorage é identificada sem mesclar os estados', () => {
  const localSnapshot = validSnapshot([{ id: 'local-only', context: 'fake', queuedAt: 'today', status: 'pending' }]);
  const idbSnapshot = validSnapshot([{ id: 'idb-only', context: 'fake', queuedAt: 'today', status: 'failed' }]);
  const localBefore = structuredClone(localSnapshot);
  const idbBefore = structuredClone(idbSnapshot);
  const result = auditRawFirestoreOfflineQueue(local(localSnapshot), idb(idbSnapshot));
  assert.equal(result.status, 'divergent');
  assert.equal(result.hasDivergence, true);
  assert.equal(result.safeToUse, false);
  assert.deepEqual(localSnapshot, localBefore);
  assert.deepEqual(idbSnapshot, idbBefore);
});

test('IDs repetidos são tratados como estado inválido', () => {
  const duplicate = { id: 'same-id', context: 'fake', queuedAt: 'today', status: 'pending' };
  const result = auditRawFirestoreOfflineQueue(local(validSnapshot([duplicate, { ...duplicate }])), idb(validSnapshot([duplicate, { ...duplicate }])));
  assert.equal(result.status, 'invalid');
  assert.equal(result.duplicateIdCount, 2);
  assert.equal(result.safeToUse, false);
});

test('descritores de repetição válidos não são confundidos com campos desconhecidos', () => {
  const single = {
    id: 'single-replay', context: 'fixture', queuedAt: 'today', status: 'failed', retryCount: 0,
    replay: { version: 1, operation: 'set', path: ['users', 'fixture', 'clients', 'c1'], data: { userId: 'fixture' } },
  };
  const batch = {
    id: 'batch-replay', context: 'fixture', queuedAt: 'today', status: 'failed', retryCount: 0,
    replay: {
      version: 1,
      operation: 'batch',
      writes: [{ operation: 'update', path: ['users', 'fixture', 'clients', 'c1'], data: { status: 'OK' } }],
    },
  };
  const snapshot = validSnapshot([single, batch]);
  const result = auditRawFirestoreOfflineQueue(local(snapshot), idb(snapshot));
  assert.equal(result.status, 'valid');
  assert.equal(result.unknownEntryCount, 0);
  assert.equal(result.safeToUse, true);
});

test('falha de leitura do IndexedDB é reportada como ilegível', () => {
  const result = auditRawFirestoreOfflineQueue(local(validSnapshot()), { status: 'unreadable' });
  assert.equal(result.status, 'unreadable');
  assert.equal(result.safeToUse, false);
});

test('falha de leitura do LocalStorage é reportada como ilegível', () => {
  const result = auditRawFirestoreOfflineQueue({ status: 'unreadable' }, idb(validSnapshot()));
  assert.equal(result.status, 'unreadable');
  assert.equal(result.safeToUse, false);
});

test('API de IndexedDB indisponível impede afirmar que a fila está vazia', () => {
  const result = auditRawFirestoreOfflineQueue(local(null), { status: 'unavailable' });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.safeToUse, false);
});

test('fila válida sem rascunhos é consistente quando ambos os espelhos não existem', () => {
  const result = auditRawFirestoreOfflineQueue(local(null), idb(null, false));
  assert.equal(result.status, 'valid');
  assert.equal(result.safeToUse, true);
  assert.equal(result.localStorageEntryCount, 0);
  assert.equal(result.indexedDbEntryCount, 0);
});
