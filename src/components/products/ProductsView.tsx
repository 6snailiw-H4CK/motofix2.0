import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowDownWideNarrow, Boxes, ChevronDown, CircleDollarSign, Download, PackagePlus, Pencil, Plus, Save, Search, Settings2, ShieldCheck, Trash2, Upload, X } from 'lucide-react';
import { cn, safeFormat } from '../../lib/utils';
import type { ProductCatalogFormInput, ProductCatalogItem, ProductCatalogVariation } from '../../types';

type ProductsViewProps = {
  products: ProductCatalogItem[];
  isSavingProduct: boolean;
  isDeletingProducts: boolean;
  isRestoringBackup: boolean;
  deletingProductId?: string | null;
  deleteConfirmId?: string | null;
  onExportBackup: () => void;
  onRestoreBackup: (file: File) => Promise<number> | number;
  onSaveProduct: (input: ProductCatalogFormInput, productId?: string) => Promise<boolean> | boolean;
  onDeleteProductClick: (product: ProductCatalogItem) => void;
  onDeleteAllProductsClick: (productIds: string[]) => Promise<boolean> | boolean;
};

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const inputClass = 'w-full rounded-xl border border-slate-700/70 bg-slate-950/50 px-3 py-2.5 text-sm font-bold text-slate-100 outline-none transition focus:border-primary/60 focus:ring-1 focus:ring-primary/50';
const labelClass = 'text-[10px] font-black uppercase tracking-[0.2em] text-slate-500';
const INITIAL_VISIBLE_PRODUCTS = 120;
const VISIBLE_PRODUCTS_STEP = 120;
type ProductStatusFilter = 'all' | 'in-stock' | 'low' | 'out' | 'untracked';
type ProductSortOrder = 'recent' | 'oldest' | 'price-low' | 'price-high' | 'description';

const emptyForm: ProductCatalogFormInput = {
  sourceCode: '',
  description: '',
  variation: '',
  variations: [],
  ncm: '',
  salePrice: 0,
  stockQuantity: 0,
  minStockQuantity: 0,
  trackStock: false,
};

