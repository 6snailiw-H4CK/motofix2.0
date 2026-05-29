import { useMemo, useState } from 'react';
import { endOfMonth, format, isWithinInterval, parseISO, startOfMonth } from 'date-fns';
import { CheckCircle, CheckCircle2, ChevronRight, DollarSign, FileText, Filter, MessageCircle, RefreshCw, Trash2, Wrench } from 'lucide-react';
import { cn, safeFormat } from '../../lib/utils';
import type { MaintenanceRecord, MessageLog } from '../../types';

type HistoryFilters = {
  startDate: string;
  endDate: string;
  clientName: string;
  serviceType: string;
  isRecurring: 'all' | 'yes' | 'no';
};

type HistorySection = 'recorrentes' | 'eventuais';
type TopPanel = 'filters' | 'messageLogs' | null;

type HistoryViewProps = {
  maintenances: MaintenanceRecord[];
  messageLogs: MessageLog[];
  messageLogDeleteConfirmId?: string | null;
  serviceTypeOptions: string[];
  processingId: string | null;
  deleteConfirmId?: string | null;
  onSettleDebt: (record: MaintenanceRecord) => Promise<void> | void;
  onConfirmPayment: (record: MaintenanceRecord) => Promise<void> | void;
  onDeleteMaintenanceClick: (record: MaintenanceRecord) => void;
  onDeleteMessageLogClick: (log: MessageLog) => void;
  onOpenGeneralReport: () => void;
};

const initialFilters = (): HistoryFilters => ({
  startDate: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
  endDate: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
  clientName: '',
  serviceType: 'all',
  isRecurring: 'all',
});

