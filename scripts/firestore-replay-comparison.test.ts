import assert from 'node:assert/strict';
import test from 'node:test';
import type { FirestoreReplayMutation } from '../src/services/firestoreOfflineQueue';
import { inspectStockReplayBaseline, mutationMatchesRemoteData } from '../src/services/firestoreReplayComparison';

const update = (data: Record<string, unknown>): FirestoreReplayMutation => ({
  operation: 'update',
  path: ['users', 'owner', 'clients', 'client'],
  data,
});

test('updatedAt mais recente no servidor não transforma alteração já aplicada em conflito', () => {
  assert.equal(
    mutationMatchesRemoteData(
      update({ returnArchived: true, updatedAt: '2026-10-22T14:02:04.270Z' }),
      { returnArchived: true, updatedAt: '2026-10-22T18:55:00.000Z' },
    ),
    true,
  );
});

test('mudança em campo de negócio continua sendo conflito', () => {
  assert.equal(
    mutationMatchesRemoteData(
      update({ returnArchived: true, updatedAt: '2026-10-22T14:02:04.270Z' }),
      { returnArchived: false, updatedAt: '2026-10-22T18:55:00.000Z' },
    ),
    false,
  );
});

test('campos de negócio múltiplos precisam coincidir antes de considerar a escrita aplicada', () => {
  assert.equal(
    mutationMatchesRemoteData(
      update({ returnArchived: true, contact: 'old-value', updatedAt: '2026-10-22T14:02:04.270Z' }),
      { returnArchived: true, contact: 'new-value', updatedAt: '2026-10-22T18:55:00.000Z' },
    ),
    false,
  );
});

test('atualização que só altera updatedAt continua exigindo correspondência exata', () => {
  assert.equal(
    mutationMatchesRemoteData(
      update({ updatedAt: '2026-10-22T14:02:04.270Z' }),
      { updatedAt: '2026-10-22T18:55:00.000Z' },
    ),
    false,
  );
});

const stockBatch = (products: Array<{ id: string; previous: number; next: number }>) => {
  const movementId = 'stock-op-test';
  const productMutations: FirestoreReplayMutation[] = products.map(({ id, next }) => ({
    operation: 'update',
    path: ['users', 'owner', 'products', id],
    data: { stockQuantity: next, variations: [], stockMovementId: movementId },
  }));
  const movement: FirestoreReplayMutation = {
    operation: 'set',
    path: ['users', 'owner', 'stock_movements', movementId],
    data: {
      userId: 'owner',
      type: 'ajuste_manual',
      batchId: movementId,
      productIds: products.map(({ id }) => id),
      changes: Object.fromEntries(products.map(({ id, previous, next }) => [id, {
        productId: id,
        previousQuantity: previous,
        nextQuantity: next,
        previousVariations: [],
        nextVariations: [],
      }])),
    },
  };
  return { mutations: [...productMutations, movement], movementId };
};

test('lote de estoque offline pode ser reenviado quando o saldo remoto ainda é o mesmo', () => {
  const { mutations } = stockBatch([{ id: 'p1', previous: 3, next: 5 }]);
  const remote = new Map<string, Record<string, unknown> | null>([
    ['users/owner/products/p1', { stockQuantity: 3, variations: [] }],
    ['users/owner/stock_movements/stock-op-test', null],
  ]);
  assert.equal(inspectStockReplayBaseline(mutations, remote), null);
});

test('lote de estoque offline é bloqueado com mensagem clara se o saldo remoto mudou', () => {
  const { mutations } = stockBatch([{ id: 'p1', previous: 3, next: 5 }]);
  const remote = new Map<string, Record<string, unknown> | null>([
    ['users/owner/products/p1', { stockQuantity: 4, variations: [] }],
    ['users/owner/stock_movements/stock-op-test', null],
  ]);
  assert.match(inspectStockReplayBaseline(mutations, remote) || '', /mudou no Firebase/);
});

test('lote de estoque offline é bloqueado se as variações remotas mudaram', () => {
  const { mutations } = stockBatch([{ id: 'p1', previous: 3, next: 5 }]);
  const remote = new Map<string, Record<string, unknown> | null>([
    ['users/owner/products/p1', { stockQuantity: 3, variations: [{ id: 'v1', stockQuantity: 1 }] }],
    ['users/owner/stock_movements/stock-op-test', null],
  ]);
  assert.match(inspectStockReplayBaseline(mutations, remote) || '', /mudou no Firebase/);
});

test('lote que atualiza vários produtos confere o saldo-base de cada um', () => {
  const { mutations } = stockBatch([
    { id: 'p1', previous: 3, next: 5 },
    { id: 'p2', previous: 8, next: 6 },
  ]);
  const remote = new Map<string, Record<string, unknown> | null>([
    ['users/owner/products/p1', { stockQuantity: 3, variations: [] }],
    ['users/owner/products/p2', { stockQuantity: 8, variations: [] }],
    ['users/owner/stock_movements/stock-op-test', null],
  ]);
  assert.equal(inspectStockReplayBaseline(mutations, remote), null);
  remote.set('users/owner/products/p2', { stockQuantity: 9, variations: [] });
  assert.match(inspectStockReplayBaseline(mutations, remote) || '', /mudou no Firebase/);
});

test('lote sem vínculo completo entre produto e movimentação é bloqueado', () => {
  const { mutations } = stockBatch([{ id: 'p1', previous: 3, next: 5 }]);
  mutations[mutations.length - 1].data.productIds = [];
  const remote = new Map<string, Record<string, unknown> | null>([
    ['users/owner/products/p1', { stockQuantity: 3, variations: [] }],
    ['users/owner/stock_movements/stock-op-test', null],
  ]);
  assert.match(inspectStockReplayBaseline(mutations, remote) || '', /vínculo válido/);
});

test('edição comum de produto sem nova movimentação não é classificada como lote de estoque', () => {
  const { mutations } = stockBatch([{ id: 'p1', previous: 3, next: 5 }]);
  mutations.splice(1, 1);
  mutations[0] = {
    ...mutations[0],
    data: { description: 'Nome atualizado', stockQuantity: 3, variations: [], stockMovementId: 'stock-op-old' },
  };
  assert.equal(inspectStockReplayBaseline(mutations, new Map()), null);
});
