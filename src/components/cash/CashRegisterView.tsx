import { format } from 'date-fns';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Activity,
  ArrowLeft,
  Check,
  Copy,
  Eye,
  FileText,
  History,
  PackageSearch,
  Plus,
  Printer,
  ReceiptText,
  RefreshCw,
  Save,
  Search,
  Send,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { parseBrazilianCurrency } from '../../lib/money';
import { cn, safeFormat } from '../../lib/utils';
import type { CashRegisterDraft } from '../../hooks/useCashRegisterActions';
import { clearLocalDraft, loadLocalDraft, saveLocalDraft } from '../../services/localDrafts';
import type {
  CashRegisterItem,
  CashRegisterLaunch,
  Client,
  ManualFiscalAttachment,
  ManualFiscalDocument,
  ManualFiscalDocumentStatus,
  ManualFiscalInfo,
  ProductCatalogItem,
  ProductCatalogVariation,
  Settings,
} from '../../types';

type QuickClientInput = Pick<Client, 'name'> & Partial<Pick<Client, 'contact' | 'bikeModel' | 'document' | 'email' | 'fullName'>>;

type CashRegisterViewProps = {
  cashLaunches: CashRegisterLaunch[];
  clients: Client[];
  products: ProductCatalogItem[];
  settings?: Settings | null;
  fiscalAutoIssueEnabled?: boolean;
  isSavingLaunch: boolean;
  deleteConfirmId?: string | null;
  deletingLaunchId?: string | null;
  initialLaunchId?: string | null;
  draftStorageKey?: string;
  onBack: () => void;
  onAutoIssueFiscalFromCashLaunch?: (cashLaunchId: string) => Promise<void> | void;
  onDeleteLaunchClick: (launch: CashRegisterLaunch) => void;
  onInitialLaunchLoaded?: () => void;
  onOpenRecurringServices?: () => void;
  onQuickSaveClient?: (client: QuickClientInput) => Promise<Client | null> | Client | null;
  onSaveLaunch: (draft: CashRegisterDraft, launchId?: string) => Promise<boolean> | boolean;
};

type MainTab = 'control' | 'history' | 'monitoring';
type WorkTab = 'opening' | 'items' | 'fiscal';
type MonitoringStatusFilter = 'all' | CashRegisterLaunch['status'];
type FiscalKind = 'nfce' | 'nfse';
type FiscalHistoryFilter = 'all' | 'pending' | 'issued' | 'cancelled';
type ProductPickerRow = {
  id: string;
  product: ProductCatalogItem;
  variation?: ProductCatalogVariation;
};

type CashRegisterLocalDraft = {
  editingLaunchId: string | null;
  editingOrderNumber: string;
  selectedClientId: string;
  clientName: string;
  bikeModel: string;
  status: CashRegisterLaunch['status'];
  isInvoiced: boolean;
  openingDate: string;
  expectedDate: string;
  observation: string;
  request: string;
  servicesExecuted: string;
  items: CashRegisterItem[];
  orderDiscountValueInput: string;
  orderDiscountPercentInput: string;
};

const statusOptions: CashRegisterLaunch['status'][] = ['Em Lancamento', 'Finalizado', 'Pendente'];
const fiscalStatusOptions: ManualFiscalDocumentStatus[] = ['Nao emitida', 'Emitida', 'Cancelada'];
const fiscalAttachmentMaxBytes = 180 * 1024;
const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const today = () => format(new Date(), 'yyyy-MM-dd');

const compactCurrency = (value: number) => currency.format(Number.isFinite(value) ? value : 0);

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const parseNumber = (value: string | number | null | undefined) => {
  return parseBrazilianCurrency(value);
};

const parsePositiveMoney = (value: string | number | null | undefined) => (
  Math.max(0, parseNumber(value))
);

