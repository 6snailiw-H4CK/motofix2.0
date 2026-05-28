import { ArrowLeft, BarChart3, TrendingUp } from 'lucide-react';
import { format, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { MaintenanceRecord } from '../../types';

type DashboardStats = {
  revenue: number;
  recurringRevenue: number;
  servicesCount: number;
};

type ReportViewProps = {
  dashboardStats: DashboardStats;
  maintenances: MaintenanceRecord[];
  onBack: () => void;
};

const normalizeLabel = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const serviceCategories = ['Troca de Oleo', 'Revisao', 'Pneus', 'Freios', 'Outros'];

export const ReportView = ({ dashboardStats, maintenances, onBack }: ReportViewProps) => {
  const currentMonth = format(new Date(), 'yyyy-MM');
  const monthlyChartData = Array.from({ length: 6 }).map((_, index) => {
    const date = subMonths(new Date(), 5 - index);
    const monthStr = format(date, 'MMM', { locale: ptBR });
    const monthYear = format(date, 'yyyy-MM');
    const monthServices = maintenances.filter((maintenance) => maintenance.date.startsWith(monthYear));

    return {
      name: monthStr,
      total: monthServices.reduce((acc, maintenance) => acc + (maintenance.serviceValue || 0), 0),
      recorrente: monthServices
        .filter((maintenance) => maintenance.isRecurringRevenue)
        .reduce((acc, maintenance) => acc + (maintenance.serviceValue || 0), 0),
    };
  });

  const topClients = Object.entries(
    maintenances
      .filter((maintenance) => maintenance.date.startsWith(currentMonth))
      .reduce((acc, maintenance) => {
        acc[maintenance.clientName] = (acc[maintenance.clientName] || 0) + (maintenance.serviceValue || 0);
        return acc;
      }, {} as Record<string, number>)
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button type="button" onClick={onBack} className="p-1.5 rounded-full hover:bg-slate-800 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-xl font-bold">Relatorio Mensal</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-800/40 p-5 rounded-2xl border border-slate-700/50">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Receita Total (Mes)</p>
          <p className="text-2xl font-bold text-white">R$ {dashboardStats.revenue.toFixed(2)}</p>
          <div className="mt-2 flex items-center gap-1 text-[10px] text-emerald-500 font-bold">
            <TrendingUp className="w-3 h-3" />
            <span>+12% vs mes anterior</span>
          </div>
        </div>
        <div className="bg-slate-800/40 p-5 rounded-2xl border border-slate-700/50">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Recorrencia</p>
          <p className="text-2xl font-bold text-primary">R$ {dashboardStats.recurringRevenue.toFixed(2)}</p>
          <p className="text-[10px] text-slate-500 mt-1">
            {((dashboardStats.recurringRevenue / (dashboardStats.revenue || 1)) * 100).toFixed(1)}% da receita total
          </p>
        </div>
        <div className="bg-slate-800/40 p-5 rounded-2xl border border-slate-700/50">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Servicos Realizados</p>
          <p className="text-2xl font-bold text-white">{dashboardStats.servicesCount}</p>
          <p className="text-[10px] text-slate-500 mt-1">Media de {(dashboardStats.servicesCount / 30).toFixed(1)} por dia</p>
        </div>
      </div>

      <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50">
        <h3 className="text-sm font-bold mb-6 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-primary" />
          Evolucao de Receita (6 Meses)
        </h3>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlyChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
              <XAxis dataKey="name" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(value) => `R$${value}`} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '12px', fontSize: '10px' }}
                itemStyle={{ fontWeight: 'bold' }}
              />
              <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Total" />
              <Bar dataKey="recorrente" fill="#10b981" radius={[4, 4, 0, 0]} name="Recorrente" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50">
          <h3 className="text-sm font-bold mb-4">Servicos por Categoria</h3>
          <div className="space-y-3">
            {serviceCategories.map((type) => {
              const count = maintenances.filter(
                (maintenance) => normalizeLabel(maintenance.serviceType) === normalizeLabel(type) && maintenance.date.startsWith(currentMonth)
              ).length;
              const percentage = (count / (dashboardStats.servicesCount || 1)) * 100;

              return (
                <div key={type} className="space-y-1">
                  <div className="flex justify-between text-[10px] font-bold">
                    <span className="text-slate-400">{type}</span>
                    <span>{count} ({percentage.toFixed(0)}%)</span>
                  </div>
                  <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-primary h-full rounded-full" style={{ width: `${percentage}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50">
          <h3 className="text-sm font-bold mb-4">Top Clientes (Mes)</h3>
          <div className="space-y-3">
            {topClients.map(([name, value]) => (
              <div key={name} className="flex justify-between items-center p-2 rounded-lg bg-slate-900/50 border border-slate-700/30">
                <span className="text-xs font-bold text-slate-300">{name}</span>
                <span className="text-xs font-bold text-emerald-500">R$ {value.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
