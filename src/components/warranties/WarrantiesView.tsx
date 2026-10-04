import { differenceInCalendarDays, format, parseISO, startOfDay } from 'date-fns';
import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownWideNarrow,
  CalendarDays,
  CheckCircle,
  CheckCircle2,
  ChevronDown,
  FileText,
  Link2,
  Pencil,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import type { Warranty } from '../../types';

type WarrantiesViewProps = {
  warranties: Warranty[];
  deleteConfirmId?: string | null;
  onNewWarranty: () => void;
  onEditWarranty: (warranty: Warranty) => void;
  onGeneratePDF: (warranty: Warranty) => void;
  onOpenCashLaunch: (cashLaunchId: string) => void;
  onDeleteWarrantyClick: (warranty: Warranty) => void;
};

type WarrantyFilter = 'all' | 'valid' | 'expiring' | 'expired';
type WarrantySort = 'recent' | 'oldest' | 'expiry';

const getDaysUntilExpiry = (warranty: Warranty) => (
  differenceInCalendarDays(parseISO(warranty.expiryDate), startOfDay(new Date()))
);

const getWarrantyStatus = (daysUntilExpiry: number) => {
  if (daysUntilExpiry < 0) return 'expired';
  if (daysUntilExpiry <= 7) return 'expiring';
  return 'valid';
};

const warrantyStatusStyles = {
  valid: 'bg-emerald-500/10 text-emerald-300',
  expiring: 'bg-amber-500/10 text-amber-300',
  expired: 'bg-red-500/10 text-red-300',
} as const;

const warrantyStatusLabels = {
  valid: 'Valida',
  expiring: 'A vencer',
  expired: 'Vencida',
} as const;

