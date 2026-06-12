import {
  differenceInCalendarDays,
  format,
  parseISO,
} from 'date-fns';
import {
  Bell,
  Calendar,
  DollarSign,
  MessageSquare,
  Plus,
  RefreshCw,
  ShieldCheck,
  UserPlus,
  WalletCards,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { safeFormat } from '../../lib/utils';
import type { AppView, Appointment, Client, Warranty } from '../../types';

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
  dailyPendingAlerts: Client[];
  pendingPaymentCount: number;
  warranties: Warranty[];
  appointments: Appointment[];
  nextAppointment?: Appointment;
  overdueClients: Client[];
  chartData: ChartDataPoint[];
  topServicesData: TopServiceRow[];
  expandedTopService: string | null;
  onViewChange: (view: AppView) => void;
  onNewClient: () => void;
  onNewExpense: () => void;
  onNewReturn: () => void;
  onSendWhatsApp: (client: Client) => void;
  onToggleTopService: (service: string) => void;
  getTopServiceSubRows: (serviceType: string) => TopServiceSubRow[];
};

type PriorityCardProps = {
  accent: 'primary' | 'amber' | 'sky' | 'purple';
  actionLabel: string;
  count: number;
  detail: string;
  icon: ComponentType<{ className?: string }>;
  title: string;
  onAction: () => void;
};

const accentStyles: Record<PriorityCardProps['accent'], string> = {
  primary: 'border-primary/25 bg-primary/5 text-primary hover:border-primary/45',
  amber: 'border-amber-400/25 bg-amber-400/5 text-amber-300 hover:border-amber-300/45',
  sky: 'border-sky-400/25 bg-sky-400/5 text-sky-300 hover:border-sky-300/45',
  purple: 'border-purple-400/25 bg-purple-400/5 text-purple-300 hover:border-purple-300/45',
};

const currency = (value: number) =>
  value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const getDaysUntil = (date?: string) => {
  if (!date) return Number.POSITIVE_INFINITY;
  const parsed = parseISO(date.replace('Z', ''));
  if (!Number.isFinite(parsed.getTime())) return Number.POSITIVE_INFINITY;
  return differenceInCalendarDays(parsed, new Date());
};

const PriorityCard = ({
  accent,
  actionLabel,
  count,
  detail,
  icon: Icon,
  title,
  onAction,
}: PriorityCardProps) => (
  <article className={`rounded-2xl border p-4 transition-colors ${accentStyles[accent]}`}>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[10px] font-black uppercase tracking-[0.2em]">{title}</p>
        <p className="mt-3 text-3xl font-black text-white">{count}</p>
      </div>
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-slate-950/40">
        <Icon className="h-5 w-5" />
      </div>
    </div>
    <p className="mt-2 min-h-8 text-xs leading-relaxed text-slate-400">{detail}</p>
    <button
      type="button"
      onClick={onAction}
      className="mt-4 inline-flex min-h-10 w-full items-center justify-center rounded-xl bg-slate-900/70 px-3 text-xs font-black text-slate-100 transition-colors hover:bg-slate-800"
    >
      {actionLabel}
    </button>
  </article>
);

