import { format } from 'date-fns';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast as sonnerToast } from 'sonner';
import {
  Activity,
  ArrowLeft,
  Box,
  Check,
  CircleCheck,
  CircleX,
  ClipboardList,
  Clock3,
  Copy,
  DollarSign,
  Eye,
  FileText,
  History,
  PackageSearch,
  Pencil,
  Plus,
  Percent,
  Printer,
  ReceiptText,
  Save,
  Search,
  Send,
  Tag,
  Trash2,
  Upload,
  X,
  Wrench,
} from 'lucide-react';
import { parseBrazilianCurrency } from '../../lib/money';
import { DateInput } from '../DateInput';
import { getCashPaymentStatus, getCashReceivableAmount, type CashPaymentStatus } from '../../lib/cashPayments';
import { cn, safeFormat } from '../../lib/utils';
import type { CashRegisterDraft } from '../../hooks/useCashRegisterActions';
import type { CashRegisterSaveResult } from '../../services/cashRegisterRepository';
import { clearLocalDraft, loadLocalDraft, saveLocalDraft } from '../../services/localDrafts';
import type {
  CashPaymentMethod,
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
  cashLaunchesLoaded: boolean;
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
  onDeleteLaunchClick: (launch: CashRegisterLaunch) => Promise<boolean> | boolean;
  onInitialLaunchLoaded?: () => void;
  onOpenClientRegistration: () => void;
  onQuickSaveClient?: (client: QuickClientInput) => Promise<Client | null> | Client | null;
  onSaveLaunch: (draft: CashRegisterDraft, launchId?: string, previousLaunch?: CashRegisterLaunch) => Promise<CashRegisterSaveResult | boolean> | CashRegisterSaveResult | boolean;
};

type MainTab = 'control' | 'history' | 'monitoring';
type WorkTab = 'opening' | 'items' | 'fiscal';
type HistoryStatusFilter = 'all' | CashRegisterLaunch['status'];
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
  statusPagamento: CashPaymentStatus;
  valorPagoInput: string;
  isInvoiced: boolean;
  paymentMethod?: CashPaymentMethod | '';
  openingDate: string;
  expectedDate: string;
  observation: string;
  request: string;
  servicesExecuted: string;
  items: CashRegisterItem[];
  orderDiscountValueInput: string;
  orderDiscountPercentInput: string;
};

const statusOptions: CashRegisterLaunch['status'][] = ['Em Lancamento', 'Pendente', 'Finalizado', 'Cancelado'];
const historyStatusOptions: Array<{ value: HistoryStatusFilter; label: string }> = [
  { value: 'all', label: 'Todos os status' },
  { value: 'Finalizado', label: 'Finalizado' },
  { value: 'Pendente', label: 'Pendente' },
  { value: 'Em Lancamento', label: 'Em lancamento' },
  { value: 'Cancelado', label: 'Cancelado' },
];
const cashPaymentMethodOptions: CashPaymentMethod[] = ['Debito', 'Credito', 'Pix', 'Dinheiro'];
const cashPaymentStatusOptions: CashPaymentStatus[] = ['Pago', 'Pendente', 'Parcial'];
const fiscalStatusOptions: ManualFiscalDocumentStatus[] = ['Nao emitida', 'Emitida', 'Cancelada'];
const fiscalAttachmentMaxBytes = 180 * 1024;
const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const today = () => format(new Date(), 'yyyy-MM-dd');

const compactCurrency = (value: number) => currency.format(Number.isFinite(value) ? value : 0);

const getStatusBadgeClass = (status: CashRegisterLaunch['status']) => {
  if (status === 'Finalizado') return 'bg-emerald-500/15 text-emerald-200';
  if (status === 'Pendente') return 'bg-amber-500/15 text-amber-200';
  if (status === 'Cancelado') return 'bg-red-500/15 text-red-200';
  return 'bg-slate-800 text-slate-200';
};

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

const getProductStockLabel = (product: ProductCatalogItem) => {
  if (!product.trackStock) return 'Sem controle';
  const stockQuantity = Number(product.stockQuantity || 0);
  if (stockQuantity <= 0) return 'Zerado';
  return `${stockQuantity} disp.`;
};

