import { type Dispatch, type KeyboardEvent, type SetStateAction, useRef, useState } from 'react';
import { format, isBefore, parseISO } from 'date-fns';
import {
  Bike,
  Download,
  Droplets,
  FileSpreadsheet,
  Upload,
  Mail,
  MessageCircle,
  MessageSquare,
  Plus,
  ShieldCheck,
  Wrench,
  X,
} from 'lucide-react';
import { APP_VERSION, DEFAULT_SERVICE_TYPES } from '../../constants/appDefaults';
import { canonicalServiceType, getServiceTypeKey, normalizeServiceTypeOptions } from '../../lib/serviceTypes';
import { cn } from '../../lib/utils';
import type { ColorMode, Settings, UserProfile } from '../../types';

type SettingsViewProps = {
  clientsCount: number;
  productsCount: number;
  userEmail?: string | null;
  userProfile: UserProfile | null;
  settings: Settings;
  setSettings: Dispatch<SetStateAction<Settings>>;
  colorMode: ColorMode;
  saveMessage: string | null;
  onSaveProfile: () => Promise<void> | void;
  onSaveSettings: () => Promise<void> | void;
  onSaveSettingsPatch: (patch: Partial<Settings>) => Promise<void> | void;
  onExportClientsBackup: () => void;
  onImportClientsBackup: (file: File) => Promise<void> | void;
  isImportingClients: boolean;
  onExportProductsBackup: () => void;
  onImportProductsBackup: (file: File) => Promise<number> | number;
  isImportingProducts: boolean;
};

