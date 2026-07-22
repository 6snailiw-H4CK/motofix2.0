/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import type { MonthlyComparisonData } from './types';

interface TrendChartProps {
  data: MonthlyComparisonData[];
}

export function TrendChart({ data }: TrendChartProps) {
  const [showExpenses, setShowExpenses] = useState(true);
  const [showProfit, setShowProfit] = useState(true);
  const [showRevenue, setShowRevenue] = useState(true);

  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-6">
        <h3 className="font-semibold text-slate-100">Tendência de Lucro (Últimos 12 Meses)</h3>
        <p className="mt-4 text-center text-slate-500">Sem dados para exibir</p>
      </div>
    );
  }

  const toggleMetric = (metric: 'expenses' | 'profit' | 'revenue') => {
    switch (metric) {
      case 'expenses':
        setShowExpenses(!showExpenses);
        break;
      case 'profit':
        setShowProfit(!showProfit);
        break;
      case 'revenue':
        setShowRevenue(!showRevenue);
        break;
    }
  };

  const formatCurrency = (value: number) => {
    if (value >= 1000) {
      return `R$${(value / 1000).toFixed(0)}k`;
    }
    return `R$${value}`;
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="rounded-lg border border-slate-600 bg-slate-900 p-3 shadow-lg">
          <p className="text-sm font-medium text-slate-100">{payload[0].payload.month}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} style={{ color: entry.color }} className="text-sm">
              {entry.name}: {entry.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-4">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h3 className="font-semibold text-slate-100">📈 Tendência de Lucro (Últimos 12 Meses)</h3>
        
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => toggleMetric('revenue')}
            className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-all ${
              showRevenue
                ? 'bg-blue-500/20 text-blue-300 ring-1 ring-blue-500/50'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            {showRevenue ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
            Receita
          </button>
          
          <button
            onClick={() => toggleMetric('profit')}
            className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-all ${
              showProfit
                ? 'bg-green-500/20 text-green-300 ring-1 ring-green-500/50'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            {showProfit ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
            Lucro
          </button>
          
          <button
            onClick={() => toggleMetric('expenses')}
            className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-all ${
              showExpenses
                ? 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/50'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            {showExpenses ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
            Despesas
          </button>
        </div>
      </div>

      {/* Gráfico de Linhas */}
      <div className="h-80 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="month" stroke="#94a3b8" tick={{ fontSize: 12 }} />
            <YAxis stroke="#94a3b8" tick={{ fontSize: 12 }} tickFormatter={formatCurrency} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {showRevenue && (
              <Line
                type="monotone"
                dataKey="revenue"
                stroke="#3b82f6"
                name="Receita"
                strokeWidth={2}
                dot={{ fill: '#3b82f6', r: 4 }}
                activeDot={{ r: 6 }}
              />
            )}
            {showProfit && (
              <Line
                type="monotone"
                dataKey="profit"
                stroke="#10b981"
                name="Lucro"
                strokeWidth={2}
                dot={{ fill: '#10b981', r: 4 }}
                activeDot={{ r: 6 }}
              />
            )}
            {showExpenses && (
              <Line
                type="monotone"
                dataKey="expenses"
                stroke="#f59e0b"
                name="Despesas"
                strokeWidth={2}
                dot={{ fill: '#f59e0b', r: 4 }}
                activeDot={{ r: 6 }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Insights */}
      <div className="mt-4 space-y-2 text-xs text-slate-400">
        <p>💡 <span className="text-slate-300">Análise:</span> Observe a tendência de lucro e receita. Se estão caindo, é hora de revisar seus custos ou aumentar a quantidade de motos atendidas.</p>
      </div>
    </div>
  );
}
