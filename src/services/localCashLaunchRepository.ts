import type { CashRegisterLaunch, ProductCatalogItem } from '../types';
import { withLocalStateMutation } from './backupLocalStateLock';

const LOCAL_CASH_LAUNCHES_STORAGE_KEY = 'motofix:local-cash-launches';
const LOCAL_PRODUCTS_STORAGE_KEY = 'motofix:local-products';
export const LOCAL_CASH_LAUNCHES_UPDATED_EVENT = 'motofix:local-cash-launches-updated';

const canUseWindow = () => {
  try {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
  } catch {
    return false;
  }
};

/** Read-only audit for business records stored outside Firestore while offline. */
export const inspectLocalOperationalStorage = () => {
  if (!canUseWindow()) {
    return { readable: false, malformedCount: 0, cashLaunches: [] as CashRegisterLaunch[], products: [] as ProductCatalogItem[] };
  }

  try {
    const parseArray = <T extends { id?: unknown }>(key: string) => {
      let raw: string | null;
      try { raw = window.localStorage.getItem(key); }
      catch { return { records: [] as T[], malformedCount: 1 }; }
      if (raw === null) return { records: [] as T[], malformedCount: 0 };
      let parsed: unknown;
      try { parsed = JSON.parse(raw); }
      catch { return { records: [] as T[], malformedCount: 1 }; }
      if (!Array.isArray(parsed)) return { records: [] as T[], malformedCount: 1 };
      const malformedCount = parsed.filter((record) => (
        !record || typeof record !== 'object' || Array.isArray(record)
        || typeof (record as { id?: unknown }).id !== 'string'
        || !(record as { id: string }).id.trim()
      )).length;
      return {
        records: parsed.filter((record): record is T => Boolean(record && typeof record === 'object' && !Array.isArray(record)
          && typeof (record as { id?: unknown }).id === 'string' && Boolean((record as { id: string }).id.trim()))),
        malformedCount,
      };
    };
    const launches = parseArray<CashRegisterLaunch>(LOCAL_CASH_LAUNCHES_STORAGE_KEY);
    const products = parseArray<ProductCatalogItem>(LOCAL_PRODUCTS_STORAGE_KEY);
    return {
      readable: launches.malformedCount === 0 && products.malformedCount === 0,
      malformedCount: launches.malformedCount + products.malformedCount,
      cashLaunches: launches.records,
      products: products.records,
    };
  } catch {
    return { readable: false, malformedCount: 0, cashLaunches: [] as CashRegisterLaunch[], products: [] as ProductCatalogItem[] };
  }
};

const sortLaunches = (launches: CashRegisterLaunch[]) => (
  [...launches].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
);

const readStorageItem = <T>(storageKey: string): T[] => {
  if (!canUseWindow()) return [];

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch (error) {
    console.warn('Nao foi possivel ler armazenamento local:', error);
    return [];
  }
};

const writeStorageItem = (storageKey: string, value: unknown) => {
  if (!canUseWindow()) return;

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(value));
  } catch (error) {
    console.warn('Nao foi possivel salvar armazenamento local:', error);
  }
};

const notifyLocalCashLaunchesUpdated = () => {
  if (!canUseWindow()) return;
  window.dispatchEvent(new CustomEvent(LOCAL_CASH_LAUNCHES_UPDATED_EVENT));
};

export const getLocalCashLaunches = (): CashRegisterLaunch[] => {
  const launches = readStorageItem<CashRegisterLaunch>(LOCAL_CASH_LAUNCHES_STORAGE_KEY);
  return sortLaunches(launches.filter((launch) => Boolean(launch?.id)));
};

export const upsertLocalCashLaunch = async (launch: CashRegisterLaunch) => withLocalStateMutation(() => {
  const launches = getLocalCashLaunches();
  const nextLaunches = launches.filter((existing) => existing.id !== launch.id);
  nextLaunches.push(launch);
  const sortedLaunches = sortLaunches(nextLaunches);
  writeStorageItem(LOCAL_CASH_LAUNCHES_STORAGE_KEY, sortedLaunches);
  notifyLocalCashLaunchesUpdated();
  return sortedLaunches;
});

export const deleteLocalCashLaunch = async (launchId: string) => withLocalStateMutation(() => {
  const launches = getLocalCashLaunches().filter((launch) => launch.id !== launchId);
  writeStorageItem(LOCAL_CASH_LAUNCHES_STORAGE_KEY, launches);
  notifyLocalCashLaunchesUpdated();
  return launches;
});

export const overwriteLocalCashLaunches = async (launches: CashRegisterLaunch[]) => withLocalStateMutation(() => {
  const sortedLaunches = sortLaunches(launches);
  writeStorageItem(LOCAL_CASH_LAUNCHES_STORAGE_KEY, sortedLaunches);
  notifyLocalCashLaunchesUpdated();
  return sortedLaunches;
});

