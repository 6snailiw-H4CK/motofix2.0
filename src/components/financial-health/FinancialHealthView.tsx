/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  AlertCircle,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Gauge,
  Package,
  RefreshCw,
  Target,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '../../lib/utils';
import type { AppView, CashRegisterLaunch, Client, ExpenseRecord, MaintenanceRecord, Settings, FinancialGoals } from '../../types';
import { MetricCard } from './MetricCard';
import { RankingTable } from './RankingTable';
import { TargetMetricsCard } from './TargetMetricsCard';
import { GoalsEditor } from './GoalsEditor';
import { TrendChart } from './TrendChart';
import { useFinancialHealth } from '../../hooks/useFinancialHealth';

type FinancialHealthViewProps = {
  maintenances: MaintenanceRecord[];
  cashLaunches: CashRegisterLaunch[];
  expenses: ExpenseRecord[];
  clients: Client[];
  settings: Settings;
  onViewChange: (view: AppView) => void;
  onSaveGoals?: (goals: FinancialGoals) => Promise<void> | void;
};

const currency = (value: number) =>
  value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  });

export function FinancialHealthView({
  maintenances,
  cashLaunches,
  expenses,
  clients,
  settings,
  onViewChange,
  onSaveGoals,
}: FinancialHealthViewProps) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [isSavingGoals, setIsSavingGoals] = useState(false);

  const data = useFinancialHealth({
    maintenances,
    cashLaunches,
    expenses,
    clients,
    settings,
    month,
    year,
  });

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const handlePreviousMonth = () => {
    if (month === 0) {
      setMonth(11);
      setYear(year - 1);
    } else {
      setMonth(month - 1);
    }
  };

  const handleNextMonth = () => {
    if (month === 11) {
      setMonth(0);
      setYear(year + 1);
    } else {
      setMonth(month + 1);
    }
  };

  const handleSaveGoals = async (goals: FinancialGoals) => {
    if (!onSaveGoals) return;
    try {
      setIsSavingGoals(true);
      await onSaveGoals(goals);
    } finally {
      setIsSavingGoals(false);
    }
  };

  const isCurrentMonth = month === now.getMonth() && year === now.getFullYear();

  const monthLabel = format(new Date(year, month, 1), 'MMMM yyyy', { locale: ptBR });

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900">
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-4 py-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="flex items-center gap-2 text-3xl font-bold text-slate-100">
                <TrendingUp className="h-8 w-8 text-green-400" />
                Saúde Financeira
              </h1>
              <p className="mt-1 text-sm text-slate-400">
                Acompanhe o desempenho financeiro e tome melhores decisões
              </p>
            </div>
            <button
              onClick={() => onViewChange('dashboard')}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700"
            >
              ← Voltar
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6">
        {/* Month Navigation */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={handlePreviousMonth}
              className="rounded-lg border border-slate-700 p-2 hover:bg-slate-800"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="text-center">
              <h2 className="text-xl font-semibold text-slate-100">{monthLabel}</h2>
              {!isCurrentMonth && (
                <button
                  onClick={() => {
                    setMonth(now.getMonth());
                    setYear(now.getFullYear());
                  }}
                  className="mt-1 text-xs text-slate-400 hover:text-slate-300"
                >
                  Ir para hoje
                </button>
              )}
            </div>
            <button
              onClick={handleNextMonth}
              className="rounded-lg border border-slate-700 p-2 hover:bg-slate-800"
              disabled={isCurrentMonth}
            >
              <ChevronRight className={cn('h-5 w-5', isCurrentMonth && 'opacity-50')} />
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <RefreshCw className="h-4 w-4" />
            Dados atualizados automaticamente
          </div>
        </div>

        {/* Main Metrics Grid */}
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Faturamento do Mês"
            value={data.metrics.totalRevenue}
            format="currency"
            icon={DollarSign}
            trend={data.metrics.totalRevenue >= data.targets.revenueTarget ? 'up' : 'down'}
          />
          <MetricCard
            label="Lucro Bruto"
            value={data.metrics.grossProfit}
            format="currency"
            icon={BarChart3}
            trend={data.metrics.grossProfit > 0 ? 'up' : 'down'}
          />
          <MetricCard
            label="Lucro Líquido"
            value={data.metrics.netProfit}
            format="currency"
            icon={TrendingUp}
            trend={data.metrics.netProfit > 0 ? 'up' : 'down'}
          />
          <MetricCard
            label="Ticket Médio"
            value={data.metrics.averageTicket}
            format="currency"
            icon={Gauge}
          />
        </div>

        {/* Additional Metrics */}
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-5">
          <MetricCard
            label="Motos Atendidas"
            value={data.metrics.uniqueMotos}
            format="number"
            icon={ZapIcon}
          />
          <MetricCard
            label="Lucro por Moto"
            value={data.metrics.profitPerMoto}
            format="currency"
            icon={Target}
          />
          <MetricCard
            label="Total de Serviços"
            value={data.metrics.totalServices}
            format="number"
            icon={BarChart3}
          />
          <MetricCard
            label="Receita Pendente"
            value={data.metrics.pendingRevenue}
            format="currency"
            icon={AlertCircle}
          />
          <MetricCard
            label="Despesas do Mês"
            value={data.metrics.totalExpenses}
            format="currency"
            icon={Package}
          />
        </div>

        {/* Goals Editor */}
        {onSaveGoals && (
          <div className="mb-6">
            <GoalsEditor
              goals={settings.financialGoals}
              onSave={handleSaveGoals}
              isSaving={isSavingGoals}
            />
          </div>
        )}

        {/* Target Metrics Section */}
        <div className="mb-6">
          <TargetMetricsCard
            goals={data.goals}
            targets={data.targets}
            metrics={{
              totalRevenue: data.metrics.totalRevenue,
              uniqueMotos: data.metrics.uniqueMotos,
            }}
          />
        </div>

        {/* Trend Chart */}
        <div className="mb-6">
          <TrendChart data={data.monthlyComparison} />
        </div>

        {/* Rankings */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <RankingTable
            title="Serviços Mais Lucrativos"
            icon={Zap}
            data={data.serviceRankings}
            isService={true}
          />
          <RankingTable
            title="Peças Mais Lucrativas"
            icon={Package}
            data={data.productRankings}
            isService={false}
          />
        </div>

        {/* Footer */}
        <div className="mt-12 rounded-lg border border-slate-700 bg-slate-900/50 p-6">
          <h3 className="mb-3 font-semibold text-slate-100">💡 Dicas para Melhorar Resultados</h3>
          <ul className="space-y-2 text-sm text-slate-400">
            <li className="flex gap-2">
              <span className="text-amber-400">•</span>
              <span>
                Foque em serviços e peças com maior margem de lucro. Compare o ticket médio com a meta por moto.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-blue-400">•</span>
              <span>Se uma OS está abaixo da meta por moto, considere oferecer serviços complementares.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-green-400">•</span>
              <span>Acompanhe motos recorrentes - elas são mais previsíveis para atingir sua meta.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-purple-400">•</span>
              <span>Revise suas despesas mensais - pequenas economias impactam muito no lucro líquido.</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

// Helper icon component
function ZapIcon({ className }: { className?: string }) {
  return <Zap className={className} />;
}