const getProductStockClass = (product: ProductCatalogItem) => {
  if (!product.trackStock) return 'text-slate-500';
  const stockQuantity = Number(product.stockQuantity || 0);
  const minStockQuantity = Number(product.minStockQuantity || 0);
  if (stockQuantity <= 0) return 'text-red-300';
  if (minStockQuantity > 0 && stockQuantity <= minStockQuantity) return 'text-amber-200';
  return 'text-emerald-200';
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

const fieldClass = 'w-full rounded-lg border border-slate-700/70 bg-slate-950/65 px-3 py-2 text-[13px] text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-primary/70 focus:ring-2 focus:ring-primary/20';
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
  cashLaunchesLoaded,
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
  onOpenClientRegistration,
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
  const [statusPagamento, setStatusPagamento] = useState<CashPaymentStatus>('Pendente');
  const [valorPagoInput, setValorPagoInput] = useState('');
  const [isInvoiced, setIsInvoiced] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<CashPaymentMethod | ''>('');
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
  const [historyDateFilter, setHistoryDateFilter] = useState(today());
  const [historyStatusFilter, setHistoryStatusFilter] = useState<HistoryStatusFilter>('all');
  const [monitoringStatusFilter, setMonitoringStatusFilter] = useState<MonitoringStatusFilter>('all');
  const [monitoringDateFilter, setMonitoringDateFilter] = useState('');
  const [monitoringSearch, setMonitoringSearch] = useState('');
  const [invoiceSuccess, setInvoiceSuccess] = useState<{ orderNumber: string; paymentMethod: CashPaymentMethod; total: number } | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [isQuickClientOpen, setIsQuickClientOpen] = useState(false);
  const [isSavingQuickClient, setIsSavingQuickClient] = useState(false);
  const [quickClientForm, setQuickClientForm] = useState<QuickClientInput>({ name: '', contact: '', bikeModel: '' });
  const [isDraftHydrated, setIsDraftHydrated] = useState(false);
  const productSearchInputRef = useRef<HTMLInputElement | null>(null);

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
      setStatusPagamento(draft.data.statusPagamento || 'Pendente');
      setValorPagoInput(draft.data.valorPagoInput || '');
      setIsInvoiced(Boolean(draft.data.isInvoiced));
      setPaymentMethod(draft.data.paymentMethod || '');
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
        const haystack = normalizeSearch(`${product.sourceCode} ${product.description} ${product.variation || ''} ${variation?.name || ''} ${variation?.salePrice || ''} ${product.ncm} ${product.stockQuantity || 0} ${getProductStockLabel(product)}`);
        return haystack.includes(search);
      })
      : expandedRows;

    return rows.slice(0, 80);
  }, [productSearch, products]);

  const productStockSummary = useMemo(() => products.reduce(
    (summary, product) => {
      if (!product.trackStock) {
        summary.inStock += 1;
        return summary;
      }

      const stockQuantity = Number(product.stockQuantity || 0);
      const minStockQuantity = Number(product.minStockQuantity || 0);
      if (stockQuantity <= 0) summary.outOfStock += 1;
      else if (minStockQuantity > 0 && stockQuantity <= minStockQuantity) summary.lowStock += 1;
      else summary.inStock += 1;
      return summary;
    },
    { inStock: 0, lowStock: 0, outOfStock: 0 }
  ), [products]);

  const filteredLaunches = useMemo(() => {
    const search = normalizeSearch(historySearch.trim());
    const currentDate = today();
    return cashLaunches.filter((launch) => {
      const isWithinDateRange = (!historyDateFilter || launch.openingDate >= historyDateFilter)
        && launch.openingDate <= currentDate;
      if (!isWithinDateRange) return false;
      const matchesStatus = historyStatusFilter === 'all' || launch.status === historyStatusFilter;
      if (!matchesStatus) return false;
      if (!search) return true;
      const launchPaymentMethod = launch.status === 'Finalizado' && launch.invoiced ? launch.paymentMethod || '' : '';
      const haystack = normalizeSearch(`${launch.orderNumber} ${launch.clientName} ${launch.status} ${launchPaymentMethod} ${launch.total}`);
      return haystack.includes(search);
    });
  }, [cashLaunches, historyDateFilter, historySearch, historyStatusFilter]);

  const monitoredLaunches = useMemo(() => (
    monitoringStatusFilter === 'all'
      ? cashLaunches
      : cashLaunches.filter((launch) => launch.status === monitoringStatusFilter)
  ), [cashLaunches, monitoringStatusFilter]);

  const monitoringStatusCounts = useMemo(() => cashLaunches.reduce<Record<CashRegisterLaunch['status'], number>>(
    (counts, launch) => {
      counts[launch.status] += 1;
      return counts;
    },
    { 'Em Lancamento': 0, Pendente: 0, Finalizado: 0, Cancelado: 0 }
  ), [cashLaunches]);

  const visibleMonitoredLaunches = useMemo(() => {
    const search = normalizeSearch(monitoringSearch.trim());
    return monitoredLaunches
      .filter((launch) => {
        if (monitoringDateFilter && launch.openingDate < monitoringDateFilter) return false;
        if (!search) return true;
        return normalizeSearch(`${launch.orderNumber} ${launch.clientName} ${launch.bikeModel || ''} ${launch.status}`)
          .includes(search);
      })
      .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt));
  }, [monitoredLaunches, monitoringDateFilter, monitoringSearch]);

  const recentMonitoredLaunches = useMemo(() => (
    [...cashLaunches]
      .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt))
      .slice(0, 5)
  ), [cashLaunches]);

  useEffect(() => {
    if (!invoiceSuccess) return undefined;

    const timer = window.setTimeout(() => setInvoiceSuccess(null), 7000);
    return () => window.clearTimeout(timer);
  }, [invoiceSuccess]);

  useEffect(() => {
    if (!isProductPickerOpen) return undefined;

    const animationFrameId = window.requestAnimationFrame(() => {
      productSearchInputRef.current?.focus();
      productSearchInputRef.current?.select();
    });

    return () => window.cancelAnimationFrame(animationFrameId);
  }, [isProductPickerOpen]);

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

  const paymentSummary = useMemo(() => {
    const total = totals.total;
    const paid = statusPagamento === 'Pago'
      ? total
      : statusPagamento === 'Parcial'
        ? Math.min(total, Math.max(0, parseNumber(valorPagoInput)))
        : 0;

    return { paid, balance: Math.max(0, total - paid) };
  }, [statusPagamento, totals.total, valorPagoInput]);

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

    setItems((current) => [
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
    ]);
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
    setStatusPagamento(launch.statusPagamento || (launch.status === 'Finalizado' && launch.invoiced ? 'Pago' : 'Pendente'));
    setValorPagoInput(launch.statusPagamento === 'Parcial' ? String(launch.valorPago || 0) : '');
    setIsInvoiced(launch.status === 'Finalizado' && Boolean(launch.invoiced));
    setPaymentMethod(launch.paymentMethod || '');
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
    setStatusPagamento('Pendente');
    setValorPagoInput('');
    setIsInvoiced(false);
    setPaymentMethod('');
    setOpeningDate(today());
    setExpectedDate(today());
    setObservation('');
    setRequest('');
    setServicesExecuted('');
    setItems([]);
    setOrderDiscountValueInput('');
    setOrderDiscountPercentInput('');
    setSaveNotice(null);
    setWorkTab('opening');
    if (draftStorageKey) clearLocalDraft(draftStorageKey);
  };

  useEffect(() => {
    if (!cashLaunchesLoaded || !isDraftHydrated || initialLaunchId || !editingLaunchId) return;
    if (!cashLaunches.some((launch) => launch.id === editingLaunchId)) {
      resetDraft();
    }
  }, [cashLaunches, cashLaunchesLoaded, editingLaunchId, initialLaunchId, isDraftHydrated]);

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

  const handlePaymentStatusChange = (nextStatus: CashPaymentStatus) => {
    setStatusPagamento(nextStatus);
    if (nextStatus !== 'Parcial') setValorPagoInput('');
  };

  const buildDraft = (statusOverride?: CashRegisterLaunch['status'], invoiced = false): CashRegisterDraft => {
    const finalStatus = statusOverride || status;
    const finalInvoiced = finalStatus === 'Finalizado' && (invoiced || isInvoiced);
    const finalPaymentStatus: CashPaymentStatus = finalInvoiced ? 'Pago' : statusPagamento;
    const finalPaid = finalPaymentStatus === 'Pago'
      ? totals.total
      : finalPaymentStatus === 'Parcial'
        ? paymentSummary.paid
        : 0;
    const finalBalance = Math.max(0, totals.total - finalPaid);

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
      statusPagamento: finalPaymentStatus,
      valorPago: finalPaid,
      saldoDevedor: finalBalance,
      invoiced: finalInvoiced,
      ...((finalPaid > 0 && paymentMethod) ? { paymentMethod } : {}),
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
      || statusPagamento !== 'Pendente'
      || valorPagoInput.trim()
      || paymentMethod
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
      statusPagamento,
      valorPagoInput,
      isInvoiced,
      paymentMethod,
      openingDate,
      expectedDate,
      observation,
      request,
      servicesExecuted,
      items,
      orderDiscountValueInput,
      orderDiscountPercentInput,
    });
  }, [bikeModel, clientName, draftStorageKey, editingLaunchId, editingOrderNumber, expectedDate, isDraftHydrated, isInvoiced, items, observation, openingDate, orderDiscountPercentInput, orderDiscountValueInput, paymentMethod, request, selectedClientId, servicesExecuted, status, statusPagamento, valorPagoInput]);

  const handleSave = async (statusOverride?: CashRegisterLaunch['status'], invoiced = false) => {
    const isInvoiceAction = statusOverride === 'Finalizado' && invoiced;
    const finalStatus = statusOverride || status;
    const finalInvoiced = finalStatus === 'Finalizado' && (invoiced || isInvoiced);
    const finalPaymentStatus = finalInvoiced ? 'Pago' : statusPagamento;
    const finalPaid = finalPaymentStatus === 'Pago' ? totals.total : paymentSummary.paid;

    if (finalPaid > 0 && !paymentMethod) {
      sonnerToast.error('Informe a forma de pagamento antes de salvar um pagamento na O.S.');
      return;
    }

    const invoicePaymentMethod = finalInvoiced && paymentMethod ? paymentMethod : null;
    const successOrderNumber = editingOrderNumber || 'Novo lancamento';
    const successTotal = totals.total;
    const shouldAutoIssueFiscal = Boolean(invoiced && statusOverride === 'Finalizado' && fiscalAutoIssueEnabled && editingLaunchId);
    const previousLaunch = editingLaunchId
      ? cashLaunches.find((launch) => launch.id === editingLaunchId)
      : undefined;
    const saveResult = await Promise.resolve(onSaveLaunch(buildDraft(statusOverride, invoiced), editingLaunchId || undefined, previousLaunch));
    if (saveResult) {
      const isOfflineSave = typeof saveResult === 'object'
        ? saveResult.savedOffline
        : typeof navigator !== 'undefined' && navigator.onLine === false;
      const isFinalizedAction = finalStatus === 'Finalizado';
      setSaveNotice(isOfflineSave
        ? 'Salvo localmente e aguardando sincronização.'
        : isFinalizedAction
          ? 'O.S. salva com sucesso.'
          : 'O.S. salva com sucesso.');
      if (isInvoiceAction && invoicePaymentMethod) {
        setInvoiceSuccess({
          orderNumber: successOrderNumber,
          paymentMethod: invoicePaymentMethod,
          total: successTotal,
        });
      }
      if (shouldAutoIssueFiscal && editingLaunchId && !isOfflineSave) {
        await Promise.resolve(onAutoIssueFiscalFromCashLaunch?.(editingLaunchId));
      }
      resetDraft();
    }
  };

  return (
    <div className="cash-register-view space-y-5 text-[13px]">
      <div className="flex flex-col gap-2 rounded-2xl border border-slate-700/60 bg-gradient-to-br from-slate-900 via-slate-900/95 to-slate-900/70 px-3 py-2 shadow-lg shadow-black/15 sm:px-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-slate-700/70 bg-slate-950/70 text-slate-300 shadow-sm transition hover:border-primary/50 hover:bg-slate-800 hover:text-white"
            aria-label="Voltar"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-primary">Oficina • Controle de serviços</p>
            <h2 className="text-lg font-black tracking-tight text-white">Ordem de Serviço</h2>
            <p className="text-[11px] text-slate-400">Cadastre e acompanhe as ordens de serviço.</p>
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
                {invoiceSuccess.orderNumber} foi faturada com sucesso no valor de {compactCurrency(invoiceSuccess.total)} via {invoiceSuccess.paymentMethod}.
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

      <section className="overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-900/55 shadow-xl shadow-black/15">
        <div className="border-b border-slate-700/60 bg-slate-950/55 p-2 sm:px-4">
          <div className="flex flex-wrap gap-1 rounded-xl border border-slate-800/80 bg-slate-950/70 p-1">
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
                    'inline-flex min-h-10 items-center gap-2 rounded-lg border px-4 text-xs font-bold uppercase tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
                    isActive
                      ? 'border-primary/25 bg-primary/15 text-white shadow-sm'
                      : 'border-transparent text-slate-400 hover:bg-slate-800/80 hover:text-white'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {mainTab === 'control' && (
          <div className="space-y-4 p-4">
            <div className="flex flex-wrap gap-2 border-b border-slate-700/50 pb-3">
              {[
                { id: 'opening' as WorkTab, label: 'Abertura' },
                { id: 'items' as WorkTab, label: 'Mercadorias / Servicos' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setWorkTab(tab.id)}
                  className={cn(
                    'rounded-lg px-4 py-2 text-xs font-bold transition',
                    workTab === tab.id ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'border border-slate-700/60 bg-slate-950/60 text-slate-400 hover:border-slate-600 hover:text-white'
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
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)] 2xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
                <div className="space-y-4 rounded-2xl border border-slate-700/60 bg-slate-950/35 p-4 shadow-inner shadow-black/10">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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
                          onClick={onOpenClientRegistration}
                          disabled={!onQuickSaveClient}
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-primary/45 bg-primary/10 text-primary transition hover:bg-primary hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                          title="Cadastrar cliente"
                          aria-label="Cadastrar cliente"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className={labelClass}>Abertura</label>
                      <DateInput value={openingDate} onChange={setOpeningDate} className={fieldClass} />
                    </div>
                    <div className="space-y-1">
                      <label className={labelClass}>Prevista</label>
                      <DateInput value={expectedDate} onChange={setExpectedDate} className={fieldClass} />
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

                  <div className="grid gap-3 rounded-xl border border-slate-700/60 bg-slate-900/55 p-3 md:grid-cols-2 xl:grid-cols-5">
                    <div className="space-y-1">
                      <label className={labelClass}>Pagamento</label>
                      <select value={statusPagamento} onChange={(event) => handlePaymentStatusChange(event.target.value as CashPaymentStatus)} className={fieldClass}>
                        {cashPaymentStatusOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                    </div>
                    {statusPagamento === 'Parcial' && (
                      <div className="space-y-1">
                        <label className={labelClass}>Valor pago R$</label>
                        <input value={valorPagoInput} onChange={(event) => setValorPagoInput(event.target.value)} inputMode="decimal" placeholder="0,00" className={fieldClass} />
                      </div>
                    )}
                    {paymentSummary.paid > 0 && (
                      <div className="space-y-1">
                        <label className={labelClass}>Forma</label>
                        <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as CashPaymentMethod | '')} className={fieldClass}>
                          <option value="">Selecione</option>
                          {cashPaymentMethodOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                      </div>
                    )}
                    <div className="rounded-lg border border-slate-700/40 bg-slate-950/65 px-3 py-2">
                      <p className={labelClass}>Pago</p>
                      <p className="mt-1 text-sm font-black text-emerald-300">{compactCurrency(paymentSummary.paid)}</p>
                    </div>
                    <div className="rounded-lg border border-slate-700/40 bg-slate-950/65 px-3 py-2">
                      <p className={labelClass}>Saldo</p>
                      <p className={cn('mt-1 text-sm font-black', paymentSummary.balance > 0 ? 'text-amber-200' : 'text-emerald-300')}>{compactCurrency(paymentSummary.balance)}</p>
                    </div>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
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
                    className="flex min-h-24 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-primary/40 bg-primary/[0.06] text-xs font-bold text-primary transition hover:border-primary/70 hover:bg-primary/10"
                  >
                    <PackageSearch className="h-5 w-5" />
                    Abrir mercadorias / servicos
                  </button>
                </div>

                <div className="min-h-[28rem] rounded-2xl border border-slate-700/60 bg-slate-950/55 p-4 shadow-inner shadow-black/10">
                  <div className="flex items-center justify-between gap-3 border-b border-slate-700/60 pb-3">
                    <div>
                      <p className={labelClass}>Itens selecionados</p>
                      <h3 className="mt-0.5 text-lg font-black text-white">{items.length} item(ns)</h3>
                    </div>
                    <button type="button" onClick={() => setIsProductPickerOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white">
                      <Plus className="h-4 w-4" />
                      Incluir
                    </button>
                  </div>

                  <div className="mt-2 max-h-72 space-y-2 overflow-y-auto pr-1">
                    {items.length === 0 ? (
                      <div className="grid min-h-64 place-content-center justify-items-center gap-3 rounded-xl border border-dashed border-slate-700/60 bg-slate-900/30 p-6 text-center">
                        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-800/80 text-slate-500">
                          <PackageSearch className="h-6 w-6" />
                        </span>
                        <div>
                          <p className="text-sm font-bold text-slate-300">Nenhum item adicionado</p>
                          <p className="mt-1 max-w-52 text-xs leading-5 text-slate-500">Inclua mercadorias ou serviços para compor esta ordem.</p>
                        </div>
                      </div>
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
              <div className="space-y-3 rounded-2xl border border-slate-700/60 bg-slate-950/35 p-4 shadow-inner shadow-black/10">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
                      <Box className="h-6 w-6" />
                    </span>
                    <div>
                      <p className={labelClass}>Mercadorias / Servicos</p>
                      <h3 className="text-base font-black text-white">{items.length} item(ns) no lancamento</h3>
                    </div>
                  </div>
                  <button type="button" onClick={() => setIsProductPickerOpen(true)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-black text-white shadow-lg shadow-primary/20 transition hover:bg-primary/90">
                    <Plus className="h-4 w-4" />
                    Incluir
                  </button>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-700/60">
                  <table className="min-w-[1080px] w-full text-left text-[13px]">
                    <thead className="bg-slate-800/80 text-slate-300">
                      <tr>
                        <th className="whitespace-nowrap px-3 py-3">Excluir</th>
                        <th className="whitespace-nowrap px-3 py-3">Codigo</th>
                        <th className="whitespace-nowrap px-3 py-3">Descricao</th>
                        <th className="whitespace-nowrap px-3 py-3">Variacao</th>
                        <th className="whitespace-nowrap px-3 py-3">Qtd</th>
                        <th className="whitespace-nowrap px-3 py-3">Unitario R$</th>
                        <th className="whitespace-nowrap px-3 py-3">Total Liquido R$</th>
                        <th className="whitespace-nowrap px-3 py-3">Data</th>
                        <th className="whitespace-nowrap px-3 py-3">Observacao</th>
                      </tr>
                    </thead>
                    <tbody className="bg-slate-950/25">
                      {items.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="h-80 px-3 py-8 text-center">
                            <div className="flex flex-col items-center justify-center gap-2 text-slate-400">
                              <span className="relative grid h-14 w-14 place-items-center text-slate-400">
                                <Box className="h-12 w-12" strokeWidth={1.7} />
                                <span className="absolute -top-1 right-0 h-2 w-2 rounded-full bg-primary" />
                                <span className="absolute -top-2 left-1 h-1.5 w-1.5 rounded-full bg-primary" />
                                <span className="absolute -top-2 right-4 h-2 w-0.5 rounded-full bg-primary" />
                              </span>
                              <p className="text-xs text-slate-400">Clique em Incluir para pesquisar uma mercadoria importada.</p>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        items.map((item) => (
                          <tr
                            key={item.id}
                            className="border-b border-slate-700/50 last:border-b-0 hover:bg-slate-900/70"
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
                              <DateInput value={item.date} onChange={(value) => updateItem(item.id, { date: value })} className="w-36 rounded-md bg-slate-900 px-2 py-1.5 text-[13px] outline-none focus:ring-1 focus:ring-primary" />
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

            <div className="grid gap-4 rounded-2xl border border-slate-700/60 bg-slate-950/60 p-4 shadow-lg shadow-black/10 xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.85fr)_auto] xl:items-center">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:border-r xl:border-slate-700/60 xl:pr-4">
                <SummaryBox label="Mercadorias R$" value={compactCurrency(totals.merchandiseGross)} icon={<Box className="h-5 w-5" />} tone="blue" />
                <SummaryBox label="Servicos R$" value={compactCurrency(totals.servicesTotal)} icon={<Wrench className="h-5 w-5" />} tone="slate" />
                <SummaryBox label="Descontos R$" value={compactCurrency(totals.discountTotal)} icon={<Tag className="h-5 w-5" />} tone="purple" />
                <SummaryBox label="Total R$" value={compactCurrency(totals.total)} icon={<DollarSign className="h-5 w-5" />} accent />
              </div>

              <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 border-slate-700/60 xl:border-r xl:pr-4">
                <Percent className="h-5 w-5 text-slate-400" />
                <div className="min-w-0">
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
              </div>

              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
                <ActionButton label="Imprimir" icon={<Printer className="h-4 w-4" />} onClick={handlePrintOrder} />
                <ActionButton label="Nova O.S" icon={<Plus className="h-4 w-4" />} onClick={startNewOrder} />
                <ActionButton
                  label={isSavingLaunch
                    ? 'Salvando...'
                    : status === 'Finalizado'
                      ? statusPagamento === 'Pago' ? 'Finalizar e faturar' : 'Finalizar O.S.'
                      : editingLaunchId ? 'Atualizar O.S.' : 'Salvar rascunho'}
                  icon={<Save className="h-4 w-4" />}
                  onClick={() => void handleSave(
                    status === 'Finalizado' ? 'Finalizado' : undefined,
                    status === 'Finalizado' && statusPagamento === 'Pago'
                  )}
                  disabled={isSavingLaunch}
                  primary
                />
              </div>
            </div>
            {saveNotice && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] font-semibold text-amber-200">
                {saveNotice}
              </div>
            )}
          </div>
        )}

        {mainTab === 'history' && (
          <div className="space-y-4 p-3 sm:p-5">
            <div className="flex flex-col gap-4 rounded-2xl border border-slate-700/50 bg-slate-950/30 p-3 sm:p-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className={labelClass}>Historico</p>
                <h3 className="mt-0.5 text-xl font-black tracking-tight text-white">{filteredLaunches.length} lancamento(s)</h3>
                <p className="mt-0.5 text-xs text-slate-400">O periodo vai da data inicial escolhida ate hoje.</p>
              </div>
              <div className="flex w-full flex-col gap-2.5 sm:flex-row lg:w-auto lg:min-w-[700px]">
                <label className="min-w-0 sm:w-44">
                  <span className="sr-only">Data inicial do historico</span>
                  <DateInput
                    value={historyDateFilter}
                    max={today()}
                    onChange={setHistoryDateFilter}
                    className={fieldClass}
                    aria-label="Data inicial do historico"
                    title="Mostrar lancamentos desta data ate hoje"
                  />
                </label>
                <select
                  value={historyStatusFilter}
                  onChange={(event) => setHistoryStatusFilter(event.target.value as HistoryStatusFilter)}
                  className={cn(fieldClass, 'sm:w-52')}
                  aria-label="Filtrar lancamentos por status"
                >
                  {historyStatusOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <div className="relative min-w-0 flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input value={historySearch} onChange={(event) => setHistorySearch(event.target.value)} placeholder="Pesquisar por OS, cliente, status..." className={cn(fieldClass, 'pl-9')} />
                </div>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-700/60 bg-slate-950/25 shadow-sm">
              <table className="min-w-[1180px] w-full table-fixed text-left text-[13px]">
                <thead className="bg-slate-800/90 text-[10px] uppercase tracking-wider text-slate-300">
                  <tr className="border-b border-slate-700/80">
                    <th className="w-24 px-2.5 py-3 font-bold">O.S.</th>
                    <th className="w-44 px-2.5 py-3 font-bold">Cliente</th>
                    <th className="w-24 px-2.5 py-3 font-bold">Abertura</th>
                    <th className="w-24 px-2.5 py-3 font-bold">Prevista</th>
                    <th className="w-32 px-2.5 py-3 font-bold">Status</th>
                    <th className="w-28 px-2.5 py-3 font-bold">Placa/Moto</th>
                    <th className="w-28 px-2.5 py-3 text-right font-bold">Total R$</th>
                    <th className="w-24 px-2.5 py-3 text-center font-bold">Pagamento</th>
                    <th className="w-28 px-2.5 py-3 text-right font-bold">Saldo R$</th>
                    <th className="w-28 px-2.5 py-3 font-bold">Forma</th>
                    <th className="w-40 px-2.5 py-3 text-right font-bold">Acao</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 bg-slate-950/25">
                  {filteredLaunches.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="px-3 py-12 text-center text-slate-500">Nenhum lancamento encontrado neste periodo.</td>
                    </tr>
                  ) : (
                    filteredLaunches.map((launch) => (
                      <tr
                        key={launch.id}
                        onClick={() => loadLaunchForEdit(launch)}
                        className="group cursor-pointer transition-colors odd:bg-slate-900/20 hover:bg-primary/[0.06]"
                        title="Clique para editar este lancamento"
                      >
                        <td className="truncate px-2.5 py-3 font-black text-primary" title={launch.orderNumber}>
                          {formatShortOrderNumber(launch.orderNumber)}
                        </td>
                        <td className="truncate px-2.5 py-3 font-bold text-white">{launch.clientName}</td>
                        <td className="px-2.5 py-3 text-slate-300">{safeFormat(launch.openingDate)}</td>
                        <td className="px-2.5 py-3 text-slate-300">{safeFormat(launch.expectedDate)}</td>
                        <td className="px-2.5 py-3">
                          <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-bold', getStatusBadgeClass(launch.status))}>{launch.status}</span>
                        </td>
                        <td className="truncate px-2.5 py-3 text-slate-400">{launch.bikeModel || '-'}</td>
                        <td className="px-2.5 py-3 text-right font-black text-white">{compactCurrency(launch.total)}</td>
                        <td className="px-2.5 py-3 text-center">
                          <span className={cn(
                            'rounded-full px-2 py-0.5 text-[10px] font-black uppercase',
                            getCashPaymentStatus(launch) === 'Pago'
                              ? 'bg-emerald-500/15 text-emerald-200'
                              : getCashPaymentStatus(launch) === 'Parcial'
                                ? 'bg-sky-500/15 text-sky-200'
                                : 'bg-amber-500/15 text-amber-200'
                          )}>{getCashPaymentStatus(launch)}</span>
                        </td>
                        <td className="px-2.5 py-3 text-right font-bold text-amber-200">{compactCurrency(getCashReceivableAmount(launch))}</td>
                        <td className="px-2.5 py-3 text-slate-300">{launch.paymentMethod || '-'}</td>
                        <td className="px-2.5 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              disabled={deletingLaunchId === launch.id}
                              onClick={(event) => {
                                event.stopPropagation();
                                void (async () => {
                                  const deleted = await onDeleteLaunchClick(launch);
                                  if (deleted && editingLaunchId === launch.id) resetDraft();
                                })();
                              }}
                              className="rounded-lg border border-red-500/20 bg-red-500/10 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wide text-red-300 transition hover:border-red-500/40 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {deletingLaunchId === launch.id ? 'Excluindo' : deleteConfirmId === launch.id ? 'Confirmar' : 'Excluir'}
                            </button>
                            <span className="rounded-lg border border-primary/20 bg-primary/10 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wide text-primary">Editar</span>
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
          <div className="space-y-4 p-3 sm:p-5">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-5">
              {[
                { label: 'Total de ordens', count: cashLaunches.length, icon: ClipboardList, tone: 'text-primary', glow: 'bg-primary/10', status: 'all' as MonitoringStatusFilter },
                { label: 'Em lancamento', count: monitoringStatusCounts['Em Lancamento'], icon: Clock3, tone: 'text-amber-300', glow: 'bg-amber-500/10', status: 'Em Lancamento' as MonitoringStatusFilter },
                { label: 'Pendentes', count: monitoringStatusCounts.Pendente, icon: Activity, tone: 'text-orange-300', glow: 'bg-orange-500/10', status: 'Pendente' as MonitoringStatusFilter },
                { label: 'Finalizadas', count: monitoringStatusCounts.Finalizado, icon: CircleCheck, tone: 'text-emerald-300', glow: 'bg-emerald-500/10', status: 'Finalizado' as MonitoringStatusFilter },
                { label: 'Canceladas', count: monitoringStatusCounts.Cancelado, icon: CircleX, tone: 'text-red-300', glow: 'bg-red-500/10', status: 'Cancelado' as MonitoringStatusFilter },
              ].map((metric) => {
                const Icon = metric.icon;
                const percentage = cashLaunches.length ? (metric.count / cashLaunches.length) * 100 : 0;
                return (
                  <button
                    key={metric.label}
                    type="button"
                    onClick={() => setMonitoringStatusFilter(metric.status)}
                    className={cn(
                      'group relative flex min-h-[100px] min-w-0 items-center gap-3 overflow-hidden rounded-xl border bg-slate-950/45 p-3 text-left transition hover:-translate-y-0.5 hover:border-slate-600 sm:p-4',
                      monitoringStatusFilter === metric.status ? 'border-primary/40' : 'border-slate-700/60'
                    )}
                  >
                    <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl', metric.glow, metric.tone)}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="relative z-10 min-w-0">
                      <span className="block truncate text-[9px] font-bold uppercase tracking-wider text-slate-400 sm:text-[10px]">{metric.label}</span>
                      <span className="mt-1 block text-xl font-black leading-none text-white sm:text-2xl">{metric.count}</span>
                      <span className="mt-1 block text-[10px] text-slate-500">
                        {metric.status === 'all' ? 'Em todos os status' : `${percentage.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% do total`}
                      </span>
                    </span>
                    <span className={cn('pointer-events-none absolute -bottom-8 -right-5 h-20 w-24 rounded-full blur-2xl transition-opacity group-hover:opacity-80', metric.glow)} />
                  </button>
                );
              })}
            </div>

            <div className="grid items-start gap-3 xl:grid-cols-[minmax(260px,0.32fr)_minmax(0,1fr)]">
              <aside className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <section className="rounded-xl border border-slate-700/60 bg-slate-950/40 p-4">
                  <p className={labelClass}>Distribuicao por status</p>
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-5 sm:justify-start xl:justify-center">
                    <div
                      className="grid h-32 w-32 shrink-0 place-items-center rounded-full p-3"
                      style={{
                        background: cashLaunches.length
                          ? `conic-gradient(#fbbf24 0% ${(monitoringStatusCounts['Em Lancamento'] / cashLaunches.length) * 100}%, #f97316 ${(monitoringStatusCounts['Em Lancamento'] / cashLaunches.length) * 100}% ${((monitoringStatusCounts['Em Lancamento'] + monitoringStatusCounts.Pendente) / cashLaunches.length) * 100}%, #10b981 ${((monitoringStatusCounts['Em Lancamento'] + monitoringStatusCounts.Pendente) / cashLaunches.length) * 100}% ${((monitoringStatusCounts['Em Lancamento'] + monitoringStatusCounts.Pendente + monitoringStatusCounts.Finalizado) / cashLaunches.length) * 100}%, #f43f5e ${((monitoringStatusCounts['Em Lancamento'] + monitoringStatusCounts.Pendente + monitoringStatusCounts.Finalizado) / cashLaunches.length) * 100}% 100%)`
                          : '#1e293b',
                      }}
                    >
                      <div className="grid h-full w-full place-items-center rounded-full border border-slate-800 bg-slate-950 text-center">
                        <span><span className="block text-xl font-black text-white">{cashLaunches.length}</span><span className="text-[10px] text-slate-400">ordem(ns)</span></span>
                      </div>
                    </div>
                    <div className="grid gap-2.5">
                      {[
                        { label: 'Em lancamento', status: 'Em Lancamento' as const, color: 'bg-amber-400' },
                        { label: 'Pendente', status: 'Pendente' as const, color: 'bg-orange-500' },
                        { label: 'Finalizada', status: 'Finalizado' as const, color: 'bg-emerald-500' },
                        { label: 'Cancelada', status: 'Cancelado' as const, color: 'bg-rose-500' },
                      ].map((item) => (
                        <div key={item.status} className="flex min-w-36 items-center gap-2 text-[11px]">
                          <span className={cn('h-2.5 w-2.5 rounded-full', item.color)} />
                          <span className="flex-1 text-slate-400">{item.label}</span>
                          <span className="font-bold text-slate-200">{monitoringStatusCounts[item.status]}</span>
                          <span className="w-11 text-right text-slate-500">
                            {cashLaunches.length ? `${((monitoringStatusCounts[item.status] / cashLaunches.length) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : '0%'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>

                <section className="rounded-xl border border-slate-700/60 bg-slate-950/40 p-4">
                  <p className={labelClass}>Ultimas atualizacoes</p>
                  {recentMonitoredLaunches.length ? (
                    <ol className="mt-3 space-y-3">
                      {recentMonitoredLaunches.map((launch) => (
                        <li key={launch.id} className="relative flex gap-3 pl-1">
                          <span className={cn(
                            'relative mt-1.5 h-3 w-3 shrink-0 rounded-full ring-4 ring-slate-950',
                            launch.status === 'Finalizado' ? 'bg-emerald-500' :
                              launch.status === 'Pendente' ? 'bg-amber-400' :
                                launch.status === 'Cancelado' ? 'bg-rose-500' : 'bg-slate-400'
                          )} />
                          <div className="min-w-0 flex-1 border-b border-slate-800/80 pb-2.5 last:border-0">
                            <div className="flex items-baseline justify-between gap-2">
                              <p className="truncate text-xs font-bold text-slate-100">
                                {formatShortOrderNumber(launch.orderNumber)} · {launch.clientName}
                              </p>
                              <time className="shrink-0 text-[10px] text-slate-500">{safeFormat(launch.updatedAt, 'dd/MM HH:mm')}</time>
                            </div>
                            <p className="mt-0.5 text-[10px] text-slate-500">{launch.status}</p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="mt-4 text-xs text-slate-500">Nenhuma ordem registrada.</p>
                  )}
                </section>
              </aside>

              <section className="min-w-0 overflow-hidden rounded-xl border border-slate-700/60 bg-slate-950/30">
                <div className="space-y-3 border-b border-slate-700/60 p-3 sm:p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <h3 className="text-base font-black text-white sm:text-lg">Lista de Ordens de Serviço</h3>
                      <p className="text-[11px] text-slate-400">{visibleMonitoredLaunches.length} ordem(ns) · Filtre por status e clique em uma ordem para editar.</p>
                    </div>
                    <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto lg:min-w-[520px]">
                      <DateInput
                        value={monitoringDateFilter}
                        max={today()}
                        onChange={setMonitoringDateFilter}
                        className={cn(fieldClass, 'sm:w-40')}
                        aria-label="Filtrar ordens a partir da data"
                      />
                      <div className="relative min-w-0 flex-1">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                        <input
                          value={monitoringSearch}
                          onChange={(event) => setMonitoringSearch(event.target.value)}
                          placeholder="Pesquisar OS, cliente, moto..."
                          className={cn(fieldClass, 'pl-9')}
                          aria-label="Pesquisar ordens de serviço"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { id: 'all' as MonitoringStatusFilter, label: 'Todas', count: cashLaunches.length },
                      { id: 'Em Lancamento' as MonitoringStatusFilter, label: 'Em lancamento', count: monitoringStatusCounts['Em Lancamento'] },
                      { id: 'Pendente' as MonitoringStatusFilter, label: 'Pendente', count: monitoringStatusCounts.Pendente },
                      { id: 'Finalizado' as MonitoringStatusFilter, label: 'Finalizada', count: monitoringStatusCounts.Finalizado },
                      { id: 'Cancelado' as MonitoringStatusFilter, label: 'Cancelada', count: monitoringStatusCounts.Cancelado },
                    ].map((filter) => (
                      <button
                        key={filter.id}
                        type="button"
                        onClick={() => setMonitoringStatusFilter(filter.id)}
                        className={cn(
                          'inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wide transition',
                          monitoringStatusFilter === filter.id
                            ? 'border-primary/40 bg-primary text-white shadow-md shadow-primary/15'
                            : 'border-slate-700/60 bg-slate-900/60 text-slate-400 hover:border-slate-600 hover:text-white'
                        )}
                      >
                        {filter.label}<span className={cn('rounded-md px-1.5 py-0.5 text-[9px]', monitoringStatusFilter === filter.id ? 'bg-black/15 text-white' : 'bg-slate-800 text-slate-300')}>{filter.count}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="max-h-[680px] overflow-auto">
                  <table className="min-w-[1040px] w-full text-left text-[11px]">
                    <thead className="sticky top-0 z-10 bg-slate-800/95 text-[9px] uppercase tracking-wider text-slate-300 backdrop-blur">
                      <tr>
                        <th className="px-2.5 py-2.5">O.S.</th>
                        <th className="px-2.5 py-2.5">Cliente</th>
                        <th className="px-2.5 py-2.5">Abertura</th>
                        <th className="px-2.5 py-2.5">Prevista</th>
                        <th className="px-2.5 py-2.5">Status</th>
                        <th className="px-2.5 py-2.5">Placa/Moto</th>
                        <th className="px-2.5 py-2.5 text-right">Total R$</th>
                        <th className="px-2.5 py-2.5 text-center">Pagamento</th>
                        <th className="px-2.5 py-2.5 text-right">Saldo R$</th>
                        <th className="px-2.5 py-2.5">Forma</th>
                        <th className="px-2.5 py-2.5 text-right">Acao</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80">
                      {visibleMonitoredLaunches.length === 0 ? (
                        <tr><td colSpan={11} className="px-3 py-12 text-center text-xs text-slate-500">Nenhuma ordem encontrada com esses filtros.</td></tr>
                      ) : visibleMonitoredLaunches.map((launch) => (
                        <tr
                          key={launch.id}
                          onClick={() => loadLaunchForEdit(launch)}
                          className="cursor-pointer odd:bg-slate-900/20 transition-colors hover:bg-primary/[0.06]"
                          title="Clique para editar esta ordem"
                        >
                          <td className="px-2.5 py-2.5 font-black text-primary" title={launch.orderNumber}>{formatShortOrderNumber(launch.orderNumber)}</td>
                          <td className="max-w-40 truncate px-2.5 py-2.5 font-bold text-white">{launch.clientName}</td>
                          <td className="whitespace-nowrap px-2.5 py-2.5 text-slate-300">{safeFormat(launch.openingDate)}</td>
                          <td className="whitespace-nowrap px-2.5 py-2.5 text-slate-300">{safeFormat(launch.expectedDate)}</td>
                          <td className="px-2.5 py-2.5"><span className={cn('rounded-full px-2 py-0.5 text-[9px] font-bold', getStatusBadgeClass(launch.status))}>{launch.status}</span></td>
                          <td className="max-w-32 truncate px-2.5 py-2.5 text-slate-400">{launch.bikeModel || '-'}</td>
                          <td className="whitespace-nowrap px-2.5 py-2.5 text-right font-bold text-white">{compactCurrency(launch.total)}</td>
                          <td className="px-2.5 py-2.5 text-center">
                            <span className={cn(
                              'rounded-full px-2 py-0.5 text-[9px] font-black uppercase',
                              getCashPaymentStatus(launch) === 'Pago'
                                ? 'bg-emerald-500/15 text-emerald-200'
                                : getCashPaymentStatus(launch) === 'Parcial'
                                  ? 'bg-sky-500/15 text-sky-200'
                                  : 'bg-amber-500/15 text-amber-200'
                            )}>{getCashPaymentStatus(launch)}</span>
                          </td>
                          <td className="whitespace-nowrap px-2.5 py-2.5 text-right font-bold text-amber-200">{compactCurrency(getCashReceivableAmount(launch))}</td>
                          <td className="px-2.5 py-2.5 text-slate-300">{launch.paymentMethod || '-'}</td>
                          <td className="px-2.5 py-2.5 text-right">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                loadLaunchForEdit(launch);
                              }}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-[10px] font-bold text-slate-200 transition hover:border-primary/40 hover:bg-slate-700"
                            >
                              <Pencil className="h-3 w-3" />Editar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
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
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/80 p-2 backdrop-blur-md sm:p-4">
          <div className="flex max-h-[96vh] w-full max-w-[1500px] flex-col overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-950 shadow-2xl shadow-black">
            <div className="flex items-center justify-between gap-4 border-b border-slate-800 bg-gradient-to-r from-slate-900 via-slate-900 to-primary/10 px-4 py-4 sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
                  <PackageSearch className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">Ordem de servico / Mercadorias</p>
                  <h3 className="mt-0.5 text-lg font-black text-white sm:text-xl">Selecionar mercadoria</h3>
                  <p className="mt-0.5 hidden text-xs text-slate-400 sm:block">Pesquise no catalogo e selecione um item para lancar na O.S.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsProductPickerOpen(false)}
                aria-label="Fechar selecao de mercadoria"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-slate-700 bg-slate-900/80 text-slate-400 transition hover:border-slate-500 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 overflow-y-auto p-4 sm:p-6">
              <div className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-900/55 p-3 sm:flex-row sm:items-center">
                <div className="relative min-w-0 flex-1">
                  <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    ref={productSearchInputRef}
                    autoFocus
                    value={productSearch}
                    onChange={(event) => setProductSearch(event.target.value)}
                    placeholder="Buscar por codigo, descricao, variacao ou NCM..."
                    aria-label="Pesquisar mercadorias"
                    className={cn(fieldClass, 'h-11 border-slate-700 bg-slate-950 pl-10')}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setProductSearch('')}
                  className="h-11 rounded-lg border border-slate-700 bg-slate-800 px-4 text-xs font-black text-slate-300 transition hover:border-primary/40 hover:bg-slate-700 hover:text-white"
                >
                  Limpar pesquisa
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-4">
                {[
                  { label: 'Total de itens', value: products.length, icon: <PackageSearch className="h-4 w-4" />, style: 'border-slate-700/70 bg-slate-900/65 text-slate-300' },
                  { label: 'Em estoque', value: productStockSummary.inStock, icon: <CircleCheck className="h-4 w-4" />, style: 'border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-300' },
                  { label: 'Estoque baixo', value: productStockSummary.lowStock, icon: <Activity className="h-4 w-4" />, style: 'border-amber-500/20 bg-amber-500/[0.06] text-amber-300' },
                  { label: 'Sem estoque', value: productStockSummary.outOfStock, icon: <CircleX className="h-4 w-4" />, style: 'border-rose-500/20 bg-rose-500/[0.06] text-rose-300' },
                ].map((metric) => (
                  <div key={metric.label} className={cn('flex min-w-0 items-center gap-3 rounded-xl border px-3 py-3', metric.style)}>
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-black/20">{metric.icon}</span>
                    <div className="min-w-0">
                      <p className="truncate text-[10px] font-bold uppercase tracking-wide text-slate-400">{metric.label}</p>
                      <p className="mt-0.5 text-lg font-black leading-none text-white">{metric.value}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/35">
                <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
                  <div>
                    <h4 className="text-sm font-black text-white">Catalogo de mercadorias</h4>
                    <p className="mt-0.5 text-[11px] text-slate-500">{productPickerRows.length} resultado(s) exibido(s)</p>
                  </div>
                  {productSearch && <span className="max-w-[45%] truncate rounded-md bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary">Busca: {productSearch}</span>}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[980px] text-left text-xs">
                    <thead className="sticky top-0 z-10 bg-slate-800/95 text-[10px] uppercase tracking-wider text-slate-400 backdrop-blur">
                      <tr>
                        <th className="w-12 px-4 py-3"></th>
                        <th className="px-3 py-3">Codigo</th>
                        <th className="px-3 py-3">Descricao</th>
                        <th className="px-3 py-3">Variacao</th>
                        <th className="px-3 py-3">NCM</th>
                        <th className="px-3 py-3 text-right">Estoque</th>
                        <th className="px-3 py-3 text-right">Venda R$</th>
                        <th className="px-4 py-3 text-right">Acao</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80">
                      {products.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="px-3 py-12 text-center text-slate-500">
                            Importe a planilha XLSX para carregar Descricao, Variacao, NCM e Venda R$.
                          </td>
                        </tr>
                      ) : productPickerRows.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="px-3 py-12 text-center text-slate-500">Nenhuma mercadoria encontrada para esta busca.</td>
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
                            className="cursor-pointer transition-colors hover:bg-primary/[0.06] focus:bg-primary/[0.08] focus:outline-none"
                          >
                            <td className="px-4 py-2.5">
                              <span className="grid h-9 w-9 place-items-center rounded-lg border border-slate-700/70 bg-slate-800/80 text-slate-400">
                                <Box className="h-4 w-4" />
                              </span>
                            </td>
                            <td className="px-3 py-2.5 font-bold text-slate-300">{product.sourceCode}</td>
                            <td className="max-w-[360px] px-3 py-2.5 font-bold text-white">{product.description}</td>
                            <td className="px-3 py-2.5 text-slate-400">{variation?.name || product.variation || '-'}</td>
                            <td className="px-3 py-2.5 text-slate-400">{product.ncm || '-'}</td>
                            <td className={cn('px-3 py-2.5 text-right text-[11px] font-black', getProductStockClass(product))}>{getProductStockLabel(product)}</td>
                            <td className="px-3 py-2.5 text-right font-black text-primary">{compactCurrency(parsePositiveMoney(variation?.salePrice ?? product.salePrice))}</td>
                            <td className="px-4 py-2.5 text-right">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  addProduct(product, variation);
                                }}
                                className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-primary transition hover:bg-primary hover:text-white"
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
              </div>
              {products.length > 80 && (
                <p className="text-xs text-slate-500">Mostrando ate 80 resultados. Use a pesquisa para filtrar mais rapido.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const SummaryBox = ({
  label,
  value,
  icon,
  tone = 'slate',
  accent = false,
}: {
  label: string;
  value: string;
  icon?: ReactNode;
  tone?: 'blue' | 'slate' | 'purple';
  accent?: boolean;
}) => {
  const iconTone = accent
    ? 'bg-primary/15 text-primary'
    : tone === 'blue'
      ? 'bg-sky-500/15 text-sky-300'
      : tone === 'purple'
        ? 'bg-fuchsia-500/15 text-fuchsia-300'
        : 'bg-slate-700/60 text-slate-300';

  return (
    <div className={cn('flex min-w-0 items-center gap-2 rounded-xl border border-slate-700/60 bg-slate-950/45 px-2 py-2', accent && 'border-primary/40 bg-primary/[0.06]')}>
      {icon && <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-full', iconTone)}>{icon}</span>}
      <div className="min-w-0">
        <p className="truncate text-[10px] font-bold text-slate-400">{label}</p>
        <p className={cn('whitespace-nowrap text-sm font-black', accent ? 'text-primary' : 'text-white')}>{value}</p>
      </div>
    </div>
  );
};

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
