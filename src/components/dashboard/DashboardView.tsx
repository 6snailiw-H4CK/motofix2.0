import {
  AlertTriangle,
  Bell,
  Bike,
  ChevronDown,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  Wrench,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart as RePieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { cn, safeFormat } from '../../lib/utils';
import type { AppView, Appointment, Client } from '../../types';

type DashboardStats = {
  revenue: number;
  recurringRevenue: number;
  servicesCount: number;
};

type CashFlowStats = {
  totalRecebidoMes: number;
  aReceber: number;
  parcialAReceber: number;
};

type ChartDataPoint = {
  month: string;
  monthIndex: number;
  year: number;
  count: number;
};

export type TopServiceRow = {
  service: string;
  revenue: number;
  position: number;
};

export type TopServiceSubRow = {
  label: string;
  count: number;
  revenue: number;
};

type DashboardViewProps = {
  cashFlowStats: CashFlowStats;
  dashboardStats: DashboardStats;
  activeWarrantiesCount: number;
  dailyPendingAlerts: Client[];
  nextAppointment?: Appointment;
  overdueClients: Client[];
  chartData: ChartDataPoint[];
  topServicesData: TopServiceRow[];
  expandedTopService: string | null;
  onViewChange: (view: AppView) => void;
  onSendWhatsApp: (client: Client) => void;
  onToggleTopService: (service: string) => void;
  getTopServiceSubRows: (serviceType: string) => TopServiceSubRow[];
};

const currency = (value: number) =>
  value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const isOilService = (service: string) =>
  service
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim() === 'troca de oleo';

const dashboardPieColors = ['#ef4444', '#f97316', '#38bdf8', '#14b8a6', '#8b5cf6', '#facc15'];

const percentage = (value: number, total: number) => {
  if (total <= 0) return 0;
  return Math.round((value / total) * 100);
};

const pieLabelRadian = Math.PI / 180;

type PiePercentLabelProps = {
  cx?: number | string;
  cy?: number | string;
  innerRadius?: number | string;
  midAngle?: number;
  outerRadius?: number | string;
  percent?: number;
};

const renderPiePercentLabel = ({
  cx = 0,
  cy = 0,
  innerRadius = 0,
  midAngle = 0,
  outerRadius = 0,
  percent = 0,
}: PiePercentLabelProps) => {
  if (percent < 0.05) return null;

  const radius = Number(innerRadius) + (Number(outerRadius) - Number(innerRadius)) * 0.58;
  const x = Number(cx) + radius * Math.cos(-midAngle * pieLabelRadian);
  const y = Number(cy) + radius * Math.sin(-midAngle * pieLabelRadian);

  return (
    <text x={x} y={y} fill="#e2e8f0" textAnchor="middle" dominantBaseline="central" className="text-[10px] font-bold">
      {`${Math.round(percent * 100)}%`}
    </text>
  );
};

export const DashboardView = ({
  cashFlowStats,
  dashboardStats,
  activeWarrantiesCount,
  dailyPendingAlerts,
  nextAppointment,
  overdueClients,
  chartData,
  topServicesData,
  expandedTopService,
  onViewChange,
  onSendWhatsApp,
  onToggleTopService,
  getTopServiceSubRows,
}: DashboardViewProps) => {
  const topServicesChartData = topServicesData.filter((item) => item.revenue > 0);
  const topServicesTotal = topServicesChartData.reduce((sum, item) => sum + item.revenue, 0);
  const monthlyServicesTotal = chartData.reduce((sum, item) => sum + item.count, 0);
  const latestMonthCount = chartData[chartData.length - 1]?.count || 0;
  const bestMonth = chartData.reduce<ChartDataPoint | null>((best, item) => {
    if (!best || item.count > best.count) return item;
    return best;
  }, null);

  return (
  <div className="space-y-8">
    <div className="grid grid-cols-3 gap-2">
      <div className="bg-emerald-500/10 p-3 rounded-2xl border border-emerald-500/20 flex flex-col justify-between min-w-0">
        <p className="text-[8px] font-bold text-emerald-500 uppercase tracking-widest mb-2">Total Recebido</p>
        <div>
          <p className="text-xl font-bold text-emerald-400 leading-tight">R$ {currency(cashFlowStats.totalRecebidoMes)}</p>
          <p className="text-[10px] text-emerald-600/70 mt-1">Este mes - Pago + Parcial</p>
        </div>
      </div>
      <div className="bg-orange-500/10 p-3 rounded-2xl border border-orange-500/20 flex flex-col justify-between min-w-0">
        <p className="text-[8px] font-bold text-orange-500 uppercase tracking-widest mb-2">Parciais a Receber</p>
        <div>
          <p className="text-xl font-bold text-orange-400 leading-tight">R$ {currency(cashFlowStats.parcialAReceber)}</p>
          <p className="text-[10px] text-orange-600/70 mt-1">Saldo de servicos com pagamento parcial</p>
        </div>
      </div>
      <div className="bg-amber-500/10 p-3 rounded-2xl border border-amber-500/20 flex flex-col justify-between min-w-0">
        <p className="text-[8px] font-bold text-amber-500 uppercase tracking-widest mb-2">A Receber</p>
        <div>
          <p className="text-xl font-bold text-amber-400 leading-tight">R$ {currency(cashFlowStats.aReceber)}</p>
          <p className="text-[10px] text-amber-600/70 mt-1">Saldo em aberto - so Pendente</p>
        </div>
      </div>
    </div>

    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <button
        type="button"
        onClick={() => onViewChange('dashboard-revenue')}
        className="bg-emerald-500/10 p-3 rounded-2xl border border-emerald-500/20 flex flex-col justify-between hover:bg-emerald-500/20 hover:border-emerald-500/40 transition-all duration-200 cursor-pointer group"
      >
        <p className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest group-hover:text-emerald-400 transition-colors">
          Receita (Mes)
        </p>
        <p className="text-lg font-bold text-white">R$ {currency(dashboardStats.revenue)}</p>
        <TrendingUp className="w-4 h-4 text-emerald-500 mt-1 group-hover:scale-110 transition-transform" />
      </button>
      <button
        type="button"
        onClick={() => onViewChange('dashboard-recurring')}
        className="bg-primary/10 p-3 rounded-2xl border border-primary/20 flex flex-col justify-between hover:bg-primary/20 hover:border-primary/40 transition-all duration-200 cursor-pointer group"
      >
        <p className="text-[9px] font-bold text-primary uppercase tracking-widest group-hover:text-primary/80 transition-colors">
          Recorrente
        </p>
        <p className="text-lg font-bold text-white">R$ {currency(dashboardStats.recurringRevenue)}</p>
        <RefreshCw className="w-4 h-4 text-primary mt-1 group-hover:scale-110 transition-transform" />
      </button>
      <button
        type="button"
        onClick={() => onViewChange('dashboard-services')}
        className="bg-blue-500/10 p-3 rounded-2xl border border-blue-500/20 flex flex-col justify-between hover:bg-blue-500/20 hover:border-blue-500/40 transition-all duration-200 cursor-pointer group"
      >
        <p className="text-[9px] font-bold text-blue-500 uppercase tracking-widest group-hover:text-blue-400 transition-colors">
          Servicos
        </p>
        <p className="text-lg font-bold text-white">{dashboardStats.servicesCount}</p>
        <Wrench className="w-4 h-4 text-blue-500 mt-1 group-hover:scale-110 transition-transform" />
      </button>
      <button
        type="button"
        onClick={() => onViewChange('warranties')}
        className="bg-purple-500/10 p-3 rounded-2xl border border-purple-500/20 flex flex-col justify-between hover:bg-purple-500/20 hover:border-purple-500/40 transition-all duration-200 cursor-pointer group"
      >
        <p className="text-[9px] font-bold text-purple-500 uppercase tracking-widest group-hover:text-purple-400 transition-colors">Garantias</p>
        <p className="text-lg font-bold text-white">{activeWarrantiesCount}</p>
        <ShieldCheck className="w-4 h-4 text-purple-500 mt-1 group-hover:scale-110 transition-transform" />
      </button>
    </div>

    {dailyPendingAlerts.length > 0 && (
      <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-primary/20 p-1 rounded-lg">
              <Bell className="w-3.5 h-3.5 text-primary animate-bounce" />
            </div>
            <div>
              <h3 className="font-bold text-sm">Envios do Dia</h3>
              <p className="text-[10px] text-slate-400">{dailyPendingAlerts.length} pendentes hoje</p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {dailyPendingAlerts.slice(0, 4).map((client) => (
            <div
              key={client.id}
              className="bg-slate-800/40 p-2.5 rounded-lg border border-slate-700/50 flex items-center justify-between group hover:border-primary/30 transition-all"
            >
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-slate-700/50 flex items-center justify-center">
                  <Bike className="w-3.5 h-3.5 text-slate-400" />
                </div>
                <div>
                  <p className="font-bold text-[11px] leading-tight">{client.name}</p>
                  <p className="text-[8px] text-slate-500 uppercase font-bold tracking-tighter">{client.bikeModel}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onSendWhatsApp(client)}
                className="bg-primary p-1.5 rounded-lg text-white hover:scale-105 transition-transform shadow-md shadow-primary/10"
              >
                <MessageSquare className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
        {dailyPendingAlerts.length > 4 && (
          <button
            type="button"
            onClick={() => onViewChange('clients')}
            className="text-[9px] text-primary font-bold uppercase tracking-widest hover:underline px-1"
          >
            + {dailyPendingAlerts.length - 4} outros alertas
          </button>
        )}
      </div>
    )}

    {nextAppointment && (
      <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-slate-400">Proximo agendamento</p>
            <h3 className="font-bold text-white">{nextAppointment.clientName}</h3>
            <p className="text-[10px] text-slate-400 mt-1">
              {nextAppointment.bikeModel} - {nextAppointment.serviceRequested}
            </p>
            <p className="text-[11px] text-slate-300 mt-1">
              {format(parseISO(nextAppointment.scheduledDate), 'dd/MM/yyyy')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onViewChange('appointments')}
            className="rounded-full bg-primary px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-white hover:bg-primary/90 transition"
          >
            Ver agenda
          </button>
        </div>
      </div>
    )}

    {overdueClients.length > 0 && (
      <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
        <div className="p-3 border-b border-slate-700 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <h3 className="font-bold text-sm">Alertas Urgentes</h3>
          </div>
          <span className="bg-red-500/10 text-red-500 text-[10px] font-bold px-2 py-0.5 rounded-md">
            {overdueClients.length} VENCIDOS
          </span>
        </div>
        <div className="divide-y divide-slate-700">
          {overdueClients.slice(0, 5).map((client) => (
            <div key={client.id} className="p-3 flex items-center justify-between hover:bg-slate-800 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-slate-700 flex items-center justify-center">
                  <Bike className="w-4.5 h-4.5 text-slate-400" />
                </div>
                <div>
                  <p className="font-bold text-xs">{client.name || 'N/A'}</p>
                  <p className="text-[10px] text-slate-500">{client.bikeModel || 'N/A'}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-red-500 font-bold text-[10px]">Vencido</p>
                <p className="text-[9px] text-slate-500">{safeFormat(client.nextMaintenanceDate, 'dd/MM/yyyy')}</p>
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => onViewChange('clients')}
          className="w-full p-3 text-primary text-xs font-bold hover:bg-slate-800 transition-colors"
        >
          Ver Todos os Alertas
        </button>
      </div>
    )}

    <div className="bg-slate-800/40 p-3.5 rounded-xl border border-slate-700/50">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between mb-4">
        <div>
          <h3 className="font-bold text-sm">Historico Mensal</h3>
          <p className="text-[10px] text-slate-400 mt-1">Evolucao da quantidade de servicos registrados nos ultimos 6 meses.</p>
        </div>
        <p className="text-[9px] text-slate-500 uppercase font-bold tracking-widest">Cada barra = servicos no mes</p>
      </div>
      {monthlyServicesTotal === 0 ? (
        <p className="text-center text-[11px] text-slate-500 py-8">Nenhum servico nos ultimos 6 meses.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr] lg:items-stretch">
          <div className="h-[250px] min-w-0 rounded-xl bg-slate-950/20 p-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 12, right: 8, left: -22, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} strokeOpacity={0.35} />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10 }} />
                <Tooltip
                  cursor={{ fill: 'rgba(239, 68, 68, 0.08)' }}
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '10px',
                    color: '#fff',
                    fontSize: '10px',
                    padding: '8px',
                  }}
                  formatter={(value: number) => [`${value} servico(s)`, 'Mes']}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]} barSize={30}>
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`${entry.month}-${entry.year}`}
                      fill={index === chartData.length - 1 ? '#ef4444' : entry.count > 0 ? '#f97316' : '#334155'}
                      fillOpacity={index === chartData.length - 1 ? 1 : entry.count > 0 ? 0.75 : 0.45}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-3 gap-2 lg:grid-cols-1">
            <div className="rounded-xl bg-slate-900/50 p-3 border border-slate-700/30">
              <p className="text-[8px] font-bold uppercase tracking-widest text-slate-500">Total</p>
              <p className="mt-1 text-xl font-bold text-white">{monthlyServicesTotal}</p>
              <p className="text-[9px] text-slate-500">servicos no periodo</p>
            </div>
            <div className="rounded-xl bg-slate-900/50 p-3 border border-red-500/20">
              <p className="text-[8px] font-bold uppercase tracking-widest text-red-400">Mes atual</p>
              <p className="mt-1 text-xl font-bold text-white">{latestMonthCount}</p>
              <p className="text-[9px] text-slate-500">{chartData[chartData.length - 1]?.month || '-'}</p>
            </div>
            <div className="rounded-xl bg-slate-900/50 p-3 border border-orange-500/20">
              <p className="text-[8px] font-bold uppercase tracking-widest text-orange-300">Melhor mes</p>
              <p className="mt-1 text-xl font-bold text-white">{bestMonth?.count || 0}</p>
              <p className="text-[9px] text-slate-500">{bestMonth?.month || '-'}</p>
            </div>
          </div>
        </div>
      )}
    </div>

    <div className="bg-slate-800/40 p-3.5 rounded-xl border border-slate-700/50">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
        <div>
          <h3 className="font-bold text-sm">Top Servicos (pagos)</h3>
          <p className="text-[10px] text-slate-400 mt-1 max-w-2xl">
            Valores baseados em servicos pagos de clientes ativos. Servicos pendentes nao entram no ranking.
          </p>
        </div>
        <p className="text-[9px] text-slate-500 uppercase font-bold tracking-widest">Toque para detalhar</p>
      </div>
      {topServicesChartData.length === 0 ? (
        <p className="text-center text-[11px] text-slate-500 py-4">Nenhum servico com status Pago para exibir no ranking.</p>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr] xl:items-center">
          <div className="min-w-0">
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <RePieChart>
                  <Pie
                    data={topServicesChartData}
                    dataKey="revenue"
                    nameKey="service"
                    innerRadius={58}
                    outerRadius={92}
                    paddingAngle={3}
                    labelLine={false}
                    label={renderPiePercentLabel}
                  >
                    {topServicesChartData.map((entry, index) => (
                      <Cell key={entry.service} fill={dashboardPieColors[index % dashboardPieColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '10px',
                      color: '#fff',
                      fontSize: '11px',
                      padding: '8px',
                    }}
                    formatter={(value: number) => [`R$ ${currency(value)}`, 'Receita paga']}
                  />
                </RePieChart>
              </ResponsiveContainer>
            </div>
            <div className="rounded-lg border border-slate-700/30 bg-slate-900/30 px-3 py-2 text-center">
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Total do ranking</p>
              <p className="text-lg font-bold text-white">R$ {currency(topServicesTotal)}</p>
            </div>
          </div>

          <div className="space-y-2">
            {topServicesData.map(({ service, revenue, position }, index) => {
              const expanded = expandedTopService === service;
              const subRows = getTopServiceSubRows(service);
              const color = dashboardPieColors[index % dashboardPieColors.length];
              return (
                <div key={service} className="rounded-lg border border-slate-700/30 bg-slate-900/30 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => onToggleTopService(service)}
                    className="w-full flex items-center justify-between p-2 text-left hover:bg-slate-800/40 transition-colors gap-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <ChevronDown className={cn('w-4 h-4 shrink-0 text-slate-500 transition-transform', expanded && 'rotate-180')} />
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                      <span className="text-xs font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded shrink-0">#{position}</span>
                      <span className="text-sm font-semibold text-white truncate">{service}</span>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="block text-sm font-bold text-primary">R$ {currency(revenue)}</span>
                      <span className="block text-[9px] text-slate-500">{percentage(revenue, topServicesTotal)}%</span>
                    </div>
                  </button>
                  {expanded && subRows.length > 0 && (
                    <div className="border-t border-slate-700/30 px-2 pb-2 pt-1 space-y-1.5">
                      <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest px-1">
                        {isOilService(service) ? 'Oleos / produtos' : 'Resumo'}
                      </p>
                      {subRows.map((row) => (
                        <div
                          key={row.label}
                          className="flex items-center justify-between gap-2 rounded-md bg-slate-950/40 px-2 py-1.5 text-[11px]"
                        >
                          <span className="text-slate-300 truncate pr-2">{row.label}</span>
                          <div className="flex items-center gap-3 shrink-0 text-slate-400">
                            <span>{row.count}x</span>
                            <span className="font-bold text-primary tabular-nums">R$ {currency(row.revenue)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  </div>
  );
};
