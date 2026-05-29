import {
  AlertTriangle,
  Bell,
  Bike,
  Calendar,
  ChevronDown,
  Clock,
  DollarSign,
  MessageSquare,
  Plus,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  Wrench,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ComponentType } from 'react';
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
  onQuickServiceRegister: () => void;
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

type DashboardMetricCardProps = {
  compactMobile?: boolean;
  description: string;
  icon: ComponentType<{ className?: string }>;
  tone: 'emerald' | 'orange' | 'amber' | 'red' | 'blue' | 'purple';
  title: string;
  value: string;
  onClick?: () => void;
};

const metricToneClasses: Record<DashboardMetricCardProps['tone'], {
  border: string;
  glow: string;
  icon: string;
  line: string;
  text: string;
}> = {
  emerald: {
    border: 'border-emerald-500/15',
    glow: 'from-emerald-500/20',
    icon: 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20',
    line: '#22c55e',
    text: 'text-emerald-300',
  },
  orange: {
    border: 'border-orange-500/15',
    glow: 'from-orange-500/20',
    icon: 'bg-orange-500/10 text-orange-400 ring-orange-500/20',
    line: '#f97316',
    text: 'text-orange-300',
  },
  amber: {
    border: 'border-amber-500/15',
    glow: 'from-amber-500/20',
    icon: 'bg-amber-500/10 text-amber-400 ring-amber-500/20',
    line: '#facc15',
    text: 'text-amber-300',
  },
  red: {
    border: 'border-primary/15',
    glow: 'from-primary/20',
    icon: 'bg-primary/10 text-primary ring-primary/20',
    line: '#ef4444',
    text: 'text-primary',
  },
  blue: {
    border: 'border-blue-500/15',
    glow: 'from-blue-500/20',
    icon: 'bg-blue-500/10 text-blue-400 ring-blue-500/20',
    line: '#3b82f6',
    text: 'text-blue-300',
  },
  purple: {
    border: 'border-purple-500/15',
    glow: 'from-purple-500/20',
    icon: 'bg-purple-500/10 text-purple-300 ring-purple-500/20',
    line: '#a855f7',
    text: 'text-purple-300',
  },
};

const metricSparklinePoints: Record<DashboardMetricCardProps['tone'], Array<[number, number]>> = {
  emerald: [[0, 28], [18, 28], [36, 28], [54, 29], [72, 28], [88, 20], [102, 22], [120, 10]],
  orange: [[0, 30], [20, 31], [40, 31], [58, 30], [76, 25], [90, 29], [106, 24], [120, 18]],
  amber: [[0, 30], [20, 30], [40, 31], [58, 31], [76, 29], [90, 20], [104, 24], [120, 16]],
  red: [[0, 31], [20, 31], [40, 31], [58, 31], [76, 28], [92, 21], [106, 24], [120, 10]],
  blue: [[0, 30], [20, 30], [40, 29], [58, 29], [76, 25], [90, 23], [106, 18], [120, 14]],
  purple: [[0, 31], [20, 31], [40, 30], [58, 28], [76, 25], [92, 21], [108, 19], [120, 14]],
};

const MetricSparkline = ({
  compactMobile,
  tone,
  title,
}: {
  compactMobile: boolean;
  tone: DashboardMetricCardProps['tone'];
  title: string;
}) => {
  const toneClasses = metricToneClasses[tone];
  const points = metricSparklinePoints[tone];
  const gradientId = `spark-${tone}-${title.replace(/[^a-z0-9]/gi, '').toLowerCase()}`;
  const linePoints = points.map(([x, y]) => `${x},${y}`).join(' ');
  const areaPoints = `0,36 ${linePoints} 120,36`;

  return (
    <svg
      className={cn('w-full overflow-visible', compactMobile ? 'h-3.5 sm:h-6' : 'h-5 sm:h-7')}
      viewBox="0 0 120 36"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={toneClasses.line} stopOpacity="0.34" />
          <stop offset="100%" stopColor={toneClasses.line} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill={`url(#${gradientId})`} />
      <polyline
        points={linePoints}
        fill="none"
        stroke={toneClasses.line}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.6"
      />
    </svg>
  );
};