export const HistoryView = ({
  maintenances,
  messageLogs,
  messageLogDeleteConfirmId,
  serviceTypeOptions,
  processingId,
  deleteConfirmId,
  onSettleDebt,
  onConfirmPayment,
  onDeleteMaintenanceClick,
  onDeleteMessageLogClick,
  onOpenGeneralReport,
}: HistoryViewProps) => {
  const [filters, setFilters] = useState<HistoryFilters>(initialFilters);
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());
  const [serviceSection, setServiceSection] = useState<Record<string, HistorySection>>({});
  const [openTopPanel, setOpenTopPanel] = useState<TopPanel>(null);

  const groupedHistory = useMemo(() => {
    const filtered = maintenances
      .filter((record) => {
        const recordDate = parseISO(record.date);
        const start = parseISO(filters.startDate);
        const end = parseISO(filters.endDate);
        const matchesDate = isWithinInterval(recordDate, { start, end });
        const matchesClient = record.clientName.toLowerCase().includes(filters.clientName.toLowerCase());
        const matchesType = filters.serviceType === 'all' || record.serviceType === filters.serviceType;
        const matchesRecurring =
          filters.isRecurring === 'all' ||
          (filters.isRecurring === 'yes' && record.isRecurringRevenue) ||
          (filters.isRecurring === 'no' && !record.isRecurringRevenue);

        return matchesDate && matchesClient && matchesType && matchesRecurring;
      })
      .sort((a, b) => b.date.localeCompare(a.date));

    const grouped = new Map<string, MaintenanceRecord[]>();
    filtered.forEach((record) => {
      if (!grouped.has(record.clientName)) {
        grouped.set(record.clientName, []);
      }
      grouped.get(record.clientName)!.push(record);
    });

    return Array.from(grouped.entries())
      .map(([clientName, services]) => ({ clientName, services }))
      .sort((a, b) => a.clientName.localeCompare(b.clientName));
  }, [filters, maintenances]);

  const filteredMessageLogs = useMemo(() => {
    return messageLogs
      .filter((log) => {
        if (!log.createdAt) return false;
        const createdAt = parseISO(log.createdAt);
        const start = parseISO(filters.startDate);
        const end = parseISO(filters.endDate);
        const matchesDate = isWithinInterval(createdAt, { start, end });
        const matchesClient = (log.clientName || '').toLowerCase().includes(filters.clientName.toLowerCase());
        return matchesDate && matchesClient;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 30);
  }, [filters.clientName, filters.endDate, filters.startDate, messageLogs]);

  const updateFilter = <K extends keyof HistoryFilters>(key: K, value: HistoryFilters[K]) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const toggleClient = (clientName: string, defaultSection: HistorySection) => {
    setExpandedClients((current) => {
      const next = new Set(current);
      if (next.has(clientName)) {
        next.delete(clientName);
      } else {
        next.add(clientName);
      }
      return next;
    });

    setServiceSection((current) => {
      if (current[clientName]) return current;
      return { ...current, [clientName]: defaultSection };
    });
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-3 lg:grid-cols-[1fr_auto] items-start">
        <div>
          <h2 className="text-lg font-bold">Historico de Servicos</h2>
        </div>
        <div className="grid grid-cols-3 gap-2 lg:min-w-[38rem]">
          <button
            type="button"
            onClick={() => setOpenTopPanel((current) => current === 'filters' ? null : 'filters')}
            className={cn(
              'bg-slate-800/40 p-2.5 sm:p-3 rounded-2xl border text-right transition-all hover:bg-slate-800/60',
              openTopPanel === 'filters' ? 'border-primary/60 shadow-lg shadow-primary/5' : 'border-slate-700/50'
            )}
            aria-expanded={openTopPanel === 'filters'}
          >
            <p className="text-[10px] uppercase text-slate-400 tracking-widest font-bold">Historico filtrado</p>
            <p className="text-sm font-bold text-white">{groupedHistory.length} cliente(s)</p>
            <p className="text-[9px] text-slate-500 mt-1">Servicos no periodo</p>
          </button>

          <button
            type="button"
            onClick={() => setOpenTopPanel((current) => current === 'messageLogs' ? null : 'messageLogs')}
            className={cn(
              'bg-slate-800/40 p-2.5 sm:p-3 rounded-2xl border text-right transition-all hover:bg-slate-800/60',
              openTopPanel === 'messageLogs' ? 'border-emerald-400/70 shadow-lg shadow-emerald-500/5' : 'border-emerald-500/20'
            )}
            aria-expanded={openTopPanel === 'messageLogs'}
          >
            <div className="mb-2 flex items-center justify-end gap-2 text-emerald-400">
              <MessageCircle className="h-3.5 w-3.5" />
              <p className="text-[10px] uppercase tracking-widest font-bold">Avisos enviados</p>
            </div>
            <p className="text-sm font-bold text-white">{filteredMessageLogs.length} registro(s)</p>
            {filteredMessageLogs[0] ? (
              <div className="mt-2 rounded-xl bg-slate-950/30 p-2 text-left">
                <p className="truncate text-[10px] font-bold text-slate-200">{filteredMessageLogs[0].clientName || 'Cliente sem nome'}</p>
                <p className="text-[9px] text-emerald-400">{safeFormat(filteredMessageLogs[0].createdAt, 'dd/MM HH:mm')}</p>
              </div>
            ) : (
              <p className="mt-2 text-[9px] text-slate-500">Nenhum aviso no periodo</p>
            )}
          </button>

          <button
            type="button"
            onClick={onOpenGeneralReport}
            className="rounded-2xl border border-sky-500/20 bg-slate-800/40 p-2.5 text-right transition-all hover:border-sky-400/50 hover:bg-slate-800/60 sm:p-3"
          >
            <div className="mb-2 flex items-center justify-end gap-2 text-sky-400">
              <FileText className="h-3.5 w-3.5" />
              <p className="text-[10px] font-bold uppercase tracking-widest">Relatorio</p>
            </div>
            <p className="text-sm font-bold text-white">Detalhado</p>
            <p className="mt-1 text-[9px] text-slate-500">Geral do app</p>
          </button>
        </div>
      </div>

      {openTopPanel === 'filters' && (
        <div className="bg-slate-800/40 p-4 rounded-2xl border border-primary/30 space-y-3">
          <div className="flex items-center gap-2 text-primary mb-1">
            <Filter className="w-3.5 h-3.5" />
            <span className="text-[10px] font-bold uppercase tracking-widest">Filtros do historico</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="space-y-1">
              <label className="text-[8px] font-bold text-slate-500 uppercase px-1">Inicio</label>
              <input
                type="date"
                value={filters.startDate}
                onChange={(event) => updateFilter('startDate', event.target.value)}
                className="w-full bg-slate-900/50 border-slate-700 rounded-lg p-1.5 text-[10px] focus:ring-1 focus:ring-primary outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[8px] font-bold text-slate-500 uppercase px-1">Fim</label>
              <input
                type="date"
                value={filters.endDate}
                onChange={(event) => updateFilter('endDate', event.target.value)}
                className="w-full bg-slate-900/50 border-slate-700 rounded-lg p-1.5 text-[10px] focus:ring-1 focus:ring-primary outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[8px] font-bold text-slate-500 uppercase px-1">Cliente</label>
              <input
                type="text"
                placeholder="Nome..."
                value={filters.clientName}
                onChange={(event) => updateFilter('clientName', event.target.value)}
                className="w-full bg-slate-900/50 border-slate-700 rounded-lg p-1.5 text-[10px] focus:ring-1 focus:ring-primary outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[8px] font-bold text-slate-500 uppercase px-1">Servico</label>
              <select
                value={filters.serviceType}
                onChange={(event) => updateFilter('serviceType', event.target.value)}
                className="w-full bg-slate-900/50 border-slate-700 rounded-lg p-1.5 text-[10px] focus:ring-1 focus:ring-primary outline-none"
              >
                <option value="all">Todos</option>
                {serviceTypeOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[8px] font-bold text-slate-500 uppercase px-1">Recorrencia</label>
              <select
                value={filters.isRecurring}
                onChange={(event) => updateFilter('isRecurring', event.target.value as HistoryFilters['isRecurring'])}
                className="w-full bg-slate-900/50 border-slate-700 rounded-lg p-1.5 text-[10px] focus:ring-1 focus:ring-primary outline-none"
              >
                <option value="all">Todos</option>
                <option value="yes">Recorrente</option>
                <option value="no">Eventual</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {openTopPanel === 'messageLogs' && (
        <div className="bg-slate-800/40 p-4 rounded-2xl border border-emerald-500/30 space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-emerald-400">
              <MessageCircle className="h-4 w-4" />
              <span className="text-[10px] font-bold uppercase tracking-widest">Logs de avisos enviados</span>
            </div>
            <span className="text-[10px] text-slate-500">{filteredMessageLogs.length} registro(s) no filtro atual</span>
          </div>

          {filteredMessageLogs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-700/40 bg-slate-900/20 p-4 text-center">
              <p className="text-[10px] text-slate-500">Nenhum aviso registrado neste periodo.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {filteredMessageLogs.map((log, index) => {
                const isConfirmingLogDelete = messageLogDeleteConfirmId === log.id;

                return (
                  <div
                    key={log.id || `${log.clientId}-${log.createdAt}-${index}`}
                    className="flex flex-col gap-2 rounded-xl bg-slate-900/35 p-3 border border-slate-700/30 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-bold text-slate-100 truncate">{log.clientName || 'Cliente sem nome'}</p>
                        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[8px] font-bold uppercase tracking-wide text-emerald-400">
                          WhatsApp
                        </span>
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[8px] font-bold uppercase tracking-wide text-primary">
                          {log.trigger === 'manual' ? 'Manual' : log.trigger}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 truncate">
                        {log.bikeModel || 'Moto nao informada'} - {log.phone || 'Telefone nao informado'}
                      </p>
                      <p className="mt-1 line-clamp-2 text-[10px] text-slate-400">{log.message}</p>
                    </div>
                    <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
                      <div className="text-left sm:text-right">
                        <p className="text-[10px] font-bold text-white">{safeFormat(log.createdAt, 'dd/MM/yyyy HH:mm')}</p>
                        <p className={cn(
                          'mt-1 text-[9px] font-bold uppercase tracking-widest',
                          log.status === 'opened_whatsapp' || log.status === 'sent' ? 'text-emerald-400' : log.status === 'failed' ? 'text-red-400' : 'text-yellow-400'
                        )}>
                          {log.status === 'opened_whatsapp'
                            ? 'WhatsApp aberto'
                            : log.status === 'sent'
                              ? 'Enviado'
                              : log.status === 'failed'
                                ? 'Falhou'
                                : 'Pendente'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onDeleteMessageLogClick(log)}
                        disabled={!log.id}
                        className={cn(
                          'rounded-lg p-2 transition-colors disabled:opacity-40',
                          isConfirmingLogDelete ? 'bg-red-500 text-white animate-pulse' : 'bg-red-500/10 text-red-500 hover:bg-red-500/20'
                        )}
                        title="Excluir log de aviso"
                      >
                        {isConfirmingLogDelete ? <CheckCircle className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
        {groupedHistory.length === 0 ? (
          <div className="text-center py-8 bg-slate-800/10 rounded-xl border border-dashed border-slate-700/30">
            <p className="text-[10px] text-slate-600">Nenhum servico registrado no periodo.</p>
          </div>
        ) : (
          groupedHistory.map(({ clientName, services }) => {
            const recurringItems = services.filter((service) => service.isRecurringRevenue);
            const eventualItems = services.filter((service) => !service.isRecurringRevenue);
            const forcedSection = filters.isRecurring === 'yes'
              ? 'recorrentes'
              : filters.isRecurring === 'no'
                ? 'eventuais'
                : null;
            const currentSection = serviceSection[clientName];
            const defaultSection = currentSection && (
              (currentSection === 'recorrentes' && recurringItems.length > 0) ||
              (currentSection === 'eventuais' && eventualItems.length > 0)
            )
              ? currentSection
              : eventualItems.length > 0 && recurringItems.length === 0 ? 'eventuais' : 'recorrentes';
            const activeSection = forcedSection ?? defaultSection;
            const sectionItems = activeSection === 'recorrentes' ? recurringItems : eventualItems;
            const isExpanded = expandedClients.has(clientName);

            return (
              <div key={clientName} className="bg-slate-800/30 rounded-xl border border-slate-700/40 overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleClient(clientName, recurringItems.length ? 'recorrentes' : 'eventuais')}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-800/50 transition-all"
                >
                  <div className="flex items-center gap-3 flex-1 text-left">
                    <ChevronRight className={cn('w-5 h-5 transition-transform', isExpanded ? 'rotate-90' : '')} />
                    <div>
                      <p className="font-bold text-sm">{clientName}</p>
                      <p className="text-[9px] text-slate-500">{services.length} servico(s)</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-primary">
                      R$ {services.reduce((sum, service) => sum + service.serviceValue, 0).toFixed(2)}
                    </p>
                    <p className="text-[8px] text-slate-500">Total</p>
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-slate-700/40 bg-slate-900/20">
                    <div className="flex gap-2 border-b border-slate-700/40 bg-slate-800/60 p-3">
                      <button
                        type="button"
                        onClick={() => setServiceSection((current) => ({ ...current, [clientName]: 'recorrentes' }))}
                        className={cn(
                          'rounded-full px-3 py-1 text-[11px] font-bold transition-colors',
                          activeSection === 'recorrentes' ? 'bg-primary text-slate-950' : 'bg-slate-900 text-slate-400 hover:bg-slate-800'
                        )}
                      >
                        Recorrentes
                      </button>
                      <button
                        type="button"
                        onClick={() => setServiceSection((current) => ({ ...current, [clientName]: 'eventuais' }))}
                        className={cn(
                          'rounded-full px-3 py-1 text-[11px] font-bold transition-colors',
                          activeSection === 'eventuais' ? 'bg-primary text-slate-950' : 'bg-slate-900 text-slate-400 hover:bg-slate-800'
                        )}
                      >
                        Eventuais
                      </button>
                    </div>

                    <div className="space-y-1 p-3">
                      {sectionItems.length === 0 ? (
                        <div className="rounded-2xl border border-slate-700/40 bg-slate-800/50 p-4 text-sm text-slate-400">
                          Nenhum servico {activeSection === 'recorrentes' ? 'recorrente' : 'eventual'} registrado para este cliente.
                        </div>
                      ) : (
                        sectionItems.map((record) => {
                          const isProcessing = processingId === record.id;
                          const isConfirmingDelete = deleteConfirmId === record.id;

                          return (
                            <div key={record.id} className="px-4 py-3 flex items-center justify-between group hover:bg-slate-800/30 transition-all rounded-2xl">
                              <div className="flex items-center gap-3 flex-1">
                                <div className={cn('p-2 rounded-lg', record.isRecurringRevenue ? 'bg-primary/10 text-primary' : 'bg-slate-700/50 text-slate-400')}>
                                  {record.isRecurringRevenue ? <RefreshCw className="w-4 h-4" /> : <Wrench className="w-4 h-4" />}
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <p className="font-bold text-xs">{record.serviceType || 'Servico'}</p>
                                    {record.isRecurringRevenue ? (
                                      <span className="text-[7px] bg-primary/20 text-primary px-1 rounded uppercase font-bold">Recorrente</span>
                                    ) : (
                                      <span className="text-[7px] bg-slate-700/30 text-slate-300 px-1 rounded uppercase font-bold">Eventual</span>
                                    )}
                                    {record.saldoDevedor && record.saldoDevedor > 0 ? (
                                      <span className="text-[7px] bg-red-500/20 text-red-400 px-1 rounded uppercase font-bold">Debito</span>
                                    ) : null}
                                  </div>
                                  <p className="text-[9px] text-slate-500">
                                    {record.bikeModel || 'N/A'} - R$ {(record.serviceValue || 0).toFixed(2)}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="text-right">
                                  <p className="font-bold text-[9px] text-white">{safeFormat(record.date, 'dd/MM/yyyy')}</p>
                                  {record.statusPagamento && (
                                    <p
                                      className={cn(
                                        'text-[8px] font-bold tracking-widest',
                                        record.statusPagamento === 'Pago'
                                          ? 'text-emerald-400'
                                          : record.statusPagamento === 'Pendente'
                                            ? 'text-yellow-400'
                                            : 'text-slate-400'
                                      )}
                                    >
                                      {record.statusPagamento}
                                    </p>
                                  )}
                                </div>
                                <div className="flex items-center gap-1">
                                  {record.statusPagamento === 'Parcial' && record.saldoDevedor && record.saldoDevedor > 0 ? (
                                    <button
                                      type="button"
                                      onClick={() => void onSettleDebt(record)}
                                      disabled={isProcessing}
                                      className="p-2 rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-all opacity-0 group-hover:opacity-100 disabled:opacity-50 flex items-center gap-1"
                                      title={`Quitar R$ ${record.saldoDevedor?.toFixed(2) || '0'} de debito`}
                                    >
                                      {isProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />}
                                    </button>
                                  ) : null}
                                  {record.statusPagamento === 'Pendente' || (record.statusPagamento === 'Parcial' && (record.valorPago || 0) === 0) ? (
                                    <button
                                      type="button"
                                      onClick={() => void onConfirmPayment(record)}
                                      disabled={isProcessing}
                                      className="p-2 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition-all opacity-0 group-hover:opacity-100 disabled:opacity-50 flex items-center gap-1"
                                      title="Confirmar pagamento completo"
                                    >
                                      {isProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                                    </button>
                                  ) : null}
                                  <button
                                    type="button"
                                    onClick={() => onDeleteMaintenanceClick(record)}
                                    className={cn(
                                      'p-2 rounded-lg transition-colors opacity-0 group-hover:opacity-100',
                                      isConfirmingDelete
                                        ? 'bg-red-500 text-white animate-pulse opacity-100'
                                        : 'bg-red-500/10 text-red-500 hover:bg-red-500/20'
                                    )}
                                  >
                                    {isConfirmingDelete ? <CheckCircle className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
