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
import { ArrowLeft, Plus, Store, X } from 'lucide-react';
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

const parseDisplayDate = (value: string) => {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) return null;

  const [, day, month, year] = match;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day));
  if (
    parsed.getFullYear() !== Number(year) ||
    parsed.getMonth() !== Number(month) - 1 ||
    parsed.getDate() !== Number(day)
  ) return null;

  return `${year}-${month}-${day}`;
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
  const [periodStart, setPeriodStart] = useState(() => format(startOfMonth(subMonths(new Date(), 11)), 'yyyy-MM-dd'));
  const [periodEnd, setPeriodEnd] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [periodStartInput, setPeriodStartInput] = useState(() => formatDateForDisplay(periodStart));
  const [periodEndInput, setPeriodEndInput] = useState(() => formatDateForDisplay(periodEnd));
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

  const canonicalSupplier = supplierSummaries.find(
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

  return (
    <div className="space-y-3.5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold">Gastos</h2>
          <p className="text-xs text-slate-400">Compras, despesas e pagamentos da oficina.</p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-800/60 px-3 py-2 text-xs font-bold text-slate-200 transition hover:bg-slate-800"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar ao Inicio
        </button>
      </div>

      <section className="space-y-3 rounded-2xl border border-slate-700/50 bg-slate-800/40 p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-primary">Registro rapido</p>
            <h3 className="text-sm font-bold text-white">Novo gasto</h3>
            <p className="text-[10px] text-slate-500">
              {isExpenseFormOpen ? 'Fornecedor, valor, descricao e data. Sem friccao.' : 'Clique em registrar para abrir o lancamento rapido.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsExpenseFormOpen((current) => !current)}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary/90"
          >
            <Plus className="h-3.5 w-3.5" />
            {isExpenseFormOpen ? 'Fechar' : 'Registrar gasto'}
          </button>
        </div>

        {isExpenseFormOpen && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void onSaveExpense(canonicalSupplier);
            }}
            className="space-y-3 border-t border-slate-700/40 pt-3"
          >
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-12">
              <div className="col-span-2 space-y-1 lg:col-span-3">
                <label className="px-1 text-[9px] font-bold uppercase tracking-widest text-slate-500">Fornecedor</label>
                <input
                  value={supplier}
                  onChange={(event) => onSupplierChange(event.target.value)}
                  list="expense-supplier-list"
                  required
                  placeholder="Loja ou distribuidor"
                  autoComplete="off"
                  className="w-full rounded-xl border-slate-700 bg-slate-900/50 p-2 text-xs outline-none focus:ring-1 focus:ring-primary"
                />
                <datalist id="expense-supplier-list">
                  {supplierSummaries.map((entry) => (
                    <option key={entry.key} value={entry.name}>{currency.format(entry.total)} em {entry.count} compra(s)</option>
                  ))}
                </datalist>
                <p className="px-1 text-[9px] text-slate-500">
                  Selecione um fornecedor existente ou digite um novo.
                </p>
              </div>
              <div className="space-y-1 lg:col-span-2">
                <label className="px-1 text-[9px] font-bold uppercase tracking-widest text-slate-500">Valor</label>
                <input
                  value={amount}
                  onChange={(event) => onAmountChange(event.target.value)}
                  placeholder="500,00"
                  className="w-full rounded-xl border-slate-700 bg-slate-900/50 p-2 text-xs outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="col-span-2 space-y-1 lg:col-span-4">
                <label className="px-1 text-[9px] font-bold uppercase tracking-widest text-slate-500">Descricao</label>
                <input
                  value={description}
                  onChange={(event) => onDescriptionChange(event.target.value)}
                  placeholder="Ex: pastilha, oleo, aluguel, compra..."
                  className="w-full rounded-xl border-slate-700 bg-slate-900/50 p-2 text-xs outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="space-y-1 lg:col-span-3">
                <label className="px-1 text-[9px] font-bold uppercase tracking-widest text-slate-500">Data</label>
                <input
                  type="date"
                  value={date}
                  onChange={(event) => onDateChange(event.target.value)}
                  className="w-full rounded-xl border-slate-700 bg-slate-900/50 p-2 text-xs outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="col-span-2 space-y-1 lg:col-span-3">
                <label className="px-1 text-[9px] font-bold uppercase tracking-widest text-slate-500">Forma de pagamento</label>
                <select
                  value={paymentMethod}
                  onChange={(event) => onPaymentMethodChange(event.target.value)}
                  required
                  className="w-full rounded-xl border-slate-700 bg-slate-900/50 p-2 text-xs outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">Selecione</option>
                  <option value="Dinheiro">Dinheiro</option>
                  <option value="Pix">Pix</option>
                  <option value="Debito">Debito</option>
                  <option value="Credito">Credito</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
              <button
                type="button"
                onClick={onResetForm}
                className="rounded-xl bg-slate-700/50 px-3 py-2 text-xs font-bold transition-all hover:bg-slate-700"
              >
                Limpar
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="rounded-xl bg-primary px-3 py-2 text-xs font-bold text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSaving ? 'Salvando...' : 'Salvar gasto'}
              </button>
            </div>
          </form>
        )}
      </section>

      <section className="rounded-2xl border border-slate-700/50 bg-slate-800/40 p-3">
        <div className="mb-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-primary">Periodo de consulta</p>
          <p className="text-[10px] text-slate-500">Veja quanto foi gasto entre as datas selecionadas.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 sm:max-w-md">
          <label className="space-y-1">
            <span className="px-1 text-[9px] font-bold uppercase tracking-widest text-slate-500">Inicio</span>
            <input
              type="text"
              inputMode="numeric"
              placeholder="dd/mm/aaaa"
              value={periodStartInput}
              onChange={(event) => {
                const value = event.target.value;
                setPeriodStartInput(value);
                const parsed = parseDisplayDate(value);
                if (parsed) setPeriodStart(parsed);
              }}
              className="w-full rounded-xl border-slate-700 bg-slate-900/50 p-2 text-xs outline-none focus:ring-1 focus:ring-primary"
            />
          </label>
          <label className="space-y-1">
            <span className="px-1 text-[9px] font-bold uppercase tracking-widest text-slate-500">Fim</span>
            <input
              type="text"
              inputMode="numeric"
              placeholder="dd/mm/aaaa"
              value={periodEndInput}
              onChange={(event) => {
                const value = event.target.value;
                setPeriodEndInput(value);
                const parsed = parseDisplayDate(value);
                if (parsed) setPeriodEnd(parsed);
              }}
              className="w-full rounded-xl border-slate-700 bg-slate-900/50 p-2 text-xs outline-none focus:ring-1 focus:ring-primary"
            />
          </label>
        </div>
        {periodStart > periodEnd && (
          <p className="mt-2 text-[10px] font-bold text-red-400">A data inicial deve ser anterior a data final.</p>
        )}
      </section>

      <div className="grid gap-3 xl:grid-cols-[0.85fr_1fr]">
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-3">
            <p className="text-[8px] font-bold uppercase tracking-widest text-slate-500">Total</p>
            <p className="mt-1 text-lg font-black text-white">R$ {total.toFixed(2)}</p>
            <p className="mt-1 text-[9px] text-slate-400">{filteredExpenseEntries.length} registro(s) no periodo</p>
          </div>
          <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-3">
            <p className="text-[8px] font-bold uppercase tracking-widest text-slate-500">Periodo</p>
            <p className="mt-1 text-lg font-black text-white">{filteredExpenseEntries.length}</p>
            <p className="mt-1 text-[9px] text-slate-400">registros no periodo</p>
          </div>
          <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-3">
            <p className="text-[8px] font-bold uppercase tracking-widest text-slate-500">Media</p>
            <p className="mt-1 text-lg font-black text-white">R$ {averagePerRecord.toFixed(2)}</p>
            <p className="mt-1 text-[9px] text-slate-400">por gasto no periodo</p>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-3">
            <h3 className="mb-2 text-xs font-bold">Por metodo</h3>
            <div className="h-36">
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
          <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-3">
            <h3 className="mb-2 text-xs font-bold">Ultimos 6 meses</h3>
            <div className="h-36">
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
      </div>

      <section className="space-y-3 rounded-2xl border border-slate-700/50 bg-slate-800/40 p-3">
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
