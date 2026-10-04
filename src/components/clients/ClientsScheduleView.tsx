import { Fragment, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  CheckCircle,
  CheckCircle2,
  ChevronRight,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Users,
} from 'lucide-react';
import { cn, safeFormat } from '../../lib/utils';
import type { Client } from '../../types';

type ClientsScheduleViewProps = {
  clients: Client[];
  clientBalanceMap: Map<string, number>;
  deleteConfirmId?: string | null;
  onBack: () => void;
  onAddClient: () => void;
  onEditClient: (client: Client) => void;
  onDeleteClientClick: (client: Client) => void;
};

const getStatusConfig = (status: Client['status']) => {
  if (status === 'OK') {
    return {
      icon: CheckCircle2,
      className: 'bg-emerald-500/20 text-emerald-500',
      label: 'OK',
    };
  }

  if (status === 'WARNING') {
    return {
      icon: AlertTriangle,
      className: 'bg-yellow-500/20 text-yellow-500',
      label: 'Alerta',
    };
  }

  return {
    icon: AlertTriangle,
    className: 'bg-red-500/20 text-red-500',
    label: 'Atrasado',
  };
};

export const ClientsScheduleView = ({
  clients,
  clientBalanceMap,
  deleteConfirmId,
  onBack,
  onAddClient,
  onEditClient,
  onDeleteClientClick,
}: ClientsScheduleViewProps) => {
  const [clientQuery, setClientQuery] = useState('');
  const [expandedClientIds, setExpandedClientIds] = useState<Set<string>>(new Set());

  const normalizedQuery = clientQuery.trim().toLowerCase();
  const filteredClients = useMemo(() => {
    if (!normalizedQuery) return clients;
    return clients.filter((client) => client.name.toLowerCase().includes(normalizedQuery));
  }, [clients, normalizedQuery]);

  const toggleClient = (clientId: string) => {
    setExpandedClientIds((current) => {
      const next = new Set(current);
      if (next.has(clientId)) {
        next.delete(clientId);
      } else {
        next.add(clientId);
      }
      return next;
    });
  };

  return (
    <div className="clients-schedule-view space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <button
            type="button"
            onClick={onBack}
            className="mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-slate-700/70 bg-slate-900/70 text-slate-300 transition hover:border-primary/40 hover:text-white"
            aria-label="Voltar"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <h2 className="text-2xl font-black tracking-tight text-white sm:text-3xl">Agenda de Clientes</h2>
            <p className="mt-1 text-xs text-slate-400 sm:text-sm">Visualize e acompanhe o relacionamento dos seus clientes.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onAddClient}
          className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-primary/15 transition hover:bg-primary/90 sm:w-auto"
        >
          <Plus className="h-4 w-4" />
          Cadastrar cliente
        </button>
      </div>

      {clients.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-700/70 bg-slate-900/40 py-14 text-center">
          <Users className="mx-auto mb-3 h-7 w-7 text-slate-600" />
          <p className="text-sm font-bold text-slate-400">Nenhum cliente cadastrado</p>
          <p className="mt-1 text-xs text-slate-600">Cadastre clientes por aqui ou registre um novo servico.</p>
        </div>
      ) : filteredClients.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-700/70 bg-slate-900/40 py-14 text-center">
          <Search className="mx-auto mb-3 h-7 w-7 text-slate-600" />
          <p className="text-sm font-bold text-slate-400">Nenhum cliente encontrado</p>
          <p className="mt-1 text-xs text-slate-600">Tente pesquisar por outro nome.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-col gap-2 rounded-2xl border border-slate-800 bg-slate-900/55 p-2.5 shadow-lg shadow-black/10 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type="search"
                value={clientQuery}
                onChange={(event) => setClientQuery(event.target.value)}
                placeholder="Buscar cliente pelo nome..."
                className="w-full rounded-xl border border-slate-700/70 bg-slate-950/60 py-2.5 pl-10 pr-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-primary/60 focus:ring-2 focus:ring-primary/10"
              />
            </div>
            <span className="px-2 text-xs font-semibold text-slate-400">
              <span className="font-black text-white">{filteredClients.length}</span> clientes
            </span>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/30 shadow-lg shadow-black/10">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left">
                <thead className="border-b border-slate-800 bg-slate-800/45 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3">Moto</th>
                    <th className="px-4 py-3">Contato</th>
                    <th className="px-4 py-3">Recorrencia</th>
                    <th className="px-4 py-3">Ultimo servico</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-right">Acao</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/90">
                  {filteredClients.map((client) => {
                    const statusConfig = getStatusConfig(client.status);
                    const StatusIcon = statusConfig.icon;
                    const balance = clientBalanceMap.get(client.id) || 0;
                    const isConfirmingDelete = deleteConfirmId === client.id;
                    const isExpanded = expandedClientIds.has(client.id);

                    return (
                      <Fragment key={client.id}>
                        <tr className="group transition-colors hover:bg-slate-800/25">
                          <td className="px-4 py-3">
                            <div className="flex min-w-0 items-center gap-2.5">
                              <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-black', statusConfig.className)}>
                                {client.name.trim().charAt(0).toUpperCase() || '?'}
                              </span>
                              <div className="min-w-0">
                                <p className="truncate text-xs font-black text-slate-100 sm:text-sm">{client.name}</p>
                                <p className="mt-0.5 text-[10px] text-slate-500">{client.bikeModel || 'Moto nao informada'}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs font-medium text-slate-300">{client.bikeModel || '-'}</td>
                          <td className="px-4 py-3">
                            <span className="flex items-center gap-2 whitespace-nowrap text-xs text-slate-300">
                              <Phone className="h-3.5 w-3.5 text-slate-500" />
                              {client.contact || 'Nao informado'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-slate-300">
                              <RefreshCw className="h-3.5 w-3.5 text-slate-500" />
                              {client.recurrenceDays} dias
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-slate-300">
                              <CalendarDays className="h-3.5 w-3.5 text-slate-500" />
                              {client.lastMaintenanceDate ? safeFormat(client.lastMaintenanceDate, 'dd/MM/yyyy') : '-'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wide', statusConfig.className)}>
                              <StatusIcon className="h-3 w-3" />
                              {statusConfig.label}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => onEditClient(client)}
                                aria-label={`Editar ${client.name}`}
                                title="Editar cliente"
                                className="grid h-8 w-8 place-items-center rounded-lg border border-slate-700/80 bg-slate-800/70 text-slate-300 transition hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => onDeleteClientClick(client)}
                                aria-label={isConfirmingDelete ? `Confirmar exclusao de ${client.name}` : `Excluir ${client.name}`}
                                title={isConfirmingDelete ? 'Confirmar exclusao' : 'Excluir cliente'}
                                className={cn(
                                  'grid h-8 w-8 place-items-center rounded-lg border transition',
                                  isConfirmingDelete
                                    ? 'border-red-500 bg-red-500 text-white'
                                    : 'border-slate-700/80 bg-slate-800/70 text-slate-400 hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-400'
                                )}
                              >
                                {isConfirmingDelete ? <CheckCircle className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
                              </button>
                              <button
                                type="button"
                                onClick={() => toggleClient(client.id)}
                                aria-label={isExpanded ? `Ocultar detalhes de ${client.name}` : `Ver detalhes de ${client.name}`}
                                aria-expanded={isExpanded}
                                className="grid h-8 w-8 place-items-center rounded-lg border border-slate-700/80 bg-slate-800/70 text-slate-400 transition hover:border-primary/40 hover:text-primary"
                              >
                                <ChevronRight className={cn('h-4 w-4 transition-transform', isExpanded && 'rotate-90 text-primary')} />
                              </button>
                            </div>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-slate-950/35">
                            <td colSpan={7} className="px-4 py-3">
                              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pl-11 text-xs">
                                <span className="inline-flex items-center gap-1.5 text-slate-400">
                                  <RefreshCw className="h-3.5 w-3.5 text-slate-500" />
                                  Recorrencia: {client.recurrenceDays} dias
                                </span>
                                {client.lastMaintenanceDate && (
                                  <span className="inline-flex items-center gap-1.5 text-slate-400">
                                    <CalendarDays className="h-3.5 w-3.5 text-slate-500" />
                                    Ultimo atendimento: {safeFormat(client.lastMaintenanceDate, 'dd/MM/yyyy')}
                                  </span>
                                )}
                                {balance > 0 && (
                                  <span className="rounded-lg border border-red-500/20 bg-red-500/10 px-2.5 py-1 font-bold text-red-300">
                                    Debito: R$ {balance.toFixed(2)}
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
