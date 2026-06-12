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
  UserRound,
  Users,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { cn } from '../../lib/utils';
import type { AppView } from '../../types';

export type SidebarNavItem = {
  id: AppView;
  icon: ComponentType<{ className?: string }>;
  label: string;
  match: AppView[];
  group?: 'primary' | 'tools';
};

export const getPrimaryNavItems = (isAdmin: boolean): SidebarNavItem[] => [
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
    id: 'general-report',
    icon: BarChart3,
    label: 'Relatorios',
    match: ['general-report', 'report'],
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
    id: 'cash-register',
    icon: ReceiptText,
    label: 'Lancamentos Caixa',
    match: ['cash-register'],
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
    id: 'history',
    icon: BarChart3,
    label: 'Historico',
    match: ['history'],
    group: 'tools',
  },
  {
    id: 'products',
    icon: Package,
    label: 'Mercadorias',
    match: ['products'],
    group: 'tools',
  },
  {
    id: 'whatsapp',
    icon: MessageCircle,
    label: 'WhatsApp IA',
    match: ['whatsapp'],
    group: 'tools',
  },
  {
    id: 'fiscal',
    icon: FileText,
    label: 'Fiscal',
    match: ['fiscal'],
    group: 'tools',
  },
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
    <aside className="app-sidebar hidden min-h-screen w-56 shrink-0 border-r border-slate-800/80 bg-[#08090d] lg:flex lg:flex-col 2xl:w-60">
      <div className="flex h-full flex-col">
        <div className="border-b border-slate-800/80 px-4 py-4">
          <div className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-white shadow-lg shadow-primary/20">
              <span className="text-sm font-black">M</span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-black leading-none text-white">MotoFix</p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Oficina SaaS</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onViewChange('settings')}
            className="mt-4 flex w-full items-center justify-between gap-2 rounded-lg border border-slate-700/70 bg-slate-900/60 px-3 py-2.5 text-left transition-colors hover:border-primary/40 hover:bg-slate-900"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
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

        <nav className="flex-1 space-y-1.5 overflow-y-auto px-2.5 py-4">
          {items.map((item, index) => {
            const Icon = item.icon;
            const isActive = item.match.includes(view);
            const showToolsHeading = item.group === 'tools' && items[index - 1]?.group !== 'tools';

            return (
              <div key={item.id}>
                {showToolsHeading && (
                  <p className="px-2 pb-1.5 pt-2.5 text-[9px] font-black uppercase tracking-[0.24em] text-slate-600">
                    Mais ferramentas
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => onViewChange(item.id)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-sm font-black transition-all',
                    isActive
                      ? 'border-primary/60 bg-primary/15 text-white shadow-lg shadow-primary/15'
                      : 'border-transparent bg-slate-950/20 text-slate-400 hover:border-slate-700 hover:bg-slate-900/80 hover:text-slate-100'
                  )}
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
                  <span className="truncate">{item.label}</span>
                </button>
              </div>
            );
          })}
        </nav>

        <div className="border-t border-slate-800/80 p-3">
          <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-slate-700 bg-slate-900 text-[11px] font-black text-white">
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
