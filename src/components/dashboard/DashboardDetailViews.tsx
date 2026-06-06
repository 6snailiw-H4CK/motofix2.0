import { ChevronLeft, ReceiptText, RefreshCw, TrendingUp, Wrench } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { getServiceTypeLabel } from '../../lib/serviceTypes';
import type { MaintenanceRecord } from '../../types';

type DashboardStats = {
  revenue: number;
  recurringRevenue: number;
  servicesCount: number;
};

type ClientStat = {
  name: string;
  sourceRows?: Array<{
    date: string;
    id: string;
    label: string;
    origin: 'Recorrentes' | 'Lancamentos Caixa';
    status: string;
    value: number;
  }>;
  totalSpent: number;
  isRecurring: boolean;
};

type DashboardDetailViewProps = {
  dashboardStats: DashboardStats;
  clientStats: ClientStat[];
  onBack: () => void;
};

type DashboardRecurringViewProps = {
  dashboardStats: DashboardStats;
  maintenances: MaintenanceRecord[];
  onBack: () => void;
};

type DashboardServicesViewProps = {
  dashboardStats: DashboardStats;
  maintenances: MaintenanceRecord[];
  onBack: () => void;
};

const currency = (value: number) =>
  value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatDate = (date: string) => {
  const parsed = parseISO(date);
  if (!Number.isFinite(parsed.getTime())) return '-';
  return format(parsed, 'dd/MM/yyyy');
};

const BackButton = ({ onBack }: { onBack: () => void }) => (
  <button
    type="button"
    onClick={onBack}
    className="flex items-center gap-2 text-slate-400 hover:text-slate-200 transition-colors text-sm"
  >
    <ChevronLeft className="w-4 h-4" />
    Voltar ao Dashboard
  </button>
);

