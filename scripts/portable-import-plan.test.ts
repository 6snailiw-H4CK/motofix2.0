import test from 'node:test';
import assert from 'node:assert/strict';
import { createPortableBackupPayload, hashPortableBackupData } from '../src/services/portableBackup';
import { createPortableImportPlan } from '../src/services/portableImportPlan';

const sourceUid = 'source-workshop-uid';
const targetUid = 'target-workshop-uid';

const makePayload = async (overrides: Record<string, unknown> = {}) => createPortableBackupPayload({
  profileSnapshot: { uid: sourceUid, email: 'old-owner@example.invalid', role: 'master_admin', ownerAccess: { permanent: true } },
  settings: { id: 'config', userId: sourceUid, businessName: 'Oficina origem' },
  collections: {
    clients: [{ id: 'client-1', userId: sourceUid, name: 'Cliente', createdAt: { __motofixType: 'timestamp', seconds: 1_800_000_000, nanoseconds: 0 } }],
    products: [{ id: 'product-1', userId: sourceUid, description: 'Óleo', stockQuantity: 3 }],
    cash_launches: [{
      id: 'os-1', userId: sourceUid, clientId: 'client-1', status: 'Finalizado',
      paymentEntries: [{ method: 'Pix', amount: 25 }], stockMovementId: 'movement-1', stockMovementBatchId: 'batch-1',
    }, { id: 'os-cancelled', userId: sourceUid, clientId: 'client-1', status: 'Cancelado', items: [] }],
    stock_movements: [{
      id: 'movement-1', userId: sourceUid, cashLaunchId: 'os-1', batchId: 'batch-1',
      productIds: ['product-1'], changes: { 'product-1': { productId: 'product-1', quantity: 1 } },
      parentRef: { __motofixType: 'document-reference', path: `users/${sourceUid}/cash_launches/os-1` },
    }],
  },
  excludedCollections: ['fiscal_private'],
  ...overrides,
}, sourceUid, '2.1.0', '2026-10-24T12:00:00.000Z');

test('monta plano sem gravação, remapeia propriedade/referência e preserva relações e históricos', async () => {
  const payload = await makePayload();
  const plan = await createPortableImportPlan(payload, { projectId: 'motofix-destination-test', uid: targetUid });

  assert.equal(plan.canImport, true);
  assert.equal(plan.destinationProjectId, 'motofix-destination-test');
  assert.equal(plan.sourceWorkshopId, sourceUid);
  assert.equal(plan.documents.length, 6);
  assert.equal(plan.excludedProfileSnapshot, true);
  assert.equal(plan.excludedLocalRecovery, true);
  assert.equal(plan.documents.find((item) => item.collection === 'clients')?.data.userId, targetUid);
  assert.equal(plan.documents.find((item) => item.collection === 'settings')?.data.userId, targetUid);
  const cancelled = plan.documents.find((item) => item.id === 'os-cancelled');
  assert.equal(cancelled?.data.status, 'Cancelado');
  const paid = plan.documents.find((item) => item.id === 'os-1');
  assert.deepEqual(paid?.data.paymentEntries, [{ method: 'Pix', amount: 25 }]);
  const movement = plan.documents.find((item) => item.id === 'movement-1');
  assert.deepEqual(movement?.data.parentRef, {
    __motofixType: 'document-reference',
    path: `users/${targetUid}/cash_launches/os-1`,
  });
  assert.equal(plan.issues.length, 0);
});

test('bloqueia referências quebradas e propriedade de outra oficina antes da gravação', async () => {
  const missingReference = await makePayload({
    collections: {
      clients: [{ id: 'client-1', userId: sourceUid }],
      cash_launches: [{ id: 'os-1', userId: sourceUid, clientId: 'missing-client' }],
    },
  });
  const missingPlan = await createPortableImportPlan(missingReference, { projectId: 'motofix-destination-test', uid: targetUid });
  assert.equal(missingPlan.canImport, false);
  assert.ok(missingPlan.issues.some((issue) => issue.code === 'missing_reference'));

  const foreignOwner = await makePayload({
    collections: { clients: [{ id: 'client-1', userId: 'unrelated-workshop' }] },
  });
  const foreignPlan = await createPortableImportPlan(foreignOwner, { projectId: 'motofix-destination-test', uid: targetUid });
  assert.equal(foreignPlan.canImport, false);
  assert.ok(foreignPlan.issues.some((issue) => issue.code === 'foreign_owner'));
});

test('bloqueia campos de privilégio explícitos, referências fora da oficina e projeto inválido', async () => {
  const unsafe = await makePayload({
    collections: {
      clients: [{ id: 'client-1', userId: sourceUid, ownerAccess: { permanent: true } }],
      stock_movements: [{
        id: 'movement-1', userId: sourceUid,
        ref: { __motofixType: 'document-reference', path: 'access_requests/another-user' },
      }],
    },
  });
  unsafe.data.collections.clients[0].ownerAccess = { permanent: true };
  unsafe.manifest.dataSha256 = await hashPortableBackupData(unsafe.data);
  const plan = await createPortableImportPlan(unsafe, { projectId: 'bad', uid: targetUid });
  assert.equal(plan.canImport, false);
  assert.ok(plan.issues.some((issue) => issue.code === 'privileged_field'));
  assert.ok(plan.issues.some((issue) => issue.code === 'external_document_reference'));
  assert.ok(plan.issues.some((issue) => issue.code === 'invalid_destination_project'));

  const malformedReference = await makePayload({
    collections: {
      clients: [{
        id: 'client-1',
        userId: sourceUid,
        ref: { __motofixType: 'document-reference', path: 'users/' + sourceUid + '/clients' },
      }],
    },
  });
  const malformedPlan = await createPortableImportPlan(malformedReference, { projectId: 'motofix-destination-test', uid: targetUid });
  assert.ok(malformedPlan.issues.some((issue) => issue.code === 'invalid_document_reference'));

  const invalidSourceProject = await makePayload();
  invalidSourceProject.manifest.sourceProjectId = '../untrusted';
  const invalidSourcePlan = await createPortableImportPlan(invalidSourceProject, { projectId: 'motofix-destination-test', uid: targetUid });
  assert.ok(invalidSourcePlan.issues.some((issue) => issue.code === 'invalid_source_project'));
});

test('preserva campos comerciais exatos e nomes com termos semelhantes no plano de importação', async () => {
  const payload = await makePayload({
    collections: {
      clients: [{
        id: 'client-1', userId: sourceUid, role: 'mechanic',
        adminRoleLabel: 'service advisor', tokenizedDescription: 'tokenized note',
      }],
    },
  });
  const plan = await createPortableImportPlan(payload, { projectId: 'motofix-destination-test', uid: targetUid });
  assert.equal(plan.canImport, true);
  const client = plan.documents.find((document) => document.collection === 'clients')?.data;
  assert.equal(client?.role, 'mechanic');
  assert.equal(client?.adminRoleLabel, 'service advisor');
  assert.equal(client?.tokenizedDescription, 'tokenized note');
});
