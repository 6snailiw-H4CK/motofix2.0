import { format } from 'date-fns';
import { useMemo, useState, type ChangeEvent, type ReactNode } from 'react';
import {
  Activity,
  ArrowLeft,
  Check,
  FileSpreadsheet,
  History,
  PackageSearch,
  Plus,
  ReceiptText,
  Save,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { cn, safeFormat } from '../../lib/utils';
import type { CashRegisterDraft } from '../../hooks/useCashRegisterActions';
import type { CashRegisterItem, CashRegisterLaunch, Client, ProductCatalogItem } from '../../types';

type CashRegisterViewProps = {
  cashLaunches: CashRegisterLaunch[];
  clients: Client[];
  products: ProductCatalogItem[];
  isImportingProducts: boolean;
  isSavingLaunch: boolean;
  onBack: () => void;
  onImportProducts: (file: File) => Promise<number> | number;
  onSaveLaunch: (draft: CashRegisterDraft) => Promise<boolean> | boolean;
};

type MainTab = 'control' | 'history' | 'monitoring';
type WorkTab = 'opening' | 'items';

const statusOptions: CashRegisterLaunch['status'][] = ['Em Lancamento', 'Finalizado', 'Pendente'];
const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const today = () => format(new Date(), 'yyyy-MM-dd');

const compactCurrency = (value: number) => currency.format(Number.isFinite(value) ? value : 0);

const parseNumber = (value: string | number) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number.parseFloat(value.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};

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

const calculateItem = (item: CashRegisterItem): CashRegisterItem => {
  const quantity = Math.max(0.01, Number(item.quantity) || 1);
  const unitPrice = Math.max(0, Number(item.unitPrice) || 0);
  const gross = quantity * unitPrice;
  const discountValue = Math.max(0, Number(item.discountValue) || 0);
  const discountPercent = Math.max(0, Number(item.discountPercent) || 0);
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

const fieldClass = 'w-full rounded-xl border border-slate-700/60 bg-slate-950/50 px-3 py-2 text-xs text-slate-100 outline-none transition focus:border-primary/60 focus:ring-1 focus:ring-primary/50';
const labelClass = 'text-[10px] font-bold uppercase tracking-widest text-slate-500';

export const CashRegisterView = ({
  cashLaunches,
  clients,
  products,
  isImportingProducts,
  isSavingLaunch,
  onBack,
  onImportProducts,
  onSaveLaunch,
}: CashRegisterViewProps) => {
  const [mainTab, setMainTab] = useState<MainTab>('control');
  const [workTab, setWorkTab] = useState<WorkTab>('opening');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [clientName, setClientName] = useState('');
  const [bikeModel, setBikeModel] = useState('');
  const [status, setStatus] = useState<CashRegisterLaunch['status']>('Em Lancamento');
  const [openingDate, setOpeningDate] = useState(today());
  const [expectedDate, setExpectedDate] = useState(today());
  const [observation, setObservation] = useState('');
  const [request, setRequest] = useState('');
  const [servicesExecuted, setServicesExecuted] = useState('');
  const [items, setItems] = useState<CashRegisterItem[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [isProductPickerOpen, setIsProductPickerOpen] = useState(false);
  const [historySearch, setHistorySearch] = useState('');

  const filteredProducts = useMemo(() => {
    const search = normalizeSearch(productSearch.trim());
    const rows = search
      ? products.filter((product) => {
        const haystack = normalizeSearch(`${product.sourceCode} ${product.description} ${product.ncm}`);
        return haystack.includes(search);
      })
      : products;

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

  const pendingLaunches = useMemo(
    () => cashLaunches.filter((launch) => launch.status !== 'Finalizado'),
    [cashLaunches]
  );

  const totals = useMemo(() => {
    const merchandiseGross = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const total = items.reduce((sum, item) => sum + item.total, 0);
    return {
      discountTotal: Math.max(0, merchandiseGross - total),
      merchandiseGross,
      servicesTotal: 0,
      total,
    };
  }, [items]);

  const selectedClient = clients.find((client) => client.id === selectedClientId);

  const selectClient = (clientId: string) => {
    setSelectedClientId(clientId);
    const client = clients.find((item) => item.id === clientId);
    if (client) {
      setClientName(client.name || '');
      setBikeModel(client.bikeModel || '');
    }
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    await Promise.resolve(onImportProducts(file));
    input.value = '';
  };

  const addProduct = (product: ProductCatalogItem) => {
    setItems((current) => {
      const existing = current.find((item) => item.productId === product.id);
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
          sourceCode: product.sourceCode,
          description: product.description,
          ncm: product.ncm,
          quantity: 1,
          unitPrice: product.salePrice,
          discountValue: 0,
          discountPercent: 0,
          netUnitPrice: product.salePrice,
          total: product.salePrice,
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

  const resetDraft = () => {
    setSelectedClientId('');
    setClientName('');
    setBikeModel('');
    setStatus('Em Lancamento');
    setOpeningDate(today());
    setExpectedDate(today());
    setObservation('');
    setRequest('');
    setServicesExecuted('');
    setItems([]);
    setWorkTab('opening');
  };

  const buildDraft = (statusOverride?: CashRegisterLaunch['status'], invoiced = false): CashRegisterDraft => ({
    clientId: selectedClientId || undefined,
    clientName: clientName.trim() || selectedClient?.name || 'Consumidor final',
    bikeModel: bikeModel.trim() || selectedClient?.bikeModel || '',
    status: statusOverride || status,
    openingDate,
    expectedDate,
    request: request.trim(),
    servicesExecuted: servicesExecuted.trim(),
    observation: observation.trim(),
    items,
    merchandiseTotal: totals.merchandiseGross,
    servicesTotal: totals.servicesTotal,
    discountTotal: totals.discountTotal,
    total: totals.total,
    invoiced,
  });

  const handleSave = async (statusOverride?: CashRegisterLaunch['status'], invoiced = false) => {
    const saved = await Promise.resolve(onSaveLaunch(buildDraft(statusOverride, invoiced)));
    if (saved) resetDraft();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="grid h-10 w-10 place-items-center rounded-xl border border-slate-700/70 bg-slate-900/70 text-slate-300 transition-colors hover:border-primary/50 hover:text-white"
            aria-label="Voltar"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">Modulo teste</p>
            <h2 className="text-2xl font-black tracking-tight text-white">Lancamentos Caixa</h2>
            <p className="text-xs text-slate-500">Venda rapida com cliente, mercadorias importadas e historico.</p>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className={cn(
            'inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-2.5 text-xs font-bold text-primary transition hover:border-primary/60 hover:bg-primary/15',
            isImportingProducts && 'pointer-events-none opacity-60'
          )}>
            <Upload className="h-4 w-4" />
            {isImportingProducts ? 'Importando...' : 'Importar XLSX'}
            <input
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={handleImport}
              disabled={isImportingProducts}
            />
          </label>
          <div className="rounded-xl border border-slate-700/60 bg-slate-900/70 px-3 py-2 text-xs text-slate-400">
            <span className="font-bold text-white">{products.length}</span> mercadoria(s)
          </div>
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-900/55 shadow-2xl shadow-black/20">
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
                  'inline-flex min-h-12 items-center gap-2 border-b-2 px-5 text-xs font-bold uppercase tracking-wide transition-colors',
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
                    'rounded-xl px-4 py-2 text-xs font-bold transition',
                    workTab === tab.id ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-slate-950/60 text-slate-400 hover:text-white'
                  )}
                >
                  {tab.label}
                </button>
              ))}
              <button type="button" disabled className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600">Funcionarios</button>
              <button type="button" disabled className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600">Alocacao</button>
            </div>

            {workTab === 'opening' ? (
              <div className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
                <div className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <div className="space-y-1">
                      <label className={labelClass}>Status</label>
                      <select value={status} onChange={(event) => setStatus(event.target.value as CashRegisterLaunch['status'])} className={fieldClass}>
                        {statusOptions.map((option) => <option key={option}>{option}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <label className={labelClass}>Cliente</label>
                      <select value={selectedClientId} onChange={(event) => selectClient(event.target.value)} className={fieldClass}>
                        <option value="">-- NAO INFORMADO --</option>
                        {clients.map((client) => (
                          <option key={client.id} value={client.id}>{client.name} {client.bikeModel ? `- ${client.bikeModel}` : ''}</option>
                        ))}
                      </select>
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

                  <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
                    <div className="space-y-1">
                      <label className={labelClass}>Observacao</label>
                      <textarea
                        value={observation}
                        onChange={(event) => setObservation(event.target.value)}
                        rows={5}
                        placeholder="Observacoes gerais do lancamento..."
                        className={cn(fieldClass, 'resize-none')}
                      />
                    </div>
                    <div className="grid gap-3">
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
                    className="flex min-h-28 w-full items-center justify-center gap-3 rounded-2xl border border-dashed border-primary/40 bg-primary/5 text-sm font-bold text-primary transition hover:bg-primary/10"
                  >
                    <PackageSearch className="h-5 w-5" />
                    Abrir mercadorias / servicos
                  </button>
                </div>

                <div className="rounded-2xl border border-slate-700/50 bg-slate-950/40 p-4">
                  <div className="flex items-center justify-between gap-3 border-b border-slate-700/50 pb-3">
                    <div>
                      <p className={labelClass}>Itens selecionados</p>
                      <h3 className="text-lg font-black text-white">{items.length} item(ns)</h3>
                    </div>
                    <button type="button" onClick={() => setIsProductPickerOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-white">
                      <Plus className="h-4 w-4" />
                      Incluir
                    </button>
                  </div>

                  <div className="mt-3 space-y-2">
                    {items.length === 0 ? (
                      <p className="rounded-xl bg-slate-900/70 p-4 text-xs text-slate-500">Nenhuma mercadoria incluida ainda.</p>
                    ) : (
                      items.slice(0, 5).map((item) => (
                        <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-900/70 p-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-white">{item.description}</p>
                            <p className="text-[10px] text-slate-500">Cod. {item.sourceCode} | NCM {item.ncm || '-'}</p>
                          </div>
                          <p className="shrink-0 text-sm font-black text-primary">{compactCurrency(item.total)}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className={labelClass}>Mercadorias / Servicos</p>
                    <h3 className="text-lg font-black text-white">{items.length} item(ns) no lancamento</h3>
                  </div>
                  <button type="button" onClick={() => setIsProductPickerOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-primary/20">
                    <Plus className="h-4 w-4" />
                    Incluir
                  </button>
                </div>

                <div className="overflow-x-auto rounded-2xl border border-slate-700/50">
                  <table className="min-w-[1180px] w-full text-left text-xs">
                    <thead className="bg-primary/90 text-white">
                      <tr>
                        <th className="px-3 py-2">Excluir</th>
                        <th className="px-3 py-2">Codigo</th>
                        <th className="px-3 py-2">Descricao</th>
                        <th className="px-3 py-2">Qtd</th>
                        <th className="px-3 py-2">Unitario R$</th>
                        <th className="px-3 py-2">Desconto R$</th>
                        <th className="px-3 py-2">Desconto %</th>
                        <th className="px-3 py-2">Unit. Liquido R$</th>
                        <th className="px-3 py-2">Total Liquido R$</th>
                        <th className="px-3 py-2">Data</th>
                        <th className="px-3 py-2">Observacao</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 bg-slate-950/40">
                      {items.length === 0 ? (
                        <tr>
                          <td colSpan={11} className="px-3 py-10 text-center text-slate-500">Clique em Incluir para pesquisar uma mercadoria importada.</td>
                        </tr>
                      ) : (
                        items.map((item) => (
                          <tr key={item.id} className="hover:bg-slate-900/70">
                            <td className="px-3 py-2">
                              <button type="button" onClick={() => setItems((current) => current.filter((row) => row.id !== item.id))} className="rounded-lg bg-red-500/10 p-2 text-red-400 hover:bg-red-500/20">
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                            <td className="px-3 py-2 font-bold text-slate-300">{item.sourceCode}</td>
                            <td className="max-w-sm px-3 py-2 font-bold text-white">{item.description}</td>
                            <td className="px-3 py-2">
                              <input type="number" min="0.01" step="0.01" value={item.quantity} onChange={(event) => updateItem(item.id, { quantity: parseNumber(event.target.value) })} className="w-20 rounded-lg bg-slate-900 px-2 py-1.5 text-right outline-none focus:ring-1 focus:ring-primary" />
                            </td>
                            <td className="px-3 py-2">
                              <input value={String(item.unitPrice)} onChange={(event) => updateItem(item.id, { unitPrice: parseNumber(event.target.value) })} className="w-24 rounded-lg bg-slate-900 px-2 py-1.5 text-right outline-none focus:ring-1 focus:ring-primary" />
                            </td>
                            <td className="px-3 py-2">
                              <input value={String(item.discountValue)} onChange={(event) => updateItem(item.id, { discountValue: parseNumber(event.target.value) })} className="w-24 rounded-lg bg-slate-900 px-2 py-1.5 text-right outline-none focus:ring-1 focus:ring-primary" />
                            </td>
                            <td className="px-3 py-2">
                              <input value={String(item.discountPercent)} onChange={(event) => updateItem(item.id, { discountPercent: parseNumber(event.target.value) })} className="w-24 rounded-lg bg-slate-900 px-2 py-1.5 text-right outline-none focus:ring-1 focus:ring-primary" />
                            </td>
                            <td className="px-3 py-2 text-right font-bold text-emerald-300">{compactCurrency(item.netUnitPrice)}</td>
                            <td className="px-3 py-2 text-right font-black text-primary">{compactCurrency(item.total)}</td>
                            <td className="px-3 py-2">
                              <input type="date" value={item.date} onChange={(event) => updateItem(item.id, { date: event.target.value })} className="w-36 rounded-lg bg-slate-900 px-2 py-1.5 outline-none focus:ring-1 focus:ring-primary" />
                            </td>
                            <td className="px-3 py-2">
                              <input value={item.note || ''} onChange={(event) => updateItem(item.id, { note: event.target.value })} placeholder="Obs." className="w-44 rounded-lg bg-slate-900 px-2 py-1.5 outline-none focus:ring-1 focus:ring-primary" />
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="grid gap-3 border-t border-slate-700/50 pt-4 lg:grid-cols-[auto_1fr_auto] lg:items-end">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <SummaryBox label="Mercadorias R$" value={compactCurrency(totals.merchandiseGross)} />
                <SummaryBox label="Servicos R$" value={compactCurrency(totals.servicesTotal)} />
                <SummaryBox label="Descontos R$" value={compactCurrency(totals.discountTotal)} />
                <SummaryBox label="Total R$" value={compactCurrency(totals.total)} accent />
              </div>

              <div className="hidden lg:block" />

              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
                <ActionButton disabled label="Email Tecnico" />
                <ActionButton disabled label="Imprimir Fatura" />
                <ActionButton label="Faturar" onClick={() => void handleSave('Finalizado', true)} disabled={isSavingLaunch} />
                <ActionButton disabled label="Imprimir" />
                <ActionButton label="Incluir" icon={<Plus className="h-4 w-4" />} onClick={() => setIsProductPickerOpen(true)} />
                <ActionButton label={isSavingLaunch ? 'Salvando...' : 'Salvar'} icon={<Save className="h-4 w-4" />} onClick={() => void handleSave()} disabled={isSavingLaunch} primary />
                <ActionButton label="Fechar" icon={<X className="h-4 w-4" />} onClick={onBack} />
              </div>
            </div>
          </div>
        )}

        {mainTab === 'history' && (
          <div className="space-y-4 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className={labelClass}>Historico</p>
                <h3 className="text-xl font-black text-white">{filteredLaunches.length} lancamento(s)</h3>
              </div>
              <div className="relative w-full lg:w-96">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input value={historySearch} onChange={(event) => setHistorySearch(event.target.value)} placeholder="Pesquisar por OS, cliente, status..." className={cn(fieldClass, 'pl-9')} />
              </div>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-700/50">
              <table className="min-w-[920px] w-full text-left text-xs">
                <thead className="bg-primary/90 text-white">
                  <tr>
                    <th className="px-3 py-2">O.S.</th>
                    <th className="px-3 py-2">Cliente</th>
                    <th className="px-3 py-2">Abertura</th>
                    <th className="px-3 py-2">Prevista</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Placa/Moto</th>
                    <th className="px-3 py-2 text-right">Total R$</th>
                    <th className="px-3 py-2 text-center">Faturado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 bg-slate-950/40">
                  {filteredLaunches.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-3 py-10 text-center text-slate-500">Nenhum lancamento salvo ainda.</td>
                    </tr>
                  ) : (
                    filteredLaunches.map((launch) => (
                      <tr key={launch.id} className="hover:bg-slate-900/70">
                        <td className="px-3 py-2 font-black text-primary">{launch.orderNumber}</td>
                        <td className="px-3 py-2 font-bold text-white">{launch.clientName}</td>
                        <td className="px-3 py-2 text-slate-300">{safeFormat(launch.openingDate)}</td>
                        <td className="px-3 py-2 text-slate-300">{safeFormat(launch.expectedDate)}</td>
                        <td className="px-3 py-2">
                          <span className="rounded-full bg-slate-800 px-2 py-1 text-[10px] font-bold text-slate-200">{launch.status}</span>
                        </td>
                        <td className="px-3 py-2 text-slate-400">{launch.bikeModel || '-'}</td>
                        <td className="px-3 py-2 text-right font-black text-white">{compactCurrency(launch.total)}</td>
                        <td className="px-3 py-2 text-center">{launch.invoiced ? <Check className="mx-auto h-4 w-4 text-emerald-400" /> : '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {mainTab === 'monitoring' && (
          <div className="grid gap-4 p-4 lg:grid-cols-[0.8fr_1.2fr]">
            <div className="rounded-2xl border border-slate-700/50 bg-slate-950/40 p-4">
              <p className={labelClass}>Resumo</p>
              <h3 className="mt-1 text-2xl font-black text-white">{pendingLaunches.length}</h3>
              <p className="text-xs text-slate-500">Lancamento(s) ainda em andamento ou pendentes.</p>
            </div>
            <div className="space-y-2">
              {pendingLaunches.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-700/50 p-6 text-center text-xs text-slate-500">Nada pendente no momento.</div>
              ) : (
                pendingLaunches.map((launch) => (
                  <div key={launch.id} className="flex flex-col gap-2 rounded-2xl border border-slate-700/50 bg-slate-950/40 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-black text-white">{launch.clientName}</p>
                      <p className="text-[10px] text-slate-500">{launch.orderNumber} | {safeFormat(launch.createdAt, 'dd/MM/yyyy HH:mm')}</p>
                    </div>
                    <div className="text-left sm:text-right">
                      <p className="text-sm font-black text-primary">{compactCurrency(launch.total)}</p>
                      <p className="text-[10px] font-bold uppercase text-slate-500">{launch.status}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </section>

      {isProductPickerOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl shadow-black">
            <div className="flex flex-col gap-3 border-b border-slate-800 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className={labelClass}>Pesquisa de Mercadoria</p>
                <h3 className="text-xl font-black text-white">Selecionar variacao</h3>
              </div>
              <button type="button" onClick={() => setIsProductPickerOpen(false)} className="grid h-10 w-10 place-items-center rounded-xl bg-slate-900 text-slate-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-3 border-b border-slate-800 p-4 lg:grid-cols-[1fr_auto_auto] lg:items-end">
              <div className="space-y-1">
                <label className={labelClass}>Pesquisa</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input autoFocus value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Ex: PATIN, filtro, oleo..." className={cn(fieldClass, 'pl-9')} />
                </div>
              </div>
              <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-xs font-bold text-slate-200 hover:border-primary/50">
                <FileSpreadsheet className="h-4 w-4" />
                Trocar XLSX
                <input type="file" accept=".xlsx" className="hidden" onChange={handleImport} disabled={isImportingProducts} />
              </label>
              <button type="button" onClick={() => setProductSearch('')} className="rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-slate-300 hover:bg-slate-800">
                Limpar
              </button>
            </div>

            <div className="flex-1 overflow-auto p-4">
              <div className="min-w-[820px] overflow-hidden rounded-2xl border border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-primary/90 text-white">
                    <tr>
                      <th className="px-3 py-2">Codigo</th>
                      <th className="px-3 py-2">Descricao</th>
                      <th className="px-3 py-2">NCM</th>
                      <th className="px-3 py-2 text-right">Venda R$</th>
                      <th className="px-3 py-2 text-right">Acao</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 bg-slate-950/40">
                    {products.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-10 text-center text-slate-500">
                          Importe a planilha XLSX para carregar Descricao, NCM e Venda R$.
                        </td>
                      </tr>
                    ) : filteredProducts.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-10 text-center text-slate-500">Nenhuma mercadoria encontrada para esta busca.</td>
                      </tr>
                    ) : (
                      filteredProducts.map((product) => (
                        <tr key={product.id} className="hover:bg-slate-900/70">
                          <td className="px-3 py-2 font-bold text-slate-300">{product.sourceCode}</td>
                          <td className="px-3 py-2 font-bold text-white">{product.description}</td>
                          <td className="px-3 py-2 text-slate-400">{product.ncm || '-'}</td>
                          <td className="px-3 py-2 text-right font-black text-primary">{compactCurrency(product.salePrice)}</td>
                          <td className="px-3 py-2 text-right">
                            <button type="button" onClick={() => addProduct(product)} className="rounded-xl bg-primary px-3 py-2 text-[10px] font-black uppercase text-white hover:bg-primary/90">
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
                <p className="mt-3 text-[10px] text-slate-500">Mostrando ate 80 resultados. Use a pesquisa para filtrar mais rapido.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const SummaryBox = ({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) => (
  <div className={cn('rounded-xl border border-slate-700/50 bg-slate-950/50 px-3 py-2', accent && 'border-primary/40 bg-primary/10')}>
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
      'inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition',
      primary ? 'bg-primary text-white hover:bg-primary/90' : 'bg-slate-800 text-slate-200 hover:bg-slate-700',
      disabled && 'cursor-not-allowed opacity-45 hover:bg-slate-800'
    )}
  >
    {icon}
    {label}
  </button>
);
