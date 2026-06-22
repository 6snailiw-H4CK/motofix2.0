import type { CashRegisterLaunch } from '../types';

export function validateCashLaunchData(data: Partial<CashRegisterLaunch>) {
  // Business rule: when a launch is not in 'Em Lancamento', it must contain merchandise
  const status = data.status;
  const items = Array.isArray(data.items) ? data.items : [];
  const merchandiseTotal = Number(data.merchandiseTotal || 0);

  if (status && status !== 'Em Lancamento') {
    if (items.length === 0 || merchandiseTotal <= 0) {
      throw new Error('O.S. sem mercadoria nao permitida para status finalizado ou pendente.');
    }
  }
}
