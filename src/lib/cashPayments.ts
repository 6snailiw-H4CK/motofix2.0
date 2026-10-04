import type { CashRegisterLaunch } from '../types';

export type CashPaymentStatus = NonNullable<CashRegisterLaunch['statusPagamento']>;
type CashPaymentRecord = Pick<CashRegisterLaunch, 'total' | 'statusPagamento' | 'valorPago' | 'status' | 'invoiced'>;

const toAmount = (value?: number | string | null) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

export const isCashLaunchFinancial = (launch: CashRegisterLaunch) => (
  launch.status === 'Pendente' || launch.status === 'Finalizado'
);

export const getCashPaymentStatus = (launch: CashPaymentRecord): CashPaymentStatus => {
  if (launch.statusPagamento) return launch.statusPagamento;
  return launch.status === 'Finalizado' && launch.invoiced ? 'Pago' : 'Pendente';
};

export const getCashPaidAmount = (launch: CashPaymentRecord) => {
  const total = toAmount(launch.total);
  const status = getCashPaymentStatus(launch);

  if (status === 'Pago') return total;
  if (status === 'Parcial') return Math.min(total, toAmount(launch.valorPago));
  return 0;
};

export const getCashReceivableAmount = (launch: CashRegisterLaunch) => {
  if (!isCashLaunchFinancial(launch) || getCashPaymentStatus(launch) === 'Pago') return 0;

  const total = toAmount(launch.total);
  const explicitBalance = toAmount(launch.saldoDevedor);
  return explicitBalance > 0 ? Math.min(total, explicitBalance) : Math.max(0, total - getCashPaidAmount(launch));
};
