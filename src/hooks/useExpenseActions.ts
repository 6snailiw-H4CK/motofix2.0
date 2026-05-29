import { format } from 'date-fns';
import type { User } from 'firebase/auth';
import { useCallback, useState } from 'react';
import { toast as sonnerToast } from 'sonner';
import { expenseRepository } from '../services/expenseRepository';
import { handleFirestoreError, OperationType } from '../services/firestoreError';

type UseExpenseActionsParams = {
  user: User | null;
  onAfterSave?: () => void;
};

export const useExpenseActions = ({ user, onAfterSave }: UseExpenseActionsParams) => {
  const [description, setDescription] = useState('');
  const [supplier, setSupplier] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cartao de Credito');
  const [date, setDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [note, setNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const resetForm = useCallback(() => {
    setDescription('');
    setSupplier('');
    setAmount('');
    setPaymentMethod('Cartao de Credito');
    setDate(format(new Date(), 'yyyy-MM-dd'));
    setNote('');
  }, []);

  const saveExpense = useCallback(async () => {
    if (!user) return;

    const parsedAmount = parseFloat(amount.replace(',', '.'));
    if (!description.trim() || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      sonnerToast.error('Preencha a descricao e um valor valido para o gasto.');
      return;
    }

    setIsSaving(true);
    try {
      await expenseRepository.create(user.uid, {
        description: description.trim(),
        supplier: supplier.trim() || '',
        amount: parsedAmount,
        paymentMethod,
        date: date || format(new Date(), 'yyyy-MM-dd'),
        note: note.trim() || '',
        userId: user.uid,
        createdAt: format(new Date(), "yyyy-MM-dd'T'HH:mm:ss'Z'"),
      });

      resetForm();
      onAfterSave?.();
      sonnerToast.success('Gasto registrado com sucesso.');
    } catch (error) {
      sonnerToast.error('Nao foi possivel salvar o gasto.');
      handleFirestoreError(error, OperationType.CREATE, 'expenses');
    } finally {
      setIsSaving(false);
    }
  }, [amount, date, description, note, onAfterSave, paymentMethod, resetForm, supplier, user]);

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
