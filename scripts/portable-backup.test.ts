import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPortableBackupPayload,
  decryptPortableBackup,
  encryptPortableBackup,
  summarizePortableBackup,
} from '../src/services/portableBackup';

const password = 'motoFix-backup-teste-2026!';

const createFixture = async () => createPortableBackupPayload({
  profileSnapshot: { uid: 'workshop-test', role: 'admin' },
  settings: { companyName: 'Oficina de teste' },
  collections: {
    clients: [{ id: 'client-1', name: 'Cliente de teste', createdAt: { __motofixType: 'timestamp', seconds: 1_800_000_000, nanoseconds: 0 } }],
    cash_launches: [{ id: 'os-1', clientId: 'client-1', status: 'finalizada' }],
    products: [{ id: 'product-1', stock: 2 }],
    stock_movements: [{ id: 'movement-1', cashLaunchId: 'os-1', productId: 'product-1' }],
    operational_logs: [{ id: 'log-1', action: 'os_finalizada' }],
  },
  localRecovery: { drafts: [{ key: 'workshop-test:cash-register', data: { request: 'troca' } }], queue: { writes: [] } },
  excludedCollections: ['fiscal_private'],
  notes: ['Anexos de Storage não encontrados nesta instalação.'],
}, 'workshop-test', '2.1.0', '2026-10-24T12:00:00.000Z');

test('criptografa e valida backup portátil com IDs, relações e contagens', async () => {
  const payload = await createFixture();
  const encrypted = await encryptPortableBackup(payload, password);
  assert.equal(encrypted.includes('Cliente de teste'), false);

  const recovered = await decryptPortableBackup(encrypted, password);
  assert.deepEqual(recovered, payload);
  assert.equal(summarizePortableBackup(recovered).totalRecords, 6);
  assert.equal(summarizePortableBackup(recovered).workshopName, 'Oficina de teste');
  assert.equal(summarizePortableBackup(recovered).hasLocalRecovery, true);
});

test('recusa senha incorreta sem revelar conteúdo do arquivo', async () => {
  const encrypted = await encryptPortableBackup(await createFixture(), password);
  await assert.rejects(
    decryptPortableBackup(encrypted, 'outra-senha-que-nao-serve'),
    /Não foi possível abrir o backup/,
  );
});

test('detecta arquivo adulterado antes de aceitar a restauração', async () => {
  const envelope = JSON.parse(await encryptPortableBackup(await createFixture(), password)) as {
    ciphertext: string;
  };
  envelope.ciphertext = `${envelope.ciphertext.slice(0, -4)}AAAA`;
  await assert.rejects(
    decryptPortableBackup(JSON.stringify(envelope), password),
    /integridade do arquivo falhou/,
  );
});

test('recusa senha fraca e arquivo JSON legado sem criptografia', async () => {
  const payload = await createFixture();
  await assert.rejects(encryptPortableBackup(payload, 'curta'), /pelo menos 12 caracteres/);
  await assert.rejects(
    decryptPortableBackup(JSON.stringify(payload), password),
    /não é um backup criptografado MotoFix/,
  );
});

test('recusa coleções privadas e contagens adulteradas antes de restaurar', async () => {
  const privateCollection = await createPortableBackupPayload({
    profileSnapshot: null,
    settings: null,
    collections: { fiscal_private: [{ id: 'private-1', token: 'not-exportable' }] },
  }, 'workshop-test', '2.1.0');
  await assert.rejects(encryptPortableBackup(privateCollection, password), /coleção privada/i);

  const payload = await createFixture();
  payload.manifest.counts.clients = 5;
  await assert.rejects(encryptPortableBackup(payload, password), /contagem da coleção clients/i);
});
