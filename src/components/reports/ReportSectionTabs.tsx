import { BarChart3, TrendingUp } from 'lucide-react';
import type { AppView } from '../../types';
import { cn } from '../../lib/utils';

type ReportSectionTabsProps = {
  active: 'general-report' | 'financial-health';
  onViewChange: (view: AppView) => void;
};

export const ReportSectionTabs = ({ active, onViewChange }: ReportSectionTabsProps) => (
  <nav aria-label="Seções de relatórios" className="flex flex-wrap gap-2 border-b border-slate-700/70 pb-3">
    <button
      type="button"
      aria-current={active === 'general-report' ? 'page' : undefined}
      onClick={() => onViewChange('general-report')}
      className={cn(
        'inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition',
        active === 'general-report'
          ? 'bg-primary text-white shadow-lg shadow-primary/20'
          : 'border border-slate-700 bg-slate-900/70 text-slate-300 hover:bg-slate-800'
      )}
    >
      <BarChart3 className="h-4 w-4" />
      Relatório Geral
    </button>
    <button
      type="button"
      aria-current={active === 'financial-health' ? 'page' : undefined}
      onClick={() => onViewChange('financial-health')}
      className={cn(
        'inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition',
        active === 'financial-health'
          ? 'bg-primary text-white shadow-lg shadow-primary/20'
          : 'border border-slate-700 bg-slate-900/70 text-slate-300 hover:bg-slate-800'
      )}
    >
      <TrendingUp className="h-4 w-4" />
      Saúde Financeira
    </button>
  </nav>
);
