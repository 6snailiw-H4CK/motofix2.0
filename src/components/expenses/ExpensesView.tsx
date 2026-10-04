import { format, startOfMonth, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart as RePieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowLeft, CalendarDays, ChartNoAxesColumnIncreasing, CreditCard, Plus, Receipt, Store, TrendingUp, Wallet, X } from 'lucide-react';
import { DateInput } from '../DateInput';
import type { ExpenseRecord } from '../../types';

type ExpensesViewProps = {
  expenseEntries: ExpenseRecord[];
  description: string;
  supplier: string;
  amount: string;
  paymentMethod: string;
  date: string;
  note: string;
  isSaving: boolean;
  onBack: () => void;
  onDescriptionChange: (value: string) => void;
  onSupplierChange: (value: string) => void;
  onAmountChange: (value: string) => void;
  onPaymentMethodChange: (value: string) => void;
  onDateChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  onSaveExpense: (canonicalSupplier?: string) => Promise<void> | void;
  onDeleteExpense: (expenseId: string) => Promise<void> | void;
  onResetForm: () => void;
};

const paymentMethodColors = ['#ef4444', '#f97316', '#38bdf8', '#14b8a6', '#8b5cf6'];
const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const normalizeSupplierKey = (value: string) => value
  .trim()
  .replace(/\s+/g, ' ')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('pt-BR');

