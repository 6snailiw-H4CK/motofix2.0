import { format } from 'date-fns';
import type { User } from 'firebase/auth';
import { useCallback, useEffect, useState } from 'react';
import { toast as sonnerToast } from 'sonner';
import { parseBrazilianCurrency } from '../lib/money';
import { expenseRepository } from '../services/expenseRepository';
import { handleFirestoreError, OperationType } from '../services/firestoreError';
import { clearLocalDraft, loadLocalDraft, saveLocalDraft } from '../services/localDrafts';
import { recordOperationalLog } from '../services/operationalLogRepository';

type UseExpenseActionsParams = {
  user: User | null;
  onAfterSave?: () => void;
  workshopName?: string;
};

export const useExpenseActions = ({ user, onAfterSave, workshopName }: UseExpenseActionsParams) => {
  const [description, setDescription] = useState('');
  const [supplier, setSupplier] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cartao de Credito');
  const [date, setDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [note, setNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDraftHydrated, setIsDraftHydrated] = useState(false);
  const draftKey = user?.uid ? `${user.uid}:expense-form` : '';

  const resetForm = useCallback(() => {
    setDescription('');
    setSupplier('');
    setAmount('');
    setPaymentMethod('Cartao de Credito');
    setDate(format(new Date(), 'yyyy-MM-dd'));
    setNote('');
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
    }>(draftKey);

    if (draft?.data) {
      setDescription(draft.data.description || '');
      setSupplier(draft.data.supplier || '');
      setAmount(draft.data.amount || '');
      setPaymentMethod(draft.data.paymentMethod || 'Cartao de Credito');
      setDate(draft.data.date || format(new Date(), 'yyyy-MM-dd'));
      setNote(draft.data.note || '');
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
    });
  }, [amount, date, description, draftKey, isDraftHydrated, note, paymentMethod, supplier]);

  const saveExpense = useCallback(async () => {
    if (!user) return;

    const parsedAmount = parseBrazilianCurrency(amount, Number.NaN);
    if (!description.trim() || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      sonnerToast.error('Preencha a descricao e um valor valido para o gasto.');
      return;
    }

    setIsSaving(true);
    try {
      const expenseId = await expenseRepository.create(user.uid, {
        description: description.trim(),
        supplier: supplier.trim() || '',
        amount: parsedAmount,
        paymentMethod,
        date: date || format(new Date(), 'yyyy-MM-dd'),
        note: note.trim() || '',
        userId: user.uid,
        createdAt: format(new Date(), "yyyy-MM-dd'T'HH:mm:ss'Z'"),
      });
      recordOperationalLog({
        userId: user.uid,
        usuario: user.email,
        oficina: workshopName,
        acao: 'despesa_criada',
        targetId: expenseId,
        details: { description: description.trim(), amount: parsedAmount },
      });

      clearLocalDraft(draftKey);
      resetForm();
      onAfterSave?.();
      sonnerToast.success(
        typeof navigator !== 'undefined' && navigator.onLine === false
          ? 'Gasto salvo neste computador. Sincronizacao pendente.'
          : 'Gasto registrado com sucesso.'
      );
    } catch (error) {
      sonnerToast.error('Nao foi possivel salvar o gasto.');
      handleFirestoreError(error, OperationType.CREATE, 'expenses');
    } finally {
      setIsSaving(false);
    }
  }, [amount, date, description, note, onAfterSave, paymentMethod, resetForm, supplier, user, workshopName]);

  const deleteExpense = useCallback(async (expenseId: string) => {
    if (!user) return;

    try {
      await expenseRepository.remove(user.uid, expenseId);
      sonnerToast.success('Gasto removido.');
    } catch (error) {
      console.error('Erro ao remover gasto:', error);
      sonnerToast.error('Nao foi possivel excluir o gasto.');
    }
  }, [user]);

  return {
    amount,
    date,
    deleteExpense,
    description,
    isSaving,
    note,
    paymentMethod,
    resetForm,
    saveExpense,
    setAmount,
    setDate,
    setDescription,
    setNote,
    setPaymentMethod,
    setSupplier,
    supplier,
  };
};
