import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bike,
  CheckCircle,
  CheckCircle2,
  DollarSign,
  Edit2,
  MessageCircle,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UserPlus,
  Wrench,
} from 'lucide-react';
import { cn, safeFormat } from '../../lib/utils';
import type { Client, MaintenanceRecord } from '../../types';

type ServiceListFilter = 'all' | 'recorrentes' | 'eventuais';
type ClientServiceTab = 'all' | 'recorrentes' | 'eventuais';

type ClientsViewProps = {
  clients: Client[];
  maintenances: MaintenanceRecord[];
  clientBalanceMap: Map<string, number>;
  searchQuery: string;
  serviceListFilter: ServiceListFilter;
  processingId: string | null;
  deleteConfirmId?: string | null;
  onNewClient: () => void;
  onNewProduct: () => void;
  onNewRecord: () => void;
  onOpenCashRegister: () => void;
  onSearchChange: (value: string) => void;
  onServiceListFilterChange: (filter: ServiceListFilter) => void;
  onAddMaintenance: (client: Client) => Promise<void> | void;
  onSettleDebt: (maintenance: MaintenanceRecord) => Promise<void> | void;
  onSendWhatsApp: (client: Client) => void;
  onEditClient: (client: Client) => void;
  onDeleteMaintenanceClick: (maintenance: MaintenanceRecord) => void;
};

const serviceFilterOptions: ServiceListFilter[] = ['all', 'recorrentes', 'eventuais'];
const clientServiceTabs: ClientServiceTab[] = ['all', 'recorrentes', 'eventuais'];
const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const formatCurrency = (value: number) => currencyFormatter.format(Number.isFinite(value) ? value : 0);

const getPaidValue = (record: MaintenanceRecord) => {
  const serviceValue = Number(record.serviceValue) || 0;
  const paymentStatus = String(record.statusPagamento || 'Pago').trim().toLowerCase();
  if (paymentStatus === 'pago') return serviceValue;
  if (record.valorPago !== undefined && record.valorPago !== null) {
    const paidValue = Number(record.valorPago);
    if (Number.isFinite(paidValue)) return paidValue;
  }
  return 0;
};

const getDebtValue = (record: MaintenanceRecord) => {
  const paymentStatus = String(record.statusPagamento || 'Pago').trim().toLowerCase();
  if (paymentStatus === 'pago') return 0;
  const storedDebt = Number(record.saldoDevedor);
  if (Number.isFinite(storedDebt)) return storedDebt;
  return Math.max(0, (Number(record.serviceValue) || 0) - getPaidValue(record));
};

const matchesServiceFilter = (record: MaintenanceRecord, filter: ServiceListFilter) => {
  if (filter === 'all') return true;
  return filter === 'recorrentes' ? record.isRecurringRevenue : !record.isRecurringRevenue;
};

