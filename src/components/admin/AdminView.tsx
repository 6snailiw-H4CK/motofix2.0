import { format, isAfter, isBefore, isValid, parseISO } from 'date-fns';
import {
  ArrowDownWideNarrow,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  CircleUserRound,
  Filter,
  Lock,
  Search,
  Shield,
  ShieldCheck,
  UserCheck,
  UserRoundX,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { DateInput } from '../DateInput';
import { cn } from '../../lib/utils';
import type { UserProfile } from '../../types';

type AdminViewProps = {
  users: UserProfile[];
  currentUserId: string;
  onToggleUserStatus: (user: UserProfile) => Promise<void> | void;
  onUpdateSubscription: (uid: string, days: number) => Promise<void> | void;
  onSetSubscriptionDate: (uid: string, date: string) => Promise<void> | void;
};

type UserStatusFilter = 'all' | 'active' | 'blocked';
type UserRoleFilter = 'all' | UserProfile['role'];
type UserSort = 'recent' | 'oldest' | 'name' | 'expiry';

const getSafeDate = (value?: string | null) => {
  if (!value) return null;
  const date = parseISO(value);
  return isValid(date) ? date : null;
};

const formatUserDate = (value?: string | null) => {
  const date = getSafeDate(value);
  return date ? format(date, 'dd/MM/yyyy') : '—';
};

const getPlanLabel = (user: UserProfile) => {
  switch (user.subscription?.plan) {
    case 'monthly':
      return 'Mensal';
    case 'annual':
      return 'Anual';
    default:
      return 'Gratuito';
  }
};

const getInitials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0]?.toLocaleUpperCase() || '')
    .join('') || '?';

