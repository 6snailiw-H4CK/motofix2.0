import React, { useState, useEffect } from 'react';
import { ArrowLeft, ChevronDown, ChevronUp, Link2, RefreshCw } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { DateInput } from '../DateInput';
import type { CashRegisterLaunch, Client, Warranty, Settings } from '../../types';
import { toast as sonnerToast } from 'sonner';
import { clearLocalDraft } from '../../services/localDrafts';

const formatCashLaunchDate = (dateValue?: string) => {
  const date = (dateValue || '').slice(0, 10);
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : 'Data não informada';
};

interface WarrantyFormProps {
  editingWarranty: Warranty | null;
  cashLaunches: CashRegisterLaunch[];
  clients: Client[];
  settings: Settings | null;
  isSaving: boolean;
  onBack: () => void;
  onManageCategories?: () => void;
  onSubmit: (warrantyData: Partial<Warranty>) => Promise<boolean> | boolean;
  draftStorageKey?: string;
}

export const WarrantyForm: React.FC<WarrantyFormProps> = ({
  editingWarranty,
  cashLaunches,
  clients,
  settings,
  isSaving,
  onBack,
  onManageCategories,
  onSubmit,
  draftStorageKey,
}) => {
  // 📝 Form field states
  const [formClientName, setFormClientName] = useState('');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [isClientSuggestionsOpen, setIsClientSuggestionsOpen] = useState(false);
  const [selectedCashLaunchId, setSelectedCashLaunchId] = useState('');
  const [isCashLaunchLinkOpen, setIsCashLaunchLinkOpen] = useState(false);
  const [cashLaunchSearch, setCashLaunchSearch] = useState('');
  const [cashLaunchDateFrom, setCashLaunchDateFrom] = useState('');
  const [cashLaunchDateTo, setCashLaunchDateTo] = useState('');
  const [formServiceType, setFormServiceType] = useState('');
  const [formServiceDescription, setFormServiceDescription] = useState('');
  const [formServiceValue, setFormServiceValue] = useState<number>(0);
  const [formServiceDate, setFormServiceDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [formDurationMonths, setFormDurationMonths] = useState(3);
  const [formClientPhone, setFormClientPhone] = useState('');

  useEffect(() => {
    if (editingWarranty) {
      setFormClientName(editingWarranty.clientName || '');
      setSelectedCashLaunchId(editingWarranty.cashLaunchId || '');
      setIsCashLaunchLinkOpen(Boolean(editingWarranty.cashLaunchId));
      setFormServiceType(editingWarranty.serviceType || '');
      setFormServiceDescription(editingWarranty.serviceDescription || '');
      setFormServiceValue(editingWarranty.serviceValue || 0);
      setFormServiceDate(format(parseISO(editingWarranty.serviceDate), 'yyyy-MM-dd'));
      setFormDurationMonths(editingWarranty.durationMonths || 3);
      setFormClientPhone(editingWarranty.clientPhone || '');
    } else {
      setFormClientName('');
      setSelectedClientId('');
      setIsClientSuggestionsOpen(false);
      setSelectedCashLaunchId('');
      setIsCashLaunchLinkOpen(false);
      setCashLaunchSearch('');
      setCashLaunchDateFrom('');
      setCashLaunchDateTo('');
      setFormServiceType('');
      setFormServiceDescription('');
      setFormServiceValue(0);
      setFormServiceDate(format(new Date(), 'yyyy-MM-dd'));
      setFormDurationMonths(3);
      setFormClientPhone('');
      if (draftStorageKey) clearLocalDraft(draftStorageKey);
    }
  }, [draftStorageKey, editingWarranty]);

  const handleCashLaunchChange = (cashLaunchId: string) => {
    setSelectedCashLaunchId(cashLaunchId);
    const launch = cashLaunches.find((item) => item.id === cashLaunchId);
    if (!launch) return;

    setFormClientName(launch.clientName || '');
    setFormClientPhone(launch.clientPhone || '');
    setFormServiceValue(launch.servicesTotal > 0 ? launch.servicesTotal : launch.total);
    setFormServiceDescription(launch.servicesExecuted || launch.request || '');
  };

  const normalizeSearch = (value: string) => value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

  const clientSearch = normalizeSearch(formClientName);
  const matchingClients = clients
    .filter((client) => !client.deletedAt && (!clientSearch || normalizeSearch(
      `${client.name} ${client.fullName || ''} ${client.contact || ''}`
    ).includes(clientSearch)))
    .slice(0, 8);

  const handleClientSelect = (client: Client) => {
    setSelectedClientId(client.id);
    setFormClientName(client.name || client.fullName || '');
    setFormClientPhone(client.contact || '');
    setFormServiceType(client.lastServiceType || '');
    setFormServiceDescription([
      client.bikeModel ? `Moto: ${client.bikeModel}` : '',
      client.lastServiceNotes || '',
    ].filter(Boolean).join('\n'));
    setFormServiceValue(client.lastServiceValue ?? client.serviceValue ?? 0);
    setFormServiceDate(format(new Date(), 'yyyy-MM-dd'));
    setIsClientSuggestionsOpen(false);
  };

  const normalizedCashLaunchSearch = cashLaunchSearch
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
  const eligibleCashLaunches = cashLaunches.filter((launch) => (
    launch.status === 'Finalizado' || launch.id === editingWarranty?.cashLaunchId
  ));
  const filteredCashLaunches = eligibleCashLaunches.filter((launch) => {
    const launchDate = (launch.openingDate || launch.createdAt || '').slice(0, 10);
    const searchableText = `${launch.orderNumber} ${launch.clientName}`
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

    return (!normalizedCashLaunchSearch || searchableText.includes(normalizedCashLaunchSearch))
      && (!cashLaunchDateFrom || launchDate >= cashLaunchDateFrom)
      && (!cashLaunchDateTo || launchDate <= cashLaunchDateTo);
  });
  const selectedCashLaunch = eligibleCashLaunches.find((launch) => launch.id === selectedCashLaunchId);
  const displayedCashLaunches = selectedCashLaunch && !filteredCashLaunches.some((launch) => launch.id === selectedCashLaunchId)
    ? [selectedCashLaunch, ...filteredCashLaunches]
    : filteredCashLaunches;
  const cashLaunchLinkLabel = selectedCashLaunch
    ? `OS. ${selectedCashLaunch.orderNumber} - ${selectedCashLaunch.clientName}`
    : 'Vincular Ordem de Serviço';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formServiceValue || formServiceValue <= 0) {
      sonnerToast.error('❌ Valor do Serviço deve ser maior que R$ 0,00');
      return;
    }

    if (!formServiceDate) {
      sonnerToast.error('❌ Informe a data do serviço');
      return;
    }

    await onSubmit({
      clientName: formClientName,
      cashLaunchId: selectedCashLaunchId || null,
      cashLaunchOrderNumber: cashLaunches.find((launch) => launch.id === selectedCashLaunchId)?.orderNumber || null,
      serviceType: formServiceType,
      serviceDescription: formServiceDescription,
      serviceValue: formServiceValue,
      serviceDate: `${formServiceDate}T12:00:00Z`,
      durationMonths: formDurationMonths,
      clientPhone: formClientPhone
    });
  };

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <button 
          onClick={onBack}
          className="p-1.5 rounded-full hover:bg-slate-800 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-xl font-bold">
          {editingWarranty ? 'Editar Garantia' : 'Registrar Garantia'}
        </h2>
      </div>

      <form
        onSubmit={handleSubmit}
        className="bg-slate-800/40 p-5 rounded-2xl border border-slate-700/50 space-y-5"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setIsCashLaunchLinkOpen((isOpen) => !isOpen)}
              aria-expanded={isCashLaunchLinkOpen}
              aria-controls="warranty-cash-launch-link"
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-900/50 px-3 py-2.5 text-left text-sm font-bold transition-colors hover:border-primary/50"
            >
              <span className="flex min-w-0 items-center gap-2">
                <Link2 className="h-4 w-4 shrink-0 text-primary" />
                <span className="truncate">{cashLaunchLinkLabel}</span>
                {selectedCashLaunch && <span className="shrink-0 text-[10px] font-medium text-slate-400">Vinculada</span>}
              </span>
              {isCashLaunchLinkOpen
                ? <ChevronUp className="h-4 w-4 shrink-0 text-slate-400" />
                : <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />}
            </button>

            {isCashLaunchLinkOpen && (
              <div id="warranty-cash-launch-link" className="space-y-2 rounded-xl border border-slate-700/70 bg-slate-900/30 p-3">
                <p className="px-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  Vincular Ordem de Serviço (opcional)
                </p>
                <input
                  type="search"
                  value={cashLaunchSearch}
                  onChange={(e) => setCashLaunchSearch(e.target.value)}
                  placeholder="Pesquisar cliente ou número da OS"
                  aria-label="Pesquisar OS por cliente ou número"
                  className="w-full bg-slate-900/50 border-slate-700 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none"
                />
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1 text-[10px] font-bold text-slate-500">
                    Abertura a partir de
                    <input
                      type="date"
                      value={cashLaunchDateFrom}
                      onChange={(e) => setCashLaunchDateFrom(e.target.value)}
                      aria-label="Data inicial da OS"
                      className="w-full bg-slate-900/50 border-slate-700 rounded-xl p-2.5 text-sm font-normal text-slate-200 focus:ring-1 focus:ring-primary outline-none"
                    />
                  </label>
                  <label className="space-y-1 text-[10px] font-bold text-slate-500">
                    Abertura até
                    <input
                      type="date"
                      value={cashLaunchDateTo}
                      onChange={(e) => setCashLaunchDateTo(e.target.value)}
                      aria-label="Data final da OS"
                      className="w-full bg-slate-900/50 border-slate-700 rounded-xl p-2.5 text-sm font-normal text-slate-200 focus:ring-1 focus:ring-primary outline-none"
                    />
                  </label>
                </div>
                <select
                  value={selectedCashLaunchId}
                  onChange={(e) => handleCashLaunchChange(e.target.value)}
                  className="w-full bg-slate-900/50 border-slate-700 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none"
                >
                  <option value="">Sem ordem vinculada</option>
                  {displayedCashLaunches.map((launch) => (
                    <option key={launch.id} value={launch.id}>
                      OS. {launch.orderNumber} - {launch.clientName} - {formatCashLaunchDate(launch.openingDate || launch.createdAt)}
                      {launch.id === selectedCashLaunchId && !filteredCashLaunches.some((item) => item.id === launch.id) ? ' (vínculo atual)' : ''}
                    </option>
                  ))}
                </select>
                <p className="px-1 text-[10px] text-slate-500">
                  {filteredCashLaunches.length
                    ? `${filteredCashLaunches.length} OS finalizada(s) encontrada(s). Ao selecionar, os dados do cliente e do serviço serão preenchidos.`
                    : 'Nenhuma OS finalizada encontrada com esses filtros.'}
                </p>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">
              Nome do Cliente
            </label>
            <input
              value={formClientName}
              onChange={(e) => {
                setFormClientName(e.target.value);
                setSelectedClientId('');
                setIsClientSuggestionsOpen(true);
              }}
              onFocus={() => setIsClientSuggestionsOpen(true)}
              onBlur={() => setTimeout(() => setIsClientSuggestionsOpen(false), 120)}
              required
              placeholder="Ex: João Silva"
              autoComplete="off"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={isClientSuggestionsOpen && matchingClients.length > 0}
              aria-controls="warranty-client-suggestions"
              className="w-full bg-slate-900/50 border-slate-700 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none"
            />
            {isClientSuggestionsOpen && matchingClients.length > 0 && (
              <div
                id="warranty-client-suggestions"
                role="listbox"
                className="mt-1 max-h-52 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-1 shadow-xl"
              >
                {matchingClients.map((client) => (
                  <button
                    key={client.id}
                    type="button"
                    role="option"
                    aria-selected={selectedClientId === client.id}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => handleClientSelect(client)}
                    className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-800"
                  >
                    <span className="min-w-0 truncate font-semibold">{client.name || client.fullName}</span>
                    <span className="shrink-0 text-xs text-slate-400">{client.contact || 'Sem telefone'}</span>
                  </button>
                ))}
              </div>
            )}
            <p className="px-1 text-[10px] text-slate-500">
              {selectedClientId
                ? 'Cliente cadastrado selecionado; os dados disponíveis foram preenchidos.'
                : 'Selecione um cliente cadastrado ou digite um nome para preenchimento manual.'}
            </p>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between items-center px-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                Tipo de Serviço
              </label>
              {onManageCategories ? (
                <button
                  type="button"
                  onClick={onManageCategories}
                  className="text-[9px] text-primary hover:underline font-bold uppercase tracking-tighter"
                >
                  Gerenciar Lista
                </button>
              ) : null}
            </div>
            <select
              value={formServiceType}
              onChange={(e) => setFormServiceType(e.target.value)}
              required
              className="w-full bg-slate-900/50 border-slate-700 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none"
            >
              <option value="">Selecione um serviço</option>
              {editingWarranty?.serviceType && !settings?.warrantyCategories?.includes(editingWarranty.serviceType) && (
                <option value={editingWarranty.serviceType}>{editingWarranty.serviceType}</option>
              )}
              {formServiceType && formServiceType !== editingWarranty?.serviceType && !settings?.warrantyCategories?.includes(formServiceType) && (
                <option value={formServiceType}>{formServiceType}</option>
              )}
              {settings?.warrantyCategories?.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">
              Descrição do Serviço
            </label>
            <textarea
              value={formServiceDescription}
              onChange={(e) => setFormServiceDescription(e.target.value)}
              placeholder="Detalhes adicionais do serviço"
              className="w-full bg-slate-900/50 border-slate-700 rounded-xl p-2.5 text-sm min-h-[80px] focus:ring-1 focus:ring-primary outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">
                Valor (R$)
              </label>
              <input
                type="number"
                step="0.01"
                value={formServiceValue}
                onChange={(e) => setFormServiceValue(parseFloat(e.target.value) || 0)}
                className="w-full bg-slate-900/50 border-slate-700 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">
                Data
              </label>
              <DateInput
                value={formServiceDate}
                onChange={setFormServiceDate}
                required
                className="w-full bg-slate-900/50 border-slate-700 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">
                Duração (meses)
              </label>
              <select
                value={formDurationMonths}
                onChange={(e) => setFormDurationMonths(parseInt(e.target.value))}
                className="w-full bg-slate-900/50 border-slate-700 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none"
              >
                <option value={1}>1 mês</option>
                <option value={3}>3 meses</option>
                <option value={6}>6 meses</option>
                <option value={12}>12 meses</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">
                Telefone
              </label>
              <input
                value={formClientPhone}
                onChange={(e) => setFormClientPhone(e.target.value)}
                placeholder="(11) 98765-4321"
                className="w-full bg-slate-900/50 border-slate-700 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none"
              />
            </div>
          </div>
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
              editingWarranty ? 'Salvar Alterações' : 'Registrar Garantia'
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
