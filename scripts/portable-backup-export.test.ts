import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { webcrypto } from 'node:crypto';
import { decryptPortableBackup, hashPortableBackupSourceSnapshot, portableBackupFormat } from '../src/services/portableBackup';
import { createStableBackupArchive, readPortableBackupSource, type LocalBackupRecoverySnapshot, type RemoteBackupSnapshot } from '../src/services/portableBackupExport';

if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });

const password = 'portable-backup-e2e-password-2026';
const source: RemoteBackupSnapshot = {
  workshopId: 'source-workshop-test',
  exportedAt: '2026-10-24T10:00:00.000Z',
  sourceProjectId: 'motofix-source-test',
  data: {
    profileSnapshot: { uid: 'source-workshop-test', role: 'admin' },
    settings: { id: 'config', businessName: 'Oficina de teste' },
    collections: Object.fromEntries(portableBackupFormat.includedCollections
      .filter((name) => name !== 'settings')
      .map((name) => [name, name === 'clients'
        ? [{ id: 'client-1', userId: 'source-workshop-test', name: 'Cliente fictício' }]
        : []])),
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
  await assert.rejects(create({ readLocalRecovery: async () => local }), /Backup completo bloqueado/);

  const partial = await create({
    readLocalRecovery: async () => local,
    allowIncompleteLocalRecovery: true,
  });
  assert.equal(partial.complete, false);
  assert.match(partial.payload.data.notes?.join(' '), /COBERTURA PARCIAL/);
  assert.deepEqual(partial.payload.data.localRecovery?.queue, local.evidence.queue);
  assert.equal((partial.payload.data.localRecovery?.coverage as { classification: string }).classification, 'recovery-material-only');
});

