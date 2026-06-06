import { Clock, DollarSign, RefreshCw, ShieldCheck, TrendingUp, Wrench } from 'lucide-react';
import type { ComponentType } from 'react';
import { cn } from '../../lib/utils';

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

type DashboardMetricsGridProps = {
  activeWarrantiesCount: number;
  cashFlowStats: CashFlowStats;
  dashboardStats: DashboardStats;
  onRecurringClick?: () => void;
  onRevenueClick?: () => void;
  onServicesClick?: () => void;
  onWarrantiesClick?: () => void;
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

const currency = (value: number) =>
  value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

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

export const DashboardMetricsGrid = ({
  activeWarrantiesCount,
  cashFlowStats,
  dashboardStats,
  onRecurringClick,
  onRevenueClick,
  onServicesClick,
  onWarrantiesClick,
}: DashboardMetricsGridProps) => (
  <div className="space-y-2 lg:space-y-3">
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
        onClick={onRevenueClick}
        title="Receita (Mes)"
        tone="emerald"
        value={`R$ ${currency(dashboardStats.revenue)}`}
      />
      <DashboardMetricCard
        compactMobile
        description="Clientes com servicos recorrentes"
        icon={RefreshCw}
        onClick={onRecurringClick}
        title="Recorrente"
        tone="red"
        value={`R$ ${currency(dashboardStats.recurringRevenue)}`}
      />
      <DashboardMetricCard
        compactMobile
        description="Total de servicos"
        icon={Wrench}
        onClick={onServicesClick}
        title="Servicos"
        tone="blue"
        value={`${dashboardStats.servicesCount}`}
      />
      <DashboardMetricCard
        compactMobile
        description="Em andamento"
        icon={ShieldCheck}
        onClick={onWarrantiesClick}
        title="Garantias"
        tone="purple"
        value={`${activeWarrantiesCount}`}
      />
    </div>
  </div>
);