const makeId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `item-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const normalizeSearch = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const formatShortOrderNumber = (orderNumber?: string) => {
  const raw = String(orderNumber || '').trim();
  if (!raw) return 'OS';

  const numericSuffix = raw.match(/(\d{6})$/)?.[1];
  if (numericSuffix) return `OS ${numericSuffix}`;

  const compact = raw.replace(/^LC[-_]?/i, '').replace(/[^a-z0-9]/gi, '');
  return compact ? `OS ${compact.slice(-6)}` : 'OS';
};

const calculateItem = (item: CashRegisterItem): CashRegisterItem => {
  const quantity = Math.max(1, Number(item.quantity) || 1);
  const unitPrice = parsePositiveMoney(item.unitPrice);
  const gross = quantity * unitPrice;
  const discountValue = parsePositiveMoney(item.discountValue);
  const discountPercent = parsePositiveMoney(item.discountPercent);
  const percentValue = gross * (discountPercent / 100);
  const totalDiscount = Math.min(gross, discountValue + percentValue);
  const total = Math.max(0, gross - totalDiscount);

  return {
    ...item,
    quantity,
    unitPrice,
    discountValue,
    discountPercent,
    netUnitPrice: quantity > 0 ? total / quantity : 0,
    total,
  };
};

const fieldClass = 'w-full rounded-lg border border-slate-700/60 bg-slate-950/50 px-2.5 py-1.5 text-[13px] text-slate-100 outline-none transition focus:border-primary/60 focus:ring-1 focus:ring-primary/50';
const editableCellClass = 'w-20 rounded-md border border-slate-600/70 bg-slate-900/90 px-2 py-1.5 text-right text-[13px] font-bold text-white outline-none transition focus:border-primary focus:ring-1 focus:ring-primary';
const editableTextCellClass = 'w-full min-w-56 rounded-md border border-slate-600/70 bg-slate-900/90 px-2 py-1.5 text-[13px] font-bold text-white outline-none transition focus:border-primary focus:ring-1 focus:ring-primary';
const labelClass = 'text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400';

const createDefaultManualFiscal = (): ManualFiscalInfo => ({
  nfce: { status: 'Nao emitida', xml: null, pdf: null },
  nfse: { status: 'Nao emitida', xml: null, pdf: null },
});

const normalizeManualFiscal = (value?: ManualFiscalInfo): ManualFiscalInfo => {
  const defaults = createDefaultManualFiscal();

  return {
    nfce: { ...defaults.nfce, ...(value?.nfce || {}) },
    nfse: { ...defaults.nfse, ...(value?.nfse || {}) },
    preparedAt: value?.preparedAt,
  };
};

const readAttachmentFile = (file: File): Promise<ManualFiscalAttachment> => (
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Nao foi possivel ler o arquivo fiscal.'));
    reader.onload = () => {
      resolve({
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        uploadedAt: new Date().toISOString(),
        dataUrl: String(reader.result || ''),
      });
    };
    reader.readAsDataURL(file);
  })
);

const normalizePhoneForWhatsapp = (value: string) => {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  return digits.startsWith('55') ? digits : `55${digits}`;
};

export const CashRegisterView = ({
  cashLaunches,
  clients,
  products,
  settings,
  fiscalAutoIssueEnabled = false,
  isSavingLaunch,
  deleteConfirmId,
  deletingLaunchId,
  initialLaunchId,
  draftStorageKey,
  onBack,
  onAutoIssueFiscalFromCashLaunch,
  onDeleteLaunchClick,
  onInitialLaunchLoaded,
  onOpenRecurringServices,
  onQuickSaveClient,
  onSaveLaunch,
}: CashRegisterViewProps) => {
  const [mainTab, setMainTab] = useState<MainTab>('control');
  const [workTab, setWorkTab] = useState<WorkTab>('opening');
  const [editingLaunchId, setEditingLaunchId] = useState<string | null>(null);
  const [editingOrderNumber, setEditingOrderNumber] = useState('');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [clientName, setClientName] = useState('');
  const [bikeModel, setBikeModel] = useState('');
  const [status, setStatus] = useState<CashRegisterLaunch['status']>('Em Lancamento');
  const [isInvoiced, setIsInvoiced] = useState(false);
  const [openingDate, setOpeningDate] = useState(today());
  const [expectedDate, setExpectedDate] = useState(today());
  const [observation, setObservation] = useState('');
  const [request, setRequest] = useState('');
  const [servicesExecuted, setServicesExecuted] = useState('');
  const [items, setItems] = useState<CashRegisterItem[]>([]);
  const [orderDiscountValueInput, setOrderDiscountValueInput] = useState('');
  const [orderDiscountPercentInput, setOrderDiscountPercentInput] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [isProductPickerOpen, setIsProductPickerOpen] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [monitoringStatusFilter, setMonitoringStatusFilter] = useState<MonitoringStatusFilter>('all');
  const [invoiceSuccess, setInvoiceSuccess] = useState<{ orderNumber: string; total: number } | null>(null);
  const [isQuickClientOpen, setIsQuickClientOpen] = useState(false);
  const [isSavingQuickClient, setIsSavingQuickClient] = useState(false);
  const [quickClientForm, setQuickClientForm] = useState<QuickClientInput>({ name: '', contact: '', bikeModel: '' });
  const [isDraftHydrated, setIsDraftHydrated] = useState(false);

  useEffect(() => {
    if (!draftStorageKey || initialLaunchId) {
      setIsDraftHydrated(true);
      return;
    }

    const draft = loadLocalDraft<CashRegisterLocalDraft>(draftStorageKey);
    if (draft?.data) {
      setEditingLaunchId(draft.data.editingLaunchId || null);
      setEditingOrderNumber(draft.data.editingOrderNumber || '');
      setSelectedClientId(draft.data.selectedClientId || '');
      setClientName(draft.data.clientName || '');
      setBikeModel(draft.data.bikeModel || '');
      setStatus(draft.data.status || 'Em Lancamento');
      setIsInvoiced(Boolean(draft.data.isInvoiced));
      setOpeningDate(draft.data.openingDate || today());
      setExpectedDate(draft.data.expectedDate || today());
      setObservation(draft.data.observation || '');
      setRequest(draft.data.request || '');
      setServicesExecuted(draft.data.servicesExecuted || '');
      setItems((draft.data.items || []).map((item) => calculateItem({ ...item, id: item.id || makeId() })));
      setOrderDiscountValueInput(draft.data.orderDiscountValueInput || '');
      setOrderDiscountPercentInput(draft.data.orderDiscountPercentInput || '');
      setMainTab('control');
      setWorkTab((draft.data.items || []).length > 0 ? 'items' : 'opening');
    }

    setIsDraftHydrated(true);
  }, [draftStorageKey, initialLaunchId]);

  const productPickerRows = useMemo<ProductPickerRow[]>(() => {
    const expandedRows: ProductPickerRow[] = products.flatMap((product): ProductPickerRow[] => {
      if (product.variations?.length) {
        return product.variations.map((variation) => ({
          id: `${product.id}:${variation.id}`,
          product,
          variation,
        }));
      }

      return [{ id: product.id, product }];
    });
    const search = normalizeSearch(productSearch.trim());
    const rows = search
      ? expandedRows.filter(({ product, variation }) => {
        const haystack = normalizeSearch(`${product.sourceCode} ${product.description} ${product.variation || ''} ${variation?.name || ''} ${variation?.salePrice || ''} ${product.ncm}`);
        return haystack.includes(search);
      })
      : expandedRows;

    return rows.slice(0, 80);
  }, [productSearch, products]);

  const filteredLaunches = useMemo(() => {
    const search = normalizeSearch(historySearch.trim());
    if (!search) return cashLaunches;
    return cashLaunches.filter((launch) => {
      const haystack = normalizeSearch(`${launch.orderNumber} ${launch.clientName} ${launch.status} ${launch.total}`);
      return haystack.includes(search);
    });
  }, [cashLaunches, historySearch]);

  const monitoredLaunches = useMemo(() => (
    monitoringStatusFilter === 'all'
      ? cashLaunches
      : cashLaunches.filter((launch) => launch.status === monitoringStatusFilter)
  ), [cashLaunches, monitoringStatusFilter]);

  useEffect(() => {
    if (!invoiceSuccess) return undefined;

    const timer = window.setTimeout(() => setInvoiceSuccess(null), 7000);
    return () => window.clearTimeout(timer);
  }, [invoiceSuccess]);

  const totals = useMemo(() => {
    const merchandiseGross = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const itemsNetTotal = items.reduce((sum, item) => sum + item.total, 0);
    const itemDiscountTotal = Math.max(0, merchandiseGross - itemsNetTotal);
    const orderDiscountValue = Math.max(0, parseNumber(orderDiscountValueInput));
    const orderDiscountPercent = Math.min(100, Math.max(0, parseNumber(orderDiscountPercentInput)));
    const percentDiscountValue = itemsNetTotal * (orderDiscountPercent / 100);
    const orderDiscountTotal = Math.min(itemsNetTotal, orderDiscountValue + percentDiscountValue);
    const total = Math.max(0, itemsNetTotal - orderDiscountTotal);

    return {
      discountTotal: itemDiscountTotal + orderDiscountTotal,
      itemDiscountTotal,
      merchandiseGross,
      orderDiscountPercent,
      orderDiscountTotal,
      orderDiscountValue,
      servicesTotal: 0,
      total,
    };
  }, [items, orderDiscountPercentInput, orderDiscountValueInput]);

  const selectedClient = clients.find((client) => client.id === selectedClientId);

  const selectClient = (clientId: string) => {
    setSelectedClientId(clientId);
    const client = clients.find((item) => item.id === clientId);
    if (client) {
      setClientName(client.name || '');
      setBikeModel(client.bikeModel || '');
    }
  };

  const updateQuickClientForm = (patch: Partial<QuickClientInput>) => {
    setQuickClientForm((current) => ({ ...current, ...patch }));
  };

  const resetQuickClientForm = () => {
    setQuickClientForm({ name: '', contact: '', bikeModel: '' });
    setIsQuickClientOpen(false);
  };

  const handleQuickClientSave = async () => {
    const name = quickClientForm.name.trim();
    if (!name || !onQuickSaveClient) return;

    setIsSavingQuickClient(true);
    try {
      const createdClient = await Promise.resolve(onQuickSaveClient({
        name,
        contact: quickClientForm.contact?.trim() || '',
        bikeModel: quickClientForm.bikeModel?.trim() || '',
      }));

      if (createdClient?.id) {
        setSelectedClientId(createdClient.id);
      }
      setClientName(createdClient?.name || name);
      setBikeModel(createdClient?.bikeModel || quickClientForm.bikeModel?.trim() || '');
      resetQuickClientForm();
    } finally {
      setIsSavingQuickClient(false);
    }
  };

  const handlePrintOrder = () => {
    const draft = buildDraft();
    const orderNumber = editingOrderNumber || 'Lancamento nao salvo';
    const businessName = settings?.businessName?.trim();
    const businessPhone = (settings?.businessPhone || settings?.businessWhatsapp || '').trim();
    const businessInstagram = settings?.businessInstagram?.trim();
    const businessAddress = settings?.businessAddress?.trim();
    const companyLines = [
      businessName,
      businessPhone ? `WhatsApp: ${businessPhone}` : '',
      businessInstagram ? `Instagram: ${businessInstagram}` : '',
      businessAddress ? `Endereco: ${businessAddress}` : '',
    ].filter(Boolean);
    const companyInfo = companyLines.length
      ? companyLines.map((line) => `<div>${escapeHtml(line)}</div>`).join('')
      : '<div>Ordem de servico para conferencia do cliente</div>';
    const itemRows = draft.items.map((item, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(item.sourceCode)}</td>
        <td>
          ${escapeHtml(item.description)}
          ${item.variation ? `<div class="muted">Variacao: ${escapeHtml(item.variation)}</div>` : ''}
        </td>
        <td class="right">${item.quantity.toLocaleString('pt-BR')}</td>
        <td class="right">${compactCurrency(item.netUnitPrice)}</td>
        <td class="right">${compactCurrency(item.total)}</td>
      </tr>
    `).join('');
    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) return;

    printWindow.document.write(`<!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Ordem de Servico - ${escapeHtml(orderNumber)}</title>
          <style>
            * { box-sizing: border-box; }
            body { font-family: Arial, sans-serif; color: #111827; margin: 32px; }
            .top { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #ef4444; padding-bottom: 16px; margin-bottom: 20px; }
            .brand { font-size: 24px; font-weight: 800; color: #ef4444; }
            .company { margin-top: 4px; line-height: 1.45; }
            .muted { color: #64748b; font-size: 12px; }
            h1 { font-size: 22px; margin: 0 0 4px; }
            .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 24px; margin: 18px 0; }
            .box { border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px; }
            .label { color: #64748b; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; }
            .value { margin-top: 4px; font-size: 14px; font-weight: 700; }
            table { width: 100%; border-collapse: collapse; margin-top: 18px; font-size: 12px; }
            th { background: #ef4444; color: white; text-align: left; padding: 9px; }
            td { border-bottom: 1px solid #e2e8f0; padding: 9px; vertical-align: top; }
            .right { text-align: right; }
            .totals { margin-left: auto; margin-top: 18px; width: 300px; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; }
            .totals div { display: flex; justify-content: space-between; padding: 10px 12px; border-bottom: 1px solid #e2e8f0; }
            .totals div:last-child { border-bottom: 0; background: #fff1f2; color: #dc2626; font-weight: 800; }
            .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 60px; margin-top: 56px; font-size: 12px; }
            .line { border-top: 1px solid #111827; padding-top: 8px; text-align: center; }
            @media print { body { margin: 18mm; } }
          </style>
        </head>
        <body>
          <div class="top">
            <div>
              <div class="brand">MotoFix</div>
              <div class="muted company">${companyInfo}</div>
            </div>
            <div style="text-align:right">
              <h1>${escapeHtml(orderNumber)}</h1>
              <div class="muted">Emitido em ${safeFormat(new Date(), 'dd/MM/yyyy HH:mm')}</div>
            </div>
          </div>

          <div class="grid">
            <div class="box"><div class="label">Cliente</div><div class="value">${escapeHtml(draft.clientName)}</div></div>
            <div class="box"><div class="label">Moto / Placa</div><div class="value">${escapeHtml(draft.bikeModel || '-')}</div></div>
            <div class="box"><div class="label">Abertura</div><div class="value">${safeFormat(draft.openingDate) || '-'}</div></div>
            <div class="box"><div class="label">Status</div><div class="value">${escapeHtml(draft.status)}</div></div>
          </div>

          ${(draft.request || draft.servicesExecuted || draft.observation) ? `
            <div class="box">
              ${draft.request ? `<div><span class="label">Solicitacao</span><div class="value">${escapeHtml(draft.request)}</div></div>` : ''}
              ${draft.servicesExecuted ? `<div style="margin-top:10px"><span class="label">Servicos executados</span><div class="value">${escapeHtml(draft.servicesExecuted)}</div></div>` : ''}
              ${draft.observation ? `<div style="margin-top:10px"><span class="label">Observacao</span><div class="value">${escapeHtml(draft.observation)}</div></div>` : ''}
            </div>
          ` : ''}

          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Codigo</th>
                <th>Item</th>
                <th class="right">Qtd</th>
                <th class="right">Unit. liquido</th>
                <th class="right">Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemRows || '<tr><td colspan="6" style="text-align:center;color:#64748b">Nenhum item incluido.</td></tr>'}
            </tbody>
          </table>

          <div class="totals">
            <div><span>Mercadorias</span><strong>${compactCurrency(draft.merchandiseTotal)}</strong></div>
            <div><span>Descontos</span><strong>${compactCurrency(draft.discountTotal)}</strong></div>
            <div><span>Total</span><strong>${compactCurrency(draft.total)}</strong></div>
          </div>

          <div class="sign">
            <div class="line">Assinatura do cliente</div>
            <div class="line">Responsavel ${escapeHtml(businessName || 'MotoFix')}</div>
          </div>
          <script>
            window.onload = () => {
              window.print();
              window.onafterprint = () => window.close();
            };
          </script>
        </body>
      </html>`);
    printWindow.document.close();
  };

  const addProduct = (product: ProductCatalogItem, variation?: ProductCatalogVariation) => {
    const variationId = variation?.id || '';
    const variationName = variation?.name || product.variation || '';
    const salePrice = parsePositiveMoney(variation?.salePrice ?? product.salePrice);

    setItems((current) => {
      const existing = current.find((item) => (
        item.productId === product.id
        && (item.variationId || '') === variationId
      ));
      if (existing) {
        return current.map((item) => (
          item.id === existing.id ? calculateItem({ ...item, quantity: item.quantity + 1 }) : item
        ));
      }

      return [
        ...current,
        calculateItem({
          id: makeId(),
          productId: product.id,
          variationId,
          sourceCode: product.sourceCode,
          description: product.description,
          variation: variationName,
          ncm: product.ncm,
          quantity: 1,
          unitPrice: salePrice,
          discountValue: 0,
          discountPercent: 0,
          netUnitPrice: salePrice,
          total: salePrice,
          date: openingDate,
          note: '',
        }),
      ];
    });
    setWorkTab('items');
    setIsProductPickerOpen(false);
  };

  const updateItem = (itemId: string, patch: Partial<CashRegisterItem>) => {
    setItems((current) => current.map((item) => (
      item.id === itemId ? calculateItem({ ...item, ...patch }) : item
    )));
  };

  const updateItemQuantity = (itemId: string, value: string) => {
    const quantity = Math.max(1, Math.round(parseNumber(value)));
    updateItem(itemId, { quantity });
  };

  const loadLaunchForEdit = (launch: CashRegisterLaunch) => {
    setEditingLaunchId(launch.id);
    setEditingOrderNumber(launch.orderNumber);
    setSelectedClientId(launch.clientId || '');
    setClientName(launch.clientName || '');
    setBikeModel(launch.bikeModel || '');
    setStatus(launch.status);
    setIsInvoiced(launch.status === 'Finalizado' && Boolean(launch.invoiced));
    setOpeningDate(launch.openingDate || today());
    setExpectedDate(launch.expectedDate || today());
    setObservation(launch.observation || '');
    setRequest(launch.request || '');
    setServicesExecuted(launch.servicesExecuted || '');
    setItems((launch.items || []).map((item) => calculateItem({ ...item, id: item.id || makeId() })));
    setOrderDiscountValueInput(launch.orderDiscountValue ? String(launch.orderDiscountValue) : '');
    setOrderDiscountPercentInput(launch.orderDiscountPercent ? String(launch.orderDiscountPercent) : '');
    setMainTab('control');
    setWorkTab('items');
  };

  useEffect(() => {
    if (!initialLaunchId) return;

    const launch = cashLaunches.find((item) => item.id === initialLaunchId);
    if (!launch) return;

    loadLaunchForEdit(launch);
    onInitialLaunchLoaded?.();
  }, [cashLaunches, initialLaunchId, onInitialLaunchLoaded]);

  const resetDraft = () => {
    setEditingLaunchId(null);
    setEditingOrderNumber('');
    setSelectedClientId('');
    setClientName('');
    setBikeModel('');
    setStatus('Em Lancamento');
    setIsInvoiced(false);
    setOpeningDate(today());
    setExpectedDate(today());
    setObservation('');
    setRequest('');
    setServicesExecuted('');
    setItems([]);
    setOrderDiscountValueInput('');
    setOrderDiscountPercentInput('');
    setWorkTab('opening');
    if (draftStorageKey) clearLocalDraft(draftStorageKey);
  };

  const startNewOrder = () => {
    resetDraft();
    setMainTab('control');
    setWorkTab('opening');
    setIsProductPickerOpen(false);
    setInvoiceSuccess(null);
  };

  const handleStatusChange = (nextStatus: CashRegisterLaunch['status']) => {
    setStatus(nextStatus);
    if (nextStatus !== 'Finalizado') {
      setIsInvoiced(false);
    }
  };

  const buildDraft = (statusOverride?: CashRegisterLaunch['status'], invoiced = false): CashRegisterDraft => {
    const finalStatus = statusOverride || status;
    const finalInvoiced = finalStatus === 'Finalizado' && (invoiced || isInvoiced);

    return {
      ...(selectedClientId ? { clientId: selectedClientId } : {}),
      clientName: clientName.trim() || selectedClient?.name || 'Consumidor final',
      bikeModel: bikeModel.trim() || selectedClient?.bikeModel || '',
      status: finalStatus,
      openingDate,
      expectedDate,
      request: request.trim(),
      servicesExecuted: servicesExecuted.trim(),
      observation: observation.trim(),
      items,
      merchandiseTotal: totals.merchandiseGross,
      servicesTotal: totals.servicesTotal,
      discountTotal: totals.discountTotal,
      orderDiscountValue: totals.orderDiscountValue,
      orderDiscountPercent: totals.orderDiscountPercent,
      total: totals.total,
      invoiced: finalInvoiced,
    };
  };

  useEffect(() => {
    if (!draftStorageKey || !isDraftHydrated) return;

    const hasContent = Boolean(
      editingLaunchId
      || selectedClientId
      || clientName.trim()
      || bikeModel.trim()
      || observation.trim()
      || request.trim()
      || servicesExecuted.trim()
      || items.length > 0
      || orderDiscountValueInput.trim()
      || orderDiscountPercentInput.trim()
    );

    if (!hasContent) {
      clearLocalDraft(draftStorageKey);
      return;
    }

    saveLocalDraft<CashRegisterLocalDraft>(draftStorageKey, 'O.S. em andamento', 'cash-register', {
      editingLaunchId,
      editingOrderNumber,
      selectedClientId,
      clientName,
      bikeModel,
      status,
      isInvoiced,
      openingDate,
      expectedDate,
      observation,
      request,
      servicesExecuted,
      items,
      orderDiscountValueInput,
      orderDiscountPercentInput,
    });
  }, [bikeModel, clientName, draftStorageKey, editingLaunchId, editingOrderNumber, expectedDate, isDraftHydrated, isInvoiced, items, observation, openingDate, orderDiscountPercentInput, orderDiscountValueInput, request, selectedClientId, servicesExecuted, status]);

  const handleSave = async (statusOverride?: CashRegisterLaunch['status'], invoiced = false) => {
    const isInvoiceAction = statusOverride === 'Finalizado' && invoiced;
    const successOrderNumber = editingOrderNumber || 'Novo lancamento';
    const successTotal = totals.total;
    const shouldAutoIssueFiscal = Boolean(invoiced && statusOverride === 'Finalizado' && fiscalAutoIssueEnabled && editingLaunchId);
    const saved = await Promise.resolve(onSaveLaunch(buildDraft(statusOverride, invoiced), editingLaunchId || undefined));
    if (saved) {
      if (isInvoiceAction) {
        setInvoiceSuccess({
          orderNumber: successOrderNumber,
          total: successTotal,
        });
      }
      if (shouldAutoIssueFiscal && editingLaunchId) {
        await Promise.resolve(onAutoIssueFiscalFromCashLaunch?.(editingLaunchId));
      }
      resetDraft();
    }
  };

  return (
    <div className="cash-register-view space-y-3 text-[13px]">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onBack}
            className="grid h-9 w-9 place-items-center rounded-lg border border-slate-700/70 bg-slate-900/70 text-slate-300 transition-colors hover:border-primary/50 hover:text-white"
            aria-label="Voltar"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">Modulo teste</p>
            <h2 className="text-xl font-black tracking-tight text-white">Lancamentos Caixa</h2>
            <p className="text-xs text-slate-500">Venda rapida com cliente, mercadorias importadas e historico.</p>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="rounded-lg border border-slate-700/60 bg-slate-900/70 px-3 py-2 text-xs text-slate-400">
            <span className="font-bold text-white">{products.length}</span> mercadoria(s)
          </div>
        </div>
      </div>

      {invoiceSuccess && (
        <div className="flex flex-col gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-50 shadow-lg shadow-emerald-950/20 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-500/20 text-emerald-300">
              <Check className="h-4 w-4" />
            </span>
            <div>
              <p className="font-black text-white">Faturamento confirmado</p>
              <p className="mt-0.5 text-xs text-emerald-100/80">
                {invoiceSuccess.orderNumber} foi faturada com sucesso no valor de {compactCurrency(invoiceSuccess.total)}.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setInvoiceSuccess(null)}
            className="rounded-lg bg-emerald-500/15 px-3 py-1.5 text-[11px] font-black uppercase tracking-wide text-emerald-100 transition hover:bg-emerald-500/25"
          >
            Ok
          </button>
        </div>
      )}

      {onOpenRecurringServices && (
        <div className="hidden lg:grid lg:grid-cols-[minmax(0,300px)]">
          <button
            type="button"
            onClick={onOpenRecurringServices}
            className="group flex items-center gap-3 rounded-xl border border-primary/25 bg-primary/10 p-3 text-left shadow-lg shadow-primary/5 transition hover:border-primary/50 hover:bg-primary/15"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary text-white shadow-lg shadow-primary/20">
              <RefreshCw className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-black text-white">Recorrencia</span>
              <span className="mt-0.5 block text-xs text-slate-400 group-hover:text-slate-300">
                Ordens de servico e clientes recorrentes
              </span>
            </span>
          </button>
        </div>
      )}

      <section className="overflow-hidden rounded-xl border border-slate-700/60 bg-slate-900/55 shadow-xl shadow-black/15">
        <div className="flex flex-wrap border-b border-slate-700/60 bg-slate-950/50">
          {[
            { id: 'control' as MainTab, label: 'Controle', icon: ReceiptText },
            { id: 'history' as MainTab, label: 'Historico', icon: History },
            { id: 'monitoring' as MainTab, label: 'Monitoramento', icon: Activity },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = mainTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setMainTab(tab.id)}
                className={cn(
                  'inline-flex min-h-10 items-center gap-2 border-b-2 px-4 text-xs font-bold uppercase tracking-wide transition-colors',
                  isActive
                    ? 'border-primary bg-primary/10 text-white'
                    : 'border-transparent text-slate-400 hover:bg-slate-900 hover:text-white'
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {mainTab === 'control' && (
          <div className="space-y-3 p-3">
            <div className="flex flex-wrap gap-2 border-b border-slate-700/50 pb-2.5">
              {[
                { id: 'opening' as WorkTab, label: 'Abertura' },
                { id: 'items' as WorkTab, label: 'Mercadorias / Servicos' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setWorkTab(tab.id)}
                  className={cn(
                    'rounded-lg px-3 py-1.5 text-xs font-bold transition',
                    workTab === tab.id ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-slate-950/60 text-slate-400 hover:text-white'
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {editingLaunchId && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={startNewOrder}
                  className="rounded-lg bg-slate-900/80 px-3 py-1.5 text-xs font-bold text-slate-200 transition hover:bg-slate-800"
                >
                  Novo lancamento
                </button>
              </div>
            )}

            {workTab === 'opening' ? (
              <div className="grid gap-3 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)] 2xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
                <div className="space-y-3">
                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                    <div className="space-y-1">
                      <label className={labelClass}>Status</label>
                      <select value={status} onChange={(event) => handleStatusChange(event.target.value as CashRegisterLaunch['status'])} className={fieldClass}>
                        {statusOptions.map((option) => <option key={option}>{option}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <label className={labelClass}>Cliente</label>
                      <div className="flex gap-2">
                        <select value={selectedClientId} onChange={(event) => selectClient(event.target.value)} className={cn(fieldClass, 'min-w-0 flex-1')}>
                          <option value="">-- NAO INFORMADO --</option>
                          {clients.map((client) => (
                            <option key={client.id} value={client.id}>{client.name} {client.bikeModel ? `- ${client.bikeModel}` : ''}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => setIsQuickClientOpen(true)}
                          disabled={!onQuickSaveClient}
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-primary/45 bg-primary/10 text-primary transition hover:bg-primary hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                          title="Cadastro rapido de cliente"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className={labelClass}>Abertura</label>
                      <input type="date" value={openingDate} onChange={(event) => setOpeningDate(event.target.value)} className={fieldClass} />
                    </div>
                    <div className="space-y-1">
                      <label className={labelClass}>Prevista</label>
                      <input type="date" value={expectedDate} onChange={(event) => setExpectedDate(event.target.value)} className={fieldClass} />
                    </div>
                    <div className="space-y-1">
                      <label className={labelClass}>Nome livre</label>
                      <input value={clientName} onChange={(event) => setClientName(event.target.value)} placeholder="Consumidor final" className={fieldClass} />
                    </div>
                    <div className="space-y-1">
                      <label className={labelClass}>Moto / Placa</label>
                      <input value={bikeModel} onChange={(event) => setBikeModel(event.target.value)} placeholder="Honda CG 160" className={fieldClass} />
                    </div>
                  </div>

                  <div className="grid gap-2 lg:grid-cols-[1fr_1fr]">
                    <div className="space-y-1">
                      <label className={labelClass}>Observacao</label>
                      <textarea
                        value={observation}
                        onChange={(event) => setObservation(event.target.value)}
                        rows={3}
                        placeholder="Observacoes gerais do lancamento..."
                        className={cn(fieldClass, 'resize-none')}
                      />
                    </div>
                    <div className="grid gap-2">
                      <div className="space-y-1">
                        <label className={labelClass}>Solicitacao</label>
                        <input value={request} onChange={(event) => setRequest(event.target.value)} placeholder="Pedido do cliente" className={fieldClass} />
                      </div>
                      <div className="space-y-1">
                        <label className={labelClass}>Servicos Executados</label>
                        <input value={servicesExecuted} onChange={(event) => setServicesExecuted(event.target.value)} placeholder="Resumo executado" className={fieldClass} />
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setWorkTab('items');
                      setIsProductPickerOpen(true);
                    }}
                    className="flex min-h-20 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-primary/40 bg-primary/5 text-xs font-bold text-primary transition hover:bg-primary/10"
                  >
                    <PackageSearch className="h-5 w-5" />
                    Abrir mercadorias / servicos
                  </button>
                </div>

                <div className="rounded-xl border border-slate-700/50 bg-slate-950/40 p-3">
                  <div className="flex items-center justify-between gap-3 border-b border-slate-700/50 pb-2">
                    <div>
                      <p className={labelClass}>Itens selecionados</p>
                      <h3 className="text-base font-black text-white">{items.length} item(ns)</h3>
                    </div>
                    <button type="button" onClick={() => setIsProductPickerOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white">
                      <Plus className="h-4 w-4" />
                      Incluir
                    </button>
                  </div>

                  <div className="mt-2 max-h-72 space-y-2 overflow-y-auto pr-1">
                    {items.length === 0 ? (
                      <p className="rounded-lg bg-slate-900/70 p-3 text-xs text-slate-500">Nenhuma mercadoria incluida ainda.</p>
                    ) : (
                      items.slice(0, 5).map((item) => (
                        <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg bg-slate-900/70 p-2">
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-bold text-white">{item.description}</p>
                            <p className="text-xs text-slate-500">
                              Cod. {item.sourceCode} | {item.variation ? `Var. ${item.variation} | ` : ''}NCM {item.ncm || '-'}
                            </p>
                          </div>
                          <p className="shrink-0 text-[13px] font-black text-primary">{compactCurrency(item.total)}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className={labelClass}>Mercadorias / Servicos</p>
                    <h3 className="text-base font-black text-white">{items.length} item(ns) no lancamento</h3>
                  </div>
                  <button type="button" onClick={() => setIsProductPickerOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white shadow-lg shadow-primary/20">
                    <Plus className="h-4 w-4" />
                    Incluir
                  </button>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-700/50">
                  <table className="min-w-[1080px] w-full text-left text-[13px]">
                    <thead className="bg-primary/90 text-white">
                      <tr>
                        <th className="px-2.5 py-1.5">Excluir</th>
                        <th className="px-2.5 py-1.5">Codigo</th>
                        <th className="px-2.5 py-1.5">Descricao</th>
                        <th className="px-2.5 py-1.5">Variacao</th>
                        <th className="px-2.5 py-1.5">Qtd</th>
                        <th className="px-2.5 py-1.5">Unitario R$</th>
                        <th className="px-2.5 py-1.5">Total Liquido R$</th>
                        <th className="px-2.5 py-1.5">Data</th>
                        <th className="px-2.5 py-1.5">Observacao</th>
                      </tr>
                    </thead>
                    <tbody className="bg-slate-950/40">
                      {items.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="px-3 py-8 text-center text-slate-500">Clique em Incluir para pesquisar uma mercadoria importada.</td>
                        </tr>
                      ) : (
                        items.map((item) => (
                          <tr
                            key={item.id}
                            className="border-b-[3px] border-yellow-300 last:border-b-0 hover:bg-slate-900/70"
                          >
                            <td className="px-2.5 py-1.5">
                              <button type="button" onClick={() => setItems((current) => current.filter((row) => row.id !== item.id))} className="rounded-md bg-red-500/10 p-1.5 text-red-400 hover:bg-red-500/20">
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                            <td className="px-2.5 py-1.5 font-bold text-slate-300">{item.sourceCode}</td>
                            <td className="min-w-[16rem] max-w-sm px-2.5 py-1.5">
                              <input
                                value={item.description}
                                onChange={(event) => updateItem(item.id, { description: event.target.value })}
                                className={editableTextCellClass}
                                title="Editar nome/descricao do item"
                              />
                            </td>
                            <td className="px-2.5 py-1.5">
                              <input
                                value={item.variation || ''}
                                onChange={(event) => updateItem(item.id, { variation: event.target.value })}
                                className="w-36 rounded-md border border-slate-600/70 bg-slate-900/90 px-2 py-1.5 text-[13px] font-bold text-white outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
                                placeholder="Marca/modelo"
                              />
                            </td>
                            <td className="px-2.5 py-1.5">
                              <input
                                type="number"
                                min="1"
                                step="1"
                                value={item.quantity}
                                onChange={(event) => updateItemQuantity(item.id, event.target.value)}
                                className={editableCellClass}
                              />
                            </td>
                            <td className="px-2.5 py-1.5">
                              <input value={String(item.unitPrice)} onChange={(event) => updateItem(item.id, { unitPrice: parseNumber(event.target.value) })} className={editableCellClass} />
                            </td>
                            <td className="px-2.5 py-1.5 text-right font-black text-primary">{compactCurrency(item.total)}</td>
                            <td className="px-2.5 py-1.5">
                              <input type="date" value={item.date} onChange={(event) => updateItem(item.id, { date: event.target.value })} className="w-36 rounded-md bg-slate-900 px-2 py-1.5 text-[13px] outline-none focus:ring-1 focus:ring-primary" />
                            </td>
                            <td className="px-2.5 py-1.5">
                              <input value={item.note || ''} onChange={(event) => updateItem(item.id, { note: event.target.value })} placeholder="Obs." className="w-40 rounded-md bg-slate-900 px-2 py-1.5 text-[13px] outline-none focus:ring-1 focus:ring-primary" />
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="grid gap-3 border-t border-slate-700/50 pt-3 xl:grid-cols-[auto_minmax(220px,300px)_1fr_auto] xl:items-end">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <SummaryBox label="Mercadorias R$" value={compactCurrency(totals.merchandiseGross)} />
                <SummaryBox label="Servicos R$" value={compactCurrency(totals.servicesTotal)} />
                <SummaryBox label="Descontos R$" value={compactCurrency(totals.discountTotal)} />
                <SummaryBox label="Total R$" value={compactCurrency(totals.total)} accent />
              </div>

              <div className="rounded-lg border border-slate-700/50 bg-slate-950/40 p-2.5">
                <p className={labelClass}>Desconto do lancamento</p>
                <div className="mt-1.5 grid grid-cols-2 gap-2">
                  <label className="space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Valor R$</span>
                    <input
                      value={orderDiscountValueInput}
                      onChange={(event) => setOrderDiscountValueInput(event.target.value)}
                      placeholder="0,00"
                      className={fieldClass}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Percentual</span>
                    <input
                      value={orderDiscountPercentInput}
                      onChange={(event) => setOrderDiscountPercentInput(event.target.value)}
                      placeholder="0%"
                      className={fieldClass}
                    />
                  </label>
                </div>
                <p className="mt-1.5 text-[11px] text-slate-500">
                  Aplicado no total dos itens: {compactCurrency(totals.orderDiscountTotal)}.
                </p>
              </div>

              <div className="hidden xl:block" />

              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
                {status === 'Finalizado' && (
                  <ActionButton label="Faturar" onClick={() => void handleSave('Finalizado', true)} disabled={isSavingLaunch} />
                )}
                <ActionButton label="Imprimir" icon={<Printer className="h-4 w-4" />} onClick={handlePrintOrder} />
                <ActionButton label="Nova O.S" icon={<Plus className="h-4 w-4" />} onClick={startNewOrder} />
                <ActionButton label={isSavingLaunch ? 'Salvando...' : editingLaunchId ? 'Atualizar' : 'Salvar'} icon={<Save className="h-4 w-4" />} onClick={() => void handleSave()} disabled={isSavingLaunch} primary />
                <ActionButton label="Fechar" icon={<X className="h-4 w-4" />} onClick={startNewOrder} />
              </div>
            </div>
          </div>
        )}

        {mainTab === 'history' && (
          <div className="space-y-3 p-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className={labelClass}>Historico</p>
                <h3 className="text-lg font-black text-white">{filteredLaunches.length} lancamento(s)</h3>
                <p className="text-xs text-slate-500">Clique em uma linha para editar, dar baixa ou finalizar.</p>
              </div>
              <div className="relative w-full lg:w-96">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input value={historySearch} onChange={(event) => setHistorySearch(event.target.value)} placeholder="Pesquisar por OS, cliente, status..." className={cn(fieldClass, 'pl-9')} />
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-700/50">
              <table className="min-w-[1000px] w-full table-fixed text-left text-[13px]">
                <thead className="bg-primary/90 text-white">
                  <tr>
                    <th className="w-24 px-2.5 py-1.5">O.S.</th>
                    <th className="w-44 px-2.5 py-1.5">Cliente</th>
                    <th className="w-24 px-2.5 py-1.5">Abertura</th>
                    <th className="w-24 px-2.5 py-1.5">Prevista</th>
                    <th className="w-32 px-2.5 py-1.5">Status</th>
                    <th className="w-28 px-2.5 py-1.5">Placa/Moto</th>
                    <th className="w-28 px-2.5 py-1.5 text-right">Total R$</th>
                    <th className="w-20 px-2.5 py-1.5 text-center">Faturado</th>
                    <th className="w-40 px-2.5 py-1.5 text-right">Acao</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 bg-slate-950/40">
                  {filteredLaunches.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-3 py-8 text-center text-slate-500">Nenhum lancamento salvo ainda.</td>
                    </tr>
                  ) : (
                    filteredLaunches.map((launch) => (
                      <tr
                        key={launch.id}
                        onClick={() => loadLaunchForEdit(launch)}
                        className="cursor-pointer hover:bg-slate-900/70"
                        title="Clique para editar este lancamento"
                      >
                        <td className="truncate px-2.5 py-1.5 font-black text-primary" title={launch.orderNumber}>
                          {formatShortOrderNumber(launch.orderNumber)}
                        </td>
                        <td className="truncate px-2.5 py-1.5 font-bold text-white">{launch.clientName}</td>
                        <td className="px-2.5 py-1.5 text-slate-300">{safeFormat(launch.openingDate)}</td>
                        <td className="px-2.5 py-1.5 text-slate-300">{safeFormat(launch.expectedDate)}</td>
                        <td className="px-2.5 py-1.5">
                          <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] font-bold text-slate-200">{launch.status}</span>
                        </td>
                        <td className="truncate px-2.5 py-1.5 text-slate-400">{launch.bikeModel || '-'}</td>
                        <td className="px-2.5 py-1.5 text-right font-black text-white">{compactCurrency(launch.total)}</td>
                        <td className="px-2.5 py-1.5 text-center">{launch.status === 'Finalizado' && launch.invoiced ? <Check className="mx-auto h-4 w-4 text-emerald-400" /> : '-'}</td>
                        <td className="px-2.5 py-1.5 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              disabled={deletingLaunchId === launch.id}
                              onClick={(event) => {
                                event.stopPropagation();
                                onDeleteLaunchClick(launch);
                              }}
                              className="rounded-lg bg-red-500/10 px-2.5 py-1 text-[11px] font-black uppercase text-red-300 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {deletingLaunchId === launch.id ? 'Excluindo' : deleteConfirmId === launch.id ? 'Confirmar' : 'Excluir'}
                            </button>
                            <span className="rounded-lg bg-primary/10 px-2.5 py-1 text-[11px] font-black uppercase text-primary">Editar</span>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {mainTab === 'monitoring' && (
          <div className="space-y-3 p-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className={labelClass}>Monitoramento</p>
                <h3 className="text-lg font-black text-white">{monitoredLaunches.length} ordem(ns)</h3>
                <p className="text-xs text-slate-500">Filtre por status e clique em uma ordem para editar.</p>
              </div>

              <div className="flex flex-wrap gap-2">
                {[
                  { id: 'all' as MonitoringStatusFilter, label: 'Todas' },
                  { id: 'Em Lancamento' as MonitoringStatusFilter, label: 'Em lancamento' },
                  { id: 'Pendente' as MonitoringStatusFilter, label: 'Pendente' },
                  { id: 'Finalizado' as MonitoringStatusFilter, label: 'Finalizada' },
                ].map((filter) => (
                  <button
                    key={filter.id}
                    type="button"
                    onClick={() => setMonitoringStatusFilter(filter.id)}
                    className={cn(
                      'rounded-lg px-3 py-1.5 text-[11px] font-black uppercase transition',
                      monitoringStatusFilter === filter.id
                        ? 'bg-primary text-white shadow-lg shadow-primary/20'
                        : 'bg-slate-950/60 text-slate-400 hover:bg-slate-900 hover:text-white'
                    )}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 xl:grid-cols-[minmax(220px,0.35fr)_minmax(0,1fr)]">
              <div className="rounded-xl border border-slate-700/50 bg-slate-950/40 p-3">
                <p className={labelClass}>Resumo</p>
                <h3 className="mt-1 text-xl font-black text-white">{monitoredLaunches.length}</h3>
                <p className="text-xs text-slate-500">
                  {monitoringStatusFilter === 'all'
                    ? 'Lancamentos em todos os status.'
                    : `Lancamentos com status ${monitoringStatusFilter}.`}
                </p>
              </div>

              <div className="space-y-2">
                {monitoredLaunches.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-700/50 p-5 text-center text-xs text-slate-500">Nenhuma ordem neste filtro.</div>
                ) : (
                  monitoredLaunches.map((launch) => (
                    <button
                      key={launch.id}
                      type="button"
                      onClick={() => loadLaunchForEdit(launch)}
                      className="flex w-full flex-col gap-2 rounded-xl border border-slate-700/50 bg-slate-950/40 p-3 text-left transition hover:border-primary/40 hover:bg-slate-900/70 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="text-sm font-black text-white">{launch.clientName}</p>
                        <p className="text-xs text-slate-500">
                          <span title={launch.orderNumber}>{formatShortOrderNumber(launch.orderNumber)}</span> | {safeFormat(launch.createdAt, 'dd/MM/yyyy HH:mm')}
                        </p>
                      </div>
                      <div className="text-left sm:text-right">
                        <p className="text-sm font-black text-primary">{compactCurrency(launch.total)}</p>
                        <p className="text-xs font-bold uppercase text-slate-500">{launch.status}</p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      {isQuickClientOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-950 p-3 shadow-2xl shadow-black">
            <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-2.5">
              <div>
                <p className={labelClass}>Cadastro rapido</p>
                <h3 className="text-lg font-black text-white">Novo cliente</h3>
                <p className="mt-1 text-xs text-slate-500">Use para lancar sem sair do caixa.</p>
              </div>
              <button
                type="button"
                onClick={resetQuickClientForm}
                className="grid h-8 w-8 place-items-center rounded-lg bg-slate-900 text-slate-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 grid gap-2.5">
              <label className="space-y-1">
                <span className={labelClass}>Nome do cliente</span>
                <input
                  autoFocus
                  value={quickClientForm.name}
                  onChange={(event) => updateQuickClientForm({ name: event.target.value })}
                  className={fieldClass}
                  placeholder="Ex: Joao Silva"
                />
              </label>
              <div className="grid gap-2.5 sm:grid-cols-2">
                <label className="space-y-1">
                  <span className={labelClass}>WhatsApp</span>
                  <input
                    value={quickClientForm.contact || ''}
                    onChange={(event) => updateQuickClientForm({ contact: event.target.value })}
                    className={fieldClass}
                    placeholder="(69) 99999-9999"
                  />
                </label>
                <label className="space-y-1">
                  <span className={labelClass}>Moto / Placa</span>
                  <input
                    value={quickClientForm.bikeModel || ''}
                    onChange={(event) => updateQuickClientForm({ bikeModel: event.target.value })}
                    className={fieldClass}
                    placeholder="Honda CG 160"
                  />
                </label>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={resetQuickClientForm}
                className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-slate-200 transition hover:bg-slate-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleQuickClientSave()}
                disabled={!quickClientForm.name.trim() || isSavingQuickClient}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white shadow-lg shadow-primary/20 transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                {isSavingQuickClient ? 'Salvando...' : 'Cadastrar e usar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isProductPickerOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-950 shadow-2xl shadow-black">
            <div className="flex flex-col gap-3 border-b border-slate-800 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className={labelClass}>Pesquisa de Mercadoria</p>
                <h3 className="text-lg font-black text-white">Selecionar variacao</h3>
              </div>
              <button type="button" onClick={() => setIsProductPickerOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg bg-slate-900 text-slate-400 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid gap-2.5 border-b border-slate-800 p-3 lg:grid-cols-[1fr_auto] lg:items-end">
              <div className="space-y-1">
                <label className={labelClass}>Pesquisa</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input autoFocus value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Ex: PATIN, filtro, oleo..." className={cn(fieldClass, 'pl-9')} />
                </div>
              </div>
              <button type="button" onClick={() => setProductSearch('')} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-slate-800">
                Limpar
              </button>
            </div>

            <div className="flex-1 overflow-auto p-3">
              <div className="min-w-[920px] overflow-hidden rounded-xl border border-slate-800">
                <table className="w-full text-left text-[13px]">
                  <thead className="bg-primary/90 text-white">
                    <tr>
                      <th className="px-2.5 py-1.5">Codigo</th>
                      <th className="px-2.5 py-1.5">Descricao</th>
                      <th className="px-2.5 py-1.5">Variacao</th>
                      <th className="px-2.5 py-1.5">NCM</th>
                      <th className="px-2.5 py-1.5 text-right">Venda R$</th>
                      <th className="px-2.5 py-1.5 text-right">Acao</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 bg-slate-950/40">
                    {products.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                          Importe a planilha XLSX para carregar Descricao, Variacao, NCM e Venda R$.
                        </td>
                      </tr>
                    ) : productPickerRows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-3 py-8 text-center text-slate-500">Nenhuma mercadoria encontrada para esta busca.</td>
                      </tr>
                    ) : (
                      productPickerRows.map(({ id, product, variation }) => (
                        <tr
                          key={id}
                          role="button"
                          tabIndex={0}
                          title="Clique para incluir esta mercadoria no lancamento"
                          onClick={() => addProduct(product, variation)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              addProduct(product, variation);
                            }
                          }}
                          className="cursor-pointer transition-colors hover:bg-primary/10 focus:bg-primary/10 focus:outline-none"
                        >
                          <td className="px-2.5 py-1.5 font-bold text-slate-300">{product.sourceCode}</td>
                          <td className="px-2.5 py-1.5 font-bold text-white">{product.description}</td>
                          <td className="px-2.5 py-1.5 text-slate-400">{variation?.name || product.variation || '-'}</td>
                          <td className="px-2.5 py-1.5 text-slate-400">{product.ncm || '-'}</td>
                          <td className="px-2.5 py-1.5 text-right font-black text-primary">{compactCurrency(parsePositiveMoney(variation?.salePrice ?? product.salePrice))}</td>
                          <td className="px-2.5 py-1.5 text-right">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                addProduct(product, variation);
                              }}
                              className="rounded-lg bg-primary px-3 py-1.5 text-[11px] font-black uppercase text-white hover:bg-primary/90"
                            >
                              Selecionar
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {products.length > 80 && (
                <p className="mt-3 text-xs text-slate-500">Mostrando ate 80 resultados. Use a pesquisa para filtrar mais rapido.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const SummaryBox = ({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) => (
  <div className={cn('rounded-lg border border-slate-700/50 bg-slate-950/50 px-2.5 py-1.5', accent && 'border-primary/40 bg-primary/10')}>
    <p className="text-[10px] font-bold text-slate-500">{label}</p>
    <p className={cn('text-sm font-black', accent ? 'text-primary' : 'text-white')}>{value}</p>
  </div>
);

const ActionButton = ({
  disabled = false,
  icon,
  label,
  primary = false,
  onClick,
}: {
  disabled?: boolean;
  icon?: ReactNode;
  label: string;
  primary?: boolean;
  onClick?: () => void;
}) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    className={cn(
      'inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition',
      primary ? 'bg-primary text-white hover:bg-primary/90' : 'bg-slate-800 text-slate-200 hover:bg-slate-700',
      disabled && 'cursor-not-allowed opacity-45 hover:bg-slate-800'
    )}
  >
    {icon}
    {label}
  </button>
);
