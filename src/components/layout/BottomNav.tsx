import {
  Calendar,
  ClipboardList,
  DollarSign,
  History,
  LayoutDashboard,
  MoreHorizontal,
  Settings as SettingsIcon,
  Shield,
  ShieldCheck,
  Users
} from 'lucide-react';
import type { ComponentType } from 'react';
import { useState } from 'react';
import { cn } from '../../lib/utils';
import { AppView } from '../../types';

type BottomNavProps = {
  view: AppView;
  isAdmin: boolean;
  onViewChange: (view: AppView) => void;
};

type BottomNavItem = {
  id: AppView;
  icon: ComponentType<{ className?: string }>;
  label: string;
  match?: AppView[];
  shortLabel: string;
};

export const BottomNav = ({ view, isAdmin, onViewChange }: BottomNavProps) => {
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  const primaryItems: BottomNavItem[] = [
    {
      id: 'dashboard',
      icon: LayoutDashboard,
      label: 'Inicio',
      match: ['dashboard', 'dashboard-revenue', 'dashboard-recurring', 'dashboard-services'],
      shortLabel: 'Inicio',
    },
    {
      id: 'clients',
      icon: ClipboardList,
      label: 'Servicos',
      match: ['clients', 'new-client', 'cash-register'],
      shortLabel: 'Servicos',
    },
    {
      id: 'appointments',
      icon: Calendar,
      label: 'Agenda',
      match: ['appointments'],
      shortLabel: 'Agenda',
    },
  ];

  const moreItems: BottomNavItem[] = [
    { id: 'warranties', icon: ShieldCheck, label: 'Garantias', match: ['warranties', 'new-warranty'], shortLabel: 'Garantias' },
    { id: 'expenses', icon: DollarSign, label: 'Gastos', match: ['expenses'], shortLabel: 'Gastos' },
    { id: 'clients-schedule', icon: Users, label: 'Clientes', match: ['clients-schedule', 'clients-schedule-add'], shortLabel: 'Clientes' },
    { id: 'history', icon: History, label: 'Historico', match: ['history', 'general-report', 'report'], shortLabel: 'Historico' },
    { id: 'settings', icon: SettingsIcon, label: 'Ajustes', match: ['settings'], shortLabel: 'Ajustes' },
    ...(isAdmin ? [{ id: 'admin' as AppView, icon: Shield, label: 'Admin', shortLabel: 'Admin' }] : [])
  ];

  const isMoreActive = moreItems.some((item) => item.match?.includes(view) || view === item.id);

  const handleViewChange = (itemView: AppView) => {
    setIsMoreOpen(false);
    onViewChange(itemView);
  };

  return (
    <nav className="app-bottom-nav fixed bottom-0 left-0 right-0 z-50 border-t border-slate-800/50 bg-background-dark/95 px-3 py-2 backdrop-blur-xl lg:hidden">
      {isMoreOpen && (
        <div className="absolute bottom-full left-3 right-3 mb-2 overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-950/95 shadow-2xl shadow-black/50 backdrop-blur-xl">
          <div className="divide-y divide-slate-800/70">
            {moreItems.map((item) => {
              const IconComponent = item.icon;
              const isActive = item.match?.includes(view) || view === item.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleViewChange(item.id)}
                  className={cn(
                    'flex w-full items-center gap-3 px-4 py-3 text-left transition-all',
                    isActive ? 'bg-primary/15 text-primary' : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                  )}
                  title={item.label}
                >
                  <span className={cn('grid h-9 w-9 place-items-center rounded-xl', isActive ? 'bg-primary/15' : 'bg-slate-900')}>
                    <IconComponent className="h-5 w-5" />
                  </span>
                  <span className="text-sm font-bold">{item.shortLabel}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div
        className="mx-auto grid w-full max-w-xl items-center overflow-hidden rounded-2xl border border-slate-800/70 bg-slate-950/80"
        style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}
      >
        {primaryItems.map((item) => {
          const IconComponent = item.icon;
          const isActive = item.match?.includes(view) || view === item.id;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleViewChange(item.id)}
              className={cn(
                'flex min-h-[4rem] min-w-0 flex-col items-center justify-center gap-1 border-r border-slate-800/70 px-1 py-2 transition-all',
                isActive ? 'bg-primary/15 text-primary shadow-inner shadow-primary/10' : 'text-slate-400 hover:bg-slate-900/70 hover:text-slate-100'
              )}
              title={item.label}
            >
              <IconComponent className="h-6 w-6" />
              <span className="w-full truncate text-center text-[10px] font-semibold leading-none tracking-normal">
                {item.shortLabel}
              </span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setIsMoreOpen((current) => !current)}
          className={cn(
            'flex min-h-[4rem] min-w-0 flex-col items-center justify-center gap-1 px-1 py-2 transition-all',
            isMoreActive || isMoreOpen ? 'bg-primary/15 text-primary shadow-inner shadow-primary/10' : 'text-slate-400 hover:bg-slate-900/70 hover:text-slate-100'
          )}
          aria-expanded={isMoreOpen}
          title="Mais"
        >
          <MoreHorizontal className="h-6 w-6" />
          <span className="w-full truncate text-center text-[10px] font-semibold leading-none tracking-normal">Mais</span>
        </button>
      </div>
    </nav>
  );
};