export const AdminView = ({
  users,
  currentUserId,
  onToggleUserStatus,
  onUpdateSubscription,
  onSetSubscriptionDate,
}: AdminViewProps) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<UserStatusFilter>('all');
  const [roleFilter, setRoleFilter] = useState<UserRoleFilter>('all');
  const [sortBy, setSortBy] = useState<UserSort>('recent');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const metrics = useMemo(() => {
    const activeCount = users.filter(user => user.isActive).length;
    const blockedCount = users.length - activeCount;
    const today = new Date();
    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 7);
    const upcomingCount = users.filter((user) => {
      const expiryDate = getSafeDate(user.subscriptionExpiresAt);
      return expiryDate && !isBefore(expiryDate, today) && !isAfter(expiryDate, nextWeek);
    }).length;

    return {
      activeCount,
      blockedCount,
      upcomingCount,
      activePercent: users.length ? Math.round((activeCount / users.length) * 100) : 0,
      blockedPercent: users.length ? Math.round((blockedCount / users.length) * 100) : 0,
      newThisMonth: users.filter((user) => {
        const created = getSafeDate(user.createdAt);
        return created && created.getMonth() === today.getMonth() && created.getFullYear() === today.getFullYear();
      }).length,
    };
  }, [users]);

  const filteredUsers = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    const result = users.filter((user) => {
      if (statusFilter === 'active' && !user.isActive) return false;
      if (statusFilter === 'blocked' && user.isActive) return false;
      if (roleFilter !== 'all' && user.role !== roleFilter) return false;
      if (!query) return true;
      return `${user.displayName} ${user.email} ${getPlanLabel(user)}`.toLocaleLowerCase().includes(query);
    });

    return result.sort((a, b) => {
      if (sortBy === 'name') return a.displayName.localeCompare(b.displayName, 'pt-BR');
      if (sortBy === 'expiry') {
        const aExpiry = getSafeDate(a.subscriptionExpiresAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const bExpiry = getSafeDate(b.subscriptionExpiresAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        return aExpiry - bExpiry;
      }

      const aCreated = getSafeDate(a.createdAt)?.getTime() ?? 0;
      const bCreated = getSafeDate(b.createdAt)?.getTime() ?? 0;
      return sortBy === 'recent' ? bCreated - aCreated : aCreated - bCreated;
    });
  }, [roleFilter, searchQuery, sortBy, statusFilter, users]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageUsers = filteredUsers.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const firstVisible = filteredUsers.length ? (currentPage - 1) * pageSize + 1 : 0;
  const lastVisible = Math.min(currentPage * pageSize, filteredUsers.length);

  const updateStatusFilter = (value: UserStatusFilter) => {
    setStatusFilter(value);
    setPage(1);
  };

  const updateRoleFilter = (value: UserRoleFilter) => {
    setRoleFilter(value);
    setPage(1);
  };

  const updateSearch = (value: string) => {
    setSearchQuery(value);
    setPage(1);
  };

  const setStatusFromMetric = (value: UserStatusFilter) => {
    updateStatusFilter(statusFilter === value ? 'all' : value);
  };

  return (
    <div className="admin-users-view min-w-0 space-y-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-500">
            <span>Admin</span>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="text-slate-300">Usuários</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
              <Shield className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-2xl font-black tracking-tight text-white sm:text-3xl">Usuários e assinaturas</h2>
              <p className="mt-1 text-sm text-slate-400">Gerencie acessos, permissões e vencimentos do sistema.</p>
            </div>
          </div>
        </div>
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-primary">
          <Shield className="h-4 w-4" />
          Administrador
        </span>
      </header>

      <section aria-label="Resumo de usuários" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={CircleUserRound}
          label="Total de usuários"
          value={users.length}
          detail={`${metrics.newThisMonth} novos neste mês`}
          tone="slate"
          selected={statusFilter === 'all'}
          onClick={() => setStatusFromMetric('all')}
        />
        <MetricCard
          icon={UserCheck}
          label="Ativos"
          value={metrics.activeCount}
          detail={`${metrics.activePercent}% do total`}
          tone="green"
          selected={statusFilter === 'active'}
          onClick={() => setStatusFromMetric('active')}
        />
        <MetricCard
          icon={UserRoundX}
          label="Bloqueados"
          value={metrics.blockedCount}
          detail={`${metrics.blockedPercent}% do total`}
          tone="red"
          selected={statusFilter === 'blocked'}
          onClick={() => setStatusFromMetric('blocked')}
        />
        <MetricCard
          icon={CalendarDays}
          label="Assinaturas próximas"
          value={metrics.upcomingCount}
          detail="Vencem nos próximos 7 dias"
          tone="blue"
        />
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-slate-700/70 bg-slate-900/45 p-3 lg:flex-row lg:items-center">
        <label className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="search"
            value={searchQuery}
            onChange={event => updateSearch(event.target.value)}
            placeholder="Buscar por nome, e-mail ou plano..."
            aria-label="Buscar usuários"
            className="w-full rounded-xl border border-slate-700 bg-slate-950/60 py-2.5 pl-10 pr-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
          />
        </label>

        <label className="relative min-w-0 lg:w-44">
          <ShieldCheck className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <select
            value={statusFilter}
            onChange={event => updateStatusFilter(event.target.value as UserStatusFilter)}
            aria-label="Filtrar por status"
            className="w-full appearance-none rounded-xl border border-slate-700 bg-slate-950/60 py-2.5 pl-10 pr-9 text-sm text-slate-200 outline-none transition focus:border-primary/60"
          >
            <option value="all">Todos os status</option>
            <option value="active">Ativos</option>
            <option value="blocked">Bloqueados</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        </label>

        <label className="relative min-w-0 lg:w-44">
          <CircleUserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <select
            value={roleFilter}
            onChange={event => updateRoleFilter(event.target.value as UserRoleFilter)}
            aria-label="Filtrar por função"
            className="w-full appearance-none rounded-xl border border-slate-700 bg-slate-950/60 py-2.5 pl-10 pr-9 text-sm text-slate-200 outline-none transition focus:border-primary/60"
          >
            <option value="all">Todas as funções</option>
            <option value="admin">Administradores</option>
            <option value="user">Usuários</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        </label>

        <label className="relative min-w-0 lg:w-48">
          <ArrowDownWideNarrow className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <select
            value={sortBy}
            onChange={event => setSortBy(event.target.value as UserSort)}
            aria-label="Ordenar usuários"
            className="w-full appearance-none rounded-xl border border-slate-700 bg-slate-950/60 py-2.5 pl-10 pr-9 text-sm text-slate-200 outline-none transition focus:border-primary/60"
          >
            <option value="recent">Mais recentes</option>
            <option value="oldest">Mais antigos</option>
            <option value="name">Nome (A–Z)</option>
            <option value="expiry">Vencimento próximo</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        </label>

        <button
          type="button"
          onClick={() => {
            updateSearch('');
            updateStatusFilter('all');
            updateRoleFilter('all');
            setSortBy('recent');
          }}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-300 transition hover:border-primary/40 hover:bg-slate-800"
        >
          <Filter className="h-4 w-4" />
          Limpar
        </button>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-900/35">
        <div className="flex flex-col gap-1 border-b border-slate-700/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-bold text-white">Lista de usuários</h3>
            <p className="text-xs text-slate-500">Ajuste o status e a assinatura diretamente na lista.</p>
          </div>
          <span className="text-xs text-slate-500">{filteredUsers.length} resultado(s)</span>
        </div>

        <div className="max-w-full overflow-x-auto">
          <table className="w-full min-w-[1060px] table-fixed text-left">
            <colgroup>
              <col className="w-[29%]" />
              <col className="w-[12%]" />
              <col className="w-[13%]" />
              <col className="w-[12%]" />
              <col className="w-[12%]" />
              <col className="w-[22%]" />
            </colgroup>
            <thead className="bg-slate-800/60">
              <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <th className="px-4 py-3">Usuário</th>
                <th className="px-3 py-3">Função</th>
                <th className="px-3 py-3">Plano</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Cadastro</th>
                <th className="px-3 py-3">Vencimento e ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {pageUsers.map((appUser) => {
                const isCurrentUser = appUser.uid === currentUserId;
                const expiryDate = getSafeDate(appUser.subscriptionExpiresAt);
                const isExpired = expiryDate ? isBefore(expiryDate, new Date()) : false;

                return (
                  <tr key={appUser.uid} className={cn('align-top transition hover:bg-slate-800/35', isCurrentUser && 'bg-slate-800/20')}>
                    <td className="px-4 py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className={cn(
                          'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white',
                          appUser.isActive ? 'bg-slate-700' : 'bg-red-950/70 text-red-200'
                        )}>
                          {getInitials(appUser.displayName)}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-slate-100" title={appUser.displayName}>
                            {appUser.displayName || 'Usuário sem nome'}
                            {isCurrentUser && <span className="ml-2 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-300">Você</span>}
                          </p>
                          <p className="truncate text-xs text-slate-500" title={appUser.email}>{appUser.email || 'E-mail não informado'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className={cn(
                        'inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold',
                        appUser.role === 'admin' ? 'bg-amber-500/10 text-amber-300' : 'bg-slate-800 text-slate-300'
                      )}>
                        {appUser.role === 'admin' ? 'Administrador' : 'Usuário'}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="block text-sm font-semibold text-slate-200">{getPlanLabel(appUser)}</span>
                      <span className="mt-0.5 block text-[11px] text-slate-500">
                        {appUser.subscription?.autoRenew ? 'Renovação automática' : 'Acesso manual'}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={cn(
                        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold',
                        appUser.isActive ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'
                      )}>
                        <span className={cn('h-1.5 w-1.5 rounded-full', appUser.isActive ? 'bg-emerald-400' : 'bg-red-400')} />
                        {appUser.isActive ? 'Ativo' : 'Bloqueado'}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="block text-sm text-slate-200">{formatUserDate(appUser.createdAt)}</span>
                      <span className="mt-0.5 block text-[11px] text-slate-500">Cadastro</span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex min-w-0 flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <DateInput
                            className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950/60 px-2 py-1.5 text-xs font-semibold text-slate-200 outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50"
                            value={expiryDate ? format(expiryDate, 'yyyy-MM-dd') : ''}
                            onChange={value => {
                              if (value) void onSetSubscriptionDate(appUser.uid, value);
                            }}
                            aria-label={`Vencimento da assinatura de ${appUser.displayName}`}
                            disabled={isCurrentUser}
                          />
                          {expiryDate && (
                            <span className={cn('shrink-0 text-[10px] font-semibold', isExpired ? 'text-red-300' : 'text-emerald-300')}>
                              {isExpired ? 'Expirou' : 'Ativa'}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <SubscriptionButton tone="red" title="Remover 30 dias" onClick={() => void onUpdateSubscription(appUser.uid, -30)} disabled={isCurrentUser}>−30d</SubscriptionButton>
                          <SubscriptionButton tone="red" title="Remover 7 dias" onClick={() => void onUpdateSubscription(appUser.uid, -7)} disabled={isCurrentUser}>−7d</SubscriptionButton>
                          <SubscriptionButton tone="green" title="Adicionar 30 dias" onClick={() => void onUpdateSubscription(appUser.uid, 30)} disabled={isCurrentUser}>+30d</SubscriptionButton>
                          <SubscriptionButton tone="green" title="Adicionar 90 dias" onClick={() => void onUpdateSubscription(appUser.uid, 90)} disabled={isCurrentUser}>+90d</SubscriptionButton>
                          {!isCurrentUser && (
                            <button
                              type="button"
                              onClick={() => void onToggleUserStatus(appUser)}
                              title={appUser.isActive ? 'Bloquear usuário' : 'Desbloquear usuário'}
                              aria-label={appUser.isActive ? `Bloquear ${appUser.displayName}` : `Desbloquear ${appUser.displayName}`}
                              className={cn(
                                'ml-auto inline-flex h-8 w-8 items-center justify-center rounded-lg border transition',
                                appUser.isActive
                                  ? 'border-red-500/20 bg-red-500/10 text-red-300 hover:bg-red-500/20'
                                  : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                              )}
                            >
                              {appUser.isActive ? <Lock className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                            </button>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {pageUsers.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <Search className="mx-auto h-6 w-6 text-slate-600" />
                    <p className="mt-2 text-sm font-semibold text-slate-300">Nenhum usuário encontrado</p>
                    <p className="mt-1 text-xs text-slate-500">Tente alterar a busca ou os filtros.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <footer className="flex flex-col gap-3 border-t border-slate-700/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">
            Mostrando <span className="font-semibold text-slate-300">{firstVisible}–{lastVisible}</span> de{' '}
            <span className="font-semibold text-slate-300">{filteredUsers.length}</span> usuários
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-slate-500">
              Linhas por página
              <select
                value={pageSize}
                onChange={event => {
                  setPageSize(Number(event.target.value));
                  setPage(1);
                }}
                className="rounded-lg border border-slate-700 bg-slate-950/60 px-2 py-1.5 text-xs text-slate-300 outline-none focus:border-primary/60"
                aria-label="Linhas por página"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => setPage(value => Math.max(1, value - 1))}
              disabled={currentPage <= 1}
              aria-label="Página anterior"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 text-slate-300 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-lg border border-primary/60 bg-primary/10 px-2 text-xs font-bold text-primary" aria-live="polite">
              {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage(value => Math.min(totalPages, value + 1))}
              disabled={currentPage >= totalPages}
              aria-label="Próxima página"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 text-slate-300 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
};

type MetricCardProps = {
  icon: typeof CircleUserRound;
  label: string;
  value: number;
  detail: string;
  tone: 'slate' | 'green' | 'red' | 'blue';
  selected?: boolean;
  onClick?: () => void;
};

const metricTone: Record<MetricCardProps['tone'], { icon: string; value: string }> = {
  slate: { icon: 'bg-slate-700/50 text-slate-300', value: 'text-white' },
  green: { icon: 'bg-emerald-500/10 text-emerald-400', value: 'text-emerald-100' },
  red: { icon: 'bg-red-500/10 text-red-400', value: 'text-red-100' },
  blue: { icon: 'bg-sky-500/10 text-sky-300', value: 'text-sky-100' },
};

const MetricCard = ({ icon: Icon, label, value, detail, tone, selected = false, onClick }: MetricCardProps) => {
  const content = (
    <>
      <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', metricTone[tone].icon)}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium text-slate-400">{label}</span>
        <span className={cn('mt-0.5 block text-2xl font-black leading-none', metricTone[tone].value)}>{value}</span>
        <span className="mt-2 block text-[11px] text-slate-500">{detail}</span>
      </span>
      {onClick && <ChevronsUpDown className="h-4 w-4 shrink-0 text-slate-600" />}
    </>
  );
  const className = cn(
    'flex min-w-0 items-center gap-3 rounded-2xl border bg-slate-900/45 p-4 text-left transition',
    selected ? 'border-primary/50 ring-1 ring-primary/20' : 'border-slate-700/70 hover:border-slate-600',
    onClick && 'cursor-pointer hover:bg-slate-800/60'
  );

  if (onClick) {
    return <button type="button" onClick={onClick} aria-pressed={selected} className={className}>{content}</button>;
  }

  return <div className={className}>{content}</div>;
};

const SubscriptionButton = ({
  children,
  disabled,
  onClick,
  title,
  tone,
}: {
  children: string;
  disabled: boolean;
  onClick: () => void;
  title: string;
  tone: 'red' | 'green';
}) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    title={title}
    className={cn(
      'rounded-lg border px-2 py-1 text-[10px] font-bold transition disabled:cursor-not-allowed disabled:opacity-40',
      tone === 'red'
        ? 'border-red-500/20 bg-red-500/[0.06] text-red-300 hover:bg-red-500/15'
        : 'border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-300 hover:bg-emerald-500/15'
    )}
  >
    {children}
  </button>
);
