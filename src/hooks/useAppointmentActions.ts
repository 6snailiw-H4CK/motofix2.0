import { format, startOfMonth } from 'date-fns';
import type { User } from 'firebase/auth';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast as sonnerToast } from 'sonner';
import { parseBrazilianCurrency } from '../lib/money';
import { appointmentRepository } from '../services/appointmentRepository';
import { clearLocalDraft, loadLocalDraft, saveLocalDraft } from '../services/localDrafts';
import type { Appointment } from '../types';

export type AppointmentFormValues = {
  clientName: string;
  bikeModel: string;
  date: string;
  address: string;
  serviceRequested: string;
  value: string;
};

type UseAppointmentActionsParams = {
  user: User | null;
  onDeleted: () => void;
};

export const useAppointmentActions = ({ user, onDeleted }: UseAppointmentActionsParams) => {
  const [clientName, setClientName] = useState('');
  const [bikeModel, setBikeModel] = useState('');
  const [date, setDate] = useState('');
  const [address, setAddress] = useState('');
  const [serviceRequested, setServiceRequested] = useState('');
  const [value, setValue] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState<Date>(startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [isDraftHydrated, setIsDraftHydrated] = useState(false);
  const draftKey = user?.uid ? `${user.uid}:appointment-form` : '';

  const formValues = useMemo(() => ({
    clientName,
    bikeModel,
    date,
    address,
    serviceRequested,
    value,
  }), [address, bikeModel, clientName, date, serviceRequested, value]);

  const resetForm = useCallback(() => {
    setClientName('');
    setBikeModel('');
    setAddress('');
    setServiceRequested('');
    setValue('');
    if (draftKey) clearLocalDraft(draftKey);
  }, [draftKey]);

  useEffect(() => {
    if (!draftKey) {
      setIsDraftHydrated(true);
      return;
    }

    const draft = loadLocalDraft<AppointmentFormValues>(draftKey);
    if (draft?.data) {
      setClientName(draft.data.clientName || '');
      setBikeModel(draft.data.bikeModel || '');
      setDate(draft.data.date || selectedDate);
      setAddress(draft.data.address || '');
      setServiceRequested(draft.data.serviceRequested || '');
      setValue(draft.data.value || '');
      setShowForm(true);
    }

    setIsDraftHydrated(true);
  }, [draftKey, selectedDate]);

  useEffect(() => {
    if (!isDraftHydrated || !draftKey) return;

    const hasContent = Boolean(clientName.trim() || bikeModel.trim() || address.trim() || serviceRequested.trim() || value.trim());
    if (!hasContent) {
      clearLocalDraft(draftKey);
      return;
    }

    saveLocalDraft(draftKey, 'Agendamento em andamento', 'appointments', {
      clientName,
      bikeModel,
      date: date || selectedDate,
      address,
      serviceRequested,
      value,
    });
  }, [address, bikeModel, clientName, date, draftKey, isDraftHydrated, selectedDate, serviceRequested, value]);

  const setFormValue = useCallback((field: keyof AppointmentFormValues, nextValue: string) => {
    const setters = {
      clientName: setClientName,
      bikeModel: setBikeModel,
      date: setDate,
      address: setAddress,
      serviceRequested: setServiceRequested,
      value: setValue,
    };

    setters[field](nextValue);
  }, []);

  const saveAppointment = useCallback(async (): Promise<boolean> => {
    if (!user?.uid) {
      setMessage('Erro: usuario nao autenticado.');
      return false;
    }

    if (!clientName.trim() || !bikeModel.trim() || !date.trim() || !serviceRequested.trim()) {
      setMessage('Preencha os campos obrigatorios do agendamento.');
      return false;
    }

    try {
      await appointmentRepository.create(user.uid, {
        clientName: clientName.trim(),
        bikeModel: bikeModel.trim(),
        scheduledDate: date,
        address: address.trim() || '',
        serviceRequested: serviceRequested.trim(),
        value: parseBrazilianCurrency(value),
        createdAt: new Date().toISOString(),
        userId: user.uid,
        completed: false,
      });

      clearLocalDraft(draftKey);
      resetForm();
      const savedMessage = typeof navigator !== 'undefined' && navigator.onLine === false
        ? 'Agendamento salvo neste computador. Sincronizacao pendente.'
        : 'Agendamento salvo com sucesso!';
      setMessage(savedMessage);
      sonnerToast.success(savedMessage);
      window.setTimeout(() => setMessage(null), 2500);
      return true;
    } catch (error) {
      console.error('Erro ao salvar agendamento:', error);
      setMessage('Erro ao salvar agendamento. Tente novamente.');
      return false;
    }
  }, [address, bikeModel, clientName, date, draftKey, resetForm, serviceRequested, user, value]);

  const toggleAppointmentCompleted = useCallback(async (appointment: Appointment) => {
    if (!user?.uid || !appointment?.id || appointment.completed) return;

    try {
      await appointmentRepository.update(user.uid, appointment.id, {
        completed: true,
      });
      sonnerToast.success('Agendamento marcado como concluido.');
    } catch (error) {
      console.error('Erro ao atualizar status de agendamento:', error);
      sonnerToast.error('Falha ao marcar o agendamento.');
    }
  }, [user]);

  const deleteAppointment = useCallback(async (id: string | undefined) => {
    if (!user?.uid || !id) return;

    try {
      await appointmentRepository.remove(user.uid, id);
      onDeleted();
      sonnerToast.success('Agendamento movido para a lixeira.', {
        action: {
          label: 'Desfazer',
          onClick: () => void appointmentRepository.restore(user.uid, id),
        },
      });
    } catch (error) {
      console.error('Erro ao excluir agendamento:', error);
      sonnerToast.error('Erro ao excluir agendamento.');
    }
  }, [onDeleted, user]);

  return {
    calendarMonth,
    deleteAppointment,
    formValues,
    message,
    saveAppointment,
    selectedDate,
    setCalendarMonth,
    setFormValue,
    setMessage,
    setSelectedDate,
    setShowForm,
    showForm,
    toggleAppointmentCompleted,
  };
};
