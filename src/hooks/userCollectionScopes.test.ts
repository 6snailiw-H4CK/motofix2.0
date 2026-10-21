import assert from 'node:assert/strict';
import test from 'node:test';
import { getUserCollectionsForView } from './userCollectionScopes';

test('dashboard avoids subscribing to collections belonging to other tools', () => {
  assert.deepEqual(
    [...getUserCollectionsForView('dashboard')].sort(),
    ['appointments', 'cash_launches', 'clients', 'maintenances', 'settings', 'warranties'].sort(),
  );
});

test('tool screens subscribe only to their required collections and shared settings', () => {
  assert.deepEqual(
    [...getUserCollectionsForView('products')].sort(),
    ['products', 'settings'].sort(),
  );
  assert.deepEqual(
    [...getUserCollectionsForView('expenses')].sort(),
    ['expenses', 'settings'].sort(),
  );
});

test('master admin does not subscribe to operational user collections', () => {
  assert.deepEqual([...getUserCollectionsForView('master-admin')], []);
});
