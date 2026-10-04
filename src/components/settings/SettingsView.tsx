import { type Dispatch, type KeyboardEvent, type SetStateAction, useEffect, useRef, useState } from 'react';
import { format, isBefore, parseISO } from 'date-fns';
import {
  AlertTriangle,
  Building2,
  Check,
  CloudCheck,
  CloudOff,
  CloudUpload,
  CreditCard,
  Download,
  Droplets,
  FileSpreadsheet,
  Upload,
  Mail,
  MessageCircle,
  MessageSquare,
  Moon,
  Plus,
  Save,
  Settings2,
  ShieldCheck,
  Sun,
  Wrench,
  X,
} from 'lucide-react';
import { cancelSubscription, createCustomerPortalSession, getSubscriptionStatus, type BillingStatus } from '../../services/stripeService';
import type { OfflineSyncStatus } from '../../hooks/useOfflineSyncStatus';
import { APP_VERSION, DEFAULT_SERVICE_TYPES } from '../../constants/appDefaults';
import { FailedWritesPanel } from './FailedWritesPanel';
import { canonicalServiceType, getServiceTypeKey, normalizeServiceTypeOptions } from '../../lib/serviceTypes';
import { cn } from '../../lib/utils';
import type { ColorMode, OperationalLog, Settings, UserProfile } from '../../types';

type SettingsViewProps = {
  userEmail?: string | null;
  userProfile: UserProfile | null;
  settings: Settings;
  setSettings: Dispatch<SetStateAction<Settings>>;
  colorMode: ColorMode;
  onColorModeChange: (mode: ColorMode) => void;
  saveMessage: string | null;
  onSaveProfile: () => Promise<void> | void;
  onSaveSettings: () => Promise<void> | void;
  onSaveSettingsPatch: (patch: Partial<Settings>) => Promise<void> | void;
  onExportClientsBackup: () => void;
  onExportFullBackup: () => void;
  onImportFullBackup: (file: File) => Promise<void> | void;
  onImportClientsBackup: (file: File) => Promise<void> | void;
  isImportingClients: boolean;
  onExportProductsBackup: () => void;
  onImportProductsBackup: (file: File) => Promise<number> | number;
  isImportingProducts: boolean;
  onResetOperationalData: () => Promise<boolean> | boolean;
  isResettingOperationalData: boolean;
  onOpenCheckout: () => void;
  offlineSyncStatus: OfflineSyncStatus;
  operationalLogs: OperationalLog[];
};

