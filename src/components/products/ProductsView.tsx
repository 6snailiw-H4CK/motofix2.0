import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { PackagePlus, Pencil, Plus, Save, Search, Trash2, X } from 'lucide-react';
import { cn, safeFormat } from '../../lib/utils';
import type { ProductCatalogFormInput, ProductCatalogItem, ProductCatalogVariation } from '../../types';

type ProductsViewProps = {
  products: ProductCatalogItem[];
  isSavingProduct: boolean;
  isDeletingProducts: boolean;
  deletingProductId?: string | null;
  deleteConfirmId?: string | null;
  onSaveProduct: (input: ProductCatalogFormInput, productId?: string) => Promise<boolean> | boolean;
  onDeleteProductClick: (product: ProductCatalogItem) => void;
  onDeleteAllProductsClick: (productIds: string[]) => Promise<boolean> | boolean;
};

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const inputClass = 'w-full rounded-xl border border-slate-700/70 bg-slate-950/50 px-3 py-2.5 text-sm font-bold text-slate-100 outline-none transition focus:border-primary/60 focus:ring-1 focus:ring-primary/50';
const labelClass = 'text-[10px] font-black uppercase tracking-[0.2em] text-slate-500';
const INITIAL_VISIBLE_PRODUCTS = 120;
const VISIBLE_PRODUCTS_STEP = 120;

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
  deletingProductId,
  deleteConfirmId,
  onSaveProduct,
  onDeleteProductClick,
  onDeleteAllProductsClick,
}: ProductsViewProps) => {
  const [search, setSearch] = useState('');
  const [isLowStockFilterActive, setIsLowStockFilterActive] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | undefined>();
  const [form, setForm] = useState<ProductCatalogFormInput>(emptyForm);
  const [salePriceInput, setSalePriceInput] = useState('');
  const [stockQuantityInput, setStockQuantityInput] = useState('');
  const [minStockQuantityInput, setMinStockQuantityInput] = useState('');
  const [isVariationFormOpen, setIsVariationFormOpen] = useState(false);
  const [variationName, setVariationName] = useState('');
  const [variationPriceInput, setVariationPriceInput] = useState('');
  const [isDeleteAllConfirming, setIsDeleteAllConfirming] = useState(false);
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

    if (!isLowStockFilterActive) return searchFilteredProducts;

    return searchFilteredProducts.filter((product) => {
      if (!product.trackStock) return false;
      const stockQuantity = Number(product.stockQuantity || 0);
      const minStockQuantity = Number(product.minStockQuantity || 0);
      return stockQuantity <= 0 || (minStockQuantity > 0 && stockQuantity <= minStockQuantity);
    });
  }, [deferredSearch, isLowStockFilterActive, productSearchRows, products]);

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
      controlledCount: controlledProducts.length,
      lowStockCount: lowStockProducts.length,
      totalUnits: controlledProducts.reduce((sum, product) => sum + Number(product.stockQuantity || 0), 0),
    };
  }, [products]);
  const selectedProduct = useMemo(
    () => products.find((product) => product.id === editingProductId),
    [editingProductId, products]
  );

  useEffect(() => {
    setVisibleLimit(INITIAL_VISIBLE_PRODUCTS);
  }, [deferredSearch, isLowStockFilterActive, products.length]);

  const updateForm = (patch: Partial<ProductCatalogFormInput>) => {
    setForm((current) => ({ ...current, ...patch }));
  };

  const resetVariationDraft = () => {
    setVariationName('');
    setVariationPriceInput('');
    setIsVariationFormOpen(false);
  };

  const startNewProduct = () => {
    setEditingProductId(undefined);
    setForm(emptyForm);
    setSalePriceInput('');
    setStockQuantityInput('');
    setMinStockQuantityInput('');
    resetVariationDraft();
    setIsDeleteAllConfirming(false);
  };

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
      startNewProduct();
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
      startNewProduct();
      setSearch('');
    }
  };

  return (
    <div className="light-readable-view space-y-5">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-primary">Catalogo</p>
          <h2 className="text-2xl font-black tracking-tight text-white">Mercadorias</h2>
          <p className="text-sm text-slate-400">Cadastre, edite e mantenha os itens importados usados nos Lancamentos Caixa.</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleDeleteAllProducts()}
            disabled={products.length === 0 || isDeletingProducts}
            className={cn(
              'inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-black shadow-lg transition disabled:cursor-not-allowed disabled:opacity-50',
              isDeleteAllConfirming
                ? 'bg-red-500 text-white shadow-red-500/20 hover:bg-red-600'
                : 'border border-red-500/30 bg-red-500/10 text-red-200 hover:bg-red-500/20'
            )}
          >
            <Trash2 className="h-4 w-4" />
            {isDeletingProducts ? 'Apagando...' : isDeleteAllConfirming ? 'Confirmar apagar' : 'Apagar importadas'}
          </button>
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

      <div className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)] 2xl:grid-cols-[460px_minmax(0,1fr)]">
        <section className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4 shadow-xl shadow-black/10">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className={labelClass}>{editingProductId ? 'Editando mercadoria' : 'Nova mercadoria'}</p>
              <h3 className="mt-1 text-xl font-black text-white">
                {selectedProduct?.description || 'Cadastro rapido'}
              </h3>
            </div>
            {editingProductId && (
              <button
                type="button"
                onClick={startNewProduct}
                className="grid h-9 w-9 place-items-center rounded-xl bg-slate-800 text-slate-300 transition hover:text-white"
                title="Cancelar edicao"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            <label className="space-y-1">
              <span className={labelClass}>Codigo</span>
              <input
                value={form.sourceCode}
                onChange={(event) => updateForm({ sourceCode: event.target.value })}
                className={inputClass}
                placeholder="Ex: 163"
              />
            </label>
            <label className="space-y-1">
              <span className={labelClass}>NCM</span>
              <input
                value={form.ncm}
                onChange={(event) => updateForm({ ncm: event.target.value })}
                className={inputClass}
                placeholder="Ex: 73151210"
              />
            </label>
            <label className="space-y-1 sm:col-span-2 xl:col-span-1 2xl:col-span-2">
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
            <div className="space-y-2 sm:col-span-2 xl:col-span-1 2xl:col-span-2">
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

        <section className="min-w-0 rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4 shadow-xl shadow-black/10">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-slate-700/60 bg-slate-950/40 p-3">
              <p className={labelClass}>Itens</p>
              <p className="mt-1 text-2xl font-black text-white">{products.length}</p>
            </div>
            <div className="rounded-xl border border-slate-700/60 bg-slate-950/40 p-3">
              <p className={labelClass}>Preco medio</p>
              <p className="mt-1 text-2xl font-black text-white">{currency.format(averagePrice)}</p>
            </div>
            <div className="rounded-xl border border-slate-700/60 bg-slate-950/40 p-3">
              <p className={labelClass}>Filtrados</p>
              <p className="mt-1 text-2xl font-black text-white">{filteredProducts.length}</p>
            </div>
            <button
              type="button"
              onClick={() => setIsLowStockFilterActive((current) => !current)}
              className={cn(
                'rounded-xl border p-3 text-left transition focus:outline-none focus:ring-2 focus:ring-primary/60',
                isLowStockFilterActive
                  ? 'border-amber-400/70 bg-amber-500/10'
                  : 'border-slate-700/60 bg-slate-950/40 hover:border-amber-400/60 hover:bg-amber-500/5'
              )}
              aria-pressed={isLowStockFilterActive}
              title="Mostrar somente mercadorias com estoque baixo ou zerado"
            >
              <p className={labelClass}>Estoque</p>
              <p className="mt-1 text-2xl font-black text-white">{stockSummary.totalUnits}</p>
              <p className="text-[11px] font-bold text-amber-200">{stockSummary.lowStockCount} baixo/zerado de {stockSummary.controlledCount}</p>
              <p className="mt-1 text-[10px] font-bold text-slate-400">
                {isLowStockFilterActive ? 'Filtro ativo — clique para mostrar todos' : 'Clique para ver os itens'}
              </p>
            </button>
          </div>

          <div className="mt-4 flex items-center gap-2 rounded-xl border border-slate-700/70 bg-slate-950/50 px-3 py-2 text-slate-400">
            <Search className="h-4 w-4" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="min-w-0 flex-1 bg-transparent text-sm font-bold text-slate-100 outline-none placeholder:text-slate-600"
              placeholder="Buscar por codigo, descricao, variacao ou NCM..."
            />
            {isLowStockFilterActive && (
              <button
                type="button"
                onClick={() => setIsLowStockFilterActive(false)}
                className="shrink-0 rounded-lg bg-amber-500/10 px-2 py-1 text-[10px] font-black uppercase text-amber-200 transition hover:bg-amber-500/20"
              >
                Limpar filtro
              </button>
            )}
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
                        {isLowStockFilterActive ? 'Nenhuma mercadoria com estoque baixo ou zerado.' : 'Nenhuma mercadoria encontrada.'}
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
      </div>

      <div className="rounded-2xl border border-slate-700/60 bg-slate-900/45 p-4 text-xs text-slate-400">
        <div className="flex items-start gap-3">
          <PackagePlus className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <p>
            As edicoes feitas aqui afetam as proximas inclusoes em Lancamentos Caixa. Ordens ja salvas mantem a copia do item como estava no momento do lancamento.
          </p>
        </div>
      </div>
    </div>
  );
};

export default ProductsView;
