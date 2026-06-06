import { useMemo, useState } from 'react';
import {
  CheckCircle,
  CheckCircle2,
  ChevronRight,
  DollarSign,
  Edit2,
  MessageCircle,
  PackagePlus,
  Plus,
  ReceiptText,
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
    <div className="space-y-3">
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[1fr_auto_auto_auto]">
        <button
          type="button"
          onClick={onNewRecord}
          className="w-full bg-primary p-3 rounded-xl flex items-center justify-center gap-2 text-white hover:bg-primary/90 transition-all shadow-lg shadow-primary/10"
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="font-bold text-xs">Novo Registro</span>
        </button>

        <button
          type="button"
          onClick={onNewClient}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-xs font-bold text-primary transition-all hover:border-primary/60 hover:bg-primary/15"
        >
          <UserPlus className="h-4 w-4" />
          Novo Cliente
        </button>

        <button
          type="button"
          onClick={onNewProduct}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-xs font-bold text-primary transition-all hover:border-primary/60 hover:bg-primary/15"
        >
          <PackagePlus className="h-4 w-4" />
          Nova Peca
        </button>

        <button
          type="button"
          onClick={onOpenCashRegister}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-xs font-bold text-primary transition-all hover:border-primary/60 hover:bg-primary/15"
        >
          <ReceiptText className="h-4 w-4" />
          Lancamentos Caixa
        </button>
      </div>

      <div className="flex flex-col md:flex-row gap-2 items-center justify-between">
        <h2 className="text-lg font-bold">Servicos</h2>
        <div className="relative w-full md:w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" />
          <input
            type="text"
            placeholder="Buscar..."
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            className="w-full bg-slate-800/40 border border-slate-700/50 rounded-lg pl-8 pr-3 py-1.5 text-xs focus:ring-1 focus:ring-primary outline-none"
          />
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="text-[10px] uppercase tracking-widest text-slate-400">Filtrar servicos</div>
        <div className="flex flex-wrap gap-2">
          {serviceFilterOptions.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onServiceListFilterChange(option)}
              className={cn(
                'px-3 py-2 rounded-xl text-[10px] font-bold uppercase transition-all',
                serviceListFilter === option
                  ? 'bg-primary text-white shadow-lg'
                  : 'bg-slate-800/40 text-slate-300 hover:bg-slate-800/70'
              )}
            >
              {option === 'all' ? 'Todos' : option === 'recorrentes' ? 'Recorrentes' : 'Eventuais'}
            </button>
          ))}
        </div>
      </div>

      {clients.length === 0 ? (
        <div className="text-center py-8 bg-slate-800/10 rounded-xl border border-dashed border-slate-700/30">
          <p className="text-[10px] text-slate-600">Nenhum servico encontrado.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
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
              <div key={client.id} className="bg-slate-800/30 p-3 rounded-xl border border-slate-700/40 space-y-2.5 relative overflow-hidden">
                <div
                  className={cn(
                    'absolute top-0 right-0 w-0.5 h-full opacity-50',
                    client.status === 'OK' ? 'bg-emerald-500' : client.status === 'WARNING' ? 'bg-yellow-500' : 'bg-red-500'
                  )}
                />

                <div className="flex justify-between items-start gap-2">
                  <button
                    type="button"
                    onClick={() => setExpandedClientId((current) => current === client.id ? null : client.id)}
                    aria-expanded={isExpanded}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-xl p-1 text-left hover:bg-slate-900/30 transition-colors"
                  >
                    <ChevronRight className={cn('w-4 h-4 shrink-0 text-slate-500 transition-transform', isExpanded ? 'rotate-90 text-primary' : '')} />
                    <div
                      className={cn(
                        'w-1.5 h-1.5 rounded-full shrink-0',
                        client.status === 'OK' ? 'bg-emerald-500' : client.status === 'WARNING' ? 'bg-yellow-500' : 'bg-red-500'
                      )}
                    />
                    <div className="min-w-0">
                      <h3 className="font-bold text-sm leading-tight truncate">{client.name || 'N/A'}</h3>
                      <p className="text-[10px] text-slate-500 uppercase font-bold tracking-tighter truncate">
                        {client.bikeModel || 'N/A'} - {servicesCount} servico(s)
                      </p>
                      {(hasPriority || isWarning) && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {isOverdue && (
                            <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[8px] font-bold uppercase tracking-wide text-red-400">
                              Vencido
                            </span>
                          )}
                          {isWarning && !isOverdue && (
                            <span className="rounded-full bg-yellow-500/15 px-2 py-0.5 text-[8px] font-bold uppercase tracking-wide text-yellow-400">
                              Proximo
                            </span>
                          )}
                          {balance > 0 && (
                            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[8px] font-bold uppercase tracking-wide text-amber-300">
                              Saldo devedor
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </button>

                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => void onAddMaintenance(client)}
                      disabled={client.status === 'OK' || isProcessing}
                      className={cn(
                        'p-2 rounded-lg transition-all flex items-center gap-1.5',
                        client.status === 'OK' || isProcessing
                          ? 'bg-slate-700/30 text-slate-500 cursor-not-allowed opacity-50'
                          : 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 active:scale-95'
                      )}
                      title={client.status === 'OK' ? 'Servico ja realizado' : 'Confirmar servico realizado'}
                    >
                      {isProcessing ? <RefreshCw className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                      <span className="text-[10px] font-bold uppercase hidden sm:inline">
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
                        className="p-2 rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-all active:scale-95 flex items-center gap-1.5 disabled:opacity-50"
                        title={`Quitar R$ ${balance.toFixed(2)} de debito`}
                      >
                        {isProcessing ? <RefreshCw className="w-5 h-5 animate-spin" /> : <DollarSign className="w-5 h-5" />}
                        <span className="text-[10px] font-bold uppercase hidden sm:inline">
                          {isProcessing ? 'Salvando...' : 'Quitar'}
                        </span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => onSendWhatsApp(client)}
                      className="p-2 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition-all active:scale-95 flex items-center gap-1.5"
                      title="Enviar WhatsApp"
                    >
                      <MessageCircle className="w-5 h-5" />
                      <span className="text-[10px] font-bold uppercase hidden sm:inline">Avisar</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onEditClient(client)}
                      className="p-2 rounded-lg bg-slate-700/50 text-slate-300 hover:bg-slate-700 transition-colors"
                      title="Editar cadastro"
                    >
                      <Edit2 className="w-5 h-5" />
                    </button>
                    {latestMaintenance && (
                      <button
                        type="button"
                        onClick={() => onDeleteMaintenanceClick(latestMaintenance)}
                        disabled={isDeletingLatestMaintenance}
                        className={cn(
                          'p-2 rounded-lg transition-colors disabled:opacity-50',
                          isConfirmingDelete ? 'bg-red-500 text-white animate-pulse' : 'bg-red-500/10 text-red-500 hover:bg-red-500/20'
                        )}
                        title="Excluir ultimo lancamento de servico"
                      >
                        {isDeletingLatestMaintenance ? (
                          <RefreshCw className="w-5 h-5 animate-spin" />
                        ) : isConfirmingDelete ? (
                          <CheckCircle className="w-5 h-5" />
                        ) : (
                          <Trash2 className="w-5 h-5" />
                        )}
                      </button>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setExpandedClientId((current) => current === client.id ? null : client.id)}
                  className="grid w-full grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-700/20 text-left"
                >
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-slate-900/70 rounded-xl p-2 text-center">
                      <p className="text-[8px] uppercase text-slate-400 tracking-widest">Total</p>
                      <p className="text-[10px] font-bold text-white">R$ {valorTotal.toFixed(2)}</p>
                    </div>
                    <div className="bg-slate-900/70 rounded-xl p-2 text-center">
                      <p className="text-[8px] uppercase text-slate-400 tracking-widest">Pago</p>
                      <p className="text-[10px] font-bold text-emerald-400">R$ {valorPago.toFixed(2)}</p>
                    </div>
                    <div className="bg-slate-900/70 rounded-xl p-2 text-center">
                      <p className={cn('text-[8px] uppercase tracking-widest', saldoDevedor > 0 ? 'text-red-500' : 'text-slate-400')}>
                        Restante
                      </p>
                      <p className={cn('text-[10px] font-bold', saldoDevedor > 0 ? 'text-red-400' : 'text-emerald-400')}>
                        R$ {saldoDevedor.toFixed(2)}
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
                        {latestVisibleMaintenance?.serviceType || client.lastServiceType} - R$ {(latestVisibleMaintenance?.serviceValue ?? client.lastServiceValue ?? 0).toFixed(2)}
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
                                  <p className="text-[10px] font-bold text-white">R$ {(Number(record.serviceValue) || 0).toFixed(2)}</p>
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
                                    title={`Quitar R$ ${debt.toFixed(2)} de debito`}
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
