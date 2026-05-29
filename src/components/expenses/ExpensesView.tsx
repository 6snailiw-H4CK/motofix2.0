import { addDays, format, isAfter, isSameDay, parseISO, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useState } from 'react';
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
import { ArrowLeft, Plus } from 'lucide-react';
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
  onSaveExpense: () => Promise<void> | void;
  onDeleteExpense: (expenseId: string) => Promise<void> | void;
  onResetForm: () => void;
};

const paymentMethodColors = ['#ef4444', '#f97316', '#38bdf8', '#14b8a6', '#8b5cf6'];

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
  const total = expenseEntries.reduce((sum, entry) => sum + entry.amount, 0);
  const last30Days = expenseEntries.filter((entry) => {
    const entryDate = parseISO(entry.date);
    return isAfter(entryDate, addDays(new Date(), -30)) || isSameDay(entryDate, new Date());
  });

  const byPaymentMethod = expenseEntries.reduce((acc, entry) => {
    acc[entry.paymentMethod] = (acc[entry.paymentMethod] || 0) + entry.amount;
    return acc;
  }, {} as Record<string, number>);

  const paymentMethodData = Object.entries(byPaymentMethod).map(([name, value]) => ({ name, value }));

  const monthlyData = Array.from({ length: 6 }).map((_, index) => {
    const monthDate = subMonths(new Date(), 5 - index);
    const monthKey = format(monthDate, 'yyyy-MM');
    return {
      month: format(monthDate, 'MMM', { locale: ptBR }),
      total: expenseEntries
        .filter((entry) => entry.date.startsWith(monthKey))
        .reduce((sum, entry) => sum + entry.amount, 0),
    };
  });

  const averagePerRecord = last30Days.length ? total / last30Days.length : 0;

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
              {isExpenseFormOpen ? 'Preencha os campos para salvar o gasto.' : 'Clique em registrar para abrir os campos.'}
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
              void onSaveExpense();
            }}
            className="space-y-3 border-t border-slate-700/40 pt-3"
          >
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-12">
              <div className="col-span-2 space-y-1 lg:col-span-3">
                <label className="px-1 text-[9px] font-bold uppercase tracking-widest text-slate-500">Descricao</label>
                <input
                  value={description}
                  onChange={(event) => onDescriptionChange(event.target.value)}
                  placeholder="Compra, fornecedor, parcela..."
                  className="w-full rounded-xl border-slate-700 bg-slate-900/50 p-2 text-xs outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="col-span-2 space-y-1 lg:col-span-3">
                <label className="px-1 text-[9px] font-bold uppercase tracking-widest text-slate-500">Fornecedor</label>
                <input
                  value={supplier}
                  onChange={(event) => onSupplierChange(event.target.value)}
                  placeholder="Loja, distribuidor, peca..."
                  className="w-full rounded-xl border-slate-700 bg-slate-900/50 p-2 text-xs outline-none focus:ring-1 focus:ring-primary"
                />
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
              <div className="space-y-1 lg:col-span-2">
                <label className="px-1 text-[9px] font-bold uppercase tracking-widest text-slate-500">Pagamento</label>
                <select
                  value={paymentMethod}
                  onChange={(event) => onPaymentMethodChange(event.target.value)}
                  className="w-full rounded-xl border-slate-700 bg-slate-900/50 p-2 text-xs outline-none focus:ring-1 focus:ring-primary"
                >
                  <option>Cartao de Credito</option>
                  <option>PIX</option>
                  <option>Dinheiro</option>
                  <option>Debito</option>
                  <option>Boleto</option>
                </select>
              </div>
              <div className="space-y-1 lg:col-span-2">
                <label className="px-1 text-[9px] font-bold uppercase tracking-widest text-slate-500">Data</label>
                <input
                  type="date"
                  value={date}
                  onChange={(event) => onDateChange(event.target.value)}
                  className="w-full rounded-xl border-slate-700 bg-slate-900/50 p-2 text-xs outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="col-span-2 space-y-1 lg:col-span-12">
                <label className="px-1 text-[9px] font-bold uppercase tracking-widest text-slate-500">Obs.</label>
                <input
                  value={note}
                  onChange={(event) => onNoteChange(event.target.value)}
                  placeholder="Opcional"
                  className="w-full rounded-xl border-slate-700 bg-slate-900/50 p-2 text-xs outline-none focus:ring-1 focus:ring-primary"
                />
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

      <div className="grid gap-3 xl:grid-cols-[0.85fr_1fr]">
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-3">
            <p className="text-[8px] font-bold uppercase tracking-widest text-slate-500">Total</p>
            <p className="mt-1 text-lg font-black text-white">R$ {total.toFixed(2)}</p>
            <p className="mt-1 text-[9px] text-slate-400">{expenseEntries.length} registro(s)</p>
          </div>
          <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-3">
            <p className="text-[8px] font-bold uppercase tracking-widest text-slate-500">30 dias</p>
            <p className="mt-1 text-lg font-black text-white">{last30Days.length}</p>
            <p className="mt-1 text-[9px] text-slate-400">registros</p>
          </div>
          <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-3">
            <p className="text-[8px] font-bold uppercase tracking-widest text-slate-500">Media</p>
            <p className="mt-1 text-lg font-black text-white">R$ {averagePerRecord.toFixed(2)}</p>
            <p className="mt-1 text-[9px] text-slate-400">por gasto</p>
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

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold">Ultimos gastos registrados</p>
          <span className="text-[10px] text-slate-400">{expenseEntries.length} registro(s)</span>
        </div>
        {expenseEntries.length === 0 ? (
          <div className="rounded-xl border border-slate-700/40 bg-slate-800/50 p-5 text-center text-xs text-slate-400">
            Nenhum gasto registrado ainda.
          </div>
        ) : (
          <div className="space-y-2">
            {expenseEntries.map((expense) => (
              <div
                key={expense.id}
                className="flex flex-col gap-2 rounded-xl border border-slate-700/40 bg-slate-800/30 p-3 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <p className="text-sm font-semibold text-white">{expense.description}</p>
                  <p className="mt-0.5 text-[10px] text-slate-500">
                    {expense.paymentMethod} - {expense.date}
                    {expense.supplier ? ` - Fornecedor: ${expense.supplier}` : ''}
                  </p>
                  {expense.note && <p className="mt-1 text-[10px] text-slate-400">{expense.note}</p>}
                </div>
                <div className="flex items-center gap-3 md:flex-col md:items-end">
                  <p className="text-sm font-bold text-white">R$ {expense.amount.toFixed(2)}</p>
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
        )}
      </div>
    </div>
  );
};
