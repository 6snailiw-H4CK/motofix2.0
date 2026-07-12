import type { CashPaymentMethod, CashRegisterLaunch } from '../types';

const cashPaymentMethods: CashPaymentMethod[] = ['Debito', 'Credito', 'Pix', 'Dinheiro'];

export function validateCashLaunchData(data: Partial<CashRegisterLaunch>) {
  // Business rule: active payable launches must contain merchandise.
  const status = data.status;
  const items = Array.isArray(data.items) ? data.items : [];
  const merchandiseTotal = Number(data.merchandiseTotal || 0);

  if (status && status !== 'Em Lancamento' && status !== 'Cancelado') {
    if (items.length === 0 || merchandiseTotal <= 0) {
      throw new Error('O.S. sem mercadoria nao permitida para status finalizado ou pendente.');
    }
  }

  if (data.paymentMethod && !cashPaymentMethods.includes(data.paymentMethod)) {
    throw new Error('Forma de pagamento invalida para faturamento da O.S.');
  }

  if (data.invoiced && !data.paymentMethod) {
    throw new Error('Informe a forma de pagamento antes de faturar a O.S.');
  }
}