const formatDateForDisplay = (value: string) => {
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}/${month}/${year}` : '';
};

export const ExpensesView = ({
  expenseEntries,
  description,
  supplier,
  amount,
  paymentMethod,
  date,
  note,
  isSaving,
  onBack,
  onDescriptionChange,
  onSupplierChange,
  onAmountChange,
  onPaymentMethodChange,
  onDateChange,
  onNoteChange,
  onSaveExpense,
  onDeleteExpense,
  onResetForm,
}: ExpensesViewProps) => {
  const [isExpenseFormOpen, setIsExpenseFormOpen] = useState(false);
  const [openSupplierKey, setOpenSupplierKey] = useState<string | null>(null);
  const [periodStart, setPeriodStart] = useState(() => format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [periodEnd, setPeriodEnd] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const filteredExpenseEntries = useMemo(
    () => expenseEntries.filter((entry) => entry.date >= periodStart && entry.date <= periodEnd),
    [expenseEntries, periodEnd, periodStart]
  );
  const supplierSummaries = useMemo(() => {
    const suppliers = new Map<string, { name: string; total: number; count: number; entries: ExpenseRecord[] }>();

    [...filteredExpenseEntries]
      .sort((a, b) => a.date.localeCompare(b.date))
      .forEach((entry) => {
        const name = (entry.supplier || '').trim().replace(/\s+/g, ' ');
        const key = normalizeSupplierKey(name) || '__sem_fornecedor__';
        const displayName = name || 'Sem fornecedor';

        const current = suppliers.get(key) || { name: displayName, total: 0, count: 0, entries: [] };
        current.total += entry.amount;
        current.count += 1;
        current.entries.push(entry);
        suppliers.set(key, current);
      });

    return Array.from(suppliers.entries())
      .map(([key, summary]) => ({ key, ...summary }))
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'pt-BR'));
  }, [filteredExpenseEntries]);

  const registeredSuppliers = useMemo(() => {
    const suppliers = new Map<string, string>();
    expenseEntries.forEach((entry) => {
      const name = (entry.supplier || '').trim().replace(/\s+/g, ' ');
      const key = normalizeSupplierKey(name);
      if (name && !suppliers.has(key)) suppliers.set(key, name);
    });
    return Array.from(suppliers.entries())
      .map(([key, name]) => ({ key, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [expenseEntries]);

  const canonicalSupplier = registeredSuppliers.find(
    (entry) => entry.key === normalizeSupplierKey(supplier)
  )?.name || supplier.trim().replace(/\s+/g, ' ');
  const openSupplier = supplierSummaries.find((entry) => entry.key === openSupplierKey);

  const total = filteredExpenseEntries.reduce((sum, entry) => sum + entry.amount, 0);

  const byPaymentMethod = filteredExpenseEntries.reduce((acc, entry) => {
    acc[entry.paymentMethod] = (acc[entry.paymentMethod] || 0) + entry.amount;
    return acc;
  }, {} as Record<string, number>);

  const paymentMethodData = Object.entries(byPaymentMethod).map(([name, value]) => ({ name, value }));

  const monthlyData = Array.from({ length: 6 }).map((_, index) => {
    const monthDate = subMonths(new Date(), 5 - index);
    const monthKey = format(monthDate, 'yyyy-MM');
    return {
      month: format(monthDate, 'MMM', { locale: ptBR }),
      total: filteredExpenseEntries
        .filter((entry) => entry.date.startsWith(monthKey))
        .reduce((sum, entry) => sum + entry.amount, 0),
    };
  });

  const averagePerRecord = filteredExpenseEntries.length ? total / filteredExpenseEntries.length : 0;
  const lastSixMonthsTotal = monthlyData.reduce((sum, entry) => sum + entry.total, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={onBack}
            aria-label="Voltar ao inicio"
            className="mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-slate-700/70 bg-slate-900/70 text-slate-300 transition hover:border-primary/40 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Financeiro</p>
            <h2 className="mt-0.5 text-2xl font-black tracking-tight text-white sm:text-3xl">Gastos</h2>
            <p className="mt-1 text-xs text-slate-400 sm:text-sm">Compras, despesas e pagamentos da oficina.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setIsExpenseFormOpen((current) => !current)}
          className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-primary/15 transition hover:bg-primary/90 sm:w-auto"
        >
          <Plus className="h-4 w-4" />
          {isExpenseFormOpen ? 'Fechar cadastro' : 'Registrar gasto'}
        </button>
      </div>

      {isExpenseFormOpen && (
        <section className="overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-slate-900 via-slate-900 to-primary/[0.08] shadow-xl shadow-black/10">
          <div className="flex items-center gap-3 border-b border-slate-800/90 px-4 py-4 sm:px-5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
              <Receipt className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">Lancamento financeiro</p>
              <h3 className="mt-0.5 text-base font-black text-white">Registrar novo gasto</h3>
              <p className="mt-0.5 text-xs text-slate-400">Preencha os dados da despesa para salvar no financeiro.</p>
            </div>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void onSaveExpense(canonicalSupplier);
            }}
            className="space-y-4 p-4 sm:p-5"
          >
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-12">
              <div className="space-y-1.5 xl:col-span-3">
                <label className="px-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Fornecedor</label>
                <input
                  value={supplier}
                  onChange={(event) => onSupplierChange(event.target.value)}
                  list="expense-supplier-list"
                  required
                  placeholder="Loja ou distribuidor"
                  autoComplete="off"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-primary/60 focus:ring-2 focus:ring-primary/10"
                />
                <datalist id="expense-supplier-list">
                  {registeredSuppliers.map((entry) => (
                    <option key={entry.key} value={entry.name} />
                  ))}
                </datalist>
                <p className="px-1 text-[10px] text-slate-500">
                  Selecione um fornecedor existente ou digite um novo.
                </p>
              </div>
              <div className="space-y-1.5 xl:col-span-2">
                <label className="px-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Valor</label>
                <input
                  value={amount}
                  onChange={(event) => onAmountChange(event.target.value)}
                  placeholder="500,00"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-primary/60 focus:ring-2 focus:ring-primary/10"
                />
              </div>
              <div className="space-y-1.5 xl:col-span-4">
                <label className="px-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Descricao</label>
                <input
                  value={description}
                  onChange={(event) => onDescriptionChange(event.target.value)}
                  placeholder="Ex: pastilha, oleo, aluguel, compra..."
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-primary/60 focus:ring-2 focus:ring-primary/10"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-1 xl:col-span-3">
                <label className="px-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Data</label>
                <DateInput
                  value={date}
                  onChange={onDateChange}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2.5 text-sm text-white outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/10"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-1 xl:col-span-3">
                <label className="px-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Forma de pagamento</label>
                <select
                  value={paymentMethod}
                  onChange={(event) => onPaymentMethodChange(event.target.value)}
                  required
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2.5 text-sm text-white outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/10"
                >
                  <option value="">Selecione</option>
                  <option value="Dinheiro">Dinheiro</option>
                  <option value="Pix">Pix</option>
                  <option value="Debito">Debito</option>
                  <option value="Credito">Credito</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-slate-800 pt-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onResetForm}
                className="rounded-xl border border-slate-700 bg-slate-800/70 px-4 py-2.5 text-xs font-bold text-slate-300 transition hover:bg-slate-700"
              >
                Limpar
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="rounded-xl bg-primary px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-primary/20 transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSaving ? 'Salvando...' : 'Salvar gasto'}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <CalendarDays className="h-5 w-5 shrink-0 text-primary" />
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-300">Periodo de consulta</p>
              <p className="text-[11px] text-slate-500">Veja quanto foi gasto entre as datas selecionadas.</p>
            </div>
          </div>
          <div className="grid gap-3 sm:w-full sm:max-w-lg sm:grid-cols-2">
            <label className="flex items-center gap-2">
              <span className="w-12 shrink-0 text-[10px] font-bold uppercase tracking-wider text-slate-400">Inicio</span>
              <DateInput
                value={periodStart}
                onChange={setPeriodStart}
                aria-label="Data inicial do periodo"
                className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-white outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/10"
              />
            </label>
            <label className="flex items-center gap-2">
              <span className="w-12 shrink-0 text-[10px] font-bold uppercase tracking-wider text-slate-400">Fim</span>
              <DateInput
                value={periodEnd}
                onChange={setPeriodEnd}
                aria-label="Data final do periodo"
                className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-white outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/10"
              />
            </label>
          </div>
        </div>
        {periodStart > periodEnd && (
          <p className="mt-2 text-[10px] font-bold text-red-400">A data inicial deve ser anterior a data final.</p>
        )}
      </section>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4">
        {[
          { label: 'Total no periodo', value: currency.format(total), detail: `${filteredExpenseEntries.length} registro(s)`, icon: Wallet, accent: 'border-primary/25 from-primary/[0.10]' },
          { label: 'Quantidade', value: String(filteredExpenseEntries.length), detail: 'gasto(s) registrado(s)', icon: Receipt, accent: 'border-slate-700/80 from-slate-700/30' },
          { label: 'Media por gasto', value: currency.format(averagePerRecord), detail: 'no periodo selecionado', icon: ChartNoAxesColumnIncreasing, accent: 'border-slate-700/80 from-slate-700/30' },
          { label: 'Ultimos 6 meses', value: currency.format(lastSixMonthsTotal), detail: 'total registrado', icon: TrendingUp, accent: 'border-orange-500/20 from-orange-500/[0.08]' },
        ].map((metric) => {
          const MetricIcon = metric.icon;
          return (
            <div key={metric.label} className={`flex min-w-0 items-center gap-3 rounded-2xl border bg-gradient-to-br ${metric.accent} to-slate-900/70 p-4 shadow-lg shadow-black/10`}>
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-800/80 text-slate-200">
                <MetricIcon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[10px] font-bold text-slate-400">{metric.label}</p>
                <p className="mt-0.5 truncate text-lg font-black text-white">{metric.value}</p>
                <p className="mt-0.5 truncate text-[10px] text-slate-500">{metric.detail}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/45 p-4">
            <div className="mb-2 flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" />
              <h3 className="text-xs font-bold text-white">Gastos por metodo de pagamento</h3>
            </div>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <RePieChart>
                  <Pie
                    data={paymentMethodData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={28}
                    outerRadius={50}
                    paddingAngle={3}
                    label={({ name, percent }) => `${name} ${Math.round(percent * 100)}%`}
                  >
                    {paymentMethodData.map((entry, index) => (
                      <Cell key={`cell-${entry.name}`} fill={paymentMethodColors[index % paymentMethodColors.length]} />
                    ))}
                  </Pie>
                </RePieChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/45 p-4">
            <div className="mb-2 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <h3 className="text-xs font-bold text-white">Historico dos ultimos 6 meses</h3>
            </div>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyData} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} strokeOpacity={0.35} />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '10px', fontSize: '11px' }}
                    formatter={(value: number) => [`R$ ${value.toFixed(2)}`, 'Gastos']}
                  />
                  <Bar dataKey="total" fill="#ef4444" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

      <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/30 shadow-lg shadow-black/10">
        <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3.5">
          <div>
            <h3 className="text-sm font-black text-white">Lancamentos do periodo</h3>
            <p className="mt-0.5 text-[10px] text-slate-500">Despesas registradas entre as datas selecionadas.</p>
          </div>
          <span className="rounded-lg border border-slate-700 bg-slate-800/70 px-2.5 py-1 text-[10px] font-bold text-slate-300">
            {filteredExpenseEntries.length} gasto(s)
          </span>
        </div>
        {filteredExpenseEntries.length === 0 ? (
          <div className="px-4 py-12 text-center text-xs text-slate-500">Nenhum gasto registrado neste periodo.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead className="border-b border-slate-800 bg-slate-800/40 text-[9px] font-bold uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3">Descricao</th>
                  <th className="px-4 py-3">Fornecedor</th>
                  <th className="px-4 py-3">Metodo</th>
                  <th className="px-4 py-3 text-right">Valor</th>
                  <th className="px-4 py-3 text-right">Acao</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {[...filteredExpenseEntries].sort((a, b) => b.date.localeCompare(a.date)).map((entry) => (
                  <tr key={entry.id} className="transition-colors hover:bg-slate-800/25">
                    <td className="whitespace-nowrap px-4 py-3 text-xs font-medium text-slate-300">{formatDateForDisplay(entry.date) || entry.date}</td>
                    <td className="max-w-[280px] px-4 py-3">
                      <p className="truncate text-xs font-bold text-white">{entry.description || 'Gasto sem descricao'}</p>
                      {entry.note && <p className="mt-0.5 truncate text-[10px] text-slate-500">{entry.note}</p>}
                    </td>
                    <td className="max-w-[200px] truncate px-4 py-3 text-xs text-slate-300">{entry.supplier || 'Sem fornecedor'}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800/80 px-2 py-1 text-[10px] font-semibold text-slate-300">
                        <CreditCard className="h-3 w-3 text-slate-400" />
                        {entry.paymentMethod}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-xs font-black text-primary">{currency.format(entry.amount)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => void onDeleteExpense(entry.id)}
                        className="rounded-lg border border-red-500/20 bg-red-500/[0.06] px-2.5 py-1.5 text-[10px] font-bold text-red-300 transition hover:border-red-500/40 hover:bg-red-500/15"
                      >
                        Excluir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/35 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-primary">Cadastro automatico</p>
            <h3 className="text-sm font-bold text-white">Fornecedores</h3>
            <p className="text-[10px] text-slate-500">Clique em um fornecedor para consultar todos os gastos registrados.</p>
          </div>
          <span className="rounded-full bg-slate-900/70 px-2.5 py-1 text-[10px] font-bold text-slate-300">
            {supplierSummaries.length} cadastrado(s)
          </span>
        </div>

        {supplierSummaries.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-700 p-4 text-center text-xs text-slate-500">
            O primeiro fornecedor aparecera aqui depois que o gasto for salvo.
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {supplierSummaries.map((entry) => (
              <button
                key={entry.key}
                type="button"
                onClick={() => setOpenSupplierKey(entry.key)}
                className="flex items-center gap-3 rounded-xl border border-slate-700/50 bg-slate-900/40 p-3 text-left transition hover:border-primary/50 hover:bg-slate-900/70"
                title={`Ver gastos de ${entry.name}`}
              >
                <span className="rounded-lg bg-primary/10 p-2 text-primary">
                  <Store className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-bold text-white">{entry.name}</span>
                  <span className="block text-[10px] text-slate-500">{entry.count} compra(s)</span>
                </span>
                <span className="text-xs font-black text-red-300">{currency.format(entry.total)}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {openSupplier && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-950 shadow-2xl shadow-black">
            <div className="flex items-start justify-between gap-3 border-b border-slate-800 p-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-primary">Historico do fornecedor</p>
                <h3 className="text-lg font-black text-white">{openSupplier.name}</h3>
                <p className="mt-1 text-xs text-slate-500">
                  {openSupplier.count} gasto(s) - {currency.format(openSupplier.total)} no total
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpenSupplierKey(null)}
                className="grid h-8 w-8 place-items-center rounded-lg bg-slate-900 text-slate-400 hover:text-white"
                aria-label="Fechar historico do fornecedor"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto p-3">
              {[...openSupplier.entries].reverse().map((expense) => (
                <div
                  key={expense.id}
                  className="flex flex-col gap-2 rounded-xl border border-slate-700/40 bg-slate-900/40 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{expense.description || 'Gasto sem descricao'}</p>
                    <p className="mt-0.5 text-[10px] text-slate-500">
                      {expense.date} - {expense.paymentMethod}
                    </p>
                    {expense.note && <p className="mt-1 text-[10px] text-slate-400">{expense.note}</p>}
                  </div>
                  <div className="flex shrink-0 items-center justify-between gap-3 sm:flex-col sm:items-end">
                    <p className="text-sm font-bold text-white">{currency.format(expense.amount)}</p>
                    <button
                      type="button"
                      onClick={() => void onDeleteExpense(expense.id)}
                      className="text-[10px] font-bold uppercase tracking-widest text-red-400 hover:text-red-300"
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
