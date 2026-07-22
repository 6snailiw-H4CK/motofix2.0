/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChevronDown, Zap } from 'lucide-react';
import { useState } from 'react';
import type { ServiceRanking, ProductRanking } from './types';

interface RankingTableProps<T extends ServiceRanking | ProductRanking> {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  data: T[];
  isService?: boolean;
}

const currency = (value: number) =>
  value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  });

function RankingRow<T extends ServiceRanking | ProductRanking>({ item, index, isService }: { item: T; index: number; isService?: boolean }) {
  const isServiceRanking = isService && 'serviceType' in item;
  const description = isServiceRanking ? (item as ServiceRanking).serviceType : (item as ProductRanking).productDescription;
  const count = isServiceRanking ? (item as ServiceRanking).count : (item as ProductRanking).quantity;

  const medalEmoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '•';

  return (
    <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3 hover:bg-slate-800/50">
      <div className="flex flex-1 items-center gap-4">
        <span className="w-8 text-center text-lg">{medalEmoji}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-slate-100">{description}</p>
          <p className="text-xs text-slate-500">
            {count} {isServiceRanking ? 'serviço(s)' : 'unidade(s)'} • Margem: {item.profitMargin.toFixed(0)}%
          </p>
        </div>
      </div>
      <div className="ml-4 text-right">
        <p className="font-semibold text-green-400">{currency(item.profit)}</p>
        <p className="text-xs text-slate-500">{currency(item.revenue)} em vendas</p>
      </div>
    </div>
  );
}

export function RankingTable<T extends ServiceRanking | ProductRanking>({
  title,
  icon: Icon,
  data,
  isService,
}: RankingTableProps<T>) {
  const [isExpanded, setIsExpanded] = useState(true);

  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-6">
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-slate-500" />
          <h3 className="font-semibold text-slate-400">{title}</h3>
        </div>
        <p className="mt-4 text-center text-slate-500">Sem dados para este período</p>
      </div>
    );
  }

  const top3 = data.slice(0, 3);
  const total = data.reduce((sum, item) => sum + item.profit, 0);
  const topContribution = top3.reduce((sum, item) => sum + item.profit, 0);
  const topPercentage = (topContribution / total) * 100;

  return (
    <div className="overflow-hidden rounded-lg border border-slate-700 bg-slate-900/50">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between px-4 py-4 hover:bg-slate-800/30"
      >
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-slate-400" />
          <h3 className="font-semibold text-slate-100">{title}</h3>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-sm font-semibold text-slate-100">{currency(total)}</p>
            <p className="text-xs text-slate-500">Lucro total</p>
          </div>
          <ChevronDown
            className={`h-4 w-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      {isExpanded && (
        <>
          {/* Insight dos top 3 */}
          {topPercentage > 60 && (
            <div className="border-t border-slate-700 bg-slate-800/30 px-4 py-3">
              <div className="flex items-center gap-2 text-sm text-amber-300">
                <Zap className="h-4 w-4" />
                <span>Top 3 gera {topPercentage.toFixed(0)}% do lucro deste ranking</span>
              </div>
            </div>
          )}

          {/* Linhas do ranking */}
          <div className="divide-y divide-slate-700">
            {top3.map((item, index) => (
              <RankingRow key={index} item={item} index={index} isService={isService} />
            ))}
          </div>

          {/* Ver mais */}
          {data.length > 3 && (
            <div className="border-t border-slate-700 px-4 py-3 text-center">
              <p className="text-xs text-slate-500">
                +{data.length - 3} item(ns) abaixo • Lucro total: {currency(data.slice(3).reduce((sum, item) => sum + item.profit, 0))}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
