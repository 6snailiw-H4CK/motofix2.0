import { ArrowLeft, CheckCircle2, DollarSign, ReceiptText, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { cn, safeFormat } from '../../lib/utils';
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

const getCashDebt = (launch: CashRegisterLaunch) => Math.max(0, Number(launch.total) || 0);

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
      .map((launch) => ({ launch, debt: getCashDebt(launch) }))
      .filter(({ launch, debt }) => (
        debt > 0
        && (launch.status === 'Pendente' || (launch.status === 'Finalizado' && !launch.invoiced))
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
      status: row.launch.status === 'Finalizado' && !row.launch.invoiced ? 'Finalizado sem faturar' : row.launch.status,
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
  const partialCount = pendingRows.filter(({ status }) => status.toLowerCase() === 'parcial').length;

  return (
    <div className="light-readable-view space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={onBack}
            className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-700/70 bg-slate-900/70 text-slate-300 transition hover:border-primary/40 hover:text-white"
            aria-label="Voltar"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-amber-300">Cobranca rapida</p>
            <h2 className="text-xl font-black text-white">Pendencias</h2>
            <p className="text-xs text-slate-400">Clientes com saldo a receber e acao direta para registrar pagamento.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
          <p className="text-[9px] font-bold uppercase tracking-widest text-amber-300">A receber</p>
          <p className="mt-1 text-lg font-black text-white">R$ {currency(totalDue)}</p>
        </div>
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
          <p className="text-[9px] font-bold uppercase tracking-widest text-primary">Clientes</p>
          <p className="mt-1 text-2xl font-black text-white">{combinedRows.length}</p>
        </div>
        <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-3">
          <p className="text-[9px] font-bold uppercase tracking-widest text-orange-300">Caixa</p>
          <p className="mt-1 text-2xl font-black text-white">{pendingCashRows.length}</p>
          {partialCount > 0 && <p className="mt-1 text-[9px] text-slate-500">{partialCount} parcial(is)</p>}
        </div>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar cliente, moto ou servico..."
          className="w-full rounded-xl border border-slate-800 bg-slate-950/50 py-3 pl-10 pr-3 text-sm text-white outline-none transition focus:border-primary/50"
        />
      </div>

      {filteredRows.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 text-center text-sm text-slate-400">
          Nenhuma pendencia encontrada.
        </div>
      ) : (
        <div className="space-y-2">
          {filteredRows.map((row) => {
            const isCash = row.type === 'cash';
            const isProcessing = !isCash && processingId === row.id;

            return (
              <article
                key={`${row.type}-${row.id}`}
                className="rounded-2xl border border-slate-800 bg-slate-900/55 p-3 shadow-lg shadow-black/10"
              >
                <div className="grid gap-3 md:grid-cols-[1.3fr_0.7fr_0.7fr_auto] md:items-center">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-base font-black text-white">{row.clientName}</p>
                      {isCash && (
                        <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-widest text-sky-300">
                          Caixa
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-slate-400">{row.bikeModel} - {row.label}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 md:contents">
                    <div className="rounded-xl bg-slate-950/40 p-2 md:bg-transparent md:p-0">
                      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Valor devido</p>
                      <p className="mt-1 font-black text-primary">R$ {currency(row.debt)}</p>
                    </div>
                    <div className="rounded-xl bg-slate-950/40 p-2 md:bg-transparent md:p-0">
                      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Data</p>
                      <p className="mt-1 font-bold text-white">{safeFormat(row.date) || '-'}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 md:justify-end">
                    <span
                      className={cn(
                        'rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-widest',
                        row.status.toLowerCase() === 'parcial'
                          ? 'bg-orange-500/10 text-orange-300'
                          : isCash
                            ? 'bg-sky-500/10 text-sky-300'
                          : 'bg-primary/10 text-primary'
                      )}
                    >
                      {row.status}
                    </span>
                    {isCash ? (
                      <button
                        type="button"
                        onClick={() => onOpenCashLaunch(row.launch)}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-500 px-3 py-2 text-xs font-bold text-white transition hover:bg-sky-600"
                      >
                        <ReceiptText className="h-4 w-4" />
                        Abrir caixa
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void onRegisterPayment(row.maintenance)}
                        disabled={isProcessing}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
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
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
