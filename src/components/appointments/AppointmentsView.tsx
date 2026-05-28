import { addDays, addMonths, differenceInDays, endOfMonth, format, isSameDay, parseISO, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ArrowLeft } from 'lucide-react';
import { useMemo } from 'react';
import { cn } from '../../lib/utils';
import type { Appointment } from '../../types';

type AppointmentFormValues = {
  clientName: string;
  bikeModel: string;
  date: string;
  address: string;
  serviceRequested: string;
  value: string;
};

type AppointmentsViewProps = {
  appointments: Appointment[];
  calendarMonth: Date;
  selectedDate: string;
  showForm: boolean;
  message: string | null;
  formValues: AppointmentFormValues;
  deleteConfirmId?: string | null;
  onBack: () => void;
  onCalendarMonthChange: (date: Date) => void;
  onSelectedDateChange: (date: string) => void;
  onShowFormChange: (show: boolean) => void;
  onMessageChange: (message: string | null) => void;
  onFormValueChange: (field: keyof AppointmentFormValues, value: string) => void;
  onSaveAppointment: () => Promise<boolean>;
  onToggleAppointmentCompleted: (appointment: Appointment) => Promise<void> | void;
  onDeleteAppointmentClick: (appointment: Appointment) => void;
};

const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];

export const AppointmentsView = ({
  appointments,
  calendarMonth,
  selectedDate,
  showForm,
  message,
  formValues,
  deleteConfirmId,
  onBack,
  onCalendarMonthChange,
  onSelectedDateChange,
  onShowFormChange,
  onMessageChange,
  onFormValueChange,
  onSaveAppointment,
  onToggleAppointmentCompleted,
  onDeleteAppointmentClick,
}: AppointmentsViewProps) => {
  const appointmentsByDate = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    appointments.forEach((appointment) => {
      const key = appointment.scheduledDate.slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(appointment);
    });
    return map;
  }, [appointments]);

  const monthDays = useMemo(() => {
    const end = endOfMonth(calendarMonth);
    const totalDays = differenceInDays(end, calendarMonth) + 1;
    return Array.from({ length: totalDays }, (_, index) => addDays(calendarMonth, index));
  }, [calendarMonth]);

  const selectedDateAppointments = appointmentsByDate.get(selectedDate) || [];

  const selectDate = (date: string) => {
    onSelectedDateChange(date);
    onFormValueChange('date', date);
    onMessageChange(null);
    onShowFormChange(false);
  };

  const selectToday = () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    onSelectedDateChange(today);
    onFormValueChange('date', today);
    onShowFormChange(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button type="button" onClick={onBack} className="p-1.5 rounded-full hover:bg-slate-800 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h2 className="text-xl font-bold">Agendamentos</h2>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="bg-slate-800/40 p-4 rounded-2xl border border-slate-700/50">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-slate-500">Mes</p>
              <h3 className="text-lg font-bold">{format(calendarMonth, 'MMMM yyyy', { locale: ptBR })}</h3>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onCalendarMonthChange(subMonths(calendarMonth, 1))}
                className="rounded-full bg-slate-900/70 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-200 hover:bg-slate-900 transition"
              >
                Anterior
              </button>
              <button
                type="button"
                onClick={() => onCalendarMonthChange(addMonths(calendarMonth, 1))}
                className="rounded-full bg-slate-900/70 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-200 hover:bg-slate-900 transition"
              >
                Proximo
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-2 text-[10px] uppercase tracking-widest text-slate-500 mb-2">
            {weekDays.map((day) => (
              <div key={day} className="text-center">{day}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: calendarMonth.getDay() }, (_, index) => (
              <div key={`blank-${index}`} className="h-14 rounded-2xl" />
            ))}
            {monthDays.map((day) => {
              const key = format(day, 'yyyy-MM-dd');
              const hasAppointments = appointmentsByDate.has(key);
              const selected = key === selectedDate;
              const isToday = isSameDay(day, new Date());

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => selectDate(key)}
                  className={cn(
                    'h-14 rounded-2xl border p-2 text-left text-[12px] leading-tight transition-all',
                    selected ? 'border-emerald-500 bg-emerald-500/20 text-emerald-100 shadow-inner' : 'border-slate-700 bg-slate-900/60 text-slate-100',
                    hasAppointments && !selected ? 'bg-red-500/15 border-red-500/30 text-red-200' : '',
                    isToday ? 'ring-1 ring-primary' : ''
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold">{format(day, 'd')}</span>
                    {hasAppointments && (
                      <span className="text-[9px] font-bold uppercase tracking-[0.16em]">
                        {appointmentsByDate.get(key)?.length}x
                      </span>
                    )}
                  </div>
                  <div className="text-[9px] text-slate-400 mt-1">
                    {hasAppointments ? 'Servico' : 'Livre'}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap gap-2 text-[10px]">
            <span className="rounded-full bg-emerald-500/10 text-emerald-300 px-2 py-1">Livre</span>
            <span className="rounded-full bg-red-500/10 text-red-300 px-2 py-1">Com servico</span>
            <span className="rounded-full bg-primary/10 text-primary px-2 py-1">Selecionado</span>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-slate-800/40 p-4 rounded-2xl border border-slate-700/50">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-500">Data selecionada</p>
                <h3 className="text-lg font-bold">{format(parseISO(selectedDate), 'dd/MM/yyyy')}</h3>
              </div>
              <button
                type="button"
                onClick={selectToday}
                className="rounded-full bg-slate-900/70 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-200 hover:bg-slate-900 transition"
              >
                Hoje
              </button>
            </div>

            <div className="space-y-4">
              {!showForm ? (
                <button
                  type="button"
                  onClick={() => onShowFormChange(true)}
                  className="w-full bg-primary text-white rounded-xl py-3 text-sm font-bold uppercase tracking-widest hover:bg-primary/90 transition"
                >
                  Novo Agendamento
                </button>
              ) : (
                <form
                  onSubmit={async (event) => {
                    event.preventDefault();
                    await onSaveAppointment();
                  }}
                  className="space-y-4"
                >
                  <div className="grid grid-cols-1 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Cliente</label>
                      <input
                        value={formValues.clientName}
                        onChange={(event) => onFormValueChange('clientName', event.target.value)}
                        placeholder="Ex: Joao Silva"
                        className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-primary"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Moto</label>
                      <input
                        value={formValues.bikeModel}
                        onChange={(event) => onFormValueChange('bikeModel', event.target.value)}
                        placeholder="Ex: Honda CG 160"
                        className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-primary"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Data</label>
                      <input
                        type="date"
                        value={formValues.date}
                        onChange={(event) => onFormValueChange('date', event.target.value)}
                        className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-primary"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Servico</label>
                      <input
                        value={formValues.serviceRequested}
                        onChange={(event) => onFormValueChange('serviceRequested', event.target.value)}
                        placeholder="Ex: Troca de oleo"
                        className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-primary"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Valor</label>
                      <input
                        value={formValues.value}
                        onChange={(event) => onFormValueChange('value', event.target.value)}
                        placeholder="R$ 0,00"
                        inputMode="decimal"
                        className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Endereco</label>
                      <input
                        value={formValues.address}
                        onChange={(event) => onFormValueChange('address', event.target.value)}
                        placeholder="Endereco ou observacao"
                        className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  </div>

                  {message && (
                    <p className="text-[11px] text-slate-400">{message}</p>
                  )}

                  <div className="flex flex-col sm:flex-row gap-2">
                    <button
                      type="submit"
                      className="flex-1 bg-primary text-white rounded-xl py-3 text-sm font-bold uppercase tracking-widest hover:bg-primary/90 transition"
                    >
                      Salvar Agendamento
                    </button>
                    <button
                      type="button"
                      onClick={() => onShowFormChange(false)}
                      className="flex-1 bg-slate-700/50 text-slate-200 rounded-xl py-3 text-sm font-bold uppercase tracking-widest hover:bg-slate-700/70 transition"
                    >
                      Cancelar
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>

          <div className="bg-slate-800/40 p-4 rounded-2xl border border-slate-700/50">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div>
                <h3 className="text-sm font-bold">Agendamentos deste dia</h3>
                <p className="text-[10px] text-slate-500">{selectedDateAppointments.length} registro(s)</p>
              </div>
              <button
                type="button"
                onClick={selectToday}
                className="rounded-full bg-slate-900/70 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-200 hover:bg-slate-900 transition"
              >
                Hoje
              </button>
            </div>

            {selectedDateAppointments.length === 0 ? (
              <p className="text-slate-400 text-sm">Nenhum agendamento registrado para este dia.</p>
            ) : (
              <div className="space-y-2">
                {selectedDateAppointments.map((appointment) => (
                  <div
                    key={appointment.id}
                    className={cn(
                      'rounded-2xl border p-3',
                      appointment.completed ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-slate-700/60 bg-slate-900/70'
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p
                          className={cn(
                            'font-bold text-sm truncate',
                            appointment.completed ? 'line-through text-slate-500' : 'text-white'
                          )}
                        >
                          {appointment.clientName}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-1">{appointment.bikeModel} - {appointment.serviceRequested}</p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span className="text-[10px] text-slate-400">{appointment.scheduledDate}</span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => void onToggleAppointmentCompleted(appointment)}
                            disabled={appointment.completed}
                            className={cn(
                              'rounded-full px-3 py-2 text-[10px] font-bold uppercase tracking-widest transition',
                              appointment.completed
                                ? 'bg-slate-700 text-slate-300 cursor-not-allowed'
                                : 'bg-emerald-500 text-white hover:bg-emerald-600'
                            )}
                          >
                            {appointment.completed ? 'Concluido' : 'Marcar concluido'}
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteAppointmentClick(appointment)}
                            className={cn(
                              'rounded-full px-3 py-2 text-[10px] font-bold uppercase tracking-widest transition',
                              deleteConfirmId === appointment.id ? 'bg-red-500 text-white' : 'bg-red-500/10 text-red-500 hover:bg-red-500/20'
                            )}
                          >
                            {deleteConfirmId === appointment.id ? 'Confirmar' : 'Excluir'}
                          </button>
                        </div>
                      </div>
                    </div>
                    {appointment.address && <p className="text-[10px] text-slate-500 mt-3">{appointment.address}</p>}
                    {appointment.value ? (
                      <p className="text-[10px] text-slate-400 mt-1">
                        Valor: R$ {Number(appointment.value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
