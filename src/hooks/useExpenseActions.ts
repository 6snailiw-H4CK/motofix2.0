import { format } from 'date-fns';
import type { User } from 'firebase/auth';
import { useCallback, useEffect, useState } from 'react';
import { toast as sonnerToast } from 'sonner';
import { parseBrazilianCurrency } from '../lib/money';
import { expenseRepository } from '../services/expenseRepository';
import { handleFirestoreError, OperationType } from '../services/firestoreError';
import { getFirestoreSaveResultMessage } from '../services/firestoreSaveStatus';
import { clearLocalDraft, loadLocalDraft, saveLocalDraft } from '../services/localDrafts';
import { recordOperationalLog } from '../services/operationalLogRepository';
import type { CashPaymentMethod, ExpenseRecord } from '../types';

const makeExpenseId = () => typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
  ? crypto.randomUUID()
  : `expense-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

type UseExpenseActionsParams = {
  user: User | null;
  onAfterSave?: () => void;
  workshopName?: string;
};

export const useExpenseActions = ({ user, onAfterSave, workshopName }: UseExpenseActionsParams) => {
  const [description, setDescription] = useState('');
  const [supplier, setSupplier] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Credito');
  const [date, setDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [note, setNote] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDraftHydrated, setIsDraftHydrated] = useState(false);
  const draftKey = user?.uid ? `${user.uid}:expense-form` : '';

  const resetForm = useCallback(() => {
    setDescription('');
    setSupplier('');
    setAmount('');
    setPaymentMethod('Credito');
    setDate(format(new Date(), 'yyyy-MM-dd'));
    setNote('');
    setDueDate('');
    if (draftKey) clearLocalDraft(draftKey);
  }, [draftKey]);

  useEffect(() => {
    if (!draftKey) {
      setIsDraftHydrated(true);
      return;
    }

    const draft = loadLocalDraft<{
      description: string;
      supplier: string;
      amount: string;
      paymentMethod: string;
      date: string;
      note: string;
      dueDate?: string;
    }>(draftKey);

    if (draft?.data) {
      setDescription(draft.data.description || '');
      setSupplier(draft.data.supplier || '');
      setAmount(draft.data.amount || '');
      setPaymentMethod(draft.data.paymentMethod || 'Credito');
      setDate(draft.data.date || format(new Date(), 'yyyy-MM-dd'));
      setNote(draft.data.note || '');
      setDueDate(draft.data.dueDate || '');
    }

    setIsDraftHydrated(true);
  }, [draftKey]);

  useEffect(() => {
    if (!isDraftHydrated || !draftKey) return;

    const hasContent = Boolean(description.trim() || supplier.trim() || amount.trim() || note.trim());
    if (!hasContent) {
      clearLocalDraft(draftKey);
      return;
    }

    saveLocalDraft(draftKey, 'Gasto em andamento', 'expenses', {
      description,
      supplier,
      amount,
      paymentMethod,
      date,
      note,
      dueDate,
    });
  }, [amount, date, description, draftKey, dueDate, isDraftHydrated, note, paymentMethod, supplier]);

  const saveExpense = useCallback(async (canonicalSupplier?: string) => {
    if (!user) return;

    const parsedAmount = parseBrazilianCurrency(amount, Number.NaN);
    const normalizedSupplier = (canonicalSupplier || supplier).trim().replace(/\s+/g, ' ');
    if (!normalizedSupplier || !description.trim() || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      sonnerToast.error('Preencha o fornecedor, a descricao e um valor valido para o gasto.');
      return;
    }

    setIsSaving(true);
    try {
      const now = new Date().toISOString();
      const normalizedMethod = paymentMethod as CashPaymentMethod;
      const expenseId = await expenseRepository.create(user.uid, {
        description: description.trim(),
        supplier: normalizedSupplier,
        amount: parsedAmount,
        paymentMethod,
        date: date || format(new Date(), 'yyyy-MM-dd'),
        accountingVersion: 1,
        dueDate: normalizedMethod === 'Credito' ? (dueDate || null) : null,
        settlementEntries: normalizedMethod === 'Credito' ? [] : [{
          id: makeExpenseId(),
          amount: parsedAmount,
          method: normalizedMethod,
          settledAt: now,
        }],
        note: note.trim() || '',
        userId: user.uid,
        createdAt: now,
      });
      recordOperationalLog({
        userId: user.uid,
        usuario: user.email,
        oficina: workshopName,
        acao: 'despesa_criada',
        targetId: expenseId,
        details: { module: 'Gastos', fields: ['descrição', 'fornecedor', 'valor', 'forma de pagamento', 'data', 'vencimento'] },
      });

      clearLocalDraft(draftKey);
      resetForm();
      onAfterSave?.();
      sonnerToast.success(getFirestoreSaveResultMessage('Gasto registrado com sucesso.'));
    } catch (error) {
      sonnerToast.error('Nao foi possivel salvar o gasto.');
      handleFirestoreError(error, OperationType.CREATE, 'expenses');
    } finally {
      setIsSaving(false);
    }
  }, [amount, date, description, dueDate, note, onAfterSave, paymentMethod, resetForm, supplier, user, workshopName]);

  const settleExpense = useCallback(async (
    expense: ExpenseRecord,
    amountToSettle: number,
    method: CashPaymentMethod,
    settledAt: string,
  ) => {
    if (!user) return;
    const existingEntries = expense.settlementEntries || [];
    const paid = existingEntries.reduce((sum, entry) => sum + Math.max(0, Number(entry.amount) || 0), 0);
    const remaining = Math.max(0, Number(expense.amount) - paid);
    if (amountToSettle <= 0 || amountToSettle > remaining + 0.01) {
      sonnerToast.error('O valor do pagamento deve ser maior que zero e não pode superar o saldo da conta.');
      return;
    }
    try {
      await expenseRepository.recordSettlement(user.uid, expense.id, [...existingEntries, {
        id: makeExpenseId(),
        amount: amountToSettle,
        method,
        settledAt: new Date(`${settledAt}T12:00:00`).toISOString(),
      }]);
      recordOperationalLog({
        userId: user.uid,
        usuario: user.email,
        oficina: workshopName,
        acao: 'conta_paga',
        targetId: expense.id,
        details: { module: 'Gastos', fields: ['pagamento', 'forma de pagamento', 'data de liquidação'] },
      });
      sonnerToast.success(getFirestoreSaveResultMessage('Pagamento da conta registrado; o gasto original não foi duplicado.'));
    } catch (error) {
      sonnerToast.error('Não foi possível registrar o pagamento da conta.');
      handleFirestoreError(error, OperationType.UPDATE, `expenses/${expense.id}`);
    }
  }, [user, workshopName]);

  const deleteExpense = useCallback(async (expenseId: string) => {
    if (!user) return;

    try {
      await expenseRepository.remove(user.uid, expenseId);
      recordOperationalLog({
        userId: user.uid,
        usuario: user.email,
        oficina: workshopName,
        acao: 'despesa_removida',
        targetId: expenseId,
        details: { module: 'Gastos' },
      });
      sonnerToast.success(getFirestoreSaveResultMessage('Gasto movido para a lixeira.'), {
        action: {
          label: 'Desfazer',
          onClick: () => void expenseRepository.restore(user.uid, expenseId).then(() => recordOperationalLog({
            userId: user.uid,
            usuario: user.email,
            oficina: workshopName,
            acao: 'despesa_restaurada',
            targetId: expenseId,
            details: { module: 'Gastos' },
          })),
        },
      });
    } catch (error) {
      console.error('Erro ao remover gasto:', error);
      sonnerToast.error('Nao foi possivel excluir o gasto.');
    }
  }, [user, workshopName]);

  return {
    amount,
    date,
    deleteExpense,
    description,
    isSaving,
    note,
    paymentMethod,
    dueDate,
    resetForm,
    saveExpense,
    settleExpense,
    setAmount,
    setDate,
    setDueDate,
    setDescription,
    setNote,
    setPaymentMethod,
    setSupplier,
    supplier,
  };
};
