/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { TrendingDown, TrendingUp } from 'lucide-react';

interface MetricCardProps {
  label: string;
  value: number;
  format: 'currency' | 'number' | 'percentage';
  subtitle?: string;
  trend?: 'up' | 'down' | 'neutral';
  icon?: React.ComponentType<{ className?: string }>;
}

const formatValue = (value: number, format: 'currency' | 'number' | 'percentage') => {
  if (format === 'currency') {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
  }
  if (format === 'percentage') {
    return `${value.toFixed(1)}%`;
  }
  return Math.round(value).toLocaleString('pt-BR');
};

export function MetricCard({ label, value, format, subtitle, trend, icon: Icon }: MetricCardProps) {
  const trendIcon = trend === 'up' ? (
    <TrendingUp className="h-4 w-4 text-green-400" />
  ) : trend === 'down' ? (
    <TrendingDown className="h-4 w-4 text-red-400" />
  ) : null;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-slate-700 bg-slate-900/50 p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-400">{label}</span>
        {Icon && <Icon className="h-4 w-4 text-slate-500" />}
      </div>
      <div className="flex items-end gap-2">
        <span className="text-2xl font-bold text-slate-100">{formatValue(value, format)}</span>
        {trendIcon}
      </div>
      {subtitle && <span className="text-xs text-slate-500">{subtitle}</span>}
    </div>
  );
}
