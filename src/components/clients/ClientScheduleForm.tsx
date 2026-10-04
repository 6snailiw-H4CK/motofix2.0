import {
  ArrowLeft,
  Bike,
  CalendarDays,
  Check,
  FileText,
  Gauge,
  IdCard,
  Mail,
  Phone,
  RefreshCw,
  UserRound,
  Wrench,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { safeFormat } from '../../lib/utils';
import { clearLocalDraft, loadLocalDraft, saveLocalDraft } from '../../services/localDrafts';
import type { Client, MaintenanceRecord } from '../../types';

export type ClientScheduleFormValues = {
  name: string;
  bikeModel: string;
  contact: string;
  email: string;
  vehiclePlate: string;
  mileageKm?: number;
  notes: string;
  _scheduleProfile: true;
};

type ClientScheduleFormProps = {
  editingClient: Client | null;
  historyRows: MaintenanceRecord[];
  isSaving: boolean;
  onBack: () => void;
  onSave: (values: ClientScheduleFormValues) => Promise<boolean> | boolean;
  onAfterSubmit: () => void;
  draftStorageKey?: string;
};

type ClientScheduleLocalDraft = Omit<ClientScheduleFormValues, '_scheduleProfile' | 'mileageKm'> & {
  mileageKm: string;
};

export const ClientScheduleForm = ({
  editingClient,
  historyRows,
  isSaving,
  onBack,
  onSave,
  onAfterSubmit,
  draftStorageKey,
}: ClientScheduleFormProps) => {
  const [localDraft, setLocalDraft] = useState<ClientScheduleLocalDraft | null>(() => (
    draftStorageKey && !editingClient
      ? loadLocalDraft<ClientScheduleLocalDraft>(draftStorageKey)?.data || null
      : null
  ));

  useEffect(() => {
    if (!draftStorageKey || editingClient) {
      setLocalDraft(null);
      return;
    }

    const draft = loadLocalDraft<ClientScheduleLocalDraft>(draftStorageKey);
    setLocalDraft(draft?.data || null);
  }, [draftStorageKey, editingClient]);

  const persistFormDraft = (form: HTMLFormElement) => {
    if (!draftStorageKey || editingClient) return;
    const formData = new FormData(form);
    const draft: ClientScheduleLocalDraft = {
      name: String(formData.get('name') || ''),
      bikeModel: String(formData.get('bikeModel') || ''),
      contact: String(formData.get('contact') || ''),
      email: String(formData.get('email') || ''),
      vehiclePlate: String(formData.get('vehiclePlate') || ''),
      mileageKm: String(formData.get('mileageKm') || ''),
      notes: String(formData.get('notes') || ''),
    };

    const hasContent = Boolean(draft.name.trim() || draft.bikeModel.trim() || draft.contact.trim() || draft.notes.trim());
    if (!hasContent) {
      clearLocalDraft(draftStorageKey);
      return;
    }

    saveLocalDraft(draftStorageKey, 'Cliente/moto em andamento', 'clients', draft);
  };

  const latestService = historyRows[0];
  const clientInitials = editingClient?.name
    ?.split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'NC';

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 pb-28">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Voltar para clientes"
          className="mt-1 rounded-xl p-2 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <p className="text-xs font-medium text-slate-400">Clientes <span className="px-1 text-slate-600">›</span> {editingClient ? 'Editar Cliente' : 'Novo Cliente'}</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-white">{editingClient ? 'Editar Cliente' : 'Novo Cliente'}</h2>
          <p className="mt-1 text-sm text-slate-400">Atualize os dados de contato e as informações do veículo.</p>
        </div>
      </div>

      <form
        key={editingClient?.id || `schedule-new-${localDraft ? 'draft' : 'empty'}`}
        onInput={(event) => persistFormDraft(event.currentTarget)}
        onSubmit={async (event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          const kmRaw = ((formData.get('mileageKm') as string) || '').replace(/\D/g, '');
          const mileageKmParsed = kmRaw ? parseInt(kmRaw, 10) : NaN;

          const saved = await onSave({
            name: formData.get('name') as string,
            bikeModel: formData.get('bikeModel') as string,
            contact: formData.get('contact') as string,
            email: (formData.get('email') as string) || '',
            vehiclePlate: (formData.get('vehiclePlate') as string) || '',
            mileageKm: Number.isFinite(mileageKmParsed) ? mileageKmParsed : undefined,
            notes: formData.get('notes') as string,
            _scheduleProfile: true,
          });
          if (saved) {
            if (draftStorageKey) clearLocalDraft(draftStorageKey);
            onAfterSubmit();
          }
        }}
        className="space-y-4"
      >
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-4 rounded-2xl border border-slate-800 bg-[#0d1626] p-4 shadow-[0_16px_40px_rgba(0,0,0,0.18)] sm:p-6">
            <section className="space-y-4">
              <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-orange-500/10 text-orange-500">
                  <UserRound className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-slate-100">Dados do Cliente</h3>
                  <p className="mt-0.5 text-xs text-slate-400">Informações principais e contato.</p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="client-name" className="text-[11px] font-semibold text-slate-400">Nome do cliente <span className="text-orange-500">*</span></label>
                  <div className="relative">
                    <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    <input
                      id="client-name"
                      name="name"
                      defaultValue={editingClient?.name || localDraft?.name || ''}
                      required
                      placeholder="Ex: Joao Silva"
                      className="w-full rounded-lg border border-slate-800 bg-[#08111f] py-2.5 pl-10 pr-3 text-sm text-slate-100 outline-none transition focus:border-orange-500/60 focus:ring-2 focus:ring-orange-500/10"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="client-contact" className="text-[11px] font-semibold text-slate-400">WhatsApp <span className="text-orange-500">*</span></label>
                  <div className="relative">
                    <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    <input
                      id="client-contact"
                      name="contact"
                      defaultValue={editingClient?.contact || localDraft?.contact || ''}
                      required
                      placeholder="(69) 99999-9999"
                      className="w-full rounded-lg border border-slate-800 bg-[#08111f] py-2.5 pl-10 pr-3 text-sm text-slate-100 outline-none transition focus:border-orange-500/60 focus:ring-2 focus:ring-orange-500/10"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="client-email" className="text-[11px] font-semibold text-slate-400">E-mail <span className="text-slate-500">(opcional)</span></label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    <input
                      id="client-email"
                      name="email"
                      type="email"
                      defaultValue={editingClient?.email || localDraft?.email || ''}
                      placeholder="cliente@email.com"
                      className="w-full rounded-lg border border-slate-800 bg-[#08111f] py-2.5 pl-10 pr-3 text-sm text-slate-100 outline-none transition focus:border-orange-500/60 focus:ring-2 focus:ring-orange-500/10"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="client-notes" className="text-[11px] font-semibold text-slate-400">Observações <span className="text-slate-500">(opcional)</span></label>
                  <div className="relative">
                    <FileText className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-500" />
                    <textarea
                      id="client-notes"
                      name="notes"
                      defaultValue={editingClient?.lastServiceNotes || localDraft?.notes || ''}
                      placeholder="Preferências, restrições, histórico relevante..."
                      className="min-h-[82px] w-full rounded-lg border border-slate-800 bg-[#08111f] py-2.5 pl-10 pr-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-orange-500/60 focus:ring-2 focus:ring-orange-500/10"
                    />
                  </div>
                </div>
              </div>
            </section>

            <section className="space-y-4 border-t border-slate-800 pt-5">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-orange-500/10 text-orange-500">
                  <Bike className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-slate-100">Veículo</h3>
                  <p className="mt-0.5 text-xs text-slate-400">Dados da moto do cliente.</p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <div className="space-y-1.5">
                  <label htmlFor="client-bike" className="text-[11px] font-semibold text-slate-400">Modelo da moto <span className="text-orange-500">*</span></label>
                  <div className="relative">
                    <Bike className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    <input
                      id="client-bike"
                      name="bikeModel"
                      defaultValue={editingClient?.bikeModel || localDraft?.bikeModel || ''}
                      required
                      placeholder="Ex: Honda CG 160"
                      className="w-full rounded-lg border border-slate-800 bg-[#08111f] py-2.5 pl-10 pr-3 text-sm text-slate-100 outline-none transition focus:border-orange-500/60 focus:ring-2 focus:ring-orange-500/10"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="client-plate" className="text-[11px] font-semibold text-slate-400">Placa <span className="text-slate-500">(opcional)</span></label>
                  <div className="relative">
                    <IdCard className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    <input
                      id="client-plate"
                      name="vehiclePlate"
                      defaultValue={editingClient?.vehiclePlate || localDraft?.vehiclePlate || ''}
                      placeholder="ABC1D23"
                      maxLength={8}
                      className="w-full rounded-lg border border-slate-800 bg-[#08111f] py-2.5 pl-10 pr-3 text-sm uppercase text-slate-100 outline-none transition focus:border-orange-500/60 focus:ring-2 focus:ring-orange-500/10"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="client-mileage" className="text-[11px] font-semibold text-slate-400">Quilometragem <span className="text-slate-500">(opcional)</span></label>
                  <div className="relative">
                    <Gauge className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    <input
                      id="client-mileage"
                      name="mileageKm"
                      type="number"
                      min={0}
                      defaultValue={editingClient?.mileageKm !== undefined ? String(editingClient.mileageKm) : localDraft?.mileageKm || ''}
                      placeholder="Ex: 12500"
                      className="w-full rounded-lg border border-slate-800 bg-[#08111f] py-2.5 pl-10 pr-3 text-sm text-slate-100 outline-none transition focus:border-orange-500/60 focus:ring-2 focus:ring-orange-500/10"
                    />
                  </div>
                </div>
              </div>
            </section>

            {editingClient && historyRows.length > 0 && (
              <section className="space-y-3 border-t border-slate-800 pt-5">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-orange-500/10 text-orange-500">
                    <Wrench className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="text-sm font-bold text-slate-100">Histórico de serviços</h3>
                    <p className="mt-0.5 text-xs text-slate-400">Registros anteriores deste cliente.</p>
                  </div>
                </div>
                <ul className="divide-y divide-slate-800 overflow-hidden rounded-xl border border-slate-800">
                  {historyRows.map((maintenance) => (
                    <li key={maintenance.id} className="flex flex-col gap-1 bg-[#08111f]/60 px-3 py-3 text-xs sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <span className="font-semibold text-slate-200">{maintenance.serviceType}</span>
                        <span className="ml-2 text-slate-500">{safeFormat(maintenance.date, 'dd/MM/yyyy')}</span>
                      </div>
                      <div className="flex flex-wrap gap-x-3 text-slate-400">
                        <span>R$ {(Number(maintenance.serviceValue) || 0).toFixed(2)}</span>
                        <span>{maintenance.statusPagamento || '-'}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          <aside className="space-y-4 lg:sticky lg:top-4">
            <section className="rounded-2xl border border-slate-800 bg-[#0d1626] p-4 shadow-[0_16px_40px_rgba(0,0,0,0.18)] sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-orange-500">
                  <UserRound className="h-4 w-4" />
                  <h3 className="text-sm font-bold text-slate-100">Resumo do Cliente</h3>
                </div>
                {editingClient && (
                  <span className="rounded-full bg-slate-800 px-2.5 py-1 text-[10px] font-semibold text-slate-300">
                    ID: #{editingClient.id.slice(-4)}
                  </span>
                )}
              </div>

              <div className="mt-5 flex items-center gap-3">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-blue-500/70 text-base font-bold text-white">
                  {clientInitials}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-white">{editingClient?.name || 'Novo cliente'}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
                    <Phone className="h-3.5 w-3.5" />
                    {editingClient?.contact || 'WhatsApp não informado'}
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-2 border-b border-slate-800 pb-4 text-xs text-slate-400">
                <p className="flex items-center gap-2">
                  <Bike className="h-3.5 w-3.5 text-slate-500" />
                  {editingClient?.bikeModel || 'Moto não informada'}
                  {editingClient?.vehiclePlate ? ` · ${editingClient.vehiclePlate}` : ''}
                </p>
                <p className="flex items-center gap-2">
                  <CalendarDays className="h-3.5 w-3.5 text-slate-500" />
                  Cliente desde {editingClient?.createdAt ? safeFormat(editingClient.createdAt, 'dd/MM/yyyy') : 'cadastro novo'}
                </p>
              </div>

              <div className="space-y-4 pt-4">
                <div className="flex gap-3">
                  <span className="mt-0.5 text-orange-500"><Wrench className="h-4 w-4" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-100">Último serviço</p>
                    <div className="mt-2 flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs text-slate-300">{latestService?.serviceType || editingClient?.lastServiceType || 'Nenhum serviço registrado'}</p>
                        {(latestService?.oilType || editingClient?.oilType) && (
                          <p className="mt-1 text-[11px] text-slate-500">{latestService?.oilType || editingClient?.oilType} · {editingClient?.bikeModel}</p>
                        )}
                      </div>
                      {(latestService?.date || editingClient?.lastMaintenanceDate) && (
                        <p className="shrink-0 text-xs font-semibold text-slate-300">
                          {safeFormat(latestService?.date || editingClient?.lastMaintenanceDate, 'dd/MM/yyyy')}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 border-t border-slate-800 pt-4">
                  <span className="mt-0.5 text-orange-500"><CalendarDays className="h-4 w-4" /></span>
                  <div>
                    <p className="text-xs font-bold text-slate-100">Próximo serviço previsto</p>
                    <p className="mt-2 text-sm font-semibold text-slate-200">
                      {editingClient?.nextMaintenanceDate ? safeFormat(editingClient.nextMaintenanceDate, 'dd/MM/yyyy') : 'Será calculado após o primeiro serviço'}
                    </p>
                  </div>
                </div>
              </div>

              {editingClient && (
                <div className="mt-5 flex gap-2 rounded-xl border border-orange-500/15 bg-orange-500/10 p-3 text-xs leading-relaxed text-orange-100/80">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-orange-400" />
                  <p>
                    {editingClient.isRecurringRevenue === false
                      ? 'Este cliente não está marcado para lembretes recorrentes.'
                      : `Este cliente está configurado para lembretes a cada ${editingClient.recurrenceDays || 29} dias.`}
                  </p>
                </div>
              )}
            </section>
          </aside>
        </div>

        <div className="sticky bottom-2 z-10 flex flex-col-reverse gap-3 rounded-2xl border border-slate-800 bg-[#0d1626]/95 p-3 shadow-xl backdrop-blur sm:flex-row sm:justify-between sm:px-4">
          <button
            type="button"
            onClick={onBack}
            className="w-full rounded-xl bg-slate-800 px-6 py-3 text-sm font-bold text-slate-200 transition-colors hover:bg-slate-700 sm:w-auto"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-600 px-8 py-3 text-sm font-bold text-white shadow-lg shadow-orange-950/30 transition-colors hover:bg-orange-500 disabled:opacity-50 sm:w-auto sm:min-w-64"
          >
            {isSaving ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                {editingClient ? 'Salvar Alterações' : 'Cadastrar cliente'}
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
