import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectLocalOperationalStorage } from '../src/services/localCashLaunchRepository';
import { inspectLocalDraftStorage } from '../src/services/localDrafts';

const withStorage = async (run: () => void | Promise<void>, initial: Record<string, string> = {}) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const values = new Map(Object.entries(initial));
  const storage = {
    get length() { return values.size; },
    key(index: number) { return Array.from(values.keys())[index] ?? null; },
    getItem(key: string) { return values.get(key) ?? null; },
    setItem(key: string, value: string) { values.set(key, value); },
    removeItem(key: string) { values.delete(key); },
  };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: storage } });
  try { await run(); }
  finally {
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else Reflect.deleteProperty(globalThis, 'window');
  }
};

test('audita registros locais de O.S./estoque e rascunhos sem modificar o armazenamento', async () => {
  const before = {
    cash: JSON.stringify([{ id: 'cash-1', userId: 'workshop-1' }]),
    products: JSON.stringify([{ id: 'product-1', userId: 'workshop-1' }]),
    draft: JSON.stringify({ key: 'workshop-1:client-1', label: 'Cliente', scope: 'clientes', updatedAt: '2026-10-24', data: { name: 'Fictício' } }),
  };
  await withStorage(() => {
    const operational = inspectLocalOperationalStorage();
    const drafts = inspectLocalDraftStorage();
    assert.equal(operational.readable, true);
    assert.equal(operational.cashLaunches.length, 1);
    assert.equal(operational.products.length, 1);
    assert.equal(drafts.readable, true);
    assert.equal(drafts.records.length, 1);
    assert.equal(drafts.records[0].key, 'workshop-1:client-1');
  }, {
    'motofix:local-cash-launches': before.cash,
    'motofix:local-products': before.products,
    'motofix:draft:workshop-1:client-1': before.draft,
  });
});

test('detecta JSON e registros operacionais malformados sem apagá-los', async () => {
  const rawMalformed = '{invalid';
  await withStorage(() => {
    const operational = inspectLocalOperationalStorage();
    const drafts = inspectLocalDraftStorage();
    assert.equal(operational.readable, false);
    assert.equal(operational.malformedCount, 1);
    assert.equal(drafts.readable, false);
    assert.equal(drafts.malformedCount, 1);
  }, {
    'motofix:local-cash-launches': rawMalformed,
    'motofix:local-products': '[]',
    'motofix:draft:bad': rawMalformed,
  });
});

test('detecta registros locais sem ID em vez de ignorá-los na cobertura', async () => {
  await withStorage(() => {
    const operational = inspectLocalOperationalStorage();
    assert.equal(operational.readable, false);
    assert.equal(operational.malformedCount, 1);
    assert.equal(operational.cashLaunches.length, 0);
  }, {
    'motofix:local-cash-launches': JSON.stringify([{ userId: 'workshop-1', status: 'Pendente' }]),
    'motofix:local-products': '[]',
  });
});