const DashboardMetricCard = ({
  compactMobile = false,
  description,
  icon: Icon,
  onClick,
  title,
  tone,
  value,
}: DashboardMetricCardProps) => {
  const toneClasses = metricToneClasses[tone];
  const className = cn(
    'group relative overflow-hidden rounded-xl border bg-[#0d1626] text-left shadow-[0_14px_34px_rgba(0,0,0,0.22)]',
    compactMobile ? 'min-h-[4.75rem] p-2 sm:min-h-[6.2rem] sm:p-2.5' : 'min-h-[6.1rem] p-2.5 sm:min-h-[7rem] sm:p-3',
    toneClasses.border,
    onClick && 'transition-all hover:-translate-y-0.5 hover:border-primary/30 active:translate-y-0'
  );

  const content = (
    <>
      <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-black/15" />
      <div className={cn('absolute inset-x-0 bottom-0 bg-gradient-to-t to-transparent', compactMobile ? 'h-9 sm:h-12' : 'h-12 sm:h-14', toneClasses.glow)} />
      <div className={cn('relative flex h-full flex-col justify-between', compactMobile ? 'gap-1 sm:gap-2' : 'gap-1.5 sm:gap-2')}>
        <div>
          <div className={cn('grid place-items-center rounded-full ring-1', compactMobile ? 'mb-1 h-6 w-6 sm:h-7 sm:w-7' : 'mb-1.5 h-7 w-7', toneClasses.icon)}>
            <Icon className={cn(compactMobile ? 'h-3 w-3 sm:h-3.5 sm:w-3.5' : 'h-3.5 w-3.5')} />
          </div>
          <p className={cn('text-[7px] font-black uppercase leading-tight tracking-widest sm:text-[8px]', toneClasses.text)}>{title}</p>
          <p className={cn('mt-0.5 break-words font-black leading-tight text-white', compactMobile ? 'text-sm sm:text-lg' : 'text-[0.95rem] sm:text-xl')}>{value}</p>
          <p className={cn('mt-0.5 leading-tight text-slate-300/80', compactMobile ? 'line-clamp-1 text-[7px] sm:text-[9px]' : 'text-[8px] sm:text-[9px]')}>{description}</p>
        </div>
        <MetricSparkline compactMobile={compactMobile} title={title} tone={tone} />
      </div>
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {content}
      </button>
    );
  }

  return (
    <div className={className}>
      {content}
    </div>
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
  onQuickServiceRegister,
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
  <div className="space-y-3.5 lg:space-y-5">
    <button
      type="button"
      onClick={onQuickServiceRegister}
      aria-label="Registrar servico rapido"
      title="Registrar servico rapido"
      className="fixed bottom-24 right-4 z-40 grid h-[3.75rem] w-[3.75rem] place-items-center rounded-full border border-white/10 bg-primary text-white shadow-[0_18px_45px_rgba(239,68,68,0.35)] transition-all hover:scale-105 hover:bg-primary/90 active:scale-95 lg:bottom-8 lg:right-8"
    >
      <span className="absolute inset-1 rounded-full bg-white/10" />
      <span className="relative grid h-11 w-11 place-items-center rounded-full bg-black/10 backdrop-blur">
        <Plus className="h-6 w-6" />
      </span>
    </button>

    {nextAppointment && (
      <button
        type="button"
        onClick={() => onViewChange('appointments')}
        aria-label="Ver proximo agendamento"
        title={`Proximo agendamento: ${nextAppointment.clientName}`}
        className="fixed bottom-40 right-4 z-40 grid h-12 w-12 place-items-center rounded-full border border-sky-400/20 bg-slate-950/90 text-sky-200 shadow-[0_16px_38px_rgba(14,165,233,0.25)] backdrop-blur transition-all hover:scale-105 hover:border-sky-300/40 active:scale-95 lg:bottom-28 lg:right-8"
      >
        <Calendar className="h-5 w-5" />
        <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary ring-2 ring-slate-950" />
      </button>
    )}

    <div className="grid grid-cols-3 gap-2 lg:gap-3">
      <DashboardMetricCard
        description="Este mes - Pago + Parcial"
        icon={DollarSign}
        title="Total Recebido"
        tone="emerald"
        value={`R$ ${currency(cashFlowStats.totalRecebidoMes)}`}
      />
      <DashboardMetricCard
        description="Saldo de pagamentos parciais"
        icon={Clock}
        title="Parciais a Receber"
        tone="orange"
        value={`R$ ${currency(cashFlowStats.parcialAReceber)}`}
      />
      <DashboardMetricCard
        description="Saldo em aberto"
        icon={DollarSign}
        title="A Receber"
        tone="amber"
        value={`R$ ${currency(cashFlowStats.aReceber)}`}
      />
    </div>

    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4 lg:gap-3">
      <DashboardMetricCard
        compactMobile
        description="Receita paga no mes"
        icon={TrendingUp}
        onClick={() => onViewChange('dashboard-revenue')}
        title="Receita (Mes)"
        tone="emerald"
        value={`R$ ${currency(dashboardStats.revenue)}`}
      />
      <DashboardMetricCard
        compactMobile
        description="Clientes com servicos recorrentes"
        icon={RefreshCw}
        onClick={() => onViewChange('dashboard-recurring')}
        title="Recorrente"
        tone="red"
        value={`R$ ${currency(dashboardStats.recurringRevenue)}`}
      />
      <DashboardMetricCard
        compactMobile
        description="Total de servicos"
        icon={Wrench}
        onClick={() => onViewChange('dashboard-services')}
        title="Servicos"
        tone="blue"
        value={`${dashboardStats.servicesCount}`}
      />
      <DashboardMetricCard
        compactMobile
        description="Em andamento"
        icon={ShieldCheck}
        onClick={() => onViewChange('warranties')}
        title="Garantias"
        tone="purple"
        value={`${activeWarrantiesCount}`}
      />
    </div>

    {dailyPendingAlerts.length > 0 && (
      <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 space-y-2 lg:rounded-lg lg:border-slate-800/80 lg:bg-slate-950/50 lg:p-5">
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

    {overdueClients.length > 0 && (
      <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden lg:rounded-lg lg:border-slate-800/80 lg:bg-slate-950/50">
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

    <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
    <div className="relative overflow-hidden rounded-xl border border-slate-800/80 bg-[#0d1626] p-3 shadow-[0_14px_34px_rgba(0,0,0,0.22)] lg:p-4">
      <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-black/10" />
      <div className="relative mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-sm">Historico mensal</h3>
          <p className="text-[9px] text-slate-400 mt-1">Servicos registrados nos ultimos 6 meses.</p>
        </div>
        <button
          type="button"
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-700/50 bg-slate-950/30 px-2 py-1.5 text-[8px] font-bold uppercase tracking-widest text-slate-200"
        >
          6 meses
          <ChevronDown className="h-3 w-3 text-slate-500" />
        </button>
      </div>
      {monthlyServicesTotal === 0 ? (
        <p className="relative text-center text-[11px] text-slate-500 py-8">Nenhum servico nos ultimos 6 meses.</p>
      ) : (
        <div className="relative grid gap-2.5">
          <div className="h-[160px] min-w-0 rounded-xl bg-slate-950/20 p-2 lg:h-[190px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 16, right: 0, left: -28, bottom: -2 }}>
                <defs>
                  <linearGradient id="monthlyBarGradient" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity="1" />
                    <stop offset="100%" stopColor="#991b1b" stopOpacity="0.88" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} strokeOpacity={0.2} />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 700 }} />
                <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 9 }} width={24} />
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
                <Bar dataKey="count" radius={[6, 6, 0, 0]} barSize={24} fill="url(#monthlyBarGradient)">
                  <LabelList dataKey="count" position="top" fill="#e5e7eb" fontSize={9} fontWeight={800} />
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`${entry.month}-${entry.year}`}
                      fill={entry.count > 0 ? 'url(#monthlyBarGradient)' : '#334155'}
                      fillOpacity={index === chartData.length - 1 ? 1 : entry.count > 0 ? 0.82 : 0.45}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
            <div className="rounded-lg border border-slate-800/80 bg-slate-950/25 p-2.5">
              <p className="text-[7px] font-bold uppercase tracking-widest text-slate-500">Total</p>
              <p className="mt-0.5 text-base font-black text-white">{monthlyServicesTotal}</p>
              <p className="text-[8px] text-slate-500">no periodo</p>
            </div>
            <div className="rounded-lg border border-red-500/15 bg-slate-950/25 p-2.5">
              <p className="text-[7px] font-bold uppercase tracking-widest text-red-400">Mes atual</p>
              <p className="mt-0.5 text-base font-black text-white">{latestMonthCount}</p>
              <p className="text-[8px] text-slate-500">{chartData[chartData.length - 1]?.month || '-'}</p>
            </div>
            <div className="rounded-lg border border-amber-500/15 bg-slate-950/25 p-2.5">
              <p className="text-[7px] font-bold uppercase tracking-widest text-orange-300">Melhor</p>
              <p className="mt-0.5 text-base font-black text-white">{bestMonth?.count || 0}</p>
              <p className="text-[8px] text-slate-500">{bestMonth?.month || '-'}</p>
            </div>
          </div>
        </div>
      )}
    </div>

    <div className="relative overflow-hidden rounded-xl border border-slate-800/80 bg-[#0d1626] p-2.5 shadow-[0_14px_34px_rgba(0,0,0,0.18)] sm:p-3 lg:p-4">
      <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-black/10" />
      <div className="relative mb-2 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold">Top Servicos (pagos)</h3>
          <p className="mt-0.5 max-w-2xl text-[9px] text-slate-500">
            Ranking de servicos pagos ativos.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onViewChange('dashboard-services')}
          className="shrink-0 text-[9px] font-black uppercase tracking-widest text-primary transition hover:text-primary/80"
        >
          Ver todos
        </button>
      </div>
      {topServicesChartData.length === 0 ? (
        <p className="relative py-3 text-center text-[11px] text-slate-500">Nenhum servico pago para exibir.</p>
      ) : (
        <div className="relative space-y-1.5">
            {topServicesChartData.slice(0, 3).map(({ service, revenue, position }, index) => {
              const expanded = expandedTopService === service;
              const subRows = getTopServiceSubRows(service);
              const color = dashboardPieColors[index % dashboardPieColors.length];
              return (
                <div key={service} className="overflow-hidden rounded-lg border border-slate-800/70 bg-slate-950/20">
                  <button
                    type="button"
                    onClick={() => onToggleTopService(service)}
                    className="flex w-full items-center justify-between gap-2 p-2 text-left transition-colors hover:bg-slate-900/50"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform', expanded && 'rotate-180')} />
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                      <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-black text-primary">#{position}</span>
                      <span className="truncate text-xs font-semibold text-white">{service}</span>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="block text-xs font-bold text-primary">R$ {currency(revenue)}</span>
                      <span className="block text-[9px] text-slate-500">{percentage(revenue, topServicesTotal)}%</span>
                    </div>
                  </button>
                  {expanded && subRows.length > 0 && (
                    <div className="space-y-1 border-t border-slate-700/30 px-2 pb-2 pt-1">
                      <p className="px-1 text-[8px] font-bold uppercase tracking-widest text-slate-500">
                        {isOilService(service) ? 'Oleos / produtos' : 'Resumo'}
                      </p>
                      {subRows.map((row) => (
                        <div
                          key={row.label}
                          className="flex items-center justify-between gap-2 rounded-md bg-slate-950/35 px-2 py-1 text-[10px]"
                        >
                          <span className="text-slate-300 truncate pr-2">{row.label}</span>
                          <div className="flex shrink-0 items-center gap-2 text-slate-400">
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
      )}
    </div>
    </div>
  </div>
  );
};
