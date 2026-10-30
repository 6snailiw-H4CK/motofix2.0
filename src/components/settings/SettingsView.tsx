import { type Dispatch, type KeyboardEvent, type SetStateAction, useEffect, useRef, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { toast as sonnerToast } from 'sonner';
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
  FolderOpen,
  HardDriveDownload,
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
import type { OfflineSyncStatus } from '../../hooks/useOfflineSyncStatus';
import { APP_VERSION, DEFAULT_SERVICE_TYPES } from '../../constants/appDefaults';
import { FailedWritesPanel } from './FailedWritesPanel';
import { canonicalServiceType, getServiceTypeKey, normalizeServiceTypeOptions } from '../../lib/serviceTypes';
import { cn } from '../../lib/utils';
import { isAdminRole, type ColorMode, type OperationalLog, type Settings, type UserProfile } from '../../types';
import type { BackupProgress, FullBackupPreflight, FullBackupRestoreResponse, LocalBackupInventory } from '../../services/systemBackupApi';
import { systemBackupApi } from '../../services/systemBackupApi';
import type { PortableBackupSummary } from '../../services/portableBackup';
import {
  choosePwaLocalBackupDirectory,
  createPwaLocalBackup,
  getPwaLocalBackupStatus,
  subscribePwaLocalBackupStatus,
} from '../../services/pwaLocalBackup';
import { CrossProjectBackupRestore } from './CrossProjectBackupRestore';

type SettingsViewProps = {
  currentUserId: string;
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
  onExportFullBackup: (password: string, onProgress: (progress: BackupProgress) => void, allowIncomplete?: boolean) => Promise<{ filename: string; summary: PortableBackupSummary; complete?: boolean; incompleteReasons?: string[] }>;
  onSyncForBackup: () => Promise<{ updatedDocuments: number }>;
  onValidateFullBackup: (file: File, password: string) => Promise<{ summary: PortableBackupSummary; preflight: FullBackupPreflight }>;
  onPrepareRestoreBackup: (file: File, password: string, onProgress: (progress: BackupProgress) => void) => Promise<{ filename: string; summary: PortableBackupSummary }>;
  onImportFullBackup: (file: File, password: string, confirmation: string, safetyBackupFilename: string | null, onProgress: (progress: BackupProgress) => void) => Promise<FullBackupRestoreResponse>;
  onImportClientsBackup: (file: File) => Promise<void> | void;
  isImportingClients: boolean;
  onExportProductsBackup: () => void;
  onImportProductsBackup: (file: File) => Promise<number> | number;
  isImportingProducts: boolean;
  onResetOperationalData: () => Promise<boolean> | boolean;
  isResettingOperationalData: boolean;
  offlineSyncStatus: OfflineSyncStatus;
  operationalLogs: OperationalLog[];
};

export const SettingsView = ({
  currentUserId,
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
  onSyncForBackup,
  onValidateFullBackup,
  onPrepareRestoreBackup,
  onImportFullBackup,
  onImportClientsBackup,
  isImportingClients,
  onExportProductsBackup,
  onImportProductsBackup,
  isImportingProducts,
  onResetOperationalData,
  isResettingOperationalData,
  offlineSyncStatus,
  operationalLogs,
}: SettingsViewProps) => {
  const [newServiceType, setNewServiceType] = useState('');
  const [newOilType, setNewOilType] = useState('');
  const [newWarrantyCategory, setNewWarrantyCategory] = useState('');
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetConfirmation, setResetConfirmation] = useState('');
  const [resetBackupReady, setResetBackupReady] = useState(false);
  const [isLocalBackupBusy, setIsLocalBackupBusy] = useState(false);
  const [isFullBackupBusy, setIsFullBackupBusy] = useState(false);
  const [backupProgress, setBackupProgress] = useState<BackupProgress | null>(null);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [backupPassword, setBackupPassword] = useState('');
  const [backupPasswordConfirmation, setBackupPasswordConfirmation] = useState('');
  const [restorePassword, setRestorePassword] = useState('');
  const [restoreConfirmation, setRestoreConfirmation] = useState('');
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoreSummary, setRestoreSummary] = useState<PortableBackupSummary | null>(null);
  const [restorePreflight, setRestorePreflight] = useState<FullBackupPreflight | null>(null);
  const [restoreSafetyFilename, setRestoreSafetyFilename] = useState<string | null>(null);
  const [restoreSafetyConfirmed, setRestoreSafetyConfirmed] = useState(false);
  const [localBackupStatus, setLocalBackupStatus] = useState(() => getPwaLocalBackupStatus(currentUserId));
  const clientImportInputRef = useRef<HTMLInputElement | null>(null);
  const productImportInputRef = useRef<HTMLInputElement | null>(null);
  const fullBackupImportInputRef = useRef<HTMLInputElement | null>(null);

  const handleFullBackupExport = async () => {
    if (backupPassword !== backupPasswordConfirmation) {
      setBackupMessage('As duas senhas digitadas não coincidem.');
      return;
    }
    setIsFullBackupBusy(true);
    setBackupMessage(null);
    setBackupProgress({ stage: 'Iniciando backup geral...' });
    try {
      let inventory: LocalBackupInventory = await systemBackupApi.inspectLocalBackupState(currentUserId);
      if (!inventory.storageReadable) {
        throw new Error('O MotoFix não conseguiu ler com segurança a fila ou todos os rascunhos locais. Corrija o armazenamento do navegador antes de exportar. Nenhuma fila foi limpa.');
      }

      const hasQueuedWrites = inventory.pendingWrites + inventory.failedWrites + inventory.unknownPendingWrites > 0;
      if (hasQueuedWrites) {
        const details = inventory.incompleteReasons.join('; ');
        if (!window.confirm(`Há alterações locais ainda não confirmadas (${details}). Deseja tentar sincronizar todas as coleções e conferir a fila antes de gerar o arquivo?`)) {
          setBackupMessage('Exportação cancelada. As alterações locais continuam preservadas no aparelho.');
          return;
        }
        try {
          setBackupProgress({ stage: 'Enviando alterações locais e atualizando as coleções para conferência.' });
          await onSyncForBackup();
        } catch (error) {
          setBackupMessage(`A sincronização não foi confirmada: ${error instanceof Error ? error.message : 'falha desconhecida'}. A fila foi preservada.`);
        }
        inventory = await systemBackupApi.inspectLocalBackupState(currentUserId);
      }

      if (!inventory.storageReadable) {
        throw new Error('O armazenamento local não ficou legível após a sincronização. Nenhum arquivo foi gerado.');
      }
      const allowIncomplete = inventory.incompleteReasons.length > 0;
      if (allowIncomplete && !window.confirm(`O arquivo não poderá ser considerado completo. Ainda há: ${inventory.incompleteReasons.join('; ')}. Esses dados serão incluídos somente como material local de recuperação e não serão reaplicados automaticamente. Gerar a cópia parcial mesmo assim?`)) {
        setBackupMessage(`Nenhum arquivo gerado. As alterações locais permanecem salvas no navegador: ${inventory.incompleteReasons.join('; ')}.`);
        return;
      }

      const result = await onExportFullBackup(backupPassword, setBackupProgress, allowIncomplete);
      const recordCount = Object.values(result.summary.counts).reduce((sum, count) => sum + count, 0);
      setBackupMessage(result.complete === false
        ? `CÓPIA PARCIAL criada: ${result.filename} · ${recordCount} registro(s). Não representa todas as alterações locais; consulte o material de recuperação no arquivo.`
        : `Arquivo criptografado conferido: ${result.filename} · ${recordCount} registro(s).`);
      setBackupPassword('');
      setBackupPasswordConfirmation('');
    } catch (error) {
      setBackupMessage(error instanceof Error ? error.message : 'Não foi possível criar o backup geral.');
    } finally {
      setIsFullBackupBusy(false);
      setBackupProgress(null);
    }
  };

  const handleValidateFullBackup = async () => {
    if (!restoreFile) return;
    setIsFullBackupBusy(true);
    setBackupMessage(null);
    setBackupProgress({ stage: 'Abrindo arquivo e validando senha, estrutura e integridade...' });
    setRestoreSummary(null);
    setRestorePreflight(null);
    setRestoreSafetyFilename(null);
    setRestoreSafetyConfirmed(false);
    try {
      const result = await onValidateFullBackup(restoreFile, restorePassword);
      setRestoreSummary(result.summary);
      setRestorePreflight(result.preflight);
      setBackupMessage('Arquivo validado. Nenhum dado foi alterado.');
    } catch (error) {
      setBackupMessage(error instanceof Error ? error.message : 'Não foi possível validar o arquivo.');
    } finally {
      setIsFullBackupBusy(false);
      setBackupProgress(null);
    }
  };

  const handlePrepareRestoreBackup = async () => {
    if (!restoreFile || !restoreSummary || !restorePreflight || restorePreflight.target !== 'existing') return;
    setIsFullBackupBusy(true);
    setBackupMessage(null);
    setBackupProgress({ stage: 'Criando uma cópia criptografada do destino atual.' });
    setRestoreSafetyConfirmed(false);
    try {
      const result = await onPrepareRestoreBackup(restoreFile, restorePassword, setBackupProgress);
      setRestoreSafetyFilename(result.filename);
      setBackupMessage(`Cópia de segurança criada para download: ${result.filename}. Confira o arquivo antes de continuar.`);
    } catch (error) {
      setBackupMessage(error instanceof Error ? error.message : 'Não foi possível criar a cópia de segurança anterior.');
    } finally {
      setIsFullBackupBusy(false);
      setBackupProgress(null);
    }
  };

  const handleFullBackupRestore = async () => {
    if (!restoreFile || !restoreSummary || !restorePreflight || restoreConfirmation !== 'RESTAURAR') return;
    setIsFullBackupBusy(true);
    setBackupMessage(null);
    setBackupProgress({ stage: 'Preparando a restauração...' });
    try {
      const result = await onImportFullBackup(restoreFile, restorePassword, restoreConfirmation, restoreSafetyFilename, setBackupProgress);
      setBackupMessage(result.verified
        ? `Restauração verificada: ${result.restoredTotal} registro(s) confirmados no Firebase.${result.preRestoreBackupFilename ? ` Cópia anterior: ${result.preRestoreBackupFilename}.` : ''}`
        : 'A restauração terminou com divergências na verificação. Não considere todos os dados recuperados.');
      setRestoreFile(null);
      setRestoreSummary(null);
      setRestorePreflight(null);
      setRestorePassword('');
      setRestoreConfirmation('');
      setRestoreSafetyFilename(null);
      setRestoreSafetyConfirmed(false);
      if (!result.verified) sonnerToast.warning('A restauração requer revisão. Consulte o relatório de verificação.');
      else sonnerToast.success('Restauração verificada no Firebase.');
    } catch (error) {
      setBackupMessage(error instanceof Error ? error.message : 'A restauração falhou. Verifique o relatório antes de tentar novamente.');
    } finally {
      setIsFullBackupBusy(false);
      setBackupProgress(null);
    }
  };

  const backupCollectionLabel = (name: string) => ({
    clients: 'clientes', maintenances: 'manutenções', warranties: 'garantias', appointments: 'agendamentos',
    expenses: 'gastos', products: 'mercadorias', stock_movements: 'movimentos de estoque',
    cash_launches: 'ordens de serviço e caixa', settings: 'configurações', message_logs: 'avisos enviados',
    operational_logs: 'histórico operacional', fiscal_companies: 'empresas fiscais', fiscal_invoices: 'notas fiscais',
    fiscal_logs: 'logs fiscais', fiscal_invoice_files: 'arquivos fiscais', whatsapp_sessions: 'sessões WhatsApp',
    whatsapp_messages: 'mensagens WhatsApp', whatsapp_contacts: 'contatos WhatsApp',
    whatsapp_automations: 'automações WhatsApp',
  } as Record<string, string>)[name] || name.replace(/_/g, ' ');

  useEffect(() => subscribePwaLocalBackupStatus(currentUserId, setLocalBackupStatus), [currentUserId]);

  const handleChooseLocalBackupDirectory = async () => {
    setIsLocalBackupBusy(true);
    try {
      setLocalBackupStatus(await choosePwaLocalBackupDirectory(currentUserId));
    } catch (error) {
      sonnerToast.error(error instanceof Error ? error.message : 'Não foi possível configurar a pasta de backup.');
    } finally {
      setIsLocalBackupBusy(false);
    }
  };

  const handleCreateLocalBackup = async () => {
    setIsLocalBackupBusy(true);
    try {
      const result = await createPwaLocalBackup(currentUserId);
      setLocalBackupStatus(result.status);
      if (result.skipped) {
        sonnerToast.info('A cópia automática de hoje já foi criada.');
      } else if (result.partial) {
        sonnerToast.warning(`Cópia local parcial salva: ${result.filename}. Confira a cobertura no arquivo.`);
      } else {
        sonnerToast.success(`Cópia local salva: ${result.filename}.`);
      }
    } catch (error) {
      sonnerToast.error(error instanceof Error ? error.message : 'Não foi possível criar o backup local.');
    } finally {
      setIsLocalBackupBusy(false);
    }
  };

  const manualAccessExpiry = userProfile?.manualAccess?.expiresAt ?? null;
  const manualAccessExpiryDate = manualAccessExpiry ? new Date(manualAccessExpiry) : null;
  const manualAccessCurrent = userProfile?.manualAccess?.enabled === true
    && !!manualAccessExpiryDate
    && Number.isFinite(manualAccessExpiryDate.getTime())
    && manualAccessExpiryDate.getTime() > Date.now();

  const updateSettings = (patch: Partial<Settings>) => {
    setSettings((current) => ({ ...current, ...patch }));
  };

  const oilTypes = settings.oilTypes || [];
  const serviceTypes = normalizeServiceTypeOptions(settings.serviceTypes || []);
  const disabledDefaultServiceTypes = settings.disabledDefaultServiceTypes || [];
  const disabledDefaultKeys = new Set(disabledDefaultServiceTypes.map(getServiceTypeKey));
  const activeDefaultServiceTypes = DEFAULT_SERVICE_TYPES.filter(type => !disabledDefaultKeys.has(getServiceTypeKey(type)));
  const warrantyCategories = settings.warrantyCategories || [];
  const canResetOperationalData = isAdminRole(userProfile?.role);
  const syncStatus = !offlineSyncStatus.isOnline
    ? { label: 'Offline', icon: CloudOff, className: 'border-red-500/30 bg-red-500/10 text-red-100' }
    : offlineSyncStatus.lastPersistenceError
      ? { label: 'Falha local', icon: AlertTriangle, className: 'border-red-500/30 bg-red-500/10 text-red-200' }
      : offlineSyncStatus.failedWrites > 0
        ? { label: 'Falha sync', icon: AlertTriangle, className: 'border-red-500/30 bg-red-500/10 text-red-200' }
        : offlineSyncStatus.isSyncing
          ? { label: 'Sincronizando', icon: CloudUpload, className: 'border-sky-500/30 bg-sky-500/10 text-sky-100' }
          : offlineSyncStatus.pendingWrites > 0
            ? { label: 'Pendente local', icon: CloudUpload, className: 'border-amber-500/30 bg-amber-500/10 text-amber-100' }
            : !offlineSyncStatus.networkEnabled
              ? { label: 'Modo local', icon: CloudOff, className: 'border-slate-500/30 bg-slate-500/10 text-slate-200' }
              : { label: 'Sem pendências', icon: CloudCheck, className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100' };
  const SyncIcon = syncStatus.icon;
  const formatSyncDate = (value: string | null) => {
    if (!value) return 'Nunca';
    try {
      return format(parseISO(value), 'dd/MM/yyyy HH:mm');
    } catch {
      return value;
    }
  };

  const fieldLabel = (field: string) => ({
    name: 'nome', clientName: 'cliente', bikeModel: 'moto/modelo', contact: 'contato',
    email: 'e-mail', vehiclePlate: 'placa', mileageKm: 'quilometragem',
    oilType: 'óleo', oilPrice: 'preço do óleo', serviceType: 'tipo de serviço',
    serviceValue: 'valor do serviço', status: 'status', statusPagamento: 'pagamento',
    valorPago: 'valor pago', saldoDevedor: 'saldo pendente', lastMaintenanceDate: 'data do serviço',
    nextMaintenanceDate: 'próxima manutenção', recurrenceDays: 'dias de recorrência',
    description: 'descrição', supplier: 'fornecedor', amount: 'valor', paymentMethod: 'forma de pagamento',
    date: 'data', dueDate: 'vencimento', note: 'observação', openingDate: 'data de abertura',
    expectedDate: 'data prevista', request: 'solicitação', servicesExecuted: 'serviços executados',
    observation: 'observação', items: 'itens', merchandiseTotal: 'total de mercadorias',
    servicesTotal: 'total de serviços', discountTotal: 'desconto', total: 'total',
    clientId: 'cliente vinculado', scheduledDate: 'data agendada', address: 'endereço',
    serviceRequested: 'serviço solicitado', value: 'valor', durationMonths: 'duração da garantia',
    expiryDate: 'vencimento da garantia', warrantyNumber: 'número da garantia',
    businessName: 'nome da empresa', businessPhone: 'telefone/WhatsApp', businessEmail: 'e-mail da oficina',
    businessInstagram: 'Instagram', businessAddress: 'endereço da oficina', isProfileComplete: 'perfil da oficina',
    whatsappTemplate: 'mensagem do WhatsApp', oilTypes: 'óleos disponíveis', serviceTypes: 'categorias de serviço',
    disabledDefaultServiceTypes: 'categorias de serviço', warrantyCategories: 'categorias de garantia',
    financialGoals: 'metas financeiras',
  } as Record<string, string>)[field] || field.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();

  const draftScopeLabel = (scope: string) => ({
    'cash-register': 'Ordem de Serviço',
    appointments: 'Agenda',
    expenses: 'Gastos',
    clients: 'Clientes',
    warranties: 'Garantias',
  } as Record<string, string>)[scope] || scope;

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
    setRestoreFile(file);
    setRestoreSummary(null);
    setRestorePreflight(null);
    setRestoreConfirmation('');
    setRestoreSafetyFilename(null);
    setRestoreSafetyConfirmed(false);
    setBackupMessage(null);
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
          <p className="mt-1 text-xs text-slate-400">Dados da oficina, acesso e preferencias do sistema.</p>
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
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold text-white">Acesso MotoFix</p>
          </div>
          <p className="mt-2 text-sm text-slate-300">
            {manualAccessCurrent
              ? `Acesso manual vigente até ${format(manualAccessExpiryDate as Date, 'dd/MM/yyyy')}.`
              : 'A ativação e a renovação dependem da análise e confirmação manual de um Master Admin.'}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Pagamentos não são processados pelo aplicativo. O status de billing legado não libera nem revoga o acesso.
            Para combinar a forma de pagamento, entre em contato com o suporte.
          </p>
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
            <p className="text-xs leading-relaxed text-slate-400">O arquivo .motofix reúne os dados de negócio confirmados no Firebase, protegido por senha. Antes da exportação, o MotoFix verifica a fila e os rascunhos locais e pode sincronizar as coleções para conferência. Se restarem alterações locais, só gera arquivo parcial após confirmação. A fila e os rascunhos ficam apenas como material de recuperação; não são reaplicados automaticamente.</p>

            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
              <div className="flex items-start gap-3">
                <HardDriveDownload className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                <div className="min-w-0 flex-1">
                  <h4 className="text-xs font-bold text-emerald-100">Cópia automática neste computador</h4>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                    Escolha uma pasta. O MotoFix criará um arquivo por dia após uma sincronização completa, enquanto esta aba estiver aberta. A geração usa o cache local e não faz uma leitura extra no Firebase.
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-amber-200/80">
                    Esta cópia PWA é parcial: inclui apenas dados presentes no cache, fila e rascunhos deste navegador; o histórico operacional fica limitado aos últimos 50 registros e anexos do Firebase Storage não são copiados. O JSON não é criptografado, contém dados de clientes e deve ficar numa pasta privada. A restauração ainda não é feita por este recurso.
                  </p>
                  <p className="mt-2 text-[11px] text-slate-300">
                    {!localBackupStatus.supported
                      ? 'Este navegador não oferece gravação direta em pasta. Use Chrome ou Edge atualizado.'
                      : localBackupStatus.configured
                        ? `Pasta escolhida: ${localBackupStatus.directoryName || 'configurada'}`
                        : 'Nenhuma pasta foi escolhida ainda.'}
                  </p>
                  {localBackupStatus.lastBackupAt && (
                    <p className="mt-1 text-[11px] text-slate-400">
                      Último arquivo: {localBackupStatus.lastFilename || 'backup local'} · {formatSyncDate(localBackupStatus.lastBackupAt)}
                      {localBackupStatus.lastResult === 'partial' ? ' · cobertura parcial' : ''}
                    </p>
                  )}
                  {localBackupStatus.lastMessage && (
                    <p className={cn('mt-1 text-[11px]', localBackupStatus.lastResult === 'error' ? 'text-red-300' : 'text-slate-400')}>
                      {localBackupStatus.lastMessage}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={isLocalBackupBusy || !localBackupStatus.supported}
                      onClick={() => void handleChooseLocalBackupDirectory()}
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-emerald-500/30 px-3 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <FolderOpen className="h-4 w-4" /> {localBackupStatus.configured ? 'Trocar pasta' : 'Escolher pasta'}
                    </button>
                    <button
                      type="button"
                      disabled={isLocalBackupBusy || !localBackupStatus.configured}
                      onClick={() => void handleCreateLocalBackup()}
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-emerald-700 px-3 text-xs font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Download className="h-4 w-4" /> {isLocalBackupBusy ? 'Salvando...' : 'Criar cópia local agora'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-3 xl:grid-cols-2">
              <div className="rounded-xl border border-slate-700/60 bg-slate-900/45 p-4">
                <h4 className="text-sm font-bold text-white">Backup completo criptografado</h4>
                <p className="mt-1 text-xs text-slate-400">Lê as coleções confirmadas no Firebase, confere uma assinatura antes e depois da leitura e salva um arquivo portátil .motofix. A conferência detecta mudanças observáveis durante a exportação; o Firestore não oferece uma fotografia transacional única entre todas as coleções.</p>
                <div className="mt-3 grid gap-2">
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={backupPassword}
                    onChange={(event) => setBackupPassword(event.target.value)}
                    placeholder="Senha do backup (mínimo 12 caracteres)"
                    className="h-10 rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs text-white outline-none focus:border-primary"
                  />
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={backupPasswordConfirmation}
                    onChange={(event) => setBackupPasswordConfirmation(event.target.value)}
                    placeholder="Confirme a senha"
                    className="h-10 rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs text-white outline-none focus:border-primary"
                  />
                  <button type="button" disabled={isFullBackupBusy || backupPassword.length < 12 || !backupPasswordConfirmation} onClick={() => void handleFullBackupExport()} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-xs font-bold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">
                    <Download className="h-4 w-4" /> {isFullBackupBusy ? 'Preparando...' : 'Criar backup criptografado'}
                  </button>
                </div>
              </div>

              <div className="hidden" aria-hidden="true">
                <h4 className="text-sm font-bold text-white">Validar ou restaurar arquivo</h4>
                <p className="mt-1 text-xs text-slate-400">A validação funciona sem conexão e não altera dados. A restauração exige conexão e confirmação.</p>
                <div className="mt-3 grid gap-2">
                  <button type="button" disabled={isFullBackupBusy} onClick={() => fullBackupImportInputRef.current?.click()} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-700 px-3 text-xs font-semibold text-slate-200 transition hover:bg-slate-800 disabled:opacity-50">
                    <Upload className="h-4 w-4" /> {restoreFile ? restoreFile.name : 'Selecionar arquivo .motofix'}
                  </button>
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={restorePassword}
                    onChange={(event) => {
                      setRestorePassword(event.target.value);
                      setRestoreSummary(null);
                      setRestorePreflight(null);
                      setRestoreSafetyFilename(null);
                      setRestoreSafetyConfirmed(false);
                    }}
                    placeholder="Senha usada para criar este arquivo"
                    className="h-10 rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs text-white outline-none focus:border-primary"
                  />
                  <button type="button" disabled={isFullBackupBusy || !restoreFile || restorePassword.length < 12} onClick={() => void handleValidateFullBackup()} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 text-xs font-bold text-sky-200 transition hover:bg-sky-500/15 disabled:cursor-not-allowed disabled:opacity-50">
                    {isFullBackupBusy ? 'Validando...' : 'Validar arquivo e destino'}
                  </button>
                </div>
              </div>
            </div>

            {(backupProgress || backupMessage) && (
              <div className={cn('rounded-lg border p-3 text-xs', backupMessage && /falhou|não foi|inválid|divergências|bloquead/i.test(backupMessage)
                ? 'border-red-500/30 bg-red-500/10 text-red-200'
                : 'border-sky-500/25 bg-sky-500/5 text-sky-100')}>
                {backupProgress && <p className="font-semibold">{backupProgress.stage}{typeof backupProgress.completed === 'number' && typeof backupProgress.total === 'number' ? ` · ${backupProgress.completed}/${backupProgress.total}` : ''}</p>}
                {backupMessage && <p className={backupProgress ? 'mt-1' : ''}>{backupMessage}</p>}
              </div>
            )}

            {false && restoreSummary && restorePreflight && (
              <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-bold text-emerald-100">Arquivo íntegro e senha confirmada</h4>
                    <p className="mt-1 text-xs text-slate-300">Oficina: {restoreSummary.workshopName || 'sem nome'} · gerado em {formatSyncDate(restoreSummary.generatedAt)} · {restoreSummary.totalRecords} registro(s).</p>
                  </div>
                  <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-[11px] font-bold text-amber-100">
                    {restorePreflight.target === 'empty' ? 'Destino sem registros' : `Destino existente: ${restorePreflight.totalExisting} registro(s)`}
                  </span>
                </div>
                <div className="mt-3 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                  {Object.entries(restoreSummary.counts).map(([name, count]) => (
                    <p key={name} className="rounded-md border border-slate-700/60 bg-slate-950/40 px-2.5 py-1.5 text-[11px] text-slate-300">
                      {backupCollectionLabel(name)}: <strong className="text-white">{count}</strong>
                      {(restorePreflight.conflictCounts[name] || 0) > 0 ? ` · ${restorePreflight.conflictCounts[name]} ID(s) serão atualizados` : ''}
                    </p>
                  ))}
                </div>
                {restorePreflight.warning && <p className="mt-3 text-[11px] text-amber-200">{restorePreflight.warning}</p>}
                {restoreSummary.notes.length > 0 && (
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-[11px] text-slate-400">
                    {restoreSummary.notes.map((note) => <li key={note}>{note}</li>)}
                  </ul>
                )}
                {restorePreflight.target === 'existing' && (
                  <div className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/5 p-3">
                    {!restoreSafetyFilename ? (
                      <>
                        <p className="text-[11px] font-semibold text-amber-200">Antes de gravar, baixe uma cópia criptografada da base atual com a senha deste arquivo.</p>
                        <button type="button" disabled={isFullBackupBusy} onClick={() => void handlePrepareRestoreBackup()} className="mt-2 inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-amber-500/30 px-3 text-xs font-bold text-amber-100 transition hover:bg-amber-500/10 disabled:cursor-not-allowed disabled:opacity-50">
                          <Download className="h-4 w-4" /> {isFullBackupBusy ? 'Preparando cópia...' : 'Baixar cópia do destino antes de restaurar'}
                        </button>
                      </>
                    ) : (
                      <>
                        <p className="text-[11px] font-semibold text-emerald-200">Arquivo de segurança preparado: {restoreSafetyFilename}</p>
                        <label className="mt-2 flex cursor-pointer items-start gap-2 text-[11px] text-slate-300">
                          <input type="checkbox" checked={restoreSafetyConfirmed} onChange={(event) => setRestoreSafetyConfirmed(event.target.checked)} className="mt-0.5 accent-emerald-500" />
                          Confirme que encontrou o arquivo criptografado na pasta de downloads e que guardará uma cópia.
                        </label>
                      </>
                    )}
                  </div>
                )}
                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                  <input
                    value={restoreConfirmation}
                    onChange={(event) => setRestoreConfirmation(event.target.value.trim().toUpperCase())}
                    placeholder="Digite RESTAURAR para confirmar"
                    className="h-10 rounded-lg border border-amber-500/30 bg-slate-950 px-3 text-xs text-white outline-none focus:border-amber-400"
                  />
                  <button type="button" disabled={isFullBackupBusy || restoreConfirmation !== 'RESTAURAR' || (restorePreflight.target === 'existing' && (!restoreSafetyFilename || !restoreSafetyConfirmed))} onClick={() => void handleFullBackupRestore()} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 text-xs font-bold text-white transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50">
                    {isFullBackupBusy ? 'Restaurando...' : 'Restaurar dados'}
                  </button>
                </div>
              </div>
            )}

            <div className="rounded-lg border border-sky-500/25 bg-sky-500/5 p-3 text-xs text-sky-100">
              Para recuperar uma oficina em outro projeto Firebase, use exclusivamente o fluxo abaixo. A restauração antiga na mesma conta foi retirada da tela porque poderia sobrescrever documentos e não remapeava a identidade para um novo projeto.
            </div>
            <CrossProjectBackupRestore />

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
              <span className="text-[10px] text-slate-500">{operationalLogs.length} evento(s) recente(s)</span>
            </div>
            {operationalLogs.length === 0 ? (
              <p className="text-xs text-slate-500">Nenhum evento operacional registrado ainda.</p>
            ) : (
              <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
                {operationalLogs.map((log) => (
                  <div key={log.id || `${log.timestamp}-${log.acao}`} className="grid gap-1 rounded-lg border border-slate-800 bg-slate-950/55 p-2 text-xs md:grid-cols-[8.5rem_1fr_7rem] md:items-center">
                    <span className="text-slate-500">{formatSyncDate(log.timestamp)}</span>
                    <span className="font-bold text-slate-200">
                      {({
                        cliente_criado: 'Cliente criado',
                        cliente_editado: 'Cliente atualizado',
                        cliente_removido: 'Cliente excluído',
                        cliente_restaurado: 'Cliente restaurado',
                        retorno_arquivado: 'Retorno arquivado',
                        retorno_restaurado: 'Retorno restaurado',
                        os_criada: 'O.S. criada',
                        os_atualizada: 'O.S. atualizada',
                        os_finalizada: 'O.S. finalizada',
                        os_cancelada: 'O.S. cancelada',
                        os_status_alterado: 'Status da O.S. alterado',
                        os_removida: 'O.S. excluída',
                        os_restaurada: 'O.S. restaurada',
                        agendamento_criado: 'Agendamento criado',
                        agendamento_concluido: 'Agendamento concluído',
                        agendamento_removido: 'Agendamento excluído',
                        agendamento_restaurado: 'Agendamento restaurado',
                        manutencao_criada: 'Serviço de manutenção registrado',
                        manutencao_removida: 'Serviço de manutenção excluído',
                        pagamento_confirmado: 'Pagamento confirmado',
                        aviso_removido: 'Log de aviso excluído',
                        aviso_restaurado: 'Log de aviso restaurado',
                        mercadoria_criada: 'Mercadoria cadastrada',
                        mercadoria_atualizada: 'Mercadoria atualizada',
                        mercadoria_removida: 'Mercadoria excluída',
                        mercadoria_restaurada: 'Mercadoria restaurada',
                        estoque_alterado: 'Estoque alterado',
                        despesa_criada: 'Gasto registrado',
                        despesa_removida: 'Gasto excluído',
                        despesa_restaurada: 'Gasto restaurado',
                        conta_paga: 'Conta paga',
                        garantia_criada: 'Garantia criada',
                        garantia_atualizada: 'Garantia atualizada',
                        garantia_removida: 'Garantia excluída',
                        garantia_restaurada: 'Garantia restaurada',
                        configuracoes_atualizadas: 'Configurações atualizadas',
                        importacao_concluida: 'Importação concluída',
                        receita_criada: 'Receita registrada',
                      } as Record<string, string>)[log.acao] || log.acao.replace(/_/g, ' ')}
                      {typeof log.details?.module === 'string' ? ` · ${log.details.module}` : null}
                      {Array.isArray(log.details?.fields) ? (
                        <span className="mt-0.5 block font-normal text-slate-400">
                          Campos: {(log.details.fields as unknown[])
                            .filter((field): field is string => typeof field === 'string')
                            .map(fieldLabel)
                            .join(', ')}
                        </span>
                      ) : null}
                      {log.details?.stockAffected === true ? (
                        <span className="mt-0.5 block font-normal text-amber-300">A operação também pode ter movimentado o estoque.</span>
                      ) : null}
                      {typeof log.details?.count === 'number'
                        || typeof log.details?.imported === 'number'
                        || typeof log.details?.created === 'number'
                        || typeof log.details?.updated === 'number' ? (
                        <span className="mt-0.5 block font-normal text-slate-400">
                          Registros: {typeof log.details?.count === 'number'
                            ? log.details.count
                            : typeof log.details?.imported === 'number'
                              ? log.details.imported
                              : (Number(log.details?.created) || 0) + (Number(log.details?.updated) || 0)}
                          {typeof log.details?.created === 'number' ? ` · novos: ${log.details.created}` : ''}
                          {typeof log.details?.updated === 'number' ? ` · atualizados: ${log.details.updated}` : ''}
                        </span>
                      ) : null}
                    </span>
                    <span className={cn('font-bold', log.resultado === 'erro'
                      ? 'text-red-300'
                      : log.syncStatus === 'sincronizado'
                        ? 'text-emerald-300'
                        : 'text-amber-200')}>
                      {log.resultado === 'erro' ? 'Erro' : log.syncStatus === 'sincronizado'
                        ? 'Sincronizado com Firebase'
                        : log.syncStatus === 'pendente'
                          ? 'Aguardando Firebase'
                          : log.syncStatus === 'offline' || log.resultado === 'salvo_offline'
                            ? 'Salvo offline'
                            : 'Sem confirmação do Firebase'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <FailedWritesPanel currentUserId={userProfile?.uid ?? null} />
        </section>

        <section id="settings-local-drafts" className="settings-local-drafts order-10 rounded-lg border border-amber-500/25 bg-slate-900/50 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-white">Rascunhos locais deste aparelho</h3>
              <p className="mt-1 text-xs text-slate-400">Formulários em andamento guardados neste navegador. Eles não fazem parte da fila de sincronização e ainda não foram enviados ao Firebase.</p>
            </div>
            <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-xs font-bold text-amber-200">
              {offlineSyncStatus.localDrafts.length} rascunho(s)
            </span>
          </div>
          {offlineSyncStatus.localDrafts.length === 0 ? (
            <p className="rounded-lg border border-slate-800 bg-slate-950/45 p-3 text-xs text-slate-500">Nenhum formulário salvo localmente para esta conta.</p>
          ) : (
            <div className="space-y-2">
              {offlineSyncStatus.localDrafts.map((draft, index) => (
                <article key={`${draft.scope}-${draft.createdAt}-${index}`} className="rounded-lg border border-slate-700/70 bg-slate-950/45 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-bold text-slate-100">{draft.label}</p>
                      <p className="mt-0.5 text-[11px] text-slate-400">Módulo: {draftScopeLabel(draft.scope)}</p>
                    </div>
                    <span className="text-[11px] font-semibold text-amber-200">Somente neste aparelho</span>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-400">
                    Atualizado em {formatSyncDate(draft.updatedAt)}
                    {draft.createdAt !== draft.updatedAt ? ` · iniciado em ${formatSyncDate(draft.createdAt)}` : ''}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-300">
                    Campos alterados: {draft.changedFields.length > 0 ? draft.changedFields.map(fieldLabel).join(', ') : 'ainda não identificados'}
                    {draft.legacy ? ' (rascunho antigo; campos estimados pelo conteúdo salvo)' : ''}
                  </p>
                </article>
              ))}
            </div>
          )}
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
        accept=".motofix,application/vnd.motofix.backup+json,application/json"
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