export const WarrantiesView = ({
  warranties,
  deleteConfirmId,
  onNewWarranty,
  onEditWarranty,
  onGeneratePDF,
  onOpenCashLaunch,
  onDeleteWarrantyClick,
}: WarrantiesViewProps) => {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<WarrantyFilter>('all');
  const [sortOrder, setSortOrder] = useState<WarrantySort>('recent');

  const visibleWarranties = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('pt-BR');
    return warranties
      .filter((warranty) => {
        const daysUntilExpiry = getDaysUntilExpiry(warranty);
        const matchesStatus = statusFilter === 'all' || getWarrantyStatus(daysUntilExpiry) === statusFilter;
        const matchesQuery = !normalizedQuery || [
          warranty.clientName,
          warranty.clientPhone,
          warranty.serviceType,
          warranty.serviceDescription,
          String(warranty.warrantyNumber),
          warranty.cashLaunchOrderNumber || '',
        ].some((value) => value.toLocaleLowerCase('pt-BR').includes(normalizedQuery));
        return matchesStatus && matchesQuery;
      })
      .sort((a, b) => {
        if (sortOrder === 'expiry') return a.expiryDate.localeCompare(b.expiryDate);
        const dateComparison = a.serviceDate.localeCompare(b.serviceDate);
        return sortOrder === 'recent' ? -dateComparison : dateComparison;
      });
  }, [query, sortOrder, statusFilter, warranties]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Garantias</p>
          <h2 className="mt-0.5 text-2xl font-black tracking-tight text-white sm:text-3xl">Garantias</h2>
          <p className="mt-1 text-xs text-slate-400 sm:text-sm">Comprovantes e vencimentos das garantias registradas.</p>
        </div>
        <button
          type="button"
          onClick={onNewWarranty}
          className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-primary/15 transition hover:bg-primary/90 sm:w-auto"
        >
          <Plus className="h-4 w-4" />
          Registrar Garantia
        </button>
      </div>

      {warranties.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-700/70 bg-slate-900/40 py-14 text-center">
          <ShieldCheck className="mx-auto mb-3 h-7 w-7 text-slate-600" />
          <p className="text-sm font-bold text-slate-300">Nenhuma garantia salva.</p>
          <p className="mt-1 text-xs text-slate-500">As garantias registradas vao aparecer aqui com o nome do cliente.</p>
        </div>
      ) : (
        <>
          <div className="grid gap-2.5 rounded-2xl border border-slate-800 bg-slate-900/45 p-2.5 lg:grid-cols-[minmax(250px,1fr)_200px_200px]">
            <div className="relative min-w-0">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por cliente, moto, servico ou observacao..."
                aria-label="Buscar garantias"
                className="w-full rounded-xl border border-slate-700/70 bg-slate-950/60 py-2.5 pl-10 pr-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-primary/60 focus:ring-2 focus:ring-primary/10"
              />
            </div>
            <label className="relative flex items-center">
              <ShieldCheck className="pointer-events-none absolute left-3 h-4 w-4 text-slate-400" />
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as WarrantyFilter)}
                aria-label="Filtrar por status"
                className="w-full appearance-none rounded-xl border border-slate-700/70 bg-slate-950/60 py-2.5 pl-9 pr-8 text-xs font-semibold text-slate-200 outline-none transition focus:border-primary/60"
              >
                <option value="all">Todos os status</option>
                <option value="valid">Validas</option>
                <option value="expiring">A vencer</option>
                <option value="expired">Vencidas</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 h-3.5 w-3.5 text-slate-500" />
            </label>
            <label className="relative flex items-center">
              <ArrowDownWideNarrow className="pointer-events-none absolute left-3 h-4 w-4 text-slate-400" />
              <select
                value={sortOrder}
                onChange={(event) => setSortOrder(event.target.value as WarrantySort)}
                aria-label="Ordenar garantias"
                className="w-full appearance-none rounded-xl border border-slate-700/70 bg-slate-950/60 py-2.5 pl-9 pr-8 text-xs font-semibold text-slate-200 outline-none transition focus:border-primary/60"
              >
                <option value="recent">Mais recentes</option>
                <option value="oldest">Mais antigas</option>
                <option value="expiry">Vencimento proximo</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 h-3.5 w-3.5 text-slate-500" />
            </label>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/30 shadow-lg shadow-black/10">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1040px] text-left">
                <thead className="border-b border-slate-800 bg-slate-800/45 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3">Servico</th>
                    <th className="px-4 py-3">Nº</th>
                    <th className="px-4 py-3">Vencimento</th>
                    <th className="px-4 py-3 text-center">Dias</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-right">Acoes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/90">
                  {visibleWarranties.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-14 text-center text-sm text-slate-500">
                        Nenhuma garantia encontrada com esses filtros.
                      </td>
                    </tr>
                  ) : visibleWarranties.map((warranty) => {
                    const isConfirmingDelete = deleteConfirmId === warranty.id;
                    const daysUntilExpiry = getDaysUntilExpiry(warranty);
                    const status = getWarrantyStatus(daysUntilExpiry);

                    return (
                      <tr key={warranty.id} className="transition-colors hover:bg-slate-800/25">
                        <td className="px-4 py-3">
                          <div className="flex min-w-0 items-center gap-2.5">
                            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-700/80 text-xs font-black text-slate-200">
                              {warranty.clientName.trim().charAt(0).toUpperCase() || '?'}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-xs font-black text-slate-100 sm:text-sm">{warranty.clientName}</p>
                              <p className="mt-0.5 flex items-center gap-1.5 truncate text-[10px] text-slate-400">
                                <Phone className="h-3 w-3 shrink-0 text-slate-500" />
                                {warranty.clientPhone || 'Telefone nao informado'}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="max-w-[280px] px-4 py-3">
                          <p className="truncate text-xs font-semibold text-slate-200">{warranty.serviceType}</p>
                          <p className="mt-0.5 truncate text-[10px] text-slate-400">{warranty.serviceDescription || 'Servico sem descricao'}</p>
                          {warranty.cashLaunchOrderNumber && (
                            <button
                              type="button"
                              onClick={() => warranty.cashLaunchId && onOpenCashLaunch(warranty.cashLaunchId)}
                              disabled={!warranty.cashLaunchId}
                              className="mt-1 inline-flex items-center gap-1 text-[9px] font-bold text-primary transition hover:text-primary/80 disabled:cursor-default disabled:opacity-70"
                              title={warranty.cashLaunchId ? 'Abrir Ordem de Servico vinculada' : 'OS vinculada sem acesso direto'}
                            >
                              <Link2 className="h-3 w-3" />
                              O.S. {warranty.cashLaunchOrderNumber}
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs font-semibold text-slate-300">{warranty.warrantyNumber}</td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-300">
                            <CalendarDays className="h-3.5 w-3.5 text-slate-500" />
                            {format(parseISO(warranty.expiryDate), 'dd/MM/yyyy')}
                          </span>
                        </td>
                        <td className={cn(
                          'px-4 py-3 text-center text-xs font-black',
                          status === 'expired' ? 'text-red-400' : status === 'expiring' ? 'text-amber-300' : 'text-emerald-400'
                        )}>
                          {daysUntilExpiry}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wide', warrantyStatusStyles[status])}>
                            {status === 'expired'
                              ? <AlertTriangle className="h-3 w-3" />
                              : <CheckCircle2 className="h-3 w-3" />}
                            {warrantyStatusLabels[status]}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => onGeneratePDF(warranty)}
                              aria-label={`Gerar comprovante da garantia ${warranty.warrantyNumber}`}
                              title="Gerar comprovante"
                              className="grid h-8 w-8 place-items-center rounded-lg border border-slate-700/80 bg-slate-800/70 text-slate-300 transition hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-300"
                            >
                              <FileText className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onEditWarranty(warranty)}
                              aria-label={`Editar garantia ${warranty.warrantyNumber}`}
                              title="Editar garantia"
                              className="grid h-8 w-8 place-items-center rounded-lg border border-slate-700/80 bg-slate-800/70 text-slate-300 transition hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteWarrantyClick(warranty)}
                              aria-label={isConfirmingDelete ? `Confirmar exclusao da garantia ${warranty.warrantyNumber}` : `Excluir garantia ${warranty.warrantyNumber}`}
                              title={isConfirmingDelete ? 'Confirmar exclusao' : 'Excluir garantia'}
                              className={cn(
                                'grid h-8 w-8 place-items-center rounded-lg border transition',
                                isConfirmingDelete
                                  ? 'border-red-500 bg-red-500 text-white'
                                  : 'border-slate-700/80 bg-slate-800/70 text-slate-400 hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-400'
                              )}
                            >
                              {isConfirmingDelete ? <CheckCircle className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col gap-2 border-t border-slate-800 px-4 py-3 text-[10px] text-slate-400 sm:flex-row sm:items-center sm:justify-between">
              <span>Mostrando {visibleWarranties.length} de {warranties.length} garantias</span>
              <span>{warranties.length} garantia(s) registrada(s)</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
