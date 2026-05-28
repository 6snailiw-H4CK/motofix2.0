import { addDays, format, isAfter, isSameDay, parseISO, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
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
import { ArrowLeft } from 'lucide-react';
import type { ExpenseRecord } from '../../types';

type ExpensesViewProps = {
  expenseEntries: ExpenseRecord[];
  description: string;
  amount: string;
  paymentMethod: string;
  date: string;
  note: string;
  isSaving: boolean;
  onBack: () => void;
  onDescriptionChange: (value: string) => void;
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
  amount,
  paymentMethod,
  date,
  note,
  isSaving,
  onBack,
  onDescriptionChange,
  onAmountChange,
  onPaymentMethodChange,
  onDateChange,
  onNoteChange,
  onSaveExpense,
  onDeleteExpense,
  onResetForm,
}: ExpensesViewProps) => {
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
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold">Gastos</h2>
          <p className="text-sm text-slate-400">Cadastre compras, despesas e pagamentos da oficina.</p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-800/60 px-4 py-2 text-sm font-bold text-slate-200 hover:bg-slate-800 transition"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar ao Inicio
        </button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.25fr_0.9fr]">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="bg-slate-800/40 p-5 rounded-2xl border border-slate-700/50">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Total de gastos</p>
            <p className="mt-3 text-3xl font-bold text-white">R$ {total.toFixed(2)}</p>
            <p className="text-[10px] text-slate-400 mt-2">Registros no app: {expenseEntries.length}</p>
          </div>
          <div className="bg-slate-800/40 p-5 rounded-2xl border border-slate-700/50">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Ultimos 30 dias</p>
            <p className="mt-3 text-3xl font-bold text-white">{last30Days.length}</p>
            <p className="text-[10px] text-slate-400 mt-2">Registros no mes atual</p>
          </div>
          <div className="bg-slate-800/40 p-5 rounded-2xl border border-slate-700/50 md:col-span-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Media por registro</p>
            <p className="mt-3 text-3xl font-bold text-white">R$ {averagePerRecord.toFixed(2)}</p>
            <p className="text-[10px] text-slate-400 mt-2">Baseado em gastos dos ultimos 30 dias</p>
          </div>
        </div>
        <div className="grid gap-4">
          <div className="bg-slate-800/40 p-5 rounded-2xl border border-slate-700/50">
            <h3 className="text-sm font-bold mb-3">Gastos por metodo de pagamento</h3>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <RePieChart>
                  <Pie
                    data={paymentMethodData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={38}
                    outerRadius={72}
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
          <div className="bg-slate-800/40 p-5 rounded-2xl border border-slate-700/50">
            <h3 className="text-sm font-bold mb-3">Despesas nos ultimos 6 meses</h3>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyData} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
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

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void onSaveExpense();
        }}
        className="bg-slate-800/40 p-5 rounded-2xl border border-slate-700/50 space-y-4"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Descricao</label>
            <input
              value={description}
              onChange={(event) => onDescriptionChange(event.target.value)}
              placeholder="Ex: Compra de mercadoria"
              className="w-full bg-slate-900/50 border-slate-700 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Valor (R$)</label>
            <input
              value={amount}
              onChange={(event) => onAmountChange(event.target.value)}
              placeholder="500,00"
              className="w-full bg-slate-900/50 border-slate-700 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Forma de pagamento</label>
            <select
              value={paymentMethod}
              onChange={(event) => onPaymentMethodChange(event.target.value)}
              className="w-full bg-slate-900/50 border-slate-700 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none"
            >
              <option>Cartao de Credito</option>
              <option>PIX</option>
              <option>Dinheiro</option>
              <option>Debito</option>
              <option>Boleto</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Data</label>
            <input
              type="date"
              value={date}
              onChange={(event) => onDateChange(event.target.value)}
              className="w-full bg-slate-900/50 border-slate-700 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Observacoes</label>
          <textarea
            value={note}
            onChange={(event) => onNoteChange(event.target.value)}
            placeholder="Ex: parcelado em 3x, fornecedor local, devolucao pendente..."
            className="w-full bg-slate-900/50 border-slate-700 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none min-h-[100px]"
          />
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <button
            type="submit"
            disabled={isSaving}
            className="flex-1 bg-primary py-3 rounded-xl font-bold hover:bg-primary/90 transition-all text-sm shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? 'Salvando...' : 'Registrar gasto'}
          </button>
          <button
            type="button"
            onClick={onResetForm}
            className="w-full sm:w-auto px-6 bg-slate-700/50 py-3 rounded-xl font-bold hover:bg-slate-700 transition-all text-sm"
          >
            Limpar
          </button>
        </div>
      </form>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold">Ultimos gastos registrados</p>
          <span className="text-[10px] text-slate-400">{expenseEntries.length} registro(s)</span>
        </div>
        {expenseEntries.length === 0 ? (
          <div className="rounded-2xl border border-slate-700/40 bg-slate-800/50 p-6 text-sm text-slate-400 text-center">
            Nenhum gasto registrado ainda. Use o formulario acima para cadastrar despesas.
          </div>
        ) : (
          <div className="space-y-3">
            {expenseEntries.map((expense) => (
              <div
                key={expense.id}
                className="bg-slate-800/30 p-4 rounded-2xl border border-slate-700/40 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <p className="font-semibold text-sm text-white">{expense.description}</p>
                  <p className="text-[11px] text-slate-500 mt-1">{expense.paymentMethod} - {expense.date}</p>
                  {expense.note && <p className="text-[11px] text-slate-400 mt-2">{expense.note}</p>}
                </div>
                <div className="flex items-center gap-3 md:flex-col md:items-end">
                  <p className="font-bold text-white">R$ {expense.amount.toFixed(2)}</p>
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