test('cada categoria local não resolvida bloqueia o modo completo sem sincronizar', async () => {
  const cases: Array<{ reason: string; evidence: Record<string, unknown> }> = [
    { reason: 'falha em fila', evidence: { ...cleanLocal().evidence, queue: [{ id: 'fixture', status: 'failed' }] } },
    { reason: 'rascunho', evidence: { ...cleanLocal().evidence, drafts: [{ key: 'fixture' }] } },
    { reason: 'caixa local', evidence: { ...cleanLocal().evidence, localCashLaunches: [{ id: 'fixture' }] } },
    { reason: 'produto local', evidence: { ...cleanLocal().evidence, localProducts: [{ id: 'fixture' }] } },
    { reason: 'outra oficina', evidence: { ...cleanLocal().evidence, sourceStorage: { otherOwnerPendingOwnerCount: 1 } } },
  ];
  for (const item of cases) {
    const local: LocalBackupRecoverySnapshot = {
      evidence: item.evidence,
      incompleteReasons: [item.reason],
      unsafeToExport: false,
    };
    const before = structuredClone(local);
    await assert.rejects(create({ readLocalRecovery: async () => local }), /Backup completo bloqueado/);
    assert.deepEqual(local, before);
  }
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

test('detecta mudança na fila offline durante exportação, sem tentar processá-la', async () => {
  let reads = 0;
  const readLocalRecovery = async (): Promise<LocalBackupRecoverySnapshot> => ({
    evidence: { queue: [{ id: 'fixture', status: reads++ === 0 ? 'pending' : 'failed' }], drafts: [], localCashLaunches: [], localProducts: [] },
    incompleteReasons: ['fila de teste'],
    unsafeToExport: false,
  });
  await assert.rejects(create({
    readLocalRecovery,
    allowIncompleteLocalRecovery: true,
  }), /fila ou os rascunhos locais mudaram/);
  assert.equal(reads, 2);
});

test('assinatura diferente do snapshot das páginas também bloqueia o arquivo', async () => {
  await assert.rejects(create({ readRemoteSignature: async () => 'b'.repeat(64) }), /mudaram durante a exportação/);
});

test('recusa exportação se o snapshot não confirmar todas as coleções', async () => {
  const incomplete = structuredClone(source);
  delete incomplete.data.collections.whatsapp_messages;
  await assert.rejects(create({
    readRemoteSnapshot: async () => incomplete,
    readRemoteSignature: () => hashPortableBackupSourceSnapshot(incomplete.data),
  }), /todas as coleções comerciais suportadas/);
});

test('recusa backup quando projeto de origem não pode ser identificado', async () => {
  await assert.rejects(create({
    readRemoteSnapshot: async () => ({ ...structuredClone(source), sourceProjectId: null }),
  }), /projeto Firebase de origem/);
});

test('backup parcial preserva dados pendentes como material e grava pendências no manifesto', async () => {
  const local = cleanLocal();
  local.evidence.queue = [{ id: 'fake-failed-write', status: 'failed' }];
  local.evidence.drafts = [{ key: 'fixture-draft' }];
  local.evidence.localCashLaunches = [{ id: 'fixture-cash' }];
  local.evidence.localProducts = [{ id: 'fixture-product' }];
  local.incompleteReasons = ['1 falha na fila', '1 rascunho local', '1 caixa local', '1 produto local'];
  const before = structuredClone(local);
  const result = await create({ readLocalRecovery: async () => local, allowIncompleteLocalRecovery: true });
  assert.equal(result.complete, false);
  assert.match(result.filename, /parcial/);
  assert.equal(result.payload.manifest.coverage?.status, 'partial');
  assert.deepEqual(result.payload.manifest.coverage?.pendingComponents, {
    pendingWrites: 0,
    failedWrites: 1,
    unknownPendingWrites: 0,
    otherOwnerPendingOwners: 0,
    otherOwnerFailedWrites: 0,
    unknownOwnerFailedWrites: 0,
    drafts: 1,
    localCashLaunches: 1,
    localProducts: 1,
    unresolvedConditions: 4,
  });
  assert.deepEqual(local, before, 'a exportação não altera nem limpa os dados locais');
  assert.deepEqual(result.payload.data.localRecovery?.queue, local.evidence.queue);
});

test('bloqueia exportação mesmo parcial se o armazenamento local não puder ser lido', async () => {
  await assert.rejects(create({
    readLocalRecovery: async () => ({
      evidence: {}, incompleteReasons: ['não legível'], unsafeToExport: true,
    }),
    allowIncompleteLocalRecovery: true,
  }), /ler com segurança toda a fila/);
});

test('leitura do endpoint de exportação usa somente GET e exige as 18 coleções configuradas', async () => {
  const requestedMethods: string[] = [];
  const included = portableBackupFormat.includedCollections.filter((name) => name !== 'settings');
  const result = await readPortableBackupSource({
    apiBaseUrl: 'https://backup.example.invalid',
    expectedProjectId: 'motofix-source-test',
    getAuthHeaders: async () => ({ Authorization: 'Bearer fixture' }),
    fetchImpl: async (input, init) => {
      requestedMethods.push(String(init?.method));
      const url = new URL(String(input));
      if (url.searchParams.get('meta') === '1') {
        return new Response(JSON.stringify({
          format: 'motofix-full-backup', version: 2, exportedAt: '2026-10-31T10:00:00.000Z',
          sourceProjectId: 'motofix-source-test', owner: { uid: 'source-workshop-test' },
          profileSnapshot: { uid: 'source-workshop-test', role: 'master_admin' },
          settings: null, collections: included, excludedCollections: ['fiscal_private'], notes: [],
        }), { headers: { 'Content-Type': 'application/json' } });
      }
      const collection = url.searchParams.get('collection') || '';
      return new Response(JSON.stringify({ collection, documents: [], nextCursor: null }), {
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });
  assert.deepEqual(Object.keys(result.data.collections).sort(), included.sort());
  assert.equal(result.sourceProjectId, 'motofix-source-test');
  assert.ok(requestedMethods.length === included.length + 1);
  assert.ok(requestedMethods.every((method) => method === 'GET'));
});

test('recusa metadata que omite, duplica ou não identifica uma coleção', async () => {
  const included = portableBackupFormat.includedCollections.filter((name) => name !== 'settings');
  for (const collections of [included.slice(1), [...included, included[0]], [...included.slice(1), 'unexpected_collection']]) {
    await assert.rejects(readPortableBackupSource({
      apiBaseUrl: '',
      expectedProjectId: 'motofix-source-test',
      getAuthHeaders: async () => ({}),
      fetchImpl: async () => new Response(JSON.stringify({
        format: 'motofix-full-backup', version: 2, exportedAt: '2026-10-31T10:00:00.000Z',
        sourceProjectId: 'motofix-source-test', owner: { uid: 'source-workshop-test' },
        profileSnapshot: null, settings: null, collections, excludedCollections: ['fiscal_private'], notes: [],
      }), { headers: { 'Content-Type': 'application/json' } }),
    }), /exatamente todas as coleções/);
  }
});

test('recusa projeto de origem que não corresponda ao Firebase configurado antes de ler coleções', async () => {
  let requests = 0;
  await assert.rejects(readPortableBackupSource({
    apiBaseUrl: 'https://backup.example.invalid',
    expectedProjectId: 'motofix-source-test',
    getAuthHeaders: async () => ({}),
    fetchImpl: async () => {
      requests += 1;
      return new Response(JSON.stringify({
        format: 'motofix-full-backup', version: 2, exportedAt: '2026-10-31T10:00:00.000Z',
        sourceProjectId: 'motofix-wrong-test', owner: { uid: 'source-workshop-test' },
        profileSnapshot: null, settings: null,
        collections: portableBackupFormat.includedCollections.filter((name) => name !== 'settings'),
        excludedCollections: ['fiscal_private'], notes: [],
      }), { headers: { 'Content-Type': 'application/json' } });
    },
  }), /não corresponde ao projeto Firebase configurado/);
  assert.equal(requests, 1);
});
