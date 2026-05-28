import {
  Calendar,
  DollarSign,
  History,
  LayoutDashboard,
  Settings as SettingsIcon,
  Shield,
  ShieldCheck,
  Users
} from 'lucide-react';
import type { ComponentType } from 'react';
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
};

export const BottomNav = ({ view, isAdmin, onViewChange }: BottomNavProps) => {
  const items: BottomNavItem[] = [
    { id: 'dashboard', icon: LayoutDashboard, label: 'Inicio' },
    { id: 'clients', icon: Users, label: 'Servicos' },
    { id: 'appointments', icon: Calendar, label: 'Agenda' },
    { id: 'warranties', icon: ShieldCheck, label: 'Garantias' },
    { id: 'expenses', icon: DollarSign, label: 'Gastos' },
    { id: 'history', icon: History, label: 'Historico' },
    { id: 'settings', icon: SettingsIcon, label: 'Ajustes' },
    ...(isAdmin ? [{ id: 'admin' as AppView, icon: Shield, label: 'Admin' }] : [])
  ];

  return (
    <nav className="app-bottom-nav fixed bottom-0 left-0 right-0 z-50 border-t border-slate-800/50 bg-background-dark/95 px-3 py-2 backdrop-blur-xl lg:hidden">
      <div className="mx-auto flex max-w-2xl items-center gap-1 overflow-x-auto no-scrollbar">
        {items.map((item) => {
          const IconComponent = item.icon;
          const isActive = view === item.id;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onViewChange(item.id)}
              className={cn(
                'flex min-w-[3.75rem] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1.5 transition-all',
                isActive ? 'bg-primary/10 text-primary' : 'text-slate-500 hover:bg-slate-800/70 hover:text-slate-200'
              )}
              title={item.label}
            >
              <IconComponent className="h-5 w-5" />
              <span className="text-[9px] font-bold uppercase tracking-tighter leading-none">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