export const SettingsView = ({
  userEmail,
  userProfile,
  settings,
  setSettings,
  colorMode,
  onColorModeChange,
  saveMessage,
  onSaveProfile,
  onSaveSettings,
  onSaveSettingsPatch,
  onExportClientsBackup,
  onExportFullBackup,
  onImportFullBackup,
  onImportClientsBackup,
  isImportingClients,
  onExportProductsBackup,
  onImportProductsBackup,
  isImportingProducts,
  onResetOperationalData,
  isResettingOperationalData,
  onOpenCheckout,
  offlineSyncStatus,
  operationalLogs,
}: SettingsViewProps) => {
  const [newServiceType, setNewServiceType] = useState('');
  const [newOilType, setNewOilType] = useState('');
  const [newWarrantyCategory, setNewWarrantyCategory] = useState('');
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetConfirmation, setResetConfirmation] = useState('');
  const [resetBackupReady, setResetBackupReady] = useState(false);
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
  const [isCancelingSubscription, setIsCancelingSubscription] = useState(false);
  const [billingMessage, setBillingMessage] = useState<string | null>(null);
  const clientImportInputRef = useRef<HTMLInputElement | null>(null);
  const productImportInputRef = useRef<HTMLInputElement | null>(null);
  const fullBackupImportInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void getSubscriptionStatus().then(setBillingStatus).catch(() => setBillingMessage('Nao foi possivel carregar a assinatura.'));
  }, []);

  const subscriptionEnd = billingStatus?.currentPeriodEnd || userProfile?.billing?.currentPeriodEnd || userProfile?.subscriptionExpiresAt || null;
  const subscriptionStatus = billingStatus?.status || userProfile?.billing?.status || userProfile?.subscription?.status || 'inactive';
  const subscriptionIsActive = subscriptionStatus === 'active' || subscriptionStatus === 'trialing';
  const subscriptionPrice = typeof billingStatus?.amount === 'number'
    ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: (billingStatus.currency || 'brl').toUpperCase() }).format(billingStatus.amount / 100)
    : 'Nao informado';
  const subscriptionInterval = billingStatus?.interval === 'year' ? 'Anual' : billingStatus?.interval === 'month' ? 'Mensal' : 'Nao informado';
  const formattedSubscriptionEnd = subscriptionEnd ? format(parseISO(subscriptionEnd), 'dd/MM/yyyy') : 'Nao informado';
  const remainingDays = subscriptionEnd ? Math.max(0, Math.ceil((parseISO(subscriptionEnd).getTime() - Date.now()) / 86_400_000)) : null;

  const handleCancelSubscription = async () => {
    if (!subscriptionIsActive || billingStatus?.cancelAtPeriodEnd || isCancelingSubscription) return;
    const confirmed = window.confirm(`Tem certeza que deseja cancelar sua assinatura?\n\nA assinatura sera cancelada ao final do periodo atual. Seu acesso permanece ativo ate ${formattedSubscriptionEnd}.`);
    if (!confirmed) return;
    setIsCancelingSubscription(true);
    setBillingMessage(null);
    try {
      const result = await cancelSubscription();
      setBillingStatus((current) => ({ ...(current || {}), cancelAtPeriodEnd: result.cancelAtPeriodEnd, currentPeriodEnd: result.currentPeriodEnd, hasActiveSubscription: true }));
      setBillingMessage(`Cancelamento agendado. Seu acesso permanece disponivel ate ${result.currentPeriodEnd ? format(parseISO(result.currentPeriodEnd), 'dd/MM/yyyy') : formattedSubscriptionEnd}.`);
    } catch {
      setBillingMessage('Nao foi possivel agendar o cancelamento.');
    } finally {
      setIsCancelingSubscription(false);
    }
  };

  const handleOpenCustomerPortal = async () => {
    const { url } = await createCustomerPortalSession();
    window.location.assign(url);
  };

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
  const canResetOperationalData = userProfile?.role === 'admin';
  const syncStatus = offlineSyncStatus.lastError
    ? { label: 'Falha', icon: AlertTriangle, className: 'border-red-500/30 bg-red-500/10 text-red-200' }
    : !offlineSyncStatus.isOnline
      ? { label: 'Offline', icon: CloudOff, className: 'border-amber-500/30 bg-amber-500/10 text-amber-100' }
      : offlineSyncStatus.pendingWrites > 0 || offlineSyncStatus.isSyncing
        ? { label: 'Sincronizando', icon: CloudUpload, className: 'border-sky-500/30 bg-sky-500/10 text-sky-100' }
        : { label: 'Online', icon: CloudCheck, className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100' };
  const SyncIcon = syncStatus.icon;
  const formatSyncDate = (value: string | null) => {
    if (!value) return 'Nunca';
    try {
      return format(parseISO(value), 'dd/MM/yyyy HH:mm');
    } catch {
      return value;
    }
  };

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

  const handleFullBackupImportFile = (file?: File) => {
    if (!file) return;
    void onImportFullBackup(file);
    if (fullBackupImportInputRef.current) {
      fullBackupImportInputRef.current.value = '';
    }
  };

  const handleResetOperationalData = async () => {
    if (resetConfirmation !== 'ZERAR' || !resetBackupReady) return;
    const completed = await onResetOperationalData();
    if (completed) {
      setResetConfirmation('');
      setResetBackupReady(false);
      setShowResetConfirm(false);
    }
  };

  return (
    <div className="settings-page light-readable-view w-full max-w-full space-y-4 px-4 py-4 sm:px-6">
      <header className="flex flex-col gap-3 border-b border-slate-800 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white">Configuracoes</h2>
          <p className="mt-1 text-xs text-slate-400">Dados da oficina, assinatura e preferencias do sistema.</p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {saveMessage && <span className="text-xs font-medium text-emerald-400">{saveMessage}</span>}
          <button
            type="button"
            onClick={() => void onSaveSettings()}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-xs font-semibold text-white transition-colors hover:bg-primary/90"
          >
            <Save className="h-4 w-4" />
            Salvar configuracoes
          </button>
        </div>
      </header>

      <div className="settings-grid flex w-full flex-col gap-3">
        <section className="settings-subscription order-1 rounded-lg border border-slate-800 bg-slate-900/50 p-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold text-white">Assinatura</p>
              </div>
              <h3 className="mt-2 text-lg font-bold text-white">{billingStatus?.planId === 'pro' ? 'MotoFix Pro' : 'MotoFix Premium'}</h3>
              <p className="mt-1 text-xs text-slate-400">{billingStatus?.displayName || userProfile?.displayName || 'Usuario MotoFix'}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn('inline-flex h-8 items-center rounded-md border px-3 text-xs font-semibold', subscriptionIsActive ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200' : 'border-slate-700 bg-slate-950/40 text-slate-300')}>
                {billingStatus?.cancelAtPeriodEnd ? 'Cancelamento agendado' : subscriptionIsActive ? 'Ativa' : 'Inativa'}
              </span>
              <button type="button" onClick={() => void handleOpenCustomerPortal()} className="inline-flex h-8 items-center rounded-md border border-slate-700 px-3 text-xs font-medium text-slate-200 transition hover:bg-slate-800">
                Gerenciar assinatura
              </button>
            </div>
          </div>
          <div className="mt-4 grid gap-3 border-t border-slate-800 pt-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
            <div><span className="text-slate-500">E-mail</span><p className="mt-1 font-medium text-slate-200">{billingStatus?.email || userEmail || 'Nao informado'}</p></div>
            <div><span className="text-slate-500">Valor e periodicidade</span><p className="mt-1 font-medium text-slate-200">{subscriptionPrice} / {subscriptionInterval}</p></div>
            <div><span className="text-slate-500">Proxima cobranca</span><p className="mt-1 font-medium text-slate-200">{formattedSubscriptionEnd}</p></div>
            <div><span className="text-slate-500">Tempo restante</span><p className="mt-1 font-medium text-slate-200">{remainingDays === null ? 'Nao informado' : `${remainingDays} dia(s)`}</p></div>
          </div>
          {billingMessage && <p className="mt-3 rounded-md border border-slate-700 bg-slate-950/35 p-3 text-xs text-slate-200">{billingMessage}</p>}
          {subscriptionIsActive && !billingStatus?.cancelAtPeriodEnd && (
            <div className="mt-3 border-t border-slate-800 pt-3">
              <button type="button" onClick={() => void handleCancelSubscription()} disabled={isCancelingSubscription} className="text-xs font-medium text-slate-400 transition hover:text-red-300 disabled:opacity-50">
                {isCancelingSubscription ? 'Agendando cancelamento...' : 'Cancelar assinatura'}
              </button>
            </div>
          )}
        </section>

        <section className="settings-company order-2 rounded-lg border border-slate-800 bg-slate-900/50 p-4">
          <div className="mb-3 flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            <div>
              <h3 className="text-sm font-semibold text-white">Dados da Empresa</h3>
              <p className="text-[10px] text-slate-400">Informacoes principais da sua oficina.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-x-3 gap-y-2.5 sm:grid-cols-2">
            {[
              { label: 'Nome da empresa', value: settings.businessName || '', placeholder: 'Ex: MotoFix Centro Automotivo', update: (value: string) => updateSettings({ businessName: value }), required: true },
              { label: 'Telefone / WhatsApp', value: settings.businessPhone || '', placeholder: '(69) 99999-9999', update: (value: string) => updateSettings({ businessPhone: value }), required: true },
              { label: 'E-mail', value: settings.businessEmail || '', placeholder: 'contato@suaoficina.com.br', update: (value: string) => updateSettings({ businessEmail: value }), required: false },
              { label: 'Instagram', value: settings.businessInstagram || '', placeholder: '@suaoficina', update: (value: string) => updateSettings({ businessInstagram: value }), required: false },
              { label: 'Endereco', value: settings.businessAddress || '', placeholder: 'Rua, numero e bairro', update: (value: string) => updateSettings({ businessAddress: value }), required: false },
            ].map(({ label, value, placeholder, update, required }) => (
              <label key={label} className="space-y-1">
                <span className="text-[10px] font-medium text-slate-300">{label}{required && <span className="text-primary"> *</span>}</span>
                <input
                  value={value}
                  onChange={(event) => update(event.target.value)}
                  placeholder={placeholder}
                  className="h-8 w-full rounded-md border border-slate-700 bg-slate-950/50 px-2.5 text-[11px] text-slate-100 outline-none transition focus:border-primary"
                />
              </label>
            ))}
          </div>
          <div className="mt-3 flex justify-end">
            <button type="button" onClick={() => void onSaveProfile()} className="inline-flex h-8 items-center gap-2 rounded-md border border-slate-700 px-3 text-[11px] font-medium text-slate-200 hover:bg-slate-800">
              <Check className="h-3.5 w-3.5 text-emerald-400" /> Salvar dados da empresa
            </button>
          </div>
        </section>

        <section className="settings-preferences order-3 rounded-lg border border-slate-800 bg-slate-900/50 p-4">
          <div className="mb-3 flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-slate-300" />
            <div>
              <h3 className="text-sm font-semibold text-white">Preferencias do Sistema</h3>
              <p className="text-[10px] text-slate-400">Ajuste a aparencia e os dados da sua conta.</p>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md border border-slate-800 bg-slate-950/40 px-3 py-2.5">
            <div className="flex items-center gap-2.5">
              {colorMode === 'dark' ? <Moon className="h-4 w-4 text-slate-300" /> : <Sun className="h-4 w-4 text-amber-400" />}
              <div>
                <p className="text-xs font-medium text-slate-100">Modo escuro</p>
                <p className="text-[10px] text-slate-500">Utilizar tema escuro no sistema</p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={colorMode === 'dark'}
              aria-label="Modo escuro"
              onClick={() => onColorModeChange(colorMode === 'dark' ? 'light' : 'dark')}
              className={cn('relative h-5 w-9 rounded-full transition-colors', colorMode === 'dark' ? 'bg-primary' : 'bg-slate-600')}
            >
              <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform', colorMode === 'dark' ? 'left-[18px]' : 'left-0.5')} />
            </button>
          </div>
          {userEmail && (
            <div className="mt-2.5 flex items-center gap-2.5 rounded-md border border-slate-800 bg-slate-950/40 px-3 py-2.5">
              <Mail className="h-4 w-4 text-slate-400" />
              <div className="min-w-0">
                <p className="text-[10px] text-slate-500">Conta Google</p>
                <p className="truncate text-xs font-medium text-slate-100">{userEmail}</p>
              </div>
            </div>
          )}
          <div className="mt-2.5 flex items-center justify-between border-t border-slate-800 pt-2.5 text-[10px]">
            <span className="text-slate-500">Idioma</span>
            <span className="text-slate-300">Portugues (Brasil)</span>
          </div>
        </section>

        <section id="settings-backup" className="settings-backup order-8 rounded-lg border border-slate-800 bg-slate-900/50 p-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
                <FileSpreadsheet className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-white">Backup e restauracao</h3>
              </div>
            </div>
            <p className="text-xs leading-relaxed text-slate-400">O backup completo salva os dados operacionais e as configuracoes em um unico arquivo restauravel. Clientes e mercadorias tambem podem ser exportados separadamente em planilhas.</p>

            <div className="grid gap-2 sm:grid-cols-2">
              <button type="button" onClick={onExportFullBackup} className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-3 text-xs font-semibold text-white transition hover:bg-primary/90">
                <Download className="h-4 w-4" /> Baixar backup completo
              </button>
              <button type="button" onClick={() => fullBackupImportInputRef.current?.click()} className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-slate-700 px-3 text-xs font-medium text-slate-200 transition hover:bg-slate-800">
                <Upload className="h-4 w-4" /> Restaurar backup completo
              </button>
            </div>

            <div className="mt-4 grid gap-3 xl:grid-cols-2">
              <div className="rounded-xl border border-slate-700/60 bg-slate-900/45 px-4 py-3 w-full min-w-0">
                <div className="grid gap-3">
                  <div className="min-w-0">
                    <h4 className="text-sm font-bold text-white">Clientes</h4>
                    <p className="mt-1 text-xs text-slate-400">Contatos, motos, agenda, recorrencias e dados de relacionamento.</p>
                  </div>
                  <div className="grid gap-2 xl:grid-cols-2">
                    <button type="button" onClick={onExportClientsBackup} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 text-xs font-bold text-emerald-400 transition-all hover:bg-emerald-500/15">
                      <Download className="h-4 w-4" /> Exportar
                    </button>
                    <button type="button" disabled={isImportingClients} onClick={() => clientImportInputRef.current?.click()} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-primary/20 bg-primary/10 px-3 text-xs font-bold text-primary transition-all hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-60">
                      <Upload className="h-4 w-4" /> {isImportingClients ? 'Importando...' : 'Importar'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-700/60 bg-slate-900/45 px-4 py-3 w-full min-w-0">
                <div className="grid gap-3">
                  <div className="min-w-0">
                    <h4 className="text-sm font-bold text-white">Mercadorias</h4>
                    <p className="mt-1 text-xs text-slate-400">Codigos, descricoes, NCM, valores de venda e variacoes cadastradas.</p>
                  </div>
                  <div className="grid gap-2 xl:grid-cols-2">
                    <button type="button" onClick={onExportProductsBackup} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 text-xs font-bold text-emerald-400 transition-all hover:bg-emerald-500/15">
                      <Download className="h-4 w-4" /> Exportar
                    </button>
                    <button type="button" disabled={isImportingProducts} onClick={() => productImportInputRef.current?.click()} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-primary/20 bg-primary/10 px-3 text-xs font-bold text-primary transition-all hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-60">
                      <Upload className="h-4 w-4" /> {isImportingProducts ? 'Importando...' : 'Importar'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </section>

        <section id="settings-seguranca" className="settings-security order-9 rounded-lg border border-slate-800 bg-slate-900/50 p-4">
          <div className="flex flex-col gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-white">Sincronizacao e atividade</h3>
            </div>
            <div className={cn('inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-bold', syncStatus.className)}>
              <SyncIcon className="h-4 w-4" /> {syncStatus.label}
            </div>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-slate-700/60 bg-slate-950/45 p-3">
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Ultima sync</p>
              <p className="mt-1 text-xs font-bold text-white">{formatSyncDate(offlineSyncStatus.lastSyncedAt)}</p>
            </div>
            <div className="rounded-lg border border-slate-700/60 bg-slate-950/45 p-3">
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Pendencias</p>
              <p className="mt-1 text-xs font-bold text-white">{offlineSyncStatus.pendingWrites}</p>
            </div>
            <div className="rounded-lg border border-slate-700/60 bg-slate-950/45 p-3">
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Falhas na fila</p>
              <p className="mt-1 text-xs font-bold text-white">{offlineSyncStatus.failedWrites}</p>
            </div>
            <div className="rounded-lg border border-slate-700/60 bg-slate-950/45 p-3">
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Confirmados</p>
              <p className="mt-1 text-xs font-bold text-white">{offlineSyncStatus.confirmedWrites}</p>
            </div>
          </div>
          <div className="mt-3 rounded-lg border border-slate-700/60 bg-slate-950/35 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Log operacional</p>
              <span className="text-[10px] text-slate-500">{operationalLogs.length} registro(s)</span>
            </div>
            {operationalLogs.length === 0 ? (
              <p className="text-xs text-slate-500">Nenhum evento operacional registrado ainda.</p>
            ) : (
              <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
                {operationalLogs.slice(0, 12).map((log) => (
                  <div key={log.id || `${log.timestamp}-${log.acao}`} className="grid gap-1 rounded-lg border border-slate-800 bg-slate-950/55 p-2 text-xs md:grid-cols-[8.5rem_1fr_7rem] md:items-center">
                    <span className="text-slate-500">{formatSyncDate(log.timestamp)}</span>
                    <span className="font-bold text-slate-200">{log.acao.replace(/_/g, ' ')}</span>
                    <span className={cn('font-bold', log.resultado === 'erro' ? 'text-red-300' : log.resultado === 'salvo_offline' ? 'text-amber-200' : 'text-emerald-300')}>
                      {log.resultado}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <FailedWritesPanel />
        </section>

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
      <input
        ref={fullBackupImportInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(event) => handleFullBackupImportFile(event.target.files?.[0])}
      />

      <section id="settings-whatsapp" className="settings-whatsapp order-4 rounded-lg border border-slate-800 bg-slate-900/50 p-4 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <MessageSquare className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Mensagem de WhatsApp</h3>
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
      </section>

      <section id="settings-servicos" className="settings-services order-5 rounded-lg border border-slate-800 bg-slate-900/50 p-4 space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <Wrench className="w-5 h-5 text-primary" />
          <h3 className="text-sm font-semibold">Categorias de servicos</h3>
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
      </section>

      <section className="settings-oils order-6 rounded-lg border border-slate-800 bg-slate-900/50 p-4 space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <Droplets className="w-5 h-5 text-primary" />
          <h3 className="text-sm font-semibold">Oleo e itens disponiveis</h3>
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
      </section>

      <section id="settings-garantias" className="settings-warranties order-7 rounded-lg border border-slate-800 bg-slate-900/50 p-4 space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <ShieldCheck className="w-5 h-5 text-primary" />
          <h3 className="text-sm font-semibold">Categorias de garantia</h3>
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
      </section>

      <section id="settings-sobre" className="settings-about order-10">
      <div
        className={cn(
          'institutional-card rounded-2xl border p-6 space-y-5 w-full min-w-0',
          colorMode === 'light'
            ? 'bg-slate-100 text-slate-900 border-slate-300'
            : 'bg-gradient-to-br from-slate-800/80 to-slate-900/60 text-slate-100 border-slate-700/80'
        )}
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
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
        <ul className={cn('grid gap-2 text-sm xl:grid-cols-2', colorMode === 'light' ? 'text-slate-700' : 'text-slate-400')}>
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
            'flex flex-col gap-3 border-t pt-4 xl:flex-row xl:items-center xl:justify-between',
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
      </section>
      </div>
    </div>
  );
};
