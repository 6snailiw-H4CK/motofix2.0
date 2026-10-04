import { ArrowLeft, CheckCircle2, DollarSign, ReceiptText, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { cn, safeFormat } from '../../lib/utils';
import { getCashPaymentStatus, getCashReceivableAmount } from '../../lib/cashPayments';
import type { CashRegisterLaunch, MaintenanceRecord } from '../../types';

type PendenciesViewProps = {
  cashLaunches: CashRegisterLaunch[];
  maintenances: MaintenanceRecord[];
  processingId?: string | null;
  onBack: () => void;
  onOpenCashLaunch: (launch: CashRegisterLaunch) => void;
  onRegisterPayment: (maintenance: MaintenanceRecord) => Promise<void> | void;
};

const normalizeStatus = (status?: string) => String(status || 'Pago').trim();

const getDebt = (maintenance: MaintenanceRecord) => {
  const stored = Number(maintenance.saldoDevedor);
  if (Number.isFinite(stored) && stored > 0) return stored;
  const total = Number(maintenance.serviceValue) || 0;
  const paid = Number(maintenance.valorPago) || 0;
  return Math.max(0, total - paid);
};

const currency = (value: number) =>
  value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export const PendenciesView = ({
  cashLaunches,
  maintenances,
  processingId,
  onBack,
  onOpenCashLaunch,
  onRegisterPayment,
}: PendenciesViewProps) => {
  const [query, setQuery] = useState('');
  const pendingRows = useMemo(() => (
    maintenances
      .map((maintenance) => ({ maintenance, debt: getDebt(maintenance), status: normalizeStatus(maintenance.statusPagamento) }))
      .filter(({ debt, status }) => debt > 0 && status.toLowerCase() !== 'pago')
      .sort((a, b) => {
        if (b.debt !== a.debt) return b.debt - a.debt;
        return new Date(a.maintenance.date).getTime() - new Date(b.maintenance.date).getTime();
      })
  ), [maintenances]);
  const pendingCashRows = useMemo(() => (
    cashLaunches
      .map((launch) => ({ launch, debt: getCashReceivableAmount(launch) }))
      .filter(({ launch, debt }) => (
        debt > 0
      ))
      .sort((a, b) => {
        if (b.debt !== a.debt) return b.debt - a.debt;
        return new Date(a.launch.openingDate || a.launch.createdAt).getTime() - new Date(b.launch.openingDate || b.launch.createdAt).getTime();
      })
  ), [cashLaunches]);
  const combinedRows = useMemo(() => [
    ...pendingRows.map((row) => ({
      id: row.maintenance.id,
      type: 'maintenance' as const,
      clientName: row.maintenance.clientName || 'Cliente sem nome',
      bikeModel: row.maintenance.bikeModel || 'Moto nao informada',
      label: row.maintenance.serviceType || 'Servico',
      date: row.maintenance.date,
      debt: row.debt,
      status: row.status,
      maintenance: row.maintenance,
    })),
    ...pendingCashRows.map((row) => ({
      id: row.launch.id,
      type: 'cash' as const,
      clientName: row.launch.clientName || 'Cliente sem nome',
      bikeModel: row.launch.bikeModel || 'Moto nao informada',
      label: row.launch.orderNumber || 'Lancamento caixa',
      date: row.launch.openingDate || row.launch.createdAt,
      debt: row.debt,
      status: getCashPaymentStatus(row.launch),
      launch: row.launch,
    })),
  ].sort((a, b) => {
    if (b.debt !== a.debt) return b.debt - a.debt;
    return new Date(a.date).getTime() - new Date(b.date).getTime();
  }), [pendingCashRows, pendingRows]);

  const normalizedQuery = query.toLowerCase().trim();
  const filteredRows = normalizedQuery
    ? combinedRows.filter((row) => (
      row.clientName.toLowerCase().includes(normalizedQuery)
      || row.bikeModel.toLowerCase().includes(normalizedQuery)
      || row.label.toLowerCase().includes(normalizedQuery)
      || row.status.toLowerCase().includes(normalizedQuery)
    ))
    : combinedRows;

  const totalDue = combinedRows.reduce((sum, row) => sum + row.debt, 0);
  const partialCount = pendingRows.filter(({ status }) => status.toLowerCase() === 'parcial').length
    + pendingCashRows.filter(({ launch }) => getCashPaymentStatus(launch) === 'Parcial').length;

  return (
    <div className="light-readable-view space-y-4">
      <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={onBack}
            className="mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-slate-700/80 bg-slate-900/70 text-slate-300 transition hover:border-amber-400/40 hover:bg-slate-800 hover:text-white"
            aria-label="Voltar"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-orange-400">Cobranca rapida</p>
            <h2 className="mt-0.5 text-2xl font-black tracking-tight text-white">Pendencias</h2>
            <p className="mt-0.5 text-xs text-slate-400 sm:text-sm">Clientes com valores em aberto. Utilize esta area para registrar pagamentos.</p>
          </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex items-center gap-3 rounded-xl border border-orange-500/25 bg-gradient-to-r from-orange-500/[0.09] to-slate-900/60 p-3.5 shadow-lg shadow-black/10 sm:p-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-orange-500/10 text-orange-400">
            <DollarSign className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">A receber</p>
            <p className="mt-0.5 truncate text-xl font-black text-white">R$ {currency(totalDue)}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-slate-700/80 bg-gradient-to-r from-slate-800/50 to-slate-900/60 p-3.5 shadow-lg shadow-black/10 sm:p-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-orange-500/10 text-orange-400">
            <CheckCircle2 className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Clientes</p>
            <p className="mt-1 text-2xl font-black leading-none text-white">{combinedRows.length}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-orange-500/25 bg-gradient-to-r from-orange-500/[0.06] to-slate-900/60 p-3.5 shadow-lg shadow-black/10 sm:p-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-orange-500/10 text-orange-400">
            <ReceiptText className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Caixa</p>
            <p className="mt-1 text-2xl font-black leading-none text-white">{pendingCashRows.length}</p>
            {partialCount > 0 && <p className="mt-1.5 text-[10px] font-medium text-slate-400">{partialCount} parcial(is)</p>}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-700/80 bg-slate-900/45 p-2 shadow-lg shadow-black/10">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar cliente, moto ou servico..."
            className="w-full rounded-lg border border-transparent bg-transparent py-2.5 pl-10 pr-3 text-sm text-white outline-none transition placeholder:text-slate-400 focus:border-primary/50 focus:bg-slate-950/60"
          />
        </div>
      </div>

      {filteredRows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 px-6 py-14 text-center text-sm text-slate-400">
          Nenhuma pendencia encontrada.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/30 shadow-lg shadow-black/10">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left">
              <thead className="border-b border-slate-800 bg-slate-800/45 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-4 py-3.5">Cliente</th>
                  <th className="px-4 py-3.5">Valor devido</th>
                  <th className="px-4 py-3.5">Data</th>
                  <th className="px-4 py-3.5 text-center">Status</th>
                  <th className="px-4 py-3.5 text-right">Acao</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/90">
                {filteredRows.map((row) => {
                  const isCash = row.type === 'cash';
                  const isProcessing = !isCash && processingId === row.id;

                  return (
                    <tr key={`${row.type}-${row.id}`} className="transition-colors hover:bg-slate-800/25">
                      <td className="max-w-[420px] px-4 py-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <p className="truncate text-sm font-black text-slate-100">{row.clientName}</p>
                          {isCash && (
                            <span className="shrink-0 rounded-md bg-sky-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-sky-300">
                              Caixa
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 truncate text-[11px] text-slate-400">
                          {row.bikeModel} <span className="px-1 text-slate-600">·</span> {row.label}
                        </p>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className="mb-0.5 block text-[9px] font-bold uppercase tracking-wider text-slate-500">Valor devido</span>
                        <span className="text-sm font-black text-orange-400">R$ {currency(row.debt)}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className="mb-0.5 block text-[9px] font-bold uppercase tracking-wider text-slate-500">Data</span>
                        <span className="text-xs font-bold text-slate-200">{safeFormat(row.date) || '-'}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={cn(
                            'inline-flex rounded-lg px-2.5 py-1 text-[9px] font-black uppercase tracking-wide',
                            row.status.toLowerCase() === 'parcial'
                              ? 'bg-orange-500/15 text-orange-300'
                              : row.status.toLowerCase() === 'pendente'
                                ? 'bg-rose-500/15 text-rose-300'
                                : 'bg-slate-700/60 text-slate-300'
                          )}
                        >
                          {row.status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right">
                        {isCash ? (
                          <button
                            type="button"
                            onClick={() => onOpenCashLaunch(row.launch)}
                            className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-500 px-3.5 py-2 text-xs font-bold text-white shadow-sm shadow-sky-950/30 transition hover:bg-sky-400"
                          >
                            <ReceiptText className="h-4 w-4" />
                            Abrir caixa
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void onRegisterPayment(row.maintenance)}
                            disabled={isProcessing}
                            className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-3.5 py-2 text-xs font-bold text-white shadow-sm shadow-emerald-950/30 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                          >
                            {isProcessing ? (
                              <>
                                <DollarSign className="h-4 w-4" />
                                Salvando...
                              </>
                            ) : (
                              <>
                                <CheckCircle2 className="h-4 w-4" />
                                Registrar pagamento
                              </>
                            )}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
