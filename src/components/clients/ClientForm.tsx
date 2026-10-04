import { useEffect, useState, type KeyboardEvent } from 'react';
import {
  ArrowLeft,
  Bike,
  CalendarDays,
  Check,
  CreditCard,
  Droplets,
  FileText,
  Phone,
  Plus,
  RefreshCw,
  RotateCw,
  UserRound,
  Wrench,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { DateInput } from '../DateInput';
import type { Client } from '../../types';
import { isOilChangeService } from '../../lib/serviceTypes';
import { parseBrazilianCurrency } from '../../lib/money';
import { clearLocalDraft, loadLocalDraft, saveLocalDraft } from '../../services/localDrafts';

export type ClientFormValues = Partial<Client> & {
  serviceType: string;
  serviceValue: number;
  statusPagamento: 'Pago' | 'Pendente';
  valorPago: number;
  notes: string;
};

type ClientFormProps = {
  editingClient: Client | null;
  isNewService: boolean;
  clientNameInput: string;
  clientSuggestions: Client[];
  serviceType: string;
  serviceTypeOptions: string[];
  oilTypes: string[];
  isSaving: boolean;
  onBack: () => void;
  onBackToHome: () => void;
  onClientNameChange: (value: string) => void;
  onSelectClientSuggestion: (client: Client) => void;
  onServiceTypeChange: (value: string) => void;
  onAddCustomOilType: (oilType: string) => Promise<string | null>;
  onSave: (values: ClientFormValues) => Promise<boolean> | boolean;
  draftStorageKey?: string;
};

type ClientLocalDraft = {
  name: string;
  bikeModel: string;
  contact: string;
  oilType: string;
  oilPrice: string;
  serviceType: string;
  serviceValue: string;
  statusPagamento: 'Pago' | 'Pendente';
  recurrenceDays: number;
  lastMaintenanceDate: string;
  notes: string;
  isRecurringRevenue: boolean;
};

const formatPhoneInput = (value: string) => {
  const numeric = value.replace(/\D/g, '');
  if (numeric.length > 7) {
    return `(${numeric.slice(0, 2)}) ${numeric.slice(2, 7)}-${numeric.slice(7, 11)}`;
  }

  if (numeric.length > 2) {
    return `(${numeric.slice(0, 2)}) ${numeric.slice(2)}`;
  }

  return numeric;
};

const parseMoneyInput = (value: FormDataEntryValue | null) => {
  return parseBrazilianCurrency(value);
};

const normalizePaymentStatus = (value?: string | null): 'Pago' | 'Pendente' =>
  value === 'Pago' ? 'Pago' : 'Pendente';

export const ClientForm = ({
  editingClient,
  isNewService,
  clientNameInput,
  clientSuggestions,
  serviceType,
  serviceTypeOptions,
  oilTypes,
  isSaving,
  onBack,
  onBackToHome,
  onClientNameChange,
  onSelectClientSuggestion,
  onServiceTypeChange,
  onAddCustomOilType,
  onSave,
  draftStorageKey,
}: ClientFormProps) => {
  const isOilChange = isOilChangeService(serviceType);
  const defaultOilType = editingClient?.oilType || oilTypes[0] || '10W30';
  const initialServiceDate = !isNewService && editingClient?.lastMaintenanceDate
    ? format(parseISO(editingClient.lastMaintenanceDate), 'yyyy-MM-dd')
    : format(new Date(), 'yyyy-MM-dd');
  const [serviceDate, setServiceDate] = useState(initialServiceDate);
  const [recurrenceDays, setRecurrenceDays] = useState(editingClient?.recurrenceDays || 29);
  const [isRecurringRevenue, setIsRecurringRevenue] = useState(editingClient?.isRecurringRevenue ?? true);
  const [isSuggestionOpen, setIsSuggestionOpen] = useState(false);
  const [selectedOilType, setSelectedOilType] = useState(defaultOilType);
  const [isAddingOilType, setIsAddingOilType] = useState(false);
  const [newOilType, setNewOilType] = useState('');
  const [isSavingOilType, setIsSavingOilType] = useState(false);
  const [localDraft, setLocalDraft] = useState<ClientLocalDraft | null>(null);
  const [isDraftHydrated, setIsDraftHydrated] = useState(false);

  const saveCustomOilType = async () => {
    if (isSavingOilType || !newOilType.trim()) return;
    setIsSavingOilType(true);
    try {
      const savedOilType = await onAddCustomOilType(newOilType);
      if (savedOilType) {
        setSelectedOilType(savedOilType);
        setNewOilType('');
        setIsAddingOilType(false);
      }
    } finally {
      setIsSavingOilType(false);
    }
  };

  const handleOilTypeKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    void saveCustomOilType();
  };

  useEffect(() => {
    if (!draftStorageKey || editingClient) {
      setLocalDraft(null);
      setIsDraftHydrated(true);
      return;
    }

    const draft = loadLocalDraft<ClientLocalDraft>(draftStorageKey);
    if (draft?.data) {
      setLocalDraft(draft.data);
      setSelectedOilType(draft.data.oilType || defaultOilType);
      onClientNameChange(draft.data.name || '');
      if (draft.data.serviceType) onServiceTypeChange(draft.data.serviceType);
      setServiceDate(draft.data.lastMaintenanceDate || initialServiceDate);
      setRecurrenceDays(draft.data.recurrenceDays || 29);
      setIsRecurringRevenue(draft.data.isRecurringRevenue ?? true);
    }
    setIsDraftHydrated(true);
  }, [draftStorageKey, editingClient?.id]);

  const persistFormDraft = (form: HTMLFormElement) => {
    if (!draftStorageKey || editingClient || !isDraftHydrated) return;
    const formData = new FormData(form);
    const draft: ClientLocalDraft = {
      name: String(formData.get('name') || ''),
      bikeModel: String(formData.get('bikeModel') || ''),
      contact: String(formData.get('contact') || ''),
      oilType: String(formData.get('oilType') || ''),
      oilPrice: String(formData.get('oilPrice') || ''),
      serviceType,
      serviceValue: String(formData.get('serviceValue') || ''),
      statusPagamento: normalizePaymentStatus(String(formData.get('statusPagamento') || 'Pago')),
      recurrenceDays,
      lastMaintenanceDate: serviceDate,
      notes: String(formData.get('notes') || ''),
      isRecurringRevenue,
    };
    const hasContent = Boolean(draft.name.trim() || draft.bikeModel.trim() || draft.contact.trim() || draft.notes.trim());
    if (!hasContent) {
      clearLocalDraft(draftStorageKey);
      return;
    }
    saveLocalDraft(draftStorageKey, 'Cliente/servico em andamento', 'clients', draft);
  };

  useEffect(() => {
    setServiceDate(initialServiceDate);
    setRecurrenceDays(editingClient?.recurrenceDays || 29);
    setIsRecurringRevenue(editingClient?.isRecurringRevenue ?? true);
  }, [editingClient?.id, initialServiceDate, isNewService]);

  useEffect(() => {
    if (editingClient) setSelectedOilType(editingClient.oilType || defaultOilType);
  }, [defaultOilType, editingClient?.id, editingClient?.oilType]);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 pb-28">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onBackToHome}
          aria-label="Voltar"
          className="mt-1 rounded-xl p-2 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <p className="text-xs font-medium text-slate-400">Clientes <span className="px-1 text-slate-600">›</span> {editingClient ? 'Editar Cliente' : 'Serviço'}</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-white">
            {isNewService ? 'Administrar Serviço' : editingClient ? 'Editar Cliente' : 'Registrar Serviço'}
          </h2>
          <p className="mt-1 text-sm text-slate-400">Atualize as informações do cliente e do serviço.</p>
        </div>
      </div>

      <form
        key={`${editingClient?.id || 'new-service'}-${isDraftHydrated ? 'hydrated' : 'loading'}`}
        onInput={(event) => persistFormDraft(event.currentTarget)}
        onSubmit={async (event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          const selectedDate = formData.get('lastMaintenanceDate') as string;
          const oilTypeVal = isOilChange
            ? ((formData.get('oilType') as string) || defaultOilType)
            : 'N/A';
          const serviceValue = parseMoneyInput(formData.get('serviceValue'));
          const statusPagamento = normalizePaymentStatus(String(formData.get('statusPagamento') || 'Pago'));

          const saved = await onSave({
            name: formData.get('name') as string,
            bikeModel: formData.get('bikeModel') as string,
            contact: formData.get('contact') as string,
            oilType: oilTypeVal,
            oilPrice: parseMoneyInput(formData.get('oilPrice')),
            serviceType,
            serviceValue,
            statusPagamento,
            valorPago: statusPagamento === 'Pago' ? serviceValue : 0,
            isRecurringRevenue: formData.get('isRecurringRevenue') === 'on',
            recurrenceDays: parseInt(formData.get('recurrenceDays') as string, 10) || 29,
            lastMaintenanceDate: selectedDate ? `${selectedDate}T12:00:00Z` : undefined,
            notes: formData.get('notes') as string,
          });
          if (saved && draftStorageKey) clearLocalDraft(draftStorageKey);
        }}
        className="rounded-2xl border border-slate-800 bg-[#0d1626] p-4 shadow-[0_16px_40px_rgba(0,0,0,0.18)] sm:p-6"
      >
        <section className="space-y-4">
          <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-orange-500/10 text-orange-500">
              <UserRound className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-slate-100">Dados do Cliente</h3>
              <p className="mt-0.5 text-xs text-slate-400">Informações principais do cliente.</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="relative space-y-1.5">
              <label htmlFor="service-client-name" className="text-[11px] font-semibold text-slate-400">Nome do cliente <span className="text-orange-500">*</span></label>
              <div className="relative">
                <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  id="service-client-name"
                  name="name"
                  value={clientNameInput || editingClient?.name || ''}
                  onChange={(event) => {
                    setIsSuggestionOpen(true);
                    onClientNameChange(event.target.value);
                  }}
                  onFocus={() => setIsSuggestionOpen(true)}
                  onBlur={() => {
                    window.setTimeout(() => setIsSuggestionOpen(false), 120);
                  }}
                  required
                  placeholder="Ex: Joao Silva (digitar para sugestoes)"
                  className="w-full rounded-lg border border-slate-800 bg-[#08111f] py-2.5 pl-10 pr-3 text-sm text-slate-100 outline-none transition focus:border-orange-500/60 focus:ring-2 focus:ring-orange-500/10"
                />
              </div>
              {isSuggestionOpen && clientSuggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 shadow-xl">
                  {clientSuggestions.map((suggestion) => (
                    <button
                      key={suggestion.id}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setIsSuggestionOpen(false);
                        onSelectClientSuggestion(suggestion);
                      }}
                      className="w-full border-b border-slate-700/50 px-3 py-2 text-left text-xs transition last:border-0 hover:bg-slate-800"
                    >
                      <span className="block font-semibold text-white">{suggestion.name}</span>
                      <span className="text-[10px] text-slate-400">{suggestion.bikeModel} - {suggestion.contact}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="service-client-contact" className="text-[11px] font-semibold text-slate-400">WhatsApp <span className="text-orange-500">*</span></label>
              <div className="relative">
                <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  id="service-client-contact"
                  name="contact"
                  defaultValue={editingClient?.contact ?? localDraft?.contact ?? ''}
                  required
                  placeholder="Ex: (69) 99999-9999"
                  onChange={(event) => {
                    event.currentTarget.value = formatPhoneInput(event.currentTarget.value);
                  }}
                  className="w-full rounded-lg border border-slate-800 bg-[#08111f] py-2.5 pl-10 pr-3 text-sm text-slate-100 outline-none transition focus:border-orange-500/60 focus:ring-2 focus:ring-orange-500/10"
                />
              </div>
            </div>
          </div>
        </section>

        <section className="mt-5 space-y-4 border-t border-slate-800 pt-5">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-orange-500/10 text-orange-500">
              <Bike className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-slate-100">Informações da Moto</h3>
              <p className="mt-0.5 text-xs text-slate-400">Identifique o veículo e o tipo de serviço.</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="service-bike-model" className="text-[11px] font-semibold text-slate-400">Modelo da moto <span className="text-orange-500">*</span></label>
              <div className="relative">
                <Bike className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  id="service-bike-model"
                  name="bikeModel"
                  defaultValue={editingClient?.bikeModel ?? localDraft?.bikeModel ?? ''}
                  required
                  placeholder="Ex: Honda CG 160"
                  className="w-full rounded-lg border border-slate-800 bg-[#08111f] py-2.5 pl-10 pr-3 text-sm text-slate-100 outline-none transition focus:border-orange-500/60 focus:ring-2 focus:ring-orange-500/10"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="service-type" className="text-[11px] font-semibold text-slate-400">Tipo de serviço <span className="text-orange-500">*</span></label>
              <div className="relative">
                <Wrench className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <select
                  id="service-type"
                  value={serviceType}
                  onChange={(event) => onServiceTypeChange(event.target.value)}
                  className="w-full appearance-none rounded-lg border border-slate-800 bg-[#08111f] py-2.5 pl-10 pr-9 text-sm text-slate-100 outline-none transition focus:border-orange-500/60 focus:ring-2 focus:ring-orange-500/10"
                >
                  {serviceTypeOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
              <p className="text-[10px] text-slate-500">Em Histórico, use o filtro Serviço para listar por categoria.</p>
            </div>
          </div>
        </section>

        <section className="mt-5 space-y-4 border-t border-slate-800 pt-5">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-orange-500/10 text-orange-500">
              <Droplets className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-slate-100">Óleo / Itens</h3>
              <p className="mt-0.5 text-xs text-slate-400">Valor do serviço e estado do pagamento.</p>
            </div>
          </div>

          <div className={`grid gap-4 ${isOilChange ? 'sm:grid-cols-2 xl:grid-cols-3' : 'sm:grid-cols-2'}`}>
            {isOilChange && (
              <div className="space-y-1.5">
                <label htmlFor="service-oil-type" className="text-[11px] font-semibold text-slate-400">Marca / tipo de óleo</label>
                <div className="flex gap-2">
                  <select
                    id="service-oil-type"
                    name="oilType"
                    required
                    value={selectedOilType}
                    onChange={(event) => setSelectedOilType(event.target.value)}
                    className="min-w-0 flex-1 rounded-lg border border-slate-800 bg-[#08111f] px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-orange-500/60 focus:ring-2 focus:ring-orange-500/10"
                  >
                    {oilTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                  </select>
                  <button
                    type="button"
                    onClick={() => setIsAddingOilType((isOpen) => !isOpen)}
                    title="Adicionar tipo de óleo"
                    aria-label="Adicionar tipo de óleo"
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-slate-700 bg-slate-800 text-slate-200 transition hover:border-orange-500/50 hover:text-orange-400"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                {isAddingOilType && (
                  <div className="flex gap-2" role="group" aria-label="Novo tipo de óleo">
                    <input
                      autoFocus
                      value={newOilType}
                      onChange={(event) => setNewOilType(event.target.value)}
                      onKeyDown={handleOilTypeKeyDown}
                      placeholder="Marca ou tipo de óleo"
                      aria-label="Marca ou tipo de óleo"
                      className="min-w-0 flex-1 rounded-lg border border-slate-800 bg-[#08111f] px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-orange-500/60"
                    />
                    <button
                      type="button"
                      onClick={() => void saveCustomOilType()}
                      disabled={isSavingOilType || !newOilType.trim()}
                      className="rounded-lg bg-orange-600 px-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isSavingOilType ? 'Salvando...' : 'Salvar'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingOilType(false);
                        setNewOilType('');
                      }}
                      disabled={isSavingOilType}
                      className="rounded-lg border border-slate-700 px-3 text-sm text-slate-300 disabled:opacity-50"
                    >
                      Cancelar
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="service-value" className="text-[11px] font-semibold text-slate-400">Valor do serviço (R$) <span className="text-orange-500">*</span></label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">R$</span>
                <input
                  id="service-value"
                  name="serviceValue"
                  type="number"
                  step="0.01"
                  defaultValue={editingClient?.serviceValue ?? editingClient?.lastServiceValue ?? localDraft?.serviceValue ?? 0}
                  required
                  className="w-full rounded-lg border border-slate-800 bg-[#08111f] py-2.5 pl-10 pr-3 text-sm text-slate-100 outline-none transition focus:border-orange-500/60 focus:ring-2 focus:ring-orange-500/10"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="service-payment-status" className="text-[11px] font-semibold text-slate-400">Status do pagamento</label>
              <div className="relative">
                <CreditCard className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <select
                  id="service-payment-status"
                  name="statusPagamento"
                  defaultValue={normalizePaymentStatus(editingClient?.statusPagamento || localDraft?.statusPagamento || 'Pago')}
                  className="w-full appearance-none rounded-lg border border-slate-800 bg-[#08111f] py-2.5 pl-10 pr-9 text-sm text-slate-100 outline-none transition focus:border-orange-500/60 focus:ring-2 focus:ring-orange-500/10"
                >
                  <option value="Pago">Pago</option>
                  <option value="Pendente">Pendente</option>
                </select>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-5 space-y-4 border-t border-slate-800 pt-5">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-orange-500/10 text-orange-500">
              <CalendarDays className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-slate-100">Agendamento e Recorrência</h3>
              <p className="mt-0.5 text-xs text-slate-400">Data do serviço e lembretes automáticos.</p>
            </div>
          </div>

          <div className="grid items-end gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <div className="space-y-1.5">
              <label htmlFor="service-date" className="text-[11px] font-semibold text-slate-400">Data do serviço <span className="text-orange-500">*</span></label>
              <div className="relative">
                <CalendarDays className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <DateInput
                  id="service-date"
                  name="lastMaintenanceDate"
                  value={serviceDate}
                  onChange={setServiceDate}
                  required
                  className="w-full rounded-lg border border-slate-800 bg-[#08111f] py-2.5 pl-10 pr-3 text-sm text-slate-100 outline-none focus:border-orange-500/60 focus:ring-2 focus:ring-orange-500/10"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="service-recurrence" className="text-[11px] font-semibold text-slate-400">Recorrência (dias) <span className="text-orange-500">*</span></label>
              <div className="relative">
                <RotateCw className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  id="service-recurrence"
                  name="recurrenceDays"
                  type="number"
                  value={recurrenceDays}
                  onChange={(event) => setRecurrenceDays(parseInt(event.target.value, 10) || 29)}
                  required
                  className="w-full rounded-lg border border-slate-800 bg-[#08111f] py-2.5 pl-10 pr-3 text-sm text-slate-100 outline-none transition focus:border-orange-500/60 focus:ring-2 focus:ring-orange-500/10"
                />
              </div>
            </div>

            <label className="flex min-h-10 items-center gap-3 rounded-lg border border-slate-800 bg-[#08111f] px-3 py-2.5 text-sm font-medium text-slate-200">
              <input
                name="isRecurringRevenue"
                type="checkbox"
                checked={isRecurringRevenue}
                onChange={(event) => setIsRecurringRevenue(event.target.checked)}
                className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-orange-600 focus:ring-orange-500"
              />
              Recorrente
            </label>
          </div>
        </section>

        <section className="mt-5 space-y-4 border-t border-slate-800 pt-5">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-orange-500/10 text-orange-500">
              <FileText className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-slate-100">Observações</h3>
              <p className="mt-0.5 text-xs text-slate-400">Detalhes adicionais sobre o serviço.</p>
            </div>
          </div>
          <textarea
            name="notes"
            defaultValue={editingClient?.lastServiceNotes || localDraft?.notes || ''}
            placeholder="Detalhes adicionais do serviço..."
            className="min-h-[84px] w-full rounded-lg border border-slate-800 bg-[#08111f] px-3 py-2.5 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-orange-500/60 focus:ring-2 focus:ring-orange-500/10"
          />
        </section>

        <div className="sticky bottom-2 mt-5 flex flex-col-reverse gap-3 rounded-xl border border-slate-800 bg-[#111c2e]/95 p-3 shadow-xl backdrop-blur sm:flex-row sm:justify-between sm:px-4">
          <button
            type="button"
            onClick={onBack}
            className="w-full rounded-lg bg-slate-800 px-6 py-3 text-sm font-bold text-slate-200 transition-colors hover:bg-slate-700 sm:w-auto"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-orange-600 px-8 py-3 text-sm font-bold text-white shadow-lg shadow-orange-950/30 transition-colors hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:min-w-64"
          >
            {isSaving ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                {isNewService ? 'Registrar Serviço' : editingClient ? 'Salvar Alterações' : 'Registrar Serviço'}
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
