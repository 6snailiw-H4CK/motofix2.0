import {
  BarChart3,
  Calendar,
  DollarSign,
  FileText,
  LayoutDashboard,
  MessageCircle,
  Package,
  ReceiptText,
  RefreshCw,
  Settings as SettingsIcon,
  Shield,
  ShieldCheck,
  PanelLeftClose,
  PanelLeftOpen,
  UserRound,
  Users,
} from 'lucide-react';
import { useEffect, useState, type ComponentType } from 'react';
import { cn } from '../../lib/utils';
import type { AppView } from '../../types';

export type SidebarNavItem = {
  id: AppView;
  icon: ComponentType<{ className?: string }>;
  label: string;
  match: AppView[];
  group?: 'primary' | 'tools';
};

export const getPrimaryNavItems = (isAdmin: boolean, fiscalModuleAvailable: boolean): SidebarNavItem[] => [
  {
    id: 'dashboard',
    icon: LayoutDashboard,
    label: 'Inicio',
    match: ['dashboard', 'dashboard-revenue', 'dashboard-recurring', 'dashboard-services'],
    group: 'primary',
  },
  {
    id: 'clients',
    icon: ReceiptText,
    label: 'Servicos/Oleo',
    match: ['clients'],
    group: 'primary',
  },
  {
    id: 'appointments',
    icon: Calendar,
    label: 'Agenda',
    match: ['appointments'],
    group: 'primary',
  },
  {
    id: 'pendencies',
    icon: DollarSign,
    label: 'Pendencias',
    match: ['pendencies'],
    group: 'primary',
  },
  {
    id: 'cash-register',
    icon: ReceiptText,
    label: 'Lancamentos Caixa',
    match: ['cash-register'],
    group: 'primary',
  },
  {
    id: 'clients-schedule',
    icon: Users,
    label: 'Clientes',
    match: ['clients-schedule', 'clients-schedule-add'],
    group: 'primary',
  },
  {
    id: 'settings',
    icon: SettingsIcon,
    label: 'Configuracoes',
    match: ['settings'],
    group: 'primary',
  },
  {
    id: 'history',
    icon: BarChart3,
    label: 'Historico',
    match: ['history'],
    group: 'tools',
  },
  {
    id: 'returns',
    icon: RefreshCw,
    label: 'Retornos',
    match: ['returns', 'new-client'],
    group: 'tools',
  },
  {
    id: 'expenses',
    icon: DollarSign,
    label: 'Gastos',
    match: ['expenses'],
    group: 'tools',
  },
  {
    id: 'warranties',
    icon: ShieldCheck,
    label: 'Garantias',
    match: ['warranties', 'new-warranty'],
    group: 'tools',
  },
  {
    id: 'products',
    icon: Package,
    label: 'Mercadorias',
    match: ['products'],
    group: 'tools',
  },
  ...(fiscalModuleAvailable
    ? [{
      id: 'fiscal' as AppView,
      icon: FileText,
      label: 'Fiscal',
      match: ['fiscal' as AppView],
      group: 'tools' as const,
    }]
    : []),
  ...(isAdmin
    ? [{
      id: 'admin' as AppView,
      icon: Shield,
      label: 'Admin',
      match: ['admin' as AppView],
      group: 'tools' as const,
    }]
    : []),
];

type SidebarNavProps = {
  businessName?: string;
  currentUserName?: string;
  fiscalModuleAvailable: boolean;
  isAdmin: boolean;
  view: AppView;
  onViewChange: (view: AppView) => void;
};