export const ClientsView = ({
  clients,
  maintenances,
  clientBalanceMap,
  searchQuery,
  serviceListFilter,
  processingId,
  deleteConfirmId,
  onNewClient,
  onNewProduct,
  onNewRecord,
  onOpenCashRegister,
  onSearchChange,
  onServiceListFilterChange,
  onAddMaintenance,
  onSettleDebt,
  onSendWhatsApp,
  onEditClient,
  onDeleteMaintenanceClick,
}: ClientsViewProps) => {
  const [expandedClientId, setExpandedClientId] = useState<string | null>(null);
  const [clientServiceTab, setClientServiceTab] = useState<Record<string, ClientServiceTab>>({});
  const overdueClientsCount = clients.filter((client) => client.status === 'OVERDUE').length;

  const maintenancesByClient = useMemo(() => {
    const map = new Map<string, MaintenanceRecord[]>();
    maintenances.forEach((maintenance) => {
      if (!maintenance.clientId) return;
      const list = map.get(maintenance.clientId) || [];
      list.push(maintenance);
      map.set(maintenance.clientId, list);
    });

    map.forEach((list) => {
      list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    });

    return map;
  }, [maintenances]);

  return (
    <div className="services-oil-view space-y-4">
      <div>
        <button
          type="button"
          onClick={onNewRecord}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          <span className="text-sm font-black">Registrar serviço</span>
        </button>
      </div>

      <section className="rounded-2xl border border-slate-800/80 bg-[#0d1626] p-3 shadow-lg shadow-black/10 sm:p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-lg font-black tracking-tight text-white">Clientes com serviço</h2>
            <p className="mt-0.5 text-xs text-slate-400">Gerencie os serviços e acompanhe a recorrência.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Buscar cliente ou moto..."
                value={searchQuery}
                onChange={(event) => onSearchChange(event.target.value)}
                className="w-full rounded-xl border border-slate-800 bg-slate-950/60 py-2.5 pl-9 pr-3 text-xs text-slate-100 outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/10"
              />
            </div>
            <div className="flex flex-wrap gap-1.5 rounded-xl border border-slate-800/70 bg-slate-950/40 p-1">
              {serviceFilterOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => onServiceListFilterChange(option)}
                  className={cn(
                    'rounded-lg px-3 py-2 text-[10px] font-bold transition-all',
                    serviceListFilter === option
                      ? 'bg-primary text-white shadow-md shadow-primary/20'
                      : 'text-slate-400 hover:bg-slate-800/70 hover:text-white'
                  )}
                >
                  {option === 'all' ? 'Todos' : option === 'recorrentes' ? 'Recorrentes' : 'Eventuais'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {overdueClientsCount > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-red-400/25 bg-gradient-to-r from-red-950/35 to-slate-950/50 px-4 py-3 shadow-lg shadow-red-950/10">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-red-400/20 bg-red-500/10 text-red-400">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-black text-red-100">
              {overdueClientsCount} cliente{overdueClientsCount === 1 ? '' : 's'} com serviço vencido
            </p>
            <p className="text-xs text-slate-400">Verifique os destaques vermelhos antes de encerrar o atendimento.</p>
          </div>
        </div>
      )}

      {clients.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-700/50 bg-[#0d1626]/70 py-10 text-center">
          <p className="text-sm font-semibold text-slate-400">Nenhum serviço encontrado.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {clients.map((client) => {
            const allClientServices = maintenancesByClient.get(client.id) || [];
            const latestMaintenance = allClientServices[0];
            const latestVisibleMaintenance = latestMaintenance;
            const legacyTotal = latestMaintenance?.serviceValue ?? client.lastServiceValue ?? 0;
            const valorTotal = allClientServices.length > 0
              ? allClientServices.reduce((sum, record) => sum + (Number(record.serviceValue) || 0), 0)
              : legacyTotal;
            const valorPago = allClientServices.length > 0
              ? allClientServices.reduce((sum, record) => sum + getPaidValue(record), 0)
              : latestMaintenance?.valorPago ?? client.valorPago ?? 0;
            const saldoDevedor = allClientServices.length > 0
              ? allClientServices.reduce((sum, record) => sum + getDebtValue(record), 0)
              : latestMaintenance?.saldoDevedor ?? Math.max(0, valorTotal - valorPago);
            const observacoes = latestVisibleMaintenance?.notes || client.lastServiceNotes || '-';
            const balance = clientBalanceMap.get(client.id) || 0;
            const isProcessing = processingId === client.id;
            const isDeletingLatestMaintenance = latestMaintenance ? processingId === latestMaintenance.id : false;
            const isConfirmingDelete = latestMaintenance ? deleteConfirmId === latestMaintenance.id : false;
            const isExpanded = expandedClientId === client.id;
            const servicesCount = allClientServices.length || (client.lastServiceType ? 1 : 0);
            const activeClientServiceTab = clientServiceTab[client.id] || 'all';
            const listedServices = activeClientServiceTab === 'all'
              ? allClientServices
              : allClientServices.filter((maintenance) => matchesServiceFilter(maintenance, activeClientServiceTab));
            const isOverdue = client.status === 'OVERDUE';
            const isWarning = client.status === 'WARNING';
            const hasPriority = isOverdue || balance > 0;

            return (
              <div
                key={client.id}
                className={cn(
                  'relative space-y-2.5 overflow-hidden rounded-2xl border p-3.5 pl-4 shadow-lg shadow-black/10 transition-colors sm:p-4',
                  isOverdue
                    ? 'border-red-400/20 bg-gradient-to-br from-[#111a2a] to-[#0a1220]'
                    : isWarning
                      ? 'border-amber-400/20 bg-gradient-to-br from-[#111a2a] to-[#0a1220]'
                      : 'border-slate-800 bg-gradient-to-br from-[#111a2a] to-[#0a1220]'
                )}
              >
                <div
                  className={cn(
                    'absolute inset-y-0 left-0 w-1',
                    client.status === 'OK' ? 'bg-emerald-500/50' : client.status === 'WARNING' ? 'bg-amber-400/70' : 'bg-red-400'
                  )}
                />

                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <button
                    type="button"
                    onClick={() => setExpandedClientId((current) => current === client.id ? null : client.id)}
                    aria-expanded={isExpanded}
                    className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl p-1 text-left transition-colors hover:bg-slate-900/30"
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-700/60 bg-slate-950/50 text-slate-300">
                      <Bike className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="font-bold text-sm leading-tight truncate">{client.name || 'N/A'}</h3>
                      <p className="mt-0.5 text-[10px] text-slate-400 uppercase font-semibold tracking-wide truncate">
                        {client.bikeModel || 'N/A'} - {servicesCount > 0 ? `${servicesCount} servico(s)` : 'Sem servicos registrados'}
                      </p>
                      {(hasPriority || isWarning) && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {isOverdue && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-red-300/20 bg-red-500/15 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-red-200">
                              <AlertTriangle className="h-3 w-3" />
                              Vencido
                            </span>
                          )}
                          {isWarning && !isOverdue && (
                            <span className="rounded-full bg-yellow-500/10 px-2 py-0.5 text-[8px] font-bold uppercase tracking-wide text-yellow-300">
                              Proximo
                            </span>
                          )}
                          {balance > 0 && (
                            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[8px] font-bold uppercase tracking-wide text-amber-300">
                              Saldo devedor
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </button>

                  <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2">
                    <button
                      type="button"
                      onClick={() => void onAddMaintenance(client)}
                      disabled={client.status === 'OK' || isProcessing}
                      className={cn(
                        'inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-2.5 transition-all sm:px-3',
                        client.status === 'OK' || isProcessing
                          ? 'bg-slate-700/30 text-slate-500 cursor-not-allowed opacity-50'
                          : 'bg-emerald-500 text-white shadow-md shadow-emerald-950/20 hover:bg-emerald-600 active:scale-95'
                      )}
                      title={client.status === 'OK' ? 'Servico ja realizado' : 'Confirmar servico realizado'}
                    >
                      {isProcessing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      <span className="text-[10px] font-bold uppercase">
                        {isProcessing ? 'Salvando...' : 'Concluir'}
                      </span>
                    </button>

                    {balance > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          const maintenanceToSettle = allClientServices.find((maintenance) => (maintenance.saldoDevedor || 0) > 0);

                          if (maintenanceToSettle) {
                            void onSettleDebt(maintenanceToSettle);
                          }
                        }}
                        disabled={isProcessing}
                        className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-amber-500 px-2.5 text-white transition-all hover:bg-amber-600 active:scale-95 disabled:opacity-50 sm:px-3"
                        title={`Quitar ${formatCurrency(balance)} de debito`}
                      >
                        {isProcessing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <DollarSign className="h-4 w-4" />}
                        <span className="text-[10px] font-bold uppercase">
                          {isProcessing ? 'Salvando...' : 'Quitar'}
                        </span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => onSendWhatsApp(client)}
                      className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2.5 text-emerald-200 transition-all hover:bg-emerald-500/20 active:scale-95 sm:px-3"
                      title="Enviar WhatsApp"
                    >
                      <MessageCircle className="h-4 w-4" />
                      <span className="text-[10px] font-bold uppercase">Avisar</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onEditClient(client)}
                      className="grid h-9 w-9 place-items-center rounded-lg border border-slate-700/70 bg-slate-900/70 text-slate-300 transition-colors hover:border-primary/40 hover:text-white"
                      title="Editar cadastro"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    {latestMaintenance && (
                      <button
                        type="button"
                        onClick={() => onDeleteMaintenanceClick(latestMaintenance)}
                        disabled={isDeletingLatestMaintenance}
                        className={cn(
                          'inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-2.5 text-[10px] font-bold uppercase transition-colors disabled:opacity-50 sm:px-3',
                          isConfirmingDelete
                            ? 'animate-pulse bg-red-500 text-white'
                            : 'border border-red-400/20 bg-red-500/10 text-red-300 hover:border-red-400/40 hover:bg-red-500/20'
                        )}
                        title={isConfirmingDelete ? 'Confirmar exclusão do último serviço' : 'Apagar último serviço'}
                      >
                        {isDeletingLatestMaintenance ? (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : isConfirmingDelete ? (
                          <CheckCircle className="h-4 w-4" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                        <span>{isConfirmingDelete ? 'Confirmar' : 'Apagar'}</span>
                      </button>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setExpandedClientId((current) => current === client.id ? null : client.id)}
                  className="grid w-full grid-cols-1 gap-2 border-t border-slate-700/40 pt-3 text-left sm:grid-cols-2"
                >
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-xl border border-slate-800/70 bg-[#0a1422] px-2 py-2 text-center">
                      <p className="text-[8px] uppercase tracking-widest text-slate-400">Total</p>
                      <p className="mt-0.5 text-[10px] font-bold text-white">{formatCurrency(valorTotal)}</p>
                    </div>
                    <div className="rounded-xl border border-slate-800/70 bg-[#0a1422] px-2 py-2 text-center">
                      <p className="text-[8px] uppercase tracking-widest text-slate-400">Pago</p>
                      <p className="mt-0.5 text-[10px] font-bold text-emerald-400">{formatCurrency(valorPago)}</p>
                    </div>
                    <div className="rounded-xl border border-slate-800/70 bg-[#0a1422] px-2 py-2 text-center">
                      <p className={cn('text-[8px] uppercase tracking-widest', saldoDevedor > 0 ? 'text-red-500' : 'text-slate-400')}>
                        Restante
                      </p>
                      <p className={cn('mt-0.5 text-[10px] font-bold', saldoDevedor > 0 ? 'text-red-400' : 'text-emerald-400')}>
                        {formatCurrency(saldoDevedor)}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p
                          className={cn(
                            'text-[8px] uppercase font-bold tracking-widest',
                            client.status === 'OK' ? 'text-slate-500' : client.status === 'WARNING' ? 'text-yellow-500' : 'text-red-500'
                          )}
                        >
                          Proximo Alerta
                        </p>
                        <p
                          className={cn(
                            'text-[10px] font-bold',
                            client.status === 'OK' ? 'text-slate-100' : client.status === 'WARNING' ? 'text-yellow-500' : 'text-red-500'
                          )}
                        >
                          {safeFormat(client.nextMaintenanceDate, 'dd/MM/yyyy')}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[8px] uppercase text-slate-500 tracking-widest">Ultimo</p>
                        <p className="text-[10px] text-slate-400 font-bold">
                          {safeFormat(latestMaintenance?.date || client.lastMaintenanceDate, 'dd/MM/yyyy')}
                        </p>
                      </div>
                    </div>
                    {latestVisibleMaintenance?.serviceType || client.lastServiceType ? (
                      <p className="text-[9px] text-slate-400 leading-tight">
                        {latestVisibleMaintenance?.serviceType || client.lastServiceType} - {formatCurrency(latestVisibleMaintenance?.serviceValue ?? client.lastServiceValue ?? 0)}
                      </p>
                    ) : null}
                  </div>
                </button>

                {isExpanded && (
                  <div className="rounded-xl border border-slate-700/30 bg-slate-900/40 overflow-hidden">
                    <div className="flex flex-col gap-3 px-3 py-3 border-b border-slate-700/30 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-[9px] uppercase font-bold text-slate-500 tracking-widest">Servicos deste cliente</p>
                        <p className="text-[9px] text-slate-500">
                          {listedServices.length} de {allClientServices.length} registro(s)
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {clientServiceTabs.map((tab) => (
                          <button
                            key={tab}
                            type="button"
                            onClick={() => setClientServiceTab((current) => ({ ...current, [client.id]: tab }))}
                            className={cn(
                              'rounded-full px-3 py-1.5 text-[10px] font-bold uppercase transition-colors',
                              activeClientServiceTab === tab
                                ? 'bg-primary text-white'
                                : 'bg-slate-800/70 text-slate-300 hover:bg-slate-700'
                            )}
                          >
                            {tab === 'all' ? 'Todos' : tab === 'recorrentes' ? 'Recorrentes' : 'Eventuais'}
                          </button>
                        ))}
                      </div>
                    </div>

                    {listedServices.length === 0 ? (
                      <div className="p-3 text-[10px] text-slate-500">Nenhum servico no historico para este filtro.</div>
                    ) : (
                      <div className="divide-y divide-slate-700/30">
                        {listedServices.map((record) => {
                          const debt = getDebtValue(record);
                          const paymentStatus = record.statusPagamento || 'Pago';
                          const isRowProcessing = processingId === record.id;
                          const isConfirmingRowDelete = deleteConfirmId === record.id;

                          return (
                            <div key={record.id} className="flex items-center justify-between gap-3 p-3">
                              <div className="min-w-0 flex items-center gap-3">
                                <div className={cn('p-2 rounded-lg', record.isRecurringRevenue ? 'bg-primary/10 text-primary' : 'bg-slate-700/50 text-slate-400')}>
                                  <Wrench className="w-4 h-4" />
                                </div>
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="font-bold text-xs truncate">{record.serviceType || 'Servico'}</p>
                                    <span className={cn(
                                      'text-[7px] px-1 rounded uppercase font-bold',
                                      record.isRecurringRevenue ? 'bg-primary/20 text-primary' : 'bg-slate-700/50 text-slate-300'
                                    )}>
                                      {record.isRecurringRevenue ? 'Recorrente' : 'Eventual'}
                                    </span>
                                    {debt > 0 ? (
                                      <span className="text-[7px] bg-red-500/20 text-red-400 px-1 rounded uppercase font-bold">Debito</span>
                                    ) : null}
                                  </div>
                                  <p className="text-[9px] text-slate-500 truncate">
                                    {safeFormat(record.date, 'dd/MM/yyyy')} - {record.notes || 'Sem observacoes'}
                                  </p>
                                </div>
                              </div>

                              <div className="flex shrink-0 items-center gap-2">
                                <div className="text-right">
                                  <p className="text-[10px] font-bold text-white">{formatCurrency(Number(record.serviceValue) || 0)}</p>
                                  <p
                                    className={cn(
                                      'text-[8px] font-bold',
                                      paymentStatus === 'Pago'
                                        ? 'text-emerald-400'
                                        : paymentStatus === 'Pendente'
                                          ? 'text-yellow-400'
                                          : 'text-slate-400'
                                    )}
                                  >
                                    {paymentStatus}
                                  </p>
                                </div>
                                {debt > 0 ? (
                                  <button
                                    type="button"
                                    onClick={() => void onSettleDebt(record)}
                                    disabled={isRowProcessing}
                                    className="p-2 rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-all disabled:opacity-50"
                                    title={`Quitar ${formatCurrency(debt)} de debito`}
                                  >
                                    {isRowProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />}
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={() => onDeleteMaintenanceClick(record)}
                                  disabled={isRowProcessing}
                                  className={cn(
                                    'p-2 rounded-lg transition-colors disabled:opacity-50',
                                    isConfirmingRowDelete ? 'bg-red-500 text-white animate-pulse' : 'bg-red-500/10 text-red-500 hover:bg-red-500/20'
                                  )}
                                  title="Excluir este lancamento"
                                >
                                  {isConfirmingRowDelete ? <CheckCircle className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                <div className="pt-1">
                  <p className="text-[8px] uppercase font-bold text-slate-500 tracking-widest">Observacoes</p>
                  <p className="text-[9px] text-slate-400 line-clamp-1 italic">&quot;{observacoes}&quot;</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
