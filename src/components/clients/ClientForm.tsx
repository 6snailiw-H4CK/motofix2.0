import { useEffect, useState } from 'react';
import { ArrowLeft, Plus, RefreshCw } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import type { Client } from '../../types';
import { isOilChangeService } from '../../lib/serviceTypes';

export type ClientFormValues = Partial<Client> & {
  serviceType: string;
  serviceValue: number;
  statusPagamento: 'Pago' | 'Pendente' | 'Parcial';
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
  onClientNameChange: (value: string) => void;
  onSelectClientSuggestion: (client: Client) => void;
  onServiceTypeChange: (value: string) => void;
  onAddCustomServiceType: () => Promise<void> | void;
  onSave: (values: ClientFormValues) => Promise<void> | void;
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
  const normalized = String(value || '').trim().replace(',', '.');
  const parsed = parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

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
  onClientNameChange,
  onSelectClientSuggestion,
  onServiceTypeChange,
  onAddCustomServiceType,
  onSave,
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

  useEffect(() => {
    setServiceDate(initialServiceDate);
    setRecurrenceDays(editingClient?.recurrenceDays || 29);
    setIsRecurringRevenue(editingClient?.isRecurringRevenue ?? true);
  }, [editingClient?.id, initialServiceDate, isNewService]);

  return (
    <div className="mx-auto max-w-xl space-y-4 lg:max-w-4xl xl:max-w-5xl">
      <div className="flex items-center gap-3">
        <button type="button" onClick={onBack} className="p-1.5 rounded-full hover:bg-slate-800 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-xl font-bold">
          {isNewService ? 'Registrar Servico' : editingClient ? 'Editar Cliente' : 'Registrar Servico'}
        </h2>
      </div>

      <form
        key={editingClient?.id || 'new-service'}
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          const selectedDate = formData.get('lastMaintenanceDate') as string;
          const oilTypeVal = isOilChange
            ? ((formData.get('oilType') as string) || defaultOilType)
            : 'N/A';

          void onSave({
            name: formData.get('name') as string,
            bikeModel: formData.get('bikeModel') as string,
            contact: formData.get('contact') as string,
            oilType: oilTypeVal,
            oilPrice: parseMoneyInput(formData.get('oilPrice')),
            serviceType,
            serviceValue: parseMoneyInput(formData.get('serviceValue')),
            statusPagamento: (formData.get('statusPagamento') as 'Pago' | 'Pendente' | 'Parcial') || 'Pago',
            valorPago: parseMoneyInput(formData.get('valorPago')),
            isRecurringRevenue: formData.get('isRecurringRevenue') === 'on',
            recurrenceDays: parseInt(formData.get('recurrenceDays') as string, 10) || 29,
            lastMaintenanceDate: selectedDate ? `${selectedDate}T12:00:00Z` : undefined,
            notes: formData.get('notes') as string,
          });
        }}
        className="space-y-5 rounded-2xl border border-slate-700/50 bg-slate-800/40 p-5 lg:p-6"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="relative space-y-1.5 xl:col-span-2">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Nome do Cliente</label>
            <input
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
              className="w-full bg-slate-900/50 border-slate-700 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none"
            />
            {isSuggestionOpen && clientSuggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-xl z-10 max-h-48 overflow-y-auto">
                {clientSuggestions.map((suggestion) => (
                  <button
                    key={suggestion.id}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setIsSuggestionOpen(false);
                      onSelectClientSuggestion(suggestion);
                    }}
                    className="w-full px-3 py-2 text-left hover:bg-slate-700/50 border-b border-slate-700/30 last:border-b-0 text-xs transition-colors"
                  >
                    <div className="font-semibold text-white">{suggestion.name}</div>
                    <div className="text-slate-500 text-[10px]">
                      {suggestion.bikeModel} - {suggestion.contact}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5 xl:col-span-2">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">WhatsApp</label>
            <input
              name="contact"
              defaultValue={editingClient?.contact}
              required
              placeholder="Ex: (69) 99999-9999"
              onChange={(event) => {
                event.currentTarget.value = formatPhoneInput(event.currentTarget.value);
              }}
              className="w-full bg-slate-900/50 border-slate-700 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none"
            />
          </div>

          <div className="space-y-1.5 xl:col-span-2">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Modelo da Moto</label>
            <input
              name="bikeModel"
              defaultValue={editingClient?.bikeModel}
              required
              placeholder="Ex: Honda CG 160"
              className="w-full bg-slate-900/50 border-slate-700 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none"
            />
          </div>

          <div className="space-y-1.5 md:col-span-2 xl:col-span-2">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Tipo de Servico</label>
            <div className="flex gap-2 items-stretch">
              <select
                value={serviceType}
                onChange={(event) => onServiceTypeChange(event.target.value)}
                className="flex-1 min-w-0 bg-slate-900/50 border-slate-700 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none"
              >
                {serviceTypeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void onAddCustomServiceType()}
                title="Adicionar categoria"
                className="shrink-0 px-3 rounded-xl bg-slate-700/80 hover:bg-slate-600 text-white font-bold border border-slate-600 flex items-center justify-center"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[8px] text-slate-600 px-1">
              Em Historico, use o filtro &quot;Servico&quot; para listar por categoria.
            </p>
          </div>

          {isOilChange && (
            <div className="space-y-1.5 md:col-span-2 xl:col-span-2">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Marca / tipo de oleo</label>
              <select
                name="oilType"
                required
                defaultValue={defaultOilType}
                className="w-full bg-slate-900/50 border-slate-700 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none"
              >
                {oilTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Valor do Servico (R$)</label>
            <input
              name="serviceValue"
              type="number"
              step="0.01"
              defaultValue={editingClient?.serviceValue ?? editingClient?.lastServiceValue ?? 0}
              required
              className="w-full bg-slate-900/50 border-slate-700 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Status do Pagamento</label>
            <select
              name="statusPagamento"
              defaultValue={editingClient?.statusPagamento || 'Pago'}
              className="w-full bg-slate-900/50 border-slate-700 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none"
            >
              <option value="Pago">Pago</option>
              <option value="Pendente">Pendente</option>
              <option value="Parcial">Parcial</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Valor Pago (R$)</label>
            <input
              name="valorPago"
              type="number"
              step="0.01"
              defaultValue={editingClient?.valorPago ?? ''}
              className="w-full bg-slate-900/50 border-slate-700 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Data do Servico</label>
            <input
              name="lastMaintenanceDate"
              type="date"
              value={serviceDate}
              onChange={(event) => setServiceDate(event.target.value)}
              required
              className="w-full bg-slate-900/50 border-slate-700 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Recorrencia (Dias)</label>
            <input
              name="recurrenceDays"
              type="number"
              value={recurrenceDays}
              onChange={(event) => setRecurrenceDays(parseInt(event.target.value, 10) || 29)}
              required
              className="w-full bg-slate-900/50 border-slate-700 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none"
            />
          </div>

          <div className="flex items-center gap-2 pt-6">
            <input
              name="isRecurringRevenue"
              type="checkbox"
              checked={isRecurringRevenue}
              onChange={(event) => setIsRecurringRevenue(event.target.checked)}
              className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-primary focus:ring-primary"
            />
            <label className="text-xs font-bold text-slate-400">Recorrente</label>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Observacoes</label>
          <textarea
            name="notes"
            defaultValue={editingClient?.lastServiceNotes || ''}
            placeholder="Detalhes adicionais do servico..."
            className="w-full bg-slate-900/50 border-slate-700 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none h-20"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={isSaving}
            className="flex-1 bg-primary py-3 rounded-xl font-bold hover:bg-primary/90 transition-all text-sm shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSaving ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Salvando...
              </>
            ) : (
              isNewService ? 'Registrar Servico' : editingClient ? 'Salvar Alteracoes' : 'Registrar Servico'
            )}
          </button>
          <button
            type="button"
            onClick={onBack}
            className="px-6 bg-slate-700/50 py-3 rounded-xl font-bold hover:bg-slate-700 transition-all text-sm"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
};
