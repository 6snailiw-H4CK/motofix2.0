import test from 'node:test';
import assert from 'node:assert/strict';
import backupFieldPolicy from '../src/services/portableBackupFieldPolicy.json';
import {
  createPortableBackupPayload,
  decryptPortableBackup,
  encryptPortableBackup,
  assertBackupSizeWithinLimit,
  portableBackupFormat,
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
    expenses: [{ id: 'expense-1', amount: 35.5, paymentMethod: 'Pix' }],
    fiscal_companies: [{ id: 'fiscal-company-1', taxId: 'fixture-only' }],
    fiscal_invoices: [{ id: 'invoice-1', fiscalCompanyId: 'fiscal-company-1', total: 125.75 }],
  },
  localRecovery: { drafts: [], queue: [], coverage: { complete: true, incompleteReasons: [] } },
  excludedCollections: ['fiscal_private'],
  notes: ['Anexos de Storage não encontrados nesta instalação.'],
}, 'workshop-test', '2.1.0', '2026-10-24T12:00:00.000Z', 'motofix-source-test');

test('criptografa e valida backup portátil com IDs, relações e contagens', async () => {
  const payload = await createFixture();
  const encrypted = await encryptPortableBackup(payload, password);
  assert.equal(encrypted.includes('Cliente de teste'), false);

  const recovered = await decryptPortableBackup(encrypted, password);
  assert.deepEqual(recovered, payload);
  assert.equal(summarizePortableBackup(recovered).totalRecords, 9);
  assert.equal(summarizePortableBackup(recovered).workshopName, 'Oficina de teste');
  assert.equal(summarizePortableBackup(recovered).hasLocalRecovery, true);
  assert.equal(recovered.data.profileSnapshot, null);
  assert.equal(recovered.manifest.coverage?.status, 'complete');
  assert.equal(recovered.manifest.coverage?.includedCollections.length, portableBackupFormat.includedCollections.length);
  assert.equal(recovered.manifest.coverage?.counts.settings, 1);
  assert.equal(recovered.manifest.coverage?.counts.appointments, 0);
  assert.equal(recovered.manifest.coverage?.restoration.administrativePrivileges, false);
  assert.equal(recovered.data.collections.fiscal_invoices[0].total, 125.75);
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
  await assert.rejects(createPortableBackupPayload({
    profileSnapshot: null,
    settings: null,
    collections: { fiscal_private: [{ id: 'private-1', token: 'not-exportable' }] },
  }, 'workshop-test', '2.1.0'), /Coleção não permitida/i);

  const payload = await createFixture();
  payload.manifest.counts.clients = 5;
  await assert.rejects(encryptPortableBackup(payload, password), /contagem da coleção clients/i);
});

