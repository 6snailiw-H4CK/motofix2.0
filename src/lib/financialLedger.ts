import type { CashPaymentEntry, CashPaymentMethod } from '../types';

export type CashOrderStatus = 'Em Lancamento' | 'Pendente' | 'Finalizado' | 'Cancelado';
export type CashPaymentStatus = 'Pago' | 'Pendente' | 'Parcial';

/** Returns a forced payment status for order states, or null to preserve draft behavior. */
export const getPaymentStatusForOrderStatus = (status: CashOrderStatus): CashPaymentStatus | null => {
  if (status === 'Finalizado') return 'Pago';
  if (status === 'Pendente' || status === 'Cancelado') return 'Pendente';
  return null;
};

export type PaymentAllocationInput = { method: CashPaymentMethod | ''; amount: number };

const toCents = (amount: number) => Math.round((Number.isFinite(amount) ? amount : 0) * 100);

export const validatePaymentAllocation = (expectedAmount: number, inputs: PaymentAllocationInput[]) => {
  const expectedCents = toCents(expectedAmount);
  const validInputs = inputs.filter((input) => input.amount > 0);
  if (expectedCents <= 0) return validInputs.length ? 'Não há valor novo a distribuir.' : null;
  if (validInputs.some((input) => !input.method || !Number.isFinite(input.amount))) {
    return 'Cada valor informado precisa ter uma forma de pagamento válida.';
  }
  const allocatedCents = validInputs.reduce((sum, input) => sum + toCents(input.amount), 0);
  return allocatedCents === expectedCents
    ? null
    : `A soma das formas de pagamento precisa ser ${expectedCents} centavos.`;
};

export const createPaymentEntries = (
  expectedAmount: number,
  inputs: PaymentAllocationInput[],
  receivedAt: string,
  createId: () => string,
): CashPaymentEntry[] => {
  const validationError = validatePaymentAllocation(expectedAmount, inputs);
  if (validationError) throw new Error(validationError);
  return inputs
    .filter((input) => input.amount > 0 && input.method)
    .map((input) => {
      const method = input.method as CashPaymentMethod;
      return {
        id: createId(),
        amount: Math.round(input.amount * 100) / 100,
        method,
        receivedAt,
        ...(['Pix', 'Dinheiro'].includes(method) ? { settledAt: receivedAt } : {}),
      };
    });
};

export const sumExpenseSettlements = (amounts: Array<{ amount: number }> = []) => (
  amounts.reduce((sum, entry) => sum + Math.max(0, Number(entry.amount) || 0), 0)
);

export const getOpenPayableAmount = (amount: number, settlements: Array<{ amount: number }> = []) => (
  Math.max(0, (Number(amount) || 0) - sumExpenseSettlements(settlements))
);