export const DashboardRevenueView = ({ dashboardStats, clientStats, onBack }: DashboardDetailViewProps) => {
  const topClients = clientStats.filter((stat) => stat.totalSpent > 0).slice(0, 10);
  const sourceRows = topClients.flatMap((stat) => (
    (stat.sourceRows || []).map((source) => ({
      ...source,
      clientName: stat.name,
    }))
  ));

  return (
    <div className="space-y-4">
      <BackButton onBack={onBack} />
      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <TrendingUp className="w-6 h-6 text-emerald-500" />
          <h2 className="text-xl font-bold text-emerald-400">Receita (Este Mes)</h2>
        </div>
        <p className="text-4xl font-bold text-white mb-2">R$ {currency(dashboardStats.revenue)}</p>
        <p className="text-sm text-slate-400">Receita bruta total do mes atual</p>
      </div>

      <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="font-bold text-white">Receita por Cliente (Top 10)</h3>
            <p className="text-xs text-slate-500">Valores do mes atual vindos de servicos e lancamentos caixa faturados.</p>
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
            {sourceRows.length} origem(ns)
          </span>
        </div>
        {topClients.length > 0 ? (
          <div className="space-y-3 max-h-[34rem] overflow-y-auto">
            {topClients.map((stat, index) => (
              <div key={`${stat.name}-${index}`} className="rounded-xl border border-slate-700/40 bg-slate-700/20 p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-black text-slate-100">{index + 1}. {stat.name}</span>
                  <span className="text-emerald-400 font-black">R$ {currency(stat.totalSpent)}</span>
                </div>

                {(stat.sourceRows || []).length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    {stat.sourceRows?.map((source) => (
                      <div key={`${source.origin}-${source.id}`} className="grid gap-2 rounded-lg bg-slate-950/35 p-2 text-xs sm:grid-cols-[1fr_auto_auto] sm:items-center">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-slate-300">
                              <ReceiptText className="h-3 w-3" />
                              {source.origin}
                            </span>
                            <span className="truncate font-bold text-slate-200">{source.label}</span>
                          </div>
                          <p className="mt-1 text-[10px] text-slate-500">
                            {formatDate(source.date)} - {source.status}
                          </p>
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{source.status}</span>
                        <span className="text-right font-black text-emerald-400">R$ {currency(source.value)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-slate-400 text-sm">Sem dados de receita para este periodo</p>
        )}
      </div>
    </div>
  );
};

export const DashboardRecurringView = ({ dashboardStats, maintenances, onBack }: DashboardRecurringViewProps) => {
  const today = new Date();
  const recurringClients = Array.from(
    maintenances
      .filter((maintenance) => {
        if (!maintenance.isRecurringRevenue || !maintenance.date) return false;
        const serviceDate = parseISO(maintenance.date);
        return serviceDate.getMonth() === today.getMonth() && serviceDate.getFullYear() === today.getFullYear();
      })
      .reduce((map, maintenance) => {
        const key = maintenance.clientId || maintenance.clientName || maintenance.id;
        const current = map.get(key) || {
          bikeModel: maintenance.bikeModel || 'Moto nao informada',
          count: 0,
          lastDate: maintenance.date,
          name: maintenance.clientName || 'Cliente sem nome',
          totalSpent: 0,
        };

        current.count += 1;
        current.totalSpent += Number(maintenance.serviceValue) || 0;
        if (parseISO(maintenance.date).getTime() > parseISO(current.lastDate).getTime()) {
          current.lastDate = maintenance.date;
        }
        map.set(key, current);
        return map;
      }, new Map<string, { bikeModel: string; count: number; lastDate: string; name: string; totalSpent: number }>())
      .values()
  ).sort((a, b) => b.totalSpent - a.totalSpent);

  return (
    <div className="space-y-4">
      <BackButton onBack={onBack} />
      <div className="bg-primary/10 border border-primary/20 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <RefreshCw className="w-6 h-6 text-primary" />
          <h2 className="text-xl font-bold text-primary">Receita Recorrente</h2>
        </div>
        <p className="text-4xl font-bold text-white mb-2">R$ {currency(dashboardStats.recurringRevenue)}</p>
        <p className="text-sm text-slate-400">Receita de servicos recorrentes este mes</p>
      </div>

      <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4">
        <h3 className="font-bold text-white mb-4">Clientes com servicos recorrentes este mes</h3>
        {recurringClients.length > 0 ? (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {recurringClients.map((stat, index) => (
              <div key={`${stat.name}-${index}`} className="flex items-center justify-between gap-3 p-3 bg-slate-700/20 rounded-lg">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-200 truncate">{stat.name}</p>
                  <p className="text-xs text-slate-500 truncate">{stat.bikeModel}</p>
                  <p className="text-[10px] text-slate-500 mt-1">
                    {stat.count} servico(s) - Ultimo em {format(parseISO(stat.lastDate), 'dd/MM/yyyy')}
                  </p>
                </div>
                <span className="text-primary font-bold shrink-0">R$ {currency(stat.totalSpent)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-slate-400 text-sm">Sem servicos recorrentes neste mes.</p>
        )}
      </div>
    </div>
  );
};

export const DashboardServicesView = ({ dashboardStats, maintenances, onBack }: DashboardServicesViewProps) => {
  const today = new Date();
  const currentMonthServices = maintenances
    .filter((maintenance) => {
      const serviceDate = parseISO(maintenance.date);
      return serviceDate.getMonth() === today.getMonth() && serviceDate.getFullYear() === today.getFullYear();
    })
    .sort((a, b) => parseISO(b.date).getTime() - parseISO(a.date).getTime());

  return (
    <div className="space-y-4">
      <BackButton onBack={onBack} />
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <Wrench className="w-6 h-6 text-blue-500" />
          <h2 className="text-xl font-bold text-blue-400">Servicos Realizados</h2>
        </div>
        <p className="text-4xl font-bold text-white mb-2">{dashboardStats.servicesCount}</p>
        <p className="text-sm text-slate-400">Clientes com servico registrado neste mes</p>
      </div>

      <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4">
        <h3 className="font-bold text-white mb-4">Clientes atendidos neste mes</h3>
        {currentMonthServices.length > 0 ? (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {currentMonthServices.map((maintenance, index) => (
              <div key={maintenance.id || `${maintenance.clientName}-${index}`} className="flex items-center justify-between gap-3 p-3 bg-slate-700/20 rounded-lg">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-200 truncate">{maintenance.clientName || 'Cliente sem nome'}</p>
                  <p className="text-xs text-slate-500 truncate">{maintenance.bikeModel || 'Moto nao informada'}</p>
                  <p className="text-[10px] text-slate-500 mt-1">
                    {getServiceTypeLabel(maintenance.serviceType)} - {format(parseISO(maintenance.date), 'dd/MM/yyyy')}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-blue-400 font-bold text-xs">R$ {currency(maintenance.serviceValue || 0)}</p>
                  <p className="text-[9px] uppercase font-bold text-slate-500 mt-1">{maintenance.statusPagamento || 'Pago'}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-slate-400 text-sm">Nenhum servico realizado neste mes.</p>
        )}
      </div>
    </div>
  );
};
