import assert from 'node:assert/strict';
import test from 'node:test';
import { createPaymentEntries, getOpenPayableAmount, getPaymentStatusForOrderStatus, validatePaymentAllocation } from './financialLedger';

test('order status controls payment status for pending, finalized and canceled orders', () => {
  assert.equal(getPaymentStatusForOrderStatus('Pendente'), 'Pendente');
  assert.equal(getPaymentStatusForOrderStatus('Finalizado'), 'Pago');
  assert.equal(getPaymentStatusForOrderStatus('Cancelado'), 'Pendente');
  assert.equal(getPaymentStatusForOrderStatus('Em Lancamento'), null, 'budget status preserves its current payment selection');
});

test('allocates one O.S. receipt across different payment methods without losing cents', () => {
  const lines = [
    { method: 'Debito' as const, amount: 90 },
    { method: 'Credito' as const, amount: 110 },
  ];
  assert.equal(validatePaymentAllocation(200, lines), null);
  const entries = createPaymentEntries(200, lines, '2026-10-22T12:00:00.000Z', () => `payment-${Math.random()}`);
  assert.deepEqual(entries.map(({ method, amount }) => [method, amount]), [['Debito', 90], ['Credito', 110]]);
  assert.ok(entries.every((entry) => entry.receivedAt === '2026-10-22T12:00:00.000Z'));
  assert.equal(entries[0].settledAt, undefined, 'Débito aguarda o repasse da operadora');
  assert.equal(entries[1].settledAt, undefined, 'Crédito aguarda o repasse da operadora');
});

test('Pix and cash are realized immediately; card payments await operator settlement', () => {
  const entries = createPaymentEntries(80, [
    { method: 'Pix', amount: 30 },
    { method: 'Dinheiro', amount: 20 },
    { method: 'Debito', amount: 15 },
    { method: 'Credito', amount: 15 },
  ], '2026-10-22T12:00:00.000Z', () => 'payment-id');
  assert.equal(entries[0].settledAt, entries[0].receivedAt);
  assert.equal(entries[1].settledAt, entries[1].receivedAt);
  assert.equal(entries[2].settledAt, undefined);
  assert.equal(entries[3].settledAt, undefined);
});

test('rejects a split that does not match the new amount received', () => {
  assert.match(
    validatePaymentAllocation(200, [{ method: 'Debito', amount: 90 }, { method: 'Credito', amount: 100 }]) || '',
    /centavos/,
  );
});

test('computes open payable from recorded invoice settlements without re-counting the expense', () => {
  assert.equal(getOpenPayableAmount(1000, [{ amount: 250 }, { amount: 300 }]), 450);
  assert.equal(getOpenPayableAmount(1000, [{ amount: 1000 }]), 0);
});