export const SettingsView = ({
  clientsCount,
  productsCount,
  userEmail,
  userProfile,
  settings,
  setSettings,
  colorMode,
  saveMessage,
  onSaveProfile,
  onSaveSettings,
  onSaveSettingsPatch,
  onExportClientsBackup,
  onImportClientsBackup,
  isImportingClients,
  onExportProductsBackup,
  onImportProductsBackup,
  isImportingProducts,
}: SettingsViewProps) => {
  const [newServiceType, setNewServiceType] = useState('');
  const [newOilType, setNewOilType] = useState('');
  const [newWarrantyCategory, setNewWarrantyCategory] = useState('');
  const clientImportInputRef = useRef<HTMLInputElement | null>(null);
  const productImportInputRef = useRef<HTMLInputElement | null>(null);

  const updateSettings = (patch: Partial<Settings>) => {
    setSettings((current) => ({ ...current, ...patch }));
  };

  const oilTypes = settings.oilTypes || [];
  const serviceTypes = normalizeServiceTypeOptions(settings.serviceTypes || []);
  const disabledDefaultServiceTypes = settings.disabledDefaultServiceTypes || [];
  const disabledDefaultKeys = new Set(disabledDefaultServiceTypes.map(getServiceTypeKey));
  const activeDefaultServiceTypes = DEFAULT_SERVICE_TYPES.filter(type => !disabledDefaultKeys.has(getServiceTypeKey(type)));
  const warrantyCategories = settings.warrantyCategories || [];
  const subscriptionExpiresAt = userProfile?.subscriptionExpiresAt;
  const subscriptionExpired = subscriptionExpiresAt ? isBefore(parseISO(subscriptionExpiresAt), new Date()) : false;

  const saveSettingsPatch = (patch: Partial<Settings>) => {
    updateSettings(patch);
    void onSaveSettingsPatch(patch);
  };

  const addOilType = () => {
    const value = newOilType.trim();
    if (!value || oilTypes.includes(value)) return;
    saveSettingsPatch({ oilTypes: [...oilTypes, value] });
    setNewOilType('');
  };

  const addServiceType = () => {
    const value = canonicalServiceType(newServiceType);
    if (!value) return;

    const defaultMatch = DEFAULT_SERVICE_TYPES.find(type => getServiceTypeKey(type) === getServiceTypeKey(value));
    const existingOptions = normalizeServiceTypeOptions([...activeDefaultServiceTypes, ...serviceTypes]);
    const exists = existingOptions.some(type => getServiceTypeKey(type) === getServiceTypeKey(value));

    if (exists) {
      setNewServiceType('');
      return;
    }

    if (defaultMatch && disabledDefaultKeys.has(getServiceTypeKey(defaultMatch))) {
      saveSettingsPatch({
        disabledDefaultServiceTypes: disabledDefaultServiceTypes.filter(type => getServiceTypeKey(type) !== getServiceTypeKey(defaultMatch)),
      });
      setNewServiceType('');
      return;
    }

    saveSettingsPatch({ serviceTypes: normalizeServiceTypeOptions([...serviceTypes, value]) });
    setNewServiceType('');
  };

  const removeServiceType = (typeToRemove: string) => {
    const keyToRemove = getServiceTypeKey(typeToRemove);
    const defaultMatch = DEFAULT_SERVICE_TYPES.find(type => getServiceTypeKey(type) === keyToRemove);

    if (defaultMatch) {
      saveSettingsPatch({
        disabledDefaultServiceTypes: normalizeServiceTypeOptions([...disabledDefaultServiceTypes, defaultMatch]),
        serviceTypes: serviceTypes.filter(type => getServiceTypeKey(type) !== keyToRemove),
      });
      return;
    }

    saveSettingsPatch({ serviceTypes: serviceTypes.filter(type => getServiceTypeKey(type) !== keyToRemove) });
  };

  const addWarrantyCategory = () => {
    const value = newWarrantyCategory.trim();
    if (!value || warrantyCategories.includes(value)) return;
    saveSettingsPatch({ warrantyCategories: [...warrantyCategories, value] });
    setNewWarrantyCategory('');
  };

  const submitOnEnter = (event: KeyboardEvent<HTMLInputElement>, action: () => void) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      action();
    }
  };

  const handleClientImportFile = (file?: File) => {
    if (!file) return;
    void onImportClientsBackup(file);
    if (clientImportInputRef.current) {
      clientImportInputRef.current.value = '';
    }
  };

  const handleProductImportFile = (file?: File) => {
    if (!file) return;
    void onImportProductsBackup(file);
    if (productImportInputRef.current) {
      productImportInputRef.current.value = '';
    }
  };

  return (
    <div className="light-readable-view mx-auto w-full max-w-7xl space-y-5 px-1 sm:px-2">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <h2 className="text-xl font-bold">Configuracoes</h2>
        <div className="flex flex-col gap-2 sm:items-end">
          {userEmail && (
            <div className="flex max-w-full items-center gap-2 rounded-xl border border-slate-700/60 bg-slate-900/40 px-3 py-2 text-xs">
              <Mail className="h-4 w-4 shrink-0 text-primary" />
              <span className="text-slate-500">Conta Google:</span>
              <span className="truncate font-medium text-slate-200">{userEmail}</span>
            </div>
          )}
        </div>
      </div>

      {userProfile?.role !== 'admin' && subscriptionExpiresAt && (
        <div
          className={cn(
            'p-4 rounded-xl border flex items-center justify-between',
            subscriptionExpired
              ? 'bg-red-500/10 border-red-500/30 text-red-500'
              : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500'
          )}
        >
          <div className="flex items-center gap-3">
            <div className={cn('p-2 rounded-lg', subscriptionExpired ? 'bg-red-500/20' : 'bg-emerald-500/20')}>
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[9px] font-bold uppercase tracking-widest opacity-70">Sua Assinatura</p>
              <p className="text-sm font-bold">
                {subscriptionExpired ? 'Expirada' : `Ativa ate ${format(parseISO(subscriptionExpiresAt), 'dd/MM/yyyy')}`}
              </p>
            </div>
          </div>
          {subscriptionExpired && (
            <button
              type="button"
              onClick={() => window.open('https://wa.me/5511999999999?text=Ola, gostaria de renovar minha assinatura do MotoFix', '_blank')}
              className="bg-red-500 text-white px-4 py-2 rounded-lg font-bold hover:bg-red-600 transition-all text-xs"
            >
              Renovar
            </button>
          )}
        </div>
      )}

      <div className="rounded-2xl border border-slate-700/50 bg-slate-800/35 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
              <FileSpreadsheet className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">Backups</p>
              <h3 className="text-base font-bold text-white">Backups e restauracao</h3>
            </div>
          </div>
          <p className="max-w-2xl text-xs leading-relaxed text-slate-400">
            Salve copias em XLSX ou restaure dados de clientes e mercadorias sem sair das configuracoes.
          </p>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-700/60 bg-slate-900/45 px-4 py-3">
            <div className="grid gap-3 2xl:grid-cols-[1fr_auto] 2xl:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-sm font-bold text-white">Clientes</h4>
                  <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-emerald-400">
                    {clientsCount} registro(s)
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  Contatos, motos, agenda, recorrencias e dados de relacionamento.
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 2xl:w-[22rem]">
                <button
                  type="button"
                  onClick={onExportClientsBackup}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 text-xs font-bold text-emerald-400 transition-all hover:bg-emerald-500/15"
                >
                  <Download className="h-4 w-4" />
                  Exportar
                </button>
                <button
                  type="button"
                  disabled={isImportingClients}
                  onClick={() => clientImportInputRef.current?.click()}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-primary/20 bg-primary/10 px-3 text-xs font-bold text-primary transition-all hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Upload className="h-4 w-4" />
                  {isImportingClients ? 'Importando...' : 'Importar'}
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-700/60 bg-slate-900/45 px-4 py-3">
            <div className="grid gap-3 2xl:grid-cols-[1fr_auto] 2xl:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-sm font-bold text-white">Mercadorias</h4>
                  <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-primary">
                    {productsCount} item(ns)
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  Codigos, descricoes, NCM, valores de venda e variacoes cadastradas.
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 2xl:w-[22rem]">
                <button
                  type="button"
                  onClick={onExportProductsBackup}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 text-xs font-bold text-emerald-400 transition-all hover:bg-emerald-500/15"
                >
                  <Download className="h-4 w-4" />
                  Exportar
                </button>
                <button
                  type="button"
                  disabled={isImportingProducts}
                  onClick={() => productImportInputRef.current?.click()}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-primary/20 bg-primary/10 px-3 text-xs font-bold text-primary transition-all hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Upload className="h-4 w-4" />
                  {isImportingProducts ? 'Importando...' : 'Importar'}
                </button>
              </div>
            </div>
          </div>
        </div>

        <input
          ref={clientImportInputRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(event) => handleClientImportFile(event.target.files?.[0])}
        />
        <input
          ref={productImportInputRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(event) => handleProductImportFile(event.target.files?.[0])}
        />
      </div>

      <div className="bg-slate-800/40 p-4 rounded-xl border border-slate-700/50 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Bike className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-bold">Perfil da Empresa</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Nome da Empresa</label>
            <input
              value={settings.businessName || ''}
              onChange={(event) => updateSettings({ businessName: event.target.value })}
              placeholder="Ex: MotoFix Centro Automotivo"
              className="w-full bg-slate-900/50 border-slate-700 rounded-lg p-2 text-sm focus:ring-1 focus:ring-primary outline-none"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">WhatsApp da Empresa</label>
            <input
              value={settings.businessPhone || ''}
              onChange={(event) => updateSettings({ businessPhone: event.target.value })}
              placeholder="Ex: (69) 99999-9999"
              className="w-full bg-slate-900/50 border-slate-700 rounded-lg p-2 text-sm focus:ring-1 focus:ring-primary outline-none"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Instagram (@)</label>
            <input
              value={settings.businessInstagram || ''}
              onChange={(event) => updateSettings({ businessInstagram: event.target.value })}
              placeholder="Ex: @motofix_oficial"
              className="w-full bg-slate-900/50 border-slate-700 rounded-lg p-2 text-sm focus:ring-1 focus:ring-primary outline-none"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Endereco</label>
            <input
              value={settings.businessAddress || ''}
              onChange={(event) => updateSettings({ businessAddress: event.target.value })}
              placeholder="Rua Exemplo, 123 - Centro"
              className="w-full bg-slate-900/50 border-slate-700 rounded-lg p-2 text-sm focus:ring-1 focus:ring-primary outline-none"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={() => void onSaveProfile()}
          className="w-full bg-emerald-500/10 text-emerald-500 py-2.5 rounded-lg font-bold hover:bg-emerald-500/20 transition-all border border-emerald-500/20 text-xs"
        >
          Salvar Perfil da Empresa
        </button>
      </div>

      <div className="bg-slate-800/40 p-4 rounded-xl border border-slate-700/50 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <MessageSquare className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-bold">Template do WhatsApp</h3>
        </div>
        <p className="text-[10px] text-slate-400">
          Use as tags: <code>{'{client}'}</code>, <code>{'{bike}'}</code>, <code>{'{date}'}</code>
        </p>
        <textarea
          value={settings.whatsappTemplate || ''}
          onChange={(event) => updateSettings({ whatsappTemplate: event.target.value })}
          className="w-full bg-slate-900/50 border-slate-700 rounded-lg p-3 min-h-[100px] text-sm focus:ring-1 focus:ring-primary outline-none"
        />
        <button
          type="button"
          onClick={() => void onSaveSettings()}
          className="w-full bg-primary py-2.5 rounded-lg font-bold hover:bg-primary/90 transition-all text-sm"
        >
          Salvar Configuracoes
        </button>
        {saveMessage && (
          <p className="text-emerald-500 text-center text-[10px] font-bold animate-bounce">{saveMessage}</p>
        )}
      </div>

      <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <Wrench className="w-5 h-5 text-primary" />
          <h3 className="font-bold">Categorias de Servicos</h3>
        </div>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {activeDefaultServiceTypes.map((type) => (
              <div key={type} className="bg-slate-900/70 text-slate-300 px-3 py-1 rounded-lg border border-slate-700 flex items-center gap-2 group">
                <span className="text-sm">{type}</span>
                <button
                  type="button"
                  onClick={() => removeServiceType(type)}
                  aria-label={`Remover categoria ${type}`}
                  className="text-slate-400 transition-colors hover:text-red-400"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
            {serviceTypes.map((type) => (
              <div key={type} className="bg-slate-700/70 text-slate-100 px-3 py-1 rounded-lg border border-slate-600 flex items-center gap-2 group">
                <span className="text-sm">{type}</span>
                <button
                  type="button"
                  onClick={() => removeServiceType(type)}
                  aria-label={`Remover categoria ${type}`}
                  className="text-slate-300 hover:text-red-400 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={newServiceType}
              onChange={(event) => setNewServiceType(event.target.value)}
              onKeyDown={(event) => submitOnEnter(event, addServiceType)}
              placeholder="Nova categoria de servico"
              className="flex-1 bg-slate-900 border-slate-700 rounded-xl p-2 text-sm text-slate-100 placeholder:text-slate-500 focus:ring-primary focus:border-primary outline-none"
            />
            <button
              type="button"
              onClick={addServiceType}
              aria-label="Adicionar categoria de servico"
              className="bg-slate-700 p-2 rounded-xl hover:bg-slate-600"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <Droplets className="w-5 h-5 text-primary" />
          <h3 className="font-bold">Tipos de Oleo / Itens Disponiveis</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {oilTypes.map((type, index) => (
            <div key={`${type}-${index}`} className="bg-slate-700/70 text-slate-100 px-3 py-1 rounded-lg border border-slate-600 flex items-center gap-2 group">
              <span className="text-sm">{type}</span>
              <button
                type="button"
                onClick={() => saveSettingsPatch({ oilTypes: oilTypes.filter((_, currentIndex) => currentIndex !== index) })}
                className="text-slate-300 hover:text-red-400 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={newOilType}
            onChange={(event) => setNewOilType(event.target.value)}
            onKeyDown={(event) => submitOnEnter(event, addOilType)}
            placeholder="Novo tipo de item"
            className="flex-1 bg-slate-900 border-slate-700 rounded-xl p-2 text-sm text-slate-100 placeholder:text-slate-500 focus:ring-primary focus:border-primary outline-none"
          />
          <button type="button" onClick={addOilType} className="bg-slate-700 p-2 rounded-xl hover:bg-slate-600">
            <Plus className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <ShieldCheck className="w-5 h-5 text-primary" />
          <h3 className="font-bold">Categorias de Garantia</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {warrantyCategories.map((category, index) => (
            <div key={`${category}-${index}`} className="bg-slate-700/70 text-slate-100 px-3 py-1 rounded-lg border border-slate-600 flex items-center gap-2 group">
              <span className="text-sm">{category}</span>
              <button
                type="button"
                onClick={() => saveSettingsPatch({ warrantyCategories: warrantyCategories.filter((_, currentIndex) => currentIndex !== index) })}
                className="text-slate-300 hover:text-red-400 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={newWarrantyCategory}
            onChange={(event) => setNewWarrantyCategory(event.target.value)}
            onKeyDown={(event) => submitOnEnter(event, addWarrantyCategory)}
            placeholder="Nova categoria"
            className="flex-1 bg-slate-900 border-slate-700 rounded-xl p-2 text-sm text-slate-100 placeholder:text-slate-500 focus:ring-primary focus:border-primary outline-none"
          />
          <button type="button" onClick={addWarrantyCategory} className="bg-slate-700 p-2 rounded-xl hover:bg-slate-600">
            <Plus className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div
        className={cn(
          'institutional-card rounded-2xl border p-6 space-y-5',
          colorMode === 'light'
            ? 'bg-slate-100 text-slate-900 border-slate-300'
            : 'bg-gradient-to-br from-slate-800/80 to-slate-900/60 text-slate-100 border-slate-700/80'
        )}
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-primary">Institucional</p>
            <h3 className={cn('text-lg font-bold', colorMode === 'light' ? 'text-slate-900' : 'text-white')}>
              Sobre o MotoFix
            </h3>
          </div>
          <span
            className={cn(
              'w-fit rounded-full border px-3 py-1 text-[10px] font-bold',
              colorMode === 'light'
                ? 'border-slate-200 bg-slate-50 text-slate-700'
                : 'border-white/10 bg-white/5 text-slate-300'
            )}
          >
            Versao {APP_VERSION}
          </span>
        </div>
        <p className={cn('text-sm leading-relaxed', colorMode === 'light' ? 'text-slate-700' : 'text-slate-300')}>
          O MotoFix e uma solucao profissional de gestao para oficinas e centros automotivos. Centraliza cadastro de
          clientes, controle de servicos recorrentes, alertas proativos, historico financeiro e gestao de garantias.
        </p>
        <ul className={cn('grid gap-2 text-sm sm:grid-cols-2', colorMode === 'light' ? 'text-slate-700' : 'text-slate-400')}>
          {[
            'Indicadores claros e atualizados sobre o status de pagamento.',
            'Agendamento com ficha completa do cliente integrada ao historico de servicos.',
            'Relatorios e rankings de servicos, com detalhe por produto quando aplicavel.',
            'Suporte a temas claro e escuro para melhor legibilidade.',
          ].map((item) => (
            <li
              key={item}
              className={cn(
                'flex gap-2 rounded-lg px-3 py-2 border',
                colorMode === 'light' ? 'bg-white border-slate-200' : 'bg-slate-900/40 border-slate-700/40'
              )}
            >
              <span className="text-primary font-bold">-</span>
              {item}
            </li>
          ))}
        </ul>
        <div
          className={cn(
            'flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between',
            colorMode === 'light' ? 'border-slate-200 text-slate-900' : 'border-slate-700/50 text-slate-500'
          )}
        >
          <div className="flex flex-col gap-1.5 sm:gap-2">
            <span className={cn('font-semibold', colorMode === 'light' ? 'text-slate-800' : 'text-slate-400')}>Suporte</span>
            <div className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-1">
              <a
                href="https://wa.me/556999944024"
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'inline-flex items-center gap-1.5 text-sm font-semibold hover:underline',
                  colorMode === 'light' ? 'text-slate-900' : 'text-primary'
                )}
              >
                <MessageCircle className="h-3.5 w-3.5 shrink-0" />
                WhatsApp: +55 69 99994-4024
              </a>
              <a
                href="mailto:boxmotorsoficial@gmail.com"
                className={cn(
                  'inline-flex items-center gap-1.5 text-sm font-semibold hover:underline break-all',
                  colorMode === 'light' ? 'text-slate-900' : 'text-primary'
                )}
              >
                <Mail className="h-3.5 w-3.5 shrink-0" />
                boxmotorsoficial@gmail.com
              </a>
            </div>
          </div>
          <span className={cn(colorMode === 'light' ? 'text-slate-600' : 'text-slate-600 shrink-0')}>
            (c) {new Date().getFullYear()} MotoFix
          </span>
        </div>
      </div>
    </div>
  );
};