export const getLocalProducts = (): ProductCatalogItem[] => {
  return readStorageItem<ProductCatalogItem>(LOCAL_PRODUCTS_STORAGE_KEY);
};

const upsertLocalProductUnlocked = (product: ProductCatalogItem) => {
  const products = getLocalProducts().filter((existing) => existing.id !== product.id);
  products.push(product);
  writeStorageItem(LOCAL_PRODUCTS_STORAGE_KEY, products);
  return products;
};

export const upsertLocalProduct = async (product: ProductCatalogItem) => withLocalStateMutation(() => (
  upsertLocalProductUnlocked(product)
));

export const applyLocalStockAdjustment = async ({
  productId,
  previousQuantity,
  nextQuantity,
}: {
  productId: string;
  previousQuantity: number;
  nextQuantity: number;
}) => withLocalStateMutation(() => {
  const products = getLocalProducts();
  const product = products.find((candidate) => candidate.id === productId);

  if (!product) return null;

  const updatedProduct = {
    ...product,
    stockQuantity: nextQuantity,
    updatedAt: new Date().toISOString(),
  };

  upsertLocalProductUnlocked(updatedProduct);
  return updatedProduct;
});

const adjustLocalStock = (
  items: Array<{ productId?: string; variationId?: string; quantity?: number; description?: string }>,
  products: ProductCatalogItem[],
  direction: 'deduct' | 'restore'
) => {
  const nextProducts = products.map((product) => {
    const matchingItems = items.filter((item) => item.productId === product.id);
    if (!product.trackStock || matchingItems.length === 0) return product;

    const variationQuantities = new Map<string, number>();
    let productQuantity = 0;
    matchingItems.forEach((item) => {
      const quantity = Math.max(0, Math.floor(Number(item.quantity || 0)));
      const variationId = String(item.variationId || '').trim();
      if (!variationId) {
        productQuantity += quantity;
        return;
      }
      variationQuantities.set(variationId, (variationQuantities.get(variationId) || 0) + quantity);
    });

    if (variationQuantities.size > 0 && productQuantity > 0) {
      console.error(`Nao foi possivel atualizar estoque local de "${product.description}": itens gerais e por variacao misturados.`);
      return product;
    }

    const variationStockIsConfigured = Boolean(
      product.variations?.length
      && product.variations.every((variation) => variation.stockQuantity !== undefined)
    );
    if (variationQuantities.size > 0 && !variationStockIsConfigured) {
      const totalQuantity = Array.from(variationQuantities.values()).reduce((sum, quantity) => sum + quantity, 0);
      const previousQuantity = Number(product.stockQuantity || 0);
      return {
        ...product,
        stockQuantity: direction === 'deduct'
          ? Math.max(0, previousQuantity - totalQuantity)
          : previousQuantity + totalQuantity,
        updatedAt: new Date().toISOString(),
      };
    }

    if (variationQuantities.size > 0) {
      const variations = (product.variations || []).map((variation) => {
        const quantity = variationQuantities.get(variation.id);
        if (quantity === undefined) return variation;
        const previousQuantity = Math.max(0, Math.floor(Number(variation.stockQuantity || 0)));
        return {
          ...variation,
          stockQuantity: direction === 'deduct'
            ? Math.max(0, previousQuantity - quantity)
            : previousQuantity + quantity,
        };
      });
      const foundVariationIds = new Set(variations.map((variation) => variation.id));
      const missingVariationIds = Array.from(variationQuantities.keys()).filter((id) => !foundVariationIds.has(id));
      if (missingVariationIds.length > 0) {
        console.error(`Variacao(oes) ${missingVariationIds.join(', ')} nao encontrada(s) para "${product.description}" no estoque local.`);
        return product;
      }

      return {
        ...product,
        variations,
        stockQuantity: variations.reduce((sum, variation) => sum + Math.max(0, Math.floor(Number(variation.stockQuantity || 0))), 0),
        updatedAt: new Date().toISOString(),
      };
    }

    if (productQuantity <= 0) return product;
    const previousQuantity = Number(product.stockQuantity || 0);
    return {
      ...product,
      stockQuantity: direction === 'deduct'
        ? Math.max(0, previousQuantity - productQuantity)
        : previousQuantity + productQuantity,
      updatedAt: new Date().toISOString(),
    };
  });

  writeStorageItem(LOCAL_PRODUCTS_STORAGE_KEY, nextProducts);
  return nextProducts;
};

export const applyLocalStockDeduction = async (
  items: Array<{ productId?: string; variationId?: string; quantity?: number; description?: string }>,
  products?: ProductCatalogItem[],
) => withLocalStateMutation(() => adjustLocalStock(items, products || getLocalProducts(), 'deduct'));

export const applyLocalStockRestore = async (
  items: Array<{ productId?: string; variationId?: string; quantity?: number; description?: string }>,
  products?: ProductCatalogItem[],
) => withLocalStateMutation(() => adjustLocalStock(items, products || getLocalProducts(), 'restore'));
