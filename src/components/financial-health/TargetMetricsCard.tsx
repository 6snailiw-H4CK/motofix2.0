/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AlertCircle, CheckCircle2, Target } from 'lucide-react';
import type { FinancialGoals, TargetMetrics } from './types';

interface TargetMetricsCardProps {
  goals: FinancialGoals;
  targets: TargetMetrics;
  metrics: {
    totalRevenue: number;
    uniqueMotos: number;
  };
}

const currency = (value: number) =>
  value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  });

export function TargetMetricsCard({ goals, targets, metrics }: TargetMetricsCardProps) {
  const isRevenueOnTrack = targets.revenueDifference >= 0;
  const isMotosOnTrack = targets.motosDifference <= 0;

  return (
    <div className="space-y-4 rounded-lg border border-slate-700 bg-slate-900/50 p-6">
      <div className="flex items-center gap-2">
        <Target className="h-5 w-5 text-purple-400" />
        <h3 className="font-semibold text-slate-100">Meta por Moto (Essencial para Negócio)</h3>
      </div>

      {/* Meta de Receita */}
      <div className="space-y-3 rounded-lg bg-slate-800/50 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-400">Meta de Receita</p>
            <p className="text-sm text-slate-500">
              {goals.estimatedMonthlyCosts.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} (custos) + 
              {goals.desiredMonthlyProfit.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} (lucro)
            </p>
          </div>
          {isRevenueOnTrack ? (
            <CheckCircle2 className="h-5 w-5 text-green-400" />
          ) : (
            <AlertCircle className="h-5 w-5 text-amber-400" />
          )}
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded bg-slate-700/30 p-3">
            <p className="text-xs text-slate-400">Necessário</p>
            <p className="text-lg font-bold text-slate-100">{currency(targets.requiredRevenue)}</p>
          </div>
          <div className="rounded bg-slate-700/30 p-3">
            <p className="text-xs text-slate-400">Atingido</p>
            <p className="text-lg font-bold text-slate-100">{currency(metrics.totalRevenue)}</p>
          </div>
          <div className="rounded bg-slate-700/30 p-3">
            <p className={`text-xs ${isRevenueOnTrack ? 'text-green-400' : 'text-amber-400'}`}>
              {isRevenueOnTrack ? 'Acima' : 'Falta'}
            </p>
            <p className={`text-lg font-bold ${isRevenueOnTrack ? 'text-green-400' : 'text-amber-400'}`}>
              {currency(Math.abs(targets.revenueDifference))}
            </p>
          </div>
        </div>

        {/* Barra de progresso */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Progresso</span>
            <span className={`font-semibold ${targets.revenuePercentage >= 100 ? 'text-green-400' : 'text-amber-400'}`}>
              {targets.revenuePercentage.toFixed(0)}%
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-700">
            <div
              className={`h-full rounded-full ${targets.revenuePercentage >= 100 ? 'bg-green-500' : 'bg-amber-500'}`}
              style={{ width: `${Math.min(targets.revenuePercentage, 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Meta por Moto */}
      <div className="space-y-3 rounded-lg bg-slate-800/50 p-4">
        <p className="font-semibold text-slate-100">💡 Meta por Moto</p>
        
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-purple-400/30 bg-purple-400/5 p-3">
            <p className="text-xs text-slate-400">Necessário por Moto</p>
            <p className="text-2xl font-bold text-purple-400">{currency(targets.revenuePerMoto)}</p>
            <p className="mt-1 text-xs text-slate-500">
              Cada OS precisa gerar em média esse valor
            </p>
          </div>

          <div className="space-y-2">
            <div className="rounded-lg border border-slate-600 bg-slate-800/50 p-3">
              <p className="text-xs text-slate-400">Meta de Motos</p>
              <p className="text-xl font-bold text-slate-100">{goals.targetMotosPerMonth} motos</p>
            </div>
            <div className="rounded-lg border border-slate-600 bg-slate-800/50 p-3">
              <p className="text-xs text-slate-400">Atendidas</p>
              <p className="text-xl font-bold text-slate-100">{metrics.uniqueMotos} motos</p>
            </div>
          </div>
        </div>

        {/* Insight */}
        <div className="rounded-lg bg-gradient-to-r from-blue-500/10 to-purple-500/10 p-3">
          <p className="text-sm font-medium text-blue-300">
            🎯 Se você atender <span className="font-bold">{goals.targetMotosPerMonth} motos</span> e cada uma gerar 
            <span className="font-bold"> {currency(targets.revenuePerMoto)}</span>, você atinge a meta!
          </p>
        </div>
      </div>

      {/* Motos Faltando */}
      {targets.motosDifference > 0 && (
        <div className="rounded-lg border border-amber-400/30 bg-amber-400/5 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-amber-300">Motos faltando para meta</p>
              <p className="text-3xl font-bold text-amber-400">{targets.motosDifference}</p>
            </div>
            <AlertCircle className="h-8 w-8 text-amber-400" />
          </div>
        </div>
      )}
    </div>
  );
}