test('remove credenciais privadas de documentos e mantém IDs/relacionamentos comerciais', async () => {
  const payload = await createPortableBackupPayload({
    profileSnapshot: { uid: 'workshop-test', email: 'private@example.invalid', role: 'master_admin', customClaims: { admin: true } },
    settings: { id: 'config', businessName: 'Oficina', apiToken: 'do-not-export', theme: 'dark' },
    collections: {
      clients: [{ id: 'client-1', name: 'Fixture', apiKey: 'private', role: 'mechanic', adminRoleLabel: 'front desk', tokenizedDescription: 'tokenized part note', relatedOrderId: 'os-1' }],
      cash_launches: [{ id: 'os-1', clientId: 'client-1', value: 50, accessToken: 'private' }],
      whatsapp_sessions: [{ id: 'primary', status: 'connected', refreshToken: 'private', state: { auth: { sessionData: 'private' }, note: 'session data backup procedure' } }],
      fiscal_companies: [{ id: 'fiscal-1', certificateBase64: 'private-cert', certificatePassword: 'private-password', focusApiToken: 'private-token', taxId: 'business-id' }],
      fiscal_invoices: [{ id: 'invoice-1', accessKey: 'business-access-key', apiKey: 'private-api-key' }],
    },
  }, 'workshop-test', '2.1.0', '2026-10-31T12:00:00.000Z', 'motofix-source-test');
  const recovered = await decryptPortableBackup(await encryptPortableBackup(payload, password), password);
  assert.equal(recovered.data.profileSnapshot, null);
  assert.equal(recovered.data.settings?.apiToken, undefined);
  assert.equal(recovered.data.settings?.theme, 'dark');
  assert.equal(recovered.data.collections.clients[0].apiKey, undefined);
  assert.equal(recovered.data.collections.clients[0].role, 'mechanic');
  assert.equal(recovered.data.collections.clients[0].adminRoleLabel, 'front desk');
  assert.equal(recovered.data.collections.clients[0].tokenizedDescription, 'tokenized part note');
  assert.equal(recovered.data.collections.clients[0].id, 'client-1');
  assert.equal(recovered.data.collections.clients[0].relatedOrderId, 'os-1');
  assert.equal(recovered.data.collections.cash_launches[0].accessToken, undefined);
  assert.equal(recovered.data.collections.whatsapp_sessions[0].refreshToken, undefined);
  const sessionState = recovered.data.collections.whatsapp_sessions[0].state as Record<string, unknown>;
  assert.equal((sessionState.auth as Record<string, unknown>).sessionData, undefined);
  assert.equal(sessionState.note, 'session data backup procedure');
  assert.equal(recovered.data.collections.fiscal_companies[0].certificateBase64, undefined);
  assert.equal(recovered.data.collections.fiscal_companies[0].certificatePassword, undefined);
  assert.equal(recovered.data.collections.fiscal_companies[0].focusApiToken, undefined);
  assert.equal(recovered.data.collections.fiscal_companies[0].taxId, 'business-id');
  assert.equal(recovered.data.collections.fiscal_invoices[0].accessKey, 'business-access-key');
  assert.equal(recovered.data.collections.fiscal_invoices[0].apiKey, undefined);
});

test('política documenta todas as coleções e remove somente nomes sensíveis exatos', async () => {
  assert.deepEqual(
    Object.keys(backupFieldPolicy.sensitivePathsByCollection).sort(),
    [...portableBackupFormat.includedCollections].sort(),
  );
  const payload = await createPortableBackupPayload({
    profileSnapshot: null,
    settings: { id: 'config', companyName: 'Oficina', tokenizedDescription: 'preservar' },
    collections: {
      clients: [{ id: 'client-1', userId: 'workshop-test', role: 'mechanic', description: 'tokenized commercial note', nested: { apiKey: 'remove', apiKeyPolicy: 'preserve' } }],
      fiscal_companies: [{ id: 'fiscal-1', userId: 'workshop-test', certificatePassword: 'remove', taxId: 'business-id' }],
    },
  }, 'workshop-test', '2.1.0', '2026-10-31T12:00:00.000Z', 'motofix-source-test');
  assert.equal(payload.data.settings?.tokenizedDescription, 'preservar');
  assert.equal(payload.data.collections.clients[0].role, 'mechanic');
  assert.equal(payload.data.collections.clients[0].description, 'tokenized commercial note');
  assert.equal((payload.data.collections.clients[0].nested as Record<string, unknown>).apiKey, undefined);
  assert.equal((payload.data.collections.clients[0].nested as Record<string, unknown>).apiKeyPolicy, 'preserve');
  assert.equal(payload.data.collections.fiscal_companies[0].certificatePassword, undefined);
  assert.equal(payload.data.collections.fiscal_companies[0].taxId, 'business-id');
});

test('valida o limite de 300 MB sem alocar um arquivo desse tamanho', () => {
  assert.doesNotThrow(() => assertBackupSizeWithinLimit(300, 300));
  assert.throws(() => assertBackupSizeWithinLimit(301, 300), /300 MB/);
  assert.throws(() => assertBackupSizeWithinLimit(-1, 300), /tamanho informado/i);
});
