import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { webcrypto } from 'node:crypto';
import { decryptPortableBackup, hashPortableBackupSourceSnapshot } from '../src/services/portableBackup';
import { createStableBackupArchive, type LocalBackupRecoverySnapshot, type RemoteBackupSnapshot } from '../src/services/portableBackupExport';

if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });

const password = 'portable-backup-e2e-password-2026';
const source: RemoteBackupSnapshot = {
  workshopId: 'source-workshop-test',
  exportedAt: '2026-10-24T10:00:00.000Z',
  sourceProjectId: 'motofix-source-test',
  data: {
    profileSnapshot: { uid: 'source-workshop-test', role: 'admin' },
    settings: { id: 'config', businessName: 'Oficina de teste' },
    collections: { clients: [{ id: 'client-1', userId: 'source-workshop-test', name: 'Cliente fictício' }] },
    excludedCollections: ['fiscal_private'],
    notes: [],
  },
};
const cleanLocal = (): LocalBackupRecoverySnapshot => ({
  evidence: { queue: [], drafts: [], localCashLaunches: [], localProducts: [] },
  incompleteReasons: [],
  unsafeToExport: false,
});
const create = (overrides: Partial<Parameters<typeof createStableBackupArchive>[0]> = {}) => createStableBackupArchive({
  password,
  appVersion: '2.1.0-test',
  readRemoteSnapshot: async () => structuredClone(source),
  readRemoteSignature: () => hashPortableBackupSourceSnapshot(source.data),
  readLocalRecovery: async () => cleanLocal(),
  ...overrides,
});

test('exportação controlada grava .motofix em disco, calcula SHA-256 e reabre conteúdo íntegro', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'motofix-backup-export-'));
  try {
    const archive = await create();
    const path = join(directory, archive.filename);
    await writeFile(path, archive.encrypted, 'utf8');
    const diskContents = await readFile(path, 'utf8');
    const { createHash } = await import('node:crypto');
    const fileHash = createHash('sha256').update(diskContents).digest('hex');
    assert.match(fileHash, /^[a-f0-9]{64}$/);
    const reopened = await decryptPortableBackup(diskContents, password);
    assert.deepEqual(reopened, archive.payload);
    assert.equal(archive.complete, true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('falha durante a leitura não produz arquivo para download', async () => {
  let generated = false;
  await assert.rejects(create({
    readRemoteSnapshot: async () => { throw new Error('falha de leitura simulada'); },
  }).then((archive) => { generated = true; return archive; }), /falha de leitura simulada/);
  assert.equal(generated, false);
});

test('detecta alterações observáveis no Firebase durante a exportação e recusa arquivo', async () => {
  let calls = 0;
  await assert.rejects(create({
    readRemoteSignature: async () => {
      calls += 1;
      return calls === 1 ? hashPortableBackupSourceSnapshot(source.data) : 'a'.repeat(64);
    },
  }), /mudaram durante a exportação/);
  assert.equal(calls, 2);
});

test('fila offline pendente bloqueia a exportação completa e permanece como material se explicitamente parcial', async () => {
  const local = cleanLocal();
  local.evidence.queue = [{ id: 'offline-1', status: 'pending' }];
  local.incompleteReasons = ['1 gravação pendente na fila offline'];
  await assert.rejects(create({ readLocalRecovery: async () => local }), /Sincronize e confira a fila/);

  const partial = await create({
    readLocalRecovery: async () => local,
    allowIncompleteLocalRecovery: true,
  });
  assert.equal(partial.complete, false);
  assert.match(partial.payload.data.notes?.join(' '), /COBERTURA PARCIAL/);
  assert.deepEqual(partial.payload.data.localRecovery?.queue, local.evidence.queue);
  assert.equal((partial.payload.data.localRecovery?.coverage as { classification: string }).classification, 'recovery-material-only');
});

test('detecta mudança em rascunhos locais durante exportação', async () => {
  let reads = 0;
  await assert.rejects(create({
    readLocalRecovery: async () => ({
      ...cleanLocal(),
      evidence: { queue: [], drafts: [{ revision: ++reads }], localCashLaunches: [], localProducts: [] },
      incompleteReasons: ['1 rascunho local'],
    }),
    allowIncompleteLocalRecovery: true,
  }), /fila ou os rascunhos locais mudaram/);
});

test('assinatura diferente do snapshot das páginas também bloqueia o arquivo', async () => {
  await assert.rejects(create({ readRemoteSignature: async () => 'b'.repeat(64) }), /mudaram durante a exportação/);
});