const parseMoney = (value: string) => {
  const normalized = value.replace(/\./g, '').replace(',', '.');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatMoneyInput = (value: number) => (
  value ? String(value).replace('.', ',') : ''
);

const parseStockInput = (value: string) => {
  const parsed = Number(value.replace(/\D/g, ''));
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
};

const formatStockInput = (value?: number) => (
  Number(value || 0) > 0 ? String(Math.floor(Number(value || 0))) : ''
);

const getStockStatus = (product: ProductCatalogItem) => {
  if (!product.trackStock) {
    return {
      label: 'Sem controle',
      className: 'border-slate-700 bg-slate-900 text-slate-400',
    };
  }

  const stockQuantity = Number(product.stockQuantity || 0);
  const minStockQuantity = Number(product.minStockQuantity || 0);

  if (stockQuantity <= 0) {
    return {
      label: 'Zerado',
      className: 'border-red-500/40 bg-red-500/10 text-red-200',
    };
  }

  if (minStockQuantity > 0 && stockQuantity <= minStockQuantity) {
    return {
      label: 'Baixo',
      className: 'border-amber-500/40 bg-amber-500/10 text-amber-200',
    };
  }

  return {
    label: 'Em estoque',
    className: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
  };
};

const makeVariationId = (name: string) => (
  `var-${name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || Date.now()}`
);

export const ProductsView = ({
  products,
  isSavingProduct,
  isDeletingProducts,
  isRestoringBackup,
  deletingProductId,
  deleteConfirmId,
  onExportBackup,
  onRestoreBackup,
  onSaveProduct,
  onDeleteProductClick,
  onDeleteAllProductsClick,
}: ProductsViewProps) => {
  const backupImportInputRef = useRef<HTMLInputElement>(null);
  const [isBackupMenuOpen, setIsBackupMenuOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [isLowStockFilterActive, setIsLowStockFilterActive] = useState(false);
  const [statusFilter, setStatusFilter] = useState<ProductStatusFilter>('all');
  const [sortOrder, setSortOrder] = useState<ProductSortOrder>('recent');
  const [isProductFormOpen, setIsProductFormOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | undefined>();
  const [form, setForm] = useState<ProductCatalogFormInput>(emptyForm);
  const [salePriceInput, setSalePriceInput] = useState('');
  const [stockQuantityInput, setStockQuantityInput] = useState('');
  const [minStockQuantityInput, setMinStockQuantityInput] = useState('');
  const [isVariationFormOpen, setIsVariationFormOpen] = useState(false);
  const [variationName, setVariationName] = useState('');
  const [variationPriceInput, setVariationPriceInput] = useState('');
  const [isDeleteAllConfirming, setIsDeleteAllConfirming] = useState(false);
  const [isNcmPickerOpen, setIsNcmPickerOpen] = useState(false);
  const [ncmQuery, setNcmQuery] = useState('');
  const [visibleLimit, setVisibleLimit] = useState(INITIAL_VISIBLE_PRODUCTS);
  const deferredSearch = useDeferredValue(search);

  const productSearchRows = useMemo(() => (
    products.map((product) => ({
      product,
      searchText: [
        product.description,
        product.variation,
        product.sourceCode,
        product.ncm,
        product.trackStock ? 'estoque controle estoque' : 'sem controle estoque',
        String(product.stockQuantity || 0),
        String(product.minStockQuantity || 0),
        getStockStatus(product).label,
        ...(product.variations || []).flatMap((variation) => [
          variation.name,
          String(variation.salePrice || 0),
        ]),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase(),
    }))
  ), [products]);

  const filteredProducts = useMemo(() => {
    const term = deferredSearch.trim().toLowerCase();
    const searchFilteredProducts = !term
      ? products
      : productSearchRows
        .filter(({ searchText }) => searchText.includes(term))
        .map(({ product }) => product);

    const matchesStatus = (product: ProductCatalogItem) => {
      if (statusFilter === 'all') return true;
      if (statusFilter === 'untracked') return !product.trackStock;
      const stockQuantity = Number(product.stockQuantity || 0);
      const minStockQuantity = Number(product.minStockQuantity || 0);
      const isOutOfStock = stockQuantity <= 0;
      const isLowStock = isOutOfStock || (minStockQuantity > 0 && stockQuantity <= minStockQuantity);
      if (statusFilter === 'out') return product.trackStock && isOutOfStock;
      if (statusFilter === 'low') return product.trackStock && !isOutOfStock && isLowStock;
      return product.trackStock && !isLowStock;
    };

    return searchFilteredProducts
      .filter((product) => matchesStatus(product) && (!isLowStockFilterActive || (
        product.trackStock && (
          Number(product.stockQuantity || 0) <= 0
          || (Number(product.minStockQuantity || 0) > 0 && Number(product.stockQuantity || 0) <= Number(product.minStockQuantity || 0))
        )
      )))
      .sort((a, b) => {
        if (sortOrder === 'price-low') return Number(a.salePrice || 0) - Number(b.salePrice || 0);
        if (sortOrder === 'price-high') return Number(b.salePrice || 0) - Number(a.salePrice || 0);
        if (sortOrder === 'description') return a.description.localeCompare(b.description, 'pt-BR');
        const dateA = Date.parse(a.importedAt);
        const dateB = Date.parse(b.importedAt);
        const comparison = (Number.isNaN(dateA) ? 0 : dateA) - (Number.isNaN(dateB) ? 0 : dateB);
        return sortOrder === 'recent' ? -comparison : comparison;
      });
  }, [deferredSearch, isLowStockFilterActive, productSearchRows, products, sortOrder, statusFilter]);

  const visibleProducts = useMemo(
    () => filteredProducts.slice(0, visibleLimit),
    [filteredProducts, visibleLimit]
  );
  const hiddenProductsCount = Math.max(filteredProducts.length - visibleProducts.length, 0);
  const isSearchPending = search !== deferredSearch;

  const averagePrice = useMemo(() => (
    products.length
      ? products.reduce((sum, product) => sum + Number(product.salePrice || 0), 0) / products.length
      : 0
  ), [products]);
  const stockSummary = useMemo(() => {
    const controlledProducts = products.filter((product) => product.trackStock);
    const lowStockProducts = controlledProducts.filter((product) => {
      const stockQuantity = Number(product.stockQuantity || 0);
      const minStockQuantity = Number(product.minStockQuantity || 0);
      return stockQuantity <= 0 || (minStockQuantity > 0 && stockQuantity <= minStockQuantity);
    });

    return {
      lowStockCount: lowStockProducts.length,
      outOfStockCount: lowStockProducts.filter((product) => Number(product.stockQuantity || 0) <= 0).length,
      estimatedSaleValue: controlledProducts.reduce(
        (sum, product) => sum + Number(product.salePrice || 0) * Number(product.stockQuantity || 0),
        0
      ),
    };
  }, [products]);
  const selectedProduct = useMemo(
    () => products.find((product) => product.id === editingProductId),
    [editingProductId, products]
  );

  useEffect(() => {
    setVisibleLimit(INITIAL_VISIBLE_PRODUCTS);
  }, [deferredSearch, isLowStockFilterActive, products.length, sortOrder, statusFilter]);

  const updateForm = (patch: Partial<ProductCatalogFormInput>) => {
    setForm((current) => ({ ...current, ...patch }));
  };

  const [ncmList, setNcmList] = useState<Array<{ ncm: string; descricao: string; search: string }>>([]);

  const removeDiacritics = (s: string) => String(s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();

  const filteredNcmList = useMemo(() => {
    const query = removeDiacritics(ncmQuery).toLowerCase().trim();
    if (!query) return [];

    const codeQuery = query.replace(/\D/g, '');
    const terms = query.split(/\s+/).filter(Boolean);
    return ncmList
      .filter((item) => (
        (codeQuery && item.ncm.startsWith(codeQuery))
        || terms.every((term) => item.search.includes(term))
      ))
      .slice(0, 100);
  }, [ncmList, ncmQuery]);

  useEffect(() => {
    let mounted = true;
    fetch('/data/ncm.json')
      .then((res) => res.json())
      .then((data) => {
        if (!mounted) return;
        let items: any[] = [];
        if (Array.isArray(data)) items = data;
        else if (data && Array.isArray((data as any).Nomenclaturas)) items = (data as any).Nomenclaturas;

        const normalized = items.map((item: any) => {
          if (!item) return null;
          if (typeof item === 'string') return { ncm: String(item).replace(/\D/g, ''), descricao: '', search: removeDiacritics(String(item)) };
          const rawCode = String(item.ncm || item.Codigo || item.Codigo_NCM || item.CodigoNCM || item.CodigoNcm || item.Code || '').replace(/\D/g, '');
          const descricao = String(item.descricao || item.Descricao || item.descricao_concat || item.description || item.label || '');
          const search = removeDiacritics(descricao.toLowerCase() + ' ' + rawCode);
          const code = rawCode || String(item.Codigo || '').replace(/\D/g, '');
          return { ncm: (code || '').padStart(0, '0'), descricao: descricao || '', search };
        }).filter(Boolean) as Array<{ ncm: string; descricao: string; search: string }>;

        setNcmList(normalized.filter((it) => /^\d{8}$/.test(it.ncm)));
      }).catch(() => {
        // ignore
      });

    return () => { mounted = false; };
  }, []);

  const resetVariationDraft = () => {
    setVariationName('');
    setVariationPriceInput('');
    setIsVariationFormOpen(false);
  };

  const resetProductForm = () => {
    setEditingProductId(undefined);
    setForm(emptyForm);
    setSalePriceInput('');
    setStockQuantityInput('');
    setMinStockQuantityInput('');
    resetVariationDraft();
    setIsDeleteAllConfirming(false);
  };

  const startNewProduct = () => {
    resetProductForm();
    setIsProductFormOpen(true);
  };

  const closeProductForm = () => {
    setIsProductFormOpen(false);
    resetProductForm();
  };

  useEffect(() => {
    if (!isProductFormOpen || isNcmPickerOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsProductFormOpen(false);
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isNcmPickerOpen, isProductFormOpen]);

  const startEditProduct = (product: ProductCatalogItem) => {
    const variations = product.variations?.length
      ? product.variations
      : product.variation
        ? [{ id: makeVariationId(product.variation), name: product.variation, salePrice: Number(product.salePrice || 0) }]
        : [];

    setEditingProductId(product.id);
    setForm({
      sourceCode: product.sourceCode || '',
      description: product.description || '',
      variation: product.variation || '',
      variations,
      ncm: product.ncm || '',
      salePrice: Number(product.salePrice || 0),
      trackStock: Boolean(product.trackStock),
      stockQuantity: Number(product.stockQuantity || 0),
      minStockQuantity: Number(product.minStockQuantity || 0),
    });
    setSalePriceInput(formatMoneyInput(Number(product.salePrice || 0)));
    setStockQuantityInput(formatStockInput(product.stockQuantity));
    setMinStockQuantityInput(formatStockInput(product.minStockQuantity));
    setIsVariationFormOpen(false);
    setVariationName('');
    setVariationPriceInput('');
    setIsProductFormOpen(true);
  };

  const addVariation = () => {
    const name = variationName.replace(/\s+/g, ' ').trim();
    if (!name) return;

    const newVariation: ProductCatalogVariation = {
      id: `${makeVariationId(name)}-${Date.now().toString(36)}`,
      name,
      salePrice: parseMoney(variationPriceInput),
    };

    updateForm({ variations: [...(form.variations || []), newVariation] });
    setVariationName('');
    setVariationPriceInput('');
    setIsVariationFormOpen(false);
  };

  const removeVariation = (variationId: string) => {
    updateForm({ variations: (form.variations || []).filter((variation) => variation.id !== variationId) });
  };

  const handleSave = async () => {
    const saved = await onSaveProduct({
      ...form,
      salePrice: parseMoney(salePriceInput),
      stockQuantity: parseStockInput(stockQuantityInput),
      minStockQuantity: parseStockInput(minStockQuantityInput),
    }, editingProductId);

    if (saved) {
      closeProductForm();
    }
  };

  const handleDeleteAllProducts = async () => {
    if (products.length === 0 || isDeletingProducts) return;

    if (!isDeleteAllConfirming) {
      setIsDeleteAllConfirming(true);
      return;
    }

    const deleted = await onDeleteAllProductsClick(products.map((product) => product.id));
    if (deleted) {
      closeProductForm();
      setSearch('');
    }
  };

  return (
    <div className="light-readable-view space-y-5">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-primary">Catalogo</p>
          <h2 className="text-2xl font-black tracking-tight text-white">Mercadorias</h2>
          <p className="text-sm text-slate-400">Acompanhe o catalogo, os precos e a disponibilidade do estoque.</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <input
            ref={backupImportInputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void onRestoreBackup(file);
              event.target.value = '';
              setIsBackupMenuOpen(false);
            }}
          />
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsBackupMenuOpen((open) => !open)}
              aria-label="Opções de backup de mercadorias"
              aria-expanded={isBackupMenuOpen}
              aria-haspopup="menu"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-700/70 bg-slate-800 px-4 py-2.5 text-sm font-black text-slate-200 transition hover:bg-slate-700"
            >
              <Settings2 className="h-4 w-4" />
              Backup
            </button>
            {isBackupMenuOpen && (
              <div
                role="menu"
                aria-label="Opções de backup de mercadorias"
                className="absolute right-0 z-30 mt-2 grid min-w-52 gap-1 rounded-xl border border-slate-700 bg-slate-900 p-2 shadow-xl"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onExportBackup();
                    setIsBackupMenuOpen(false);
                  }}
                  disabled={products.length === 0}
                  title="O backup inclui as variações cadastradas e seus preços."
                  className="inline-flex items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-bold text-emerald-300 transition hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Download className="h-4 w-4" />
                  Baixar backup
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => backupImportInputRef.current?.click()}
                  disabled={isRestoringBackup}
                  title="Selecione uma planilha de backup para restaurar as mercadorias e suas variações."
                  className="inline-flex items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-bold text-primary transition hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Upload className="h-4 w-4" />
                  {isRestoringBackup ? 'Restaurando...' : 'Restaurar backup'}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void handleDeleteAllProducts()}
                  disabled={products.length === 0 || isDeletingProducts}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50',
                    isDeleteAllConfirming
                      ? 'bg-red-500 text-white hover:bg-red-600'
                      : 'text-red-300 hover:bg-red-500/10'
                  )}
                >
                  <Trash2 className="h-4 w-4" />
                  {isDeletingProducts ? 'Apagando...' : isDeleteAllConfirming ? 'Confirmar apagar' : 'Apagar importadas'}
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={startNewProduct}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-black text-white shadow-lg shadow-primary/20"
          >
            <Plus className="h-4 w-4" />
            Nova mercadoria
          </button>
        </div>
      </div>

      {isProductFormOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm sm:p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeProductForm();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !isNcmPickerOpen) closeProductForm();
          }}
        >
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="product-form-title"
          className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-2xl shadow-black sm:p-6"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className={labelClass}>{editingProductId ? 'Editando mercadoria' : 'Nova mercadoria'}</p>
              <h3 id="product-form-title" className="mt-1 text-xl font-black text-white">
                {selectedProduct?.description || 'Cadastro rapido'}
              </h3>
            </div>
            <button
              type="button"
              onClick={closeProductForm}
              autoFocus
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-800 text-slate-300 transition hover:text-white"
              title="Fechar formulario"
              aria-label="Fechar formulario"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className={labelClass}>Codigo</span>
              <input
                value={form.sourceCode}
                onChange={(event) => updateForm({ sourceCode: event.target.value })}
                className={inputClass}
                placeholder="Ex: 163"
              />
            </label>
            <div className="space-y-1">
              <span className={labelClass}>NCM</span>
              <div className="flex gap-2">
                <input
                  value={form.ncm}
                  readOnly
                  className={cn(inputClass, 'min-w-0')}
                  placeholder="Nenhum NCM selecionado"
                />
                <button
                  type="button"
                  onClick={() => {
                    setNcmQuery('');
                    setIsNcmPickerOpen(true);
                  }}
                  className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-3 py-2.5 text-xs font-black text-primary transition hover:bg-primary hover:text-white"
                >
                  <Search className="h-4 w-4" />
                  Pesquisar
                </button>
              </div>
            </div>
            <label className="space-y-1 sm:col-span-2">
              <span className={labelClass}>Descricao</span>
              <textarea
                value={form.description}
                onChange={(event) => updateForm({ description: event.target.value })}
                className={cn(inputClass, 'min-h-24 resize-none')}
                placeholder="Nome da mercadoria"
              />
            </label>
            <label className="space-y-1">
              <span className={labelClass}>Venda R$</span>
              <input
                value={salePriceInput}
                onChange={(event) => setSalePriceInput(event.target.value)}
                className={inputClass}
                inputMode="decimal"
                placeholder="0,00"
              />
            </label>
            <label className="flex items-center gap-3 rounded-xl border border-slate-700/70 bg-slate-950/45 px-3 py-2.5">
              <input
                type="checkbox"
                checked={Boolean(form.trackStock)}
                onChange={(event) => updateForm({ trackStock: event.target.checked })}
                className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-primary focus:ring-primary"
              />
              <span>
                <span className="block text-sm font-black text-white">Controlar estoque</span>
                <span className="text-[11px] font-bold text-slate-500">Baixa automatica ao finalizar O.S.</span>
              </span>
            </label>
            <label className="space-y-1">
              <span className={labelClass}>Estoque atual</span>
              <input
                value={stockQuantityInput}
                onChange={(event) => setStockQuantityInput(event.target.value)}
                disabled={!form.trackStock}
                className={cn(inputClass, !form.trackStock && 'cursor-not-allowed opacity-50')}
                inputMode="numeric"
                placeholder="0"
              />
            </label>
            <label className="space-y-1">
              <span className={labelClass}>Estoque minimo</span>
              <input
                value={minStockQuantityInput}
                onChange={(event) => setMinStockQuantityInput(event.target.value)}
                disabled={!form.trackStock}
                className={cn(inputClass, !form.trackStock && 'cursor-not-allowed opacity-50')}
                inputMode="numeric"
                placeholder="0"
              />
            </label>
            <div className="space-y-2 sm:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className={labelClass}>Variacoes</span>
                <button
                  type="button"
                  onClick={() => setIsVariationFormOpen((current) => !current)}
                  className="inline-flex items-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-black text-primary transition hover:bg-primary hover:text-white"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Variacao
                </button>
              </div>

              {isVariationFormOpen && (
                <div className="grid gap-2 rounded-2xl border border-primary/30 bg-primary/5 p-3 sm:grid-cols-[1fr_0.55fr_auto]">
                  <input
                    value={variationName}
                    onChange={(event) => setVariationName(event.target.value)}
                    className={inputClass}
                    placeholder="Ex: SIMPLES"
                  />
                  <input
                    value={variationPriceInput}
                    onChange={(event) => setVariationPriceInput(event.target.value)}
                    className={inputClass}
                    inputMode="decimal"
                    placeholder="Valor: 110,00"
                  />
                  <button
                    type="button"
                    onClick={addVariation}
                    disabled={!variationName.trim()}
                    className="rounded-xl bg-primary px-4 py-2.5 text-xs font-black text-white shadow-lg shadow-primary/20 transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Adicionar
                  </button>
                </div>
              )}

              {(form.variations || []).length > 0 && (
                <div className="space-y-2">
                  {(form.variations || []).map((variation) => (
                    <div
                      key={variation.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-slate-700/60 bg-slate-950/50 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-white">{variation.name}</p>
                        <p className="text-xs font-bold text-primary">{currency.format(Number(variation.salePrice || 0))}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeVariation(variation.id)}
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-red-500/10 text-red-300 transition hover:bg-red-500/20"
                        title="Remover variacao"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={isSavingProduct}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-black text-white shadow-lg shadow-primary/20 disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              {isSavingProduct ? 'Salvando...' : editingProductId ? 'Atualizar mercadoria' : 'Cadastrar mercadoria'}
            </button>
          </div>

          {selectedProduct && (
            <div className="mt-4 rounded-xl border border-slate-700/60 bg-slate-950/40 p-3 text-xs text-slate-400">
              <p>Importado em: <span className="font-bold text-slate-200">{safeFormat(selectedProduct.importedAt, 'dd/MM/yyyy HH:mm') || '-'}</span></p>
              <p>Atualizado em: <span className="font-bold text-slate-200">{safeFormat(selectedProduct.updatedAt, 'dd/MM/yyyy HH:mm') || '-'}</span></p>
            </div>
          )}
        </section>
        </div>
      )}

        <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-900/60 p-3 shadow-xl shadow-black/10 sm:p-4">
          <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
            <div className="flex items-center gap-3 rounded-xl border border-slate-700/60 bg-slate-950/40 p-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-800 text-slate-300">
                <Boxes className="h-5 w-5" />
              </span>
              <div>
                <p className={labelClass}>Total de itens</p>
                <p className="text-xl font-black text-white">{products.length}</p>
                <p className="text-[10px] font-semibold text-slate-500">mercadorias cadastradas</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-slate-700/60 bg-slate-950/40 p-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <CircleDollarSign className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className={labelClass}>Valor em estoque</p>
                <p className="truncate text-xl font-black text-white">{currency.format(stockSummary.estimatedSaleValue)}</p>
                <p className="text-[10px] font-semibold text-slate-500">estimativa pelo preco de venda</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsLowStockFilterActive((current) => !current);
                setStatusFilter('all');
              }}
              className={cn(
                'flex items-center gap-3 rounded-xl border p-3 text-left transition focus:outline-none focus:ring-2 focus:ring-primary/60',
                isLowStockFilterActive
                  ? 'border-amber-400/70 bg-amber-500/10'
                  : 'border-slate-700/60 bg-slate-950/40 hover:border-amber-400/60 hover:bg-amber-500/5'
              )}
              aria-pressed={isLowStockFilterActive}
              title="Mostrar somente mercadorias com estoque baixo ou zerado"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-500/10 text-amber-300">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <span>
                <span className={labelClass}>Estoque baixo</span>
                <span className="block text-xl font-black text-amber-300">{stockSummary.lowStockCount - stockSummary.outOfStockCount}</span>
                <span className="block text-[10px] font-semibold text-slate-500">itens no limite minimo</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setStatusFilter(statusFilter === 'out' ? 'all' : 'out');
                setIsLowStockFilterActive(false);
              }}
              className={cn(
                'flex items-center gap-3 rounded-xl border p-3 text-left transition focus:outline-none focus:ring-2 focus:ring-primary/60',
                statusFilter === 'out'
                  ? 'border-red-400/70 bg-red-500/10'
                  : 'border-slate-700/60 bg-slate-950/40 hover:border-red-400/60 hover:bg-red-500/5'
              )}
              aria-pressed={statusFilter === 'out'}
              title="Mostrar mercadorias sem estoque"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-red-500/10 text-red-300">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <span>
                <span className={labelClass}>Sem estoque</span>
                <span className="block text-xl font-black text-red-300">{stockSummary.outOfStockCount}</span>
                <span className="block text-[10px] font-semibold text-slate-500">itens zerados</span>
              </span>
            </button>
          </div>
          <div className="mt-2 text-right text-[10px] font-semibold text-slate-500">
            Preco medio de venda: {currency.format(averagePrice)} · {filteredProducts.length} resultado(s)
          </div>

          <div className="mt-3 grid gap-2 rounded-xl border border-slate-700/70 bg-slate-950/35 p-2 sm:grid-cols-[minmax(220px,1fr)_minmax(175px,220px)_minmax(175px,220px)]">
            <label className="relative flex min-w-0 items-center rounded-lg border border-slate-700/70 bg-slate-950/70 px-3 text-slate-400">
              <Search className="h-4 w-4 shrink-0" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="min-w-0 flex-1 bg-transparent px-2 py-2.5 text-xs font-bold text-slate-100 outline-none placeholder:text-slate-500"
                placeholder="Buscar por codigo, descricao ou NCM..."
                aria-label="Buscar mercadorias"
              />
            </label>
            <label className="relative flex items-center rounded-lg border border-slate-700/70 bg-slate-950/70">
              <ShieldCheck className="pointer-events-none absolute left-3 h-4 w-4 text-slate-400" />
              <select
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value as ProductStatusFilter);
                  setIsLowStockFilterActive(false);
                }}
                aria-label="Filtrar mercadorias por status"
                className="w-full appearance-none bg-transparent py-2.5 pl-9 pr-9 text-xs font-bold text-slate-200 outline-none [&>option]:bg-slate-900 [&>option]:text-slate-100"
              >
                <option value="all">Todos os status</option>
                <option value="in-stock">Em estoque</option>
                <option value="low">Estoque baixo</option>
                <option value="out">Sem estoque</option>
                <option value="untracked">Sem controle</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-slate-500" />
            </label>
            <label className="relative flex items-center rounded-lg border border-slate-700/70 bg-slate-950/70">
              <ArrowDownWideNarrow className="pointer-events-none absolute left-3 h-4 w-4 text-slate-400" />
              <select
                value={sortOrder}
                onChange={(event) => setSortOrder(event.target.value as ProductSortOrder)}
                aria-label="Ordenar mercadorias"
                className="w-full appearance-none bg-transparent py-2.5 pl-9 pr-9 text-xs font-bold text-slate-200 outline-none [&>option]:bg-slate-900 [&>option]:text-slate-100"
              >
                <option value="recent">Mais recentes</option>
                <option value="oldest">Mais antigas</option>
                <option value="price-low">Menor preco</option>
                <option value="price-high">Maior preco</option>
                <option value="description">Descricao A-Z</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-slate-500" />
            </label>
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-700/60">
            <div className="max-h-[64vh] overflow-auto">
              <table className="min-w-[1120px] w-full text-left text-xs">
                <thead className="sticky top-0 z-10 bg-primary text-white">
                  <tr>
                    <th className="px-3 py-2.5">Codigo</th>
                    <th className="px-3 py-2.5">Descricao</th>
                    <th className="px-3 py-2.5">Variacoes</th>
                    <th className="px-3 py-2.5">NCM</th>
                    <th className="px-3 py-2.5 text-right">Venda</th>
                    <th className="px-3 py-2.5 text-right">Estoque</th>
                    <th className="px-3 py-2.5">Status</th>
                    <th className="px-3 py-2.5">Importado</th>
                    <th className="px-3 py-2.5 text-right">Acoes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 bg-slate-950/35">
                  {filteredProducts.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-3 py-12 text-center text-sm font-bold text-slate-500">
                        {isLowStockFilterActive
                          ? 'Nenhuma mercadoria com estoque baixo ou zerado.'
                          : statusFilter === 'all'
                            ? 'Nenhuma mercadoria encontrada.'
                            : 'Nenhuma mercadoria corresponde ao status selecionado.'}
                      </td>
                    </tr>
                  ) : visibleProducts.map((product) => {
                    const isEditing = product.id === editingProductId;
                    const isConfirmingDelete = deleteConfirmId === product.id;
                    const isDeleting = deletingProductId === product.id;
                    const stockStatus = getStockStatus(product);

                    return (
                      <tr
                        key={product.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => startEditProduct(product)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            startEditProduct(product);
                          }
                        }}
                        className={cn(
                          'cursor-pointer transition-colors',
                          isEditing ? 'bg-primary/10' : 'hover:bg-slate-900/80'
                        )}
                      >
                        <td className="px-3 py-2.5 font-black text-slate-200">{product.sourceCode || '-'}</td>
                        <td className="max-w-lg px-3 py-2.5">
                          <p className="line-clamp-2 font-black text-white">{product.description}</p>
                        </td>
                        <td className="max-w-sm px-3 py-2.5">
                          {product.variations?.length ? (
                            <div className="space-y-1">
                              {product.variations.slice(0, 3).map((variation) => (
                                <p key={variation.id} className="truncate text-[11px] font-bold text-slate-300">
                                  {variation.name} - {currency.format(Number(variation.salePrice || 0))}
                                </p>
                              ))}
                              {product.variations.length > 3 && (
                                <p className="text-[10px] font-bold text-slate-500">+{product.variations.length - 3} variacao(es)</p>
                              )}
                            </div>
                          ) : (
                            <span className="font-bold text-slate-500">{product.variation || '-'}</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 font-bold text-slate-400">{product.ncm || '-'}</td>
                        <td className="px-3 py-2.5 text-right font-black text-primary">{currency.format(Number(product.salePrice || 0))}</td>
                        <td className="px-3 py-2.5 text-right font-black text-white">
                          {product.trackStock ? Number(product.stockQuantity || 0) : '-'}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={cn('inline-flex rounded-full border px-2 py-1 text-[10px] font-black uppercase', stockStatus.className)}>
                            {stockStatus.label}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-bold text-slate-500">{safeFormat(product.importedAt, 'dd/MM/yyyy')}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                startEditProduct(product);
                              }}
                              className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-2.5 py-2 text-[10px] font-black uppercase text-slate-200 transition hover:bg-slate-700"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                onDeleteProductClick(product);
                              }}
                              disabled={isDeleting}
                              className={cn(
                                'inline-flex items-center gap-1 rounded-lg px-2.5 py-2 text-[10px] font-black uppercase transition disabled:opacity-60',
                                isConfirmingDelete
                                  ? 'bg-red-500 text-white'
                                  : 'bg-red-500/10 text-red-300 hover:bg-red-500/20'
                              )}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              {isDeleting ? 'Excluindo...' : isConfirmingDelete ? 'Confirmar' : 'Excluir'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {filteredProducts.length > 0 && (
            <div className="mt-3 flex flex-col gap-2 rounded-2xl border border-slate-800 bg-slate-950/35 px-3 py-3 text-xs font-bold text-slate-400 sm:flex-row sm:items-center sm:justify-between">
              <span>
                {isSearchPending
                  ? 'Atualizando busca...'
                  : `Mostrando ${visibleProducts.length} de ${filteredProducts.length} mercadoria(s).`}
              </span>
              {hiddenProductsCount > 0 && (
                <button
                  type="button"
                  onClick={() => setVisibleLimit((current) => current + VISIBLE_PRODUCTS_STEP)}
                  className="inline-flex items-center justify-center rounded-xl border border-primary/30 bg-primary/10 px-4 py-2 text-xs font-black text-primary transition hover:bg-primary hover:text-white"
                >
                  Mostrar mais {Math.min(VISIBLE_PRODUCTS_STEP, hiddenProductsCount)}
                </button>
              )}
            </div>
          )}
        </section>

      <div className="rounded-2xl border border-slate-700/60 bg-slate-900/45 p-4 text-xs text-slate-400">
        <div className="flex items-start gap-3">
          <PackagePlus className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <p>
            As edicoes feitas aqui afetam as proximas inclusoes em Lancamentos Caixa. Ordens ja salvas mantem a copia do item como estava no momento do lancamento.
          </p>
        </div>
      </div>

      {isNcmPickerOpen && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsNcmPickerOpen(false);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setIsNcmPickerOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="ncm-picker-title"
            className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl shadow-black"
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-800 p-4">
              <div>
                <p className={labelClass}>Classificacao fiscal</p>
                <h3 id="ncm-picker-title" className="mt-1 text-lg font-black text-white">Pesquisar NCM</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsNcmPickerOpen(false)}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-800 text-slate-300 transition hover:text-white"
                aria-label="Fechar pesquisa de NCM"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="border-b border-slate-800 p-4">
              <label className="space-y-1">
                <span className={labelClass}>Codigo ou descricao do produto</span>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    autoFocus
                    value={ncmQuery}
                    onChange={(event) => setNcmQuery(event.target.value)}
                    className={cn(inputClass, 'pl-9')}
                    placeholder="Ex: pastilha de freio ou 87141000"
                  />
                </div>
              </label>
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-3">
              {ncmList.length === 0 ? (
                <p className="py-10 text-center text-sm font-bold text-slate-500">Tabela NCM indisponivel.</p>
              ) : !ncmQuery.trim() ? (
                <p className="py-10 text-center text-sm font-bold text-slate-500">Digite um codigo ou descricao para pesquisar.</p>
              ) : filteredNcmList.length === 0 ? (
                <p className="py-10 text-center text-sm font-bold text-slate-500">Nenhum NCM encontrado para esta pesquisa.</p>
              ) : (
                <ul className="divide-y divide-slate-800 overflow-hidden rounded-xl border border-slate-800">
                  {filteredNcmList.map((item) => (
                    <li key={item.ncm}>
                      <button
                        type="button"
                        onClick={() => {
                          updateForm({ ncm: item.ncm });
                          setIsNcmPickerOpen(false);
                        }}
                        className="flex w-full items-start gap-4 px-4 py-3 text-left transition hover:bg-slate-900 focus:bg-slate-900 focus:outline-none"
                      >
                        <span className="shrink-0 font-black tabular-nums text-white">{item.ncm}</span>
                        <span className="text-sm text-slate-300">{item.descricao}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {filteredNcmList.length === 100 && (
                <p className="px-2 pt-3 text-center text-xs font-bold text-slate-500">Exibindo ate 100 resultados. Refine a pesquisa para localizar outros codigos.</p>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default ProductsView;
