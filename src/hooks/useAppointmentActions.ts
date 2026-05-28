import { format, startOfMonth } from 'date-fns';
import type { User } from 'firebase/auth';
import { useCallback, useMemo, useState } from 'react';
import { toast as sonnerToast } from 'sonner';
import { appointmentRepository } from '../services/appointmentRepository';
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
  }, []);

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
        value: value ? parseFloat(value.replace(',', '.')) : 0,
        createdAt: new Date().toISOString(),
        userId: user.uid,
        completed: false,
      });

      resetForm();
      setMessage('Agendamento salvo com sucesso!');
      sonnerToast.success('Agendamento salvo com sucesso!');
      window.setTimeout(() => setMessage(null), 2500);
      return true;
    } catch (error) {
      console.error('Erro ao salvar agendamento:', error);
      setMessage('Erro ao salvar agendamento. Tente novamente.');
      return false;
    }
  }, [address, bikeModel, clientName, date, resetForm, serviceRequested, user, value]);

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
      sonnerToast.success('Agendamento excluido com sucesso.');
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
