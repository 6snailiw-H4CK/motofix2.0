import {
  BarChart3,
  Calendar,
  DollarSign,
  LayoutDashboard,
  Settings as SettingsIcon,
  Shield,
  ShieldCheck,
  UserRound,
  Users,
  Wrench,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { cn } from '../../lib/utils';
import type { AppView } from '../../types';

export type SidebarNavItem = {
  id: AppView;
  icon: ComponentType<{ className?: string }>;
  label: string;
  match: AppView[];
};

export const getPrimaryNavItems = (isAdmin: boolean): SidebarNavItem[] => [
  {
    id: 'dashboard',
    icon: LayoutDashboard,
    label: 'Dashboard',
    match: ['dashboard', 'dashboard-revenue', 'dashboard-recurring', 'dashboard-services'],
  },
  {
    id: 'clients-schedule',
    icon: Users,
    label: 'Clientes',
    match: ['clients-schedule', 'clients-schedule-add'],
  },
  {
    id: 'clients',
    icon: Wrench,
    label: 'Ordens de Servico',
    match: ['clients', 'new-client'],
  },
  {
    id: 'appointments',
    icon: Calendar,
    label: 'Agenda',
    match: ['appointments'],
  },
  {
    id: 'expenses',
    icon: DollarSign,
    label: 'Financeiro',
    match: ['expenses', 'general-report', 'report'],
  },
  {
    id: 'warranties',
    icon: ShieldCheck,
    label: 'Garantias',
    match: ['warranties', 'new-warranty'],
  },
  {
    id: 'general-report',
    icon: BarChart3,
    label: 'Relatorios',
    match: ['general-report', 'report'],
  },
  {
    id: 'settings',
    icon: SettingsIcon,
    label: 'Configuracoes',
    match: ['settings'],
  },
  ...(isAdmin
    ? [{
      id: 'admin' as AppView,
      icon: Shield,
      label: 'Admin',
      match: ['admin' as AppView],
    }]
    : []),
];

type SidebarNavProps = {
  businessName?: string;
  currentUserName?: string;
  isAdmin: boolean;
  view: AppView;
  onViewChange: (view: AppView) => void;
};

export const SidebarNav = ({
  businessName,
  currentUserName,
  isAdmin,
  view,
  onViewChange,
}: SidebarNavProps) => {
  const items = getPrimaryNavItems(isAdmin);

  return (
    <aside className="app-sidebar hidden min-h-screen w-72 shrink-0 border-r border-slate-800/80 bg-[#08090d] lg:flex lg:flex-col">
      <div className="flex h-full flex-col">
        <div className="border-b border-slate-800/80 px-6 py-6">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-white shadow-lg shadow-primary/20">
              <span className="text-sm font-black">M</span>
            </div>
            <div className="min-w-0">
              <p className="text-base font-black leading-none text-white">MotoFix</p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Oficina SaaS</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onViewChange('settings')}
            className="mt-6 flex w-full items-center justify-between gap-3 rounded-lg border border-slate-700/70 bg-slate-900/60 px-3 py-3 text-left transition-colors hover:border-primary/40 hover:bg-slate-900"
          >
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <UserRound className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-bold text-white">{businessName || 'Minha Oficina'}</p>
                <p className="truncate text-[10px] text-slate-500">Ambiente principal</p>
              </div>
            </div>
            <SettingsIcon className="h-4 w-4 shrink-0 text-slate-500" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 px-4 py-6">
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = item.match.includes(view);

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onViewChange(item.id)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm font-bold transition-colors',
                  isActive
                    ? 'border border-primary/30 bg-primary/10 text-white shadow-sm shadow-primary/10'
                    : 'text-slate-400 hover:bg-slate-900/80 hover:text-slate-100'
                )}
              >
                <Icon className={cn('h-5 w-5', isActive ? 'text-primary' : 'text-slate-500')} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="border-t border-slate-800/80 p-4">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-slate-700 bg-slate-900 text-xs font-black text-white">
              {(currentUserName || businessName || 'M').slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-white">{currentUserName || 'Usuario MotoFix'}</p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{isAdmin ? 'Admin' : 'Operacao'}</p>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};