export const DashboardView = ({
  cashFlowStats,
  dailyPendingAlerts,
  pendingPaymentCount,
  warranties,
  appointments,
  nextAppointment,
  overdueClients,
  onViewChange,
  onNewClient,
  onNewExpense,
  onNewReturn,
  onSendWhatsApp,
}: DashboardViewProps) => {
  const todayKey = format(new Date(), 'yyyy-MM-dd');
  const appointmentsToday = appointments.filter((appointment) => (
    appointment.scheduledDate?.slice(0, 10) === todayKey && !appointment.completed
  ));
  const warrantiesDueSoon = warranties
    .map((warranty) => ({ warranty, days: getDaysUntil(warranty.expiryDate) }))
    .filter(({ days }) => days >= 0 && days <= 30)
    .sort((a, b) => a.days - b.days);
  const contactClients = [...overdueClients, ...dailyPendingAlerts].filter((client, index, list) => (
    list.findIndex((item) => item.id === client.id) === index
  ));
  const firstContact = contactClients[0];
  const firstAppointment = appointmentsToday[0] || nextAppointment;

  return (
    <div className="space-y-4 pb-24 lg:space-y-5 lg:pb-6">
      <section className="rounded-3xl border border-slate-800/80 bg-[#0d1626] p-4 shadow-[0_16px_40px_rgba(0,0,0,0.22)] lg:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-primary">Prioridades de hoje</p>
            <h2 className="mt-1 text-2xl font-black text-white lg:text-3xl">Faça clientes voltarem para a oficina.</h2>
            <p className="mt-2 text-sm text-slate-400">
              Abra o dia vendo quem precisa voltar, quem deve e o que esta agendado.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4 lg:min-w-[46rem]">
            <button
              type="button"
              onClick={() => onViewChange('cash-register')}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-sm font-black text-white shadow-lg shadow-primary/20 transition hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              Novo Serviço
            </button>
            <button
              type="button"
              onClick={onNewReturn}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-primary/30 bg-primary/10 px-4 text-sm font-black text-primary transition hover:bg-primary/15"
            >
              <RefreshCw className="h-4 w-4" />
              Nova Troca de Óleo
            </button>
            <button
              type="button"
              onClick={onNewClient}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-slate-800 px-4 text-sm font-black text-slate-100 transition hover:bg-slate-700"
            >
              <UserPlus className="h-4 w-4" />
              Novo Cliente
            </button>
            <button
              type="button"
              onClick={onNewExpense}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-slate-800 px-4 text-sm font-black text-slate-100 transition hover:bg-slate-700"
            >
              <WalletCards className="h-4 w-4" />
              Novo Gasto
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <PriorityCard
            accent="primary"
            actionLabel="Ver clientes"
            count={contactClients.length}
            detail={firstContact ? `${firstContact.status === 'OVERDUE' ? 'Vencido: ' : ''}${firstContact.name} - ${firstContact.bikeModel || 'moto nao informada'}` : 'Nenhum cliente precisa ser contatado agora.'}
            icon={Bell}
            title="Clientes para contatar hoje"
            onAction={() => onViewChange('returns')}
          />

          <PriorityCard
            accent="amber"
            actionLabel="Cobrar pendencias"
            count={pendingPaymentCount}
            detail={`R$ ${currency(cashFlowStats.aReceber + cashFlowStats.parcialAReceber)} em aberto.`}
            icon={DollarSign}
            title="Clientes pendentes"
            onAction={() => onViewChange('pendencies')}
          />

          <PriorityCard
            accent="sky"
            actionLabel="Abrir agenda"
            count={appointmentsToday.length}
            detail={firstAppointment ? `${firstAppointment.clientName} - ${safeFormat(firstAppointment.scheduledDate, 'dd/MM/yyyy')}` : 'Nenhum agendamento para hoje.'}
            icon={Calendar}
            title="Agendamentos de hoje"
            onAction={() => onViewChange('appointments')}
          />

          <PriorityCard
            accent="purple"
            actionLabel="Ver garantias"
            count={warrantiesDueSoon.length}
            detail={warrantiesDueSoon[0] ? `${warrantiesDueSoon[0].warranty.clientName} vence em ${warrantiesDueSoon[0].days} dia(s).` : 'Nenhuma garantia vencendo em 30 dias.'}
            icon={ShieldCheck}
            title="Garantias proximas"
            onAction={() => onViewChange('warranties')}
          />
        </div>

        {firstContact && (
          <div className="mt-4 rounded-2xl border border-primary/20 bg-primary/5 p-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Proxima acao</p>
                <p className="text-sm font-black text-white">{firstContact.name}</p>
                <p className="text-xs text-slate-400">
                  {firstContact.bikeModel || 'Moto nao informada'} - retorno previsto {safeFormat(firstContact.nextMaintenanceDate, 'dd/MM/yyyy')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onSendWhatsApp(firstContact)}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 text-sm font-black text-white transition hover:bg-emerald-600"
              >
                <MessageSquare className="h-4 w-4" />
                Enviar lembrete no WhatsApp
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
