import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldUseStockRestoreOnDelete } from '../src/services/cashRegisterDeleteLogic.ts';

test('uses stock restore flow for finalized launches', () => {
  assert.equal(shouldUseStockRestoreOnDelete({ status: 'Finalizado', stockDeducted: false, invoiced: false }), true);
});

test('uses stock restore flow when stock was already deducted', () => {
  assert.equal(shouldUseStockRestoreOnDelete({ status: 'Em Lancamento', stockDeducted: true, invoiced: false }), true);
});

test('uses stock restore flow for invoiced launches', () => {
  assert.equal(shouldUseStockRestoreOnDelete({ status: 'Pendente', stockDeducted: false, invoiced: true }), true);
});

test('keeps simple soft delete flow for non-finalized launches', () => {
  assert.equal(shouldUseStockRestoreOnDelete({ status: 'Pendente', stockDeducted: false, invoiced: false }), false);
});