export const SidebarNav = ({
  businessName,
  currentUserName,
  fiscalModuleAvailable,
  isAdmin,
  view,
  onViewChange,
}: SidebarNavProps) => {
  const items = getPrimaryNavItems(isAdmin, fiscalModuleAvailable);
  const [isCollapsed, setIsCollapsed] = useState(() => (
    typeof window !== 'undefined' && window.localStorage.getItem('motofix-sidebar-collapsed') === 'true'
  ));

  useEffect(() => {
    window.localStorage.setItem('motofix-sidebar-collapsed', String(isCollapsed));
  }, [isCollapsed]);

  return (
    <aside className={cn(
      'app-sidebar hidden min-h-screen shrink-0 border-r border-slate-800/80 bg-[#08090d] transition-[width] duration-200 lg:flex lg:flex-col',
      isCollapsed ? 'w-20 2xl:w-20' : 'w-56 2xl:w-60'
    )}>
      <div className="flex h-full flex-col">
        <div className={cn('border-b border-slate-800/80 py-4', isCollapsed ? 'px-2.5' : 'px-4')}>
          <div className={cn('flex items-center', isCollapsed ? 'flex-col gap-2' : 'justify-between gap-2.5')}>
            <div className="flex items-center gap-2.5">
            <img src="/motofix-icon.svg" alt="MotoFix" className="h-9 w-9 rounded-lg bg-slate-950 object-cover shadow-lg shadow-primary/20" />
              {!isCollapsed && (
                <div className="min-w-0">
                  <p className="text-sm font-black leading-none text-white">MotoFix</p>
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Oficina SaaS</p>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setIsCollapsed((current) => !current)}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-900 hover:text-white"
              aria-label={isCollapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
              title={isCollapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
            >
              {isCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </button>
          </div>

          <button
            type="button"
            onClick={() => onViewChange('settings')}
            className={cn(
              'mt-4 flex w-full items-center rounded-lg border border-slate-700/70 bg-slate-900/60 py-2.5 text-left transition-colors hover:border-primary/40 hover:bg-slate-900',
              isCollapsed ? 'justify-center px-0' : 'justify-between gap-2 px-3'
            )}
            title={isCollapsed ? businessName || 'Minha Oficina' : undefined}
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                <UserRound className="h-4 w-4" />
              </div>
              {!isCollapsed && (
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-white">{businessName || 'Minha Oficina'}</p>
                  <p className="truncate text-[10px] text-slate-500">Ambiente principal</p>
                </div>
              )}
            </div>
            {!isCollapsed && <SettingsIcon className="h-4 w-4 shrink-0 text-slate-500" />}
          </button>
        </div>

        <nav className={cn('flex-1 space-y-1.5 overflow-y-auto py-4', isCollapsed ? 'px-2' : 'px-2.5')}>
          {items.map((item, index) => {
            const Icon = item.icon;
            const isActive = item.match.includes(view);
            const showToolsHeading = item.group === 'tools' && items[index - 1]?.group !== 'tools';

            return (
              <div key={item.id}>
                {showToolsHeading && !isCollapsed && (
                  <p className="px-2 pb-1.5 pt-2.5 text-[9px] font-black uppercase tracking-[0.24em] text-slate-600">
                    Mais ferramentas
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => onViewChange(item.id)}
                  className={cn(
                    'flex w-full items-center rounded-xl border py-2.5 text-sm font-black transition-all',
                    isCollapsed ? 'justify-center px-1.5' : 'gap-2.5 px-3 text-left',
                    isActive
                      ? 'border-primary/60 bg-primary/15 text-white shadow-lg shadow-primary/15'
                      : 'border-transparent bg-slate-950/20 text-slate-400 hover:border-slate-700 hover:bg-slate-900/80 hover:text-slate-100'
                  )}
                  title={isCollapsed ? item.label : undefined}
                  aria-label={isCollapsed ? item.label : undefined}
                >
                  <span
                    className={cn(
                      'grid h-9 w-9 shrink-0 place-items-center rounded-lg transition-colors',
                      isActive
                        ? 'bg-primary text-white shadow-lg shadow-primary/20'
                        : 'bg-slate-900 text-slate-500'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  {!isCollapsed && <span className="truncate">{item.label}</span>}
                </button>
              </div>
            );
          })}
        </nav>

        <div className={cn('border-t border-slate-800/80', isCollapsed ? 'p-2.5' : 'p-3')}>
          <div className={cn('flex items-center rounded-lg px-2 py-2', isCollapsed ? 'justify-center' : 'gap-2.5')} title={isCollapsed ? currentUserName || 'Usuario MotoFix' : undefined}>
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-slate-700 bg-slate-900 text-[11px] font-black text-white">
              {(currentUserName || businessName || 'M').slice(0, 2).toUpperCase()}
            </div>
            {!isCollapsed && (
              <div className="min-w-0">
                <p className="truncate text-xs font-bold text-white">{currentUserName || 'Usuario MotoFix'}</p>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{isAdmin ? 'Admin' : 'Operacao'}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
};
