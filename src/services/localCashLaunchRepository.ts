import type { CashRegisterLaunch, ProductCatalogItem } from '../types';

const LOCAL_CASH_LAUNCHES_STORAGE_KEY = 'motofix:local-cash-launches';
const LOCAL_PRODUCTS_STORAGE_KEY = 'motofix:local-products';
export const LOCAL_CASH_LAUNCHES_UPDATED_EVENT = 'motofix:local-cash-launches-updated';

const canUseWindow = () => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

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

export const upsertLocalCashLaunch = (launch: CashRegisterLaunch) => {
  const launches = getLocalCashLaunches();
  const nextLaunches = launches.filter((existing) => existing.id !== launch.id);
  nextLaunches.push(launch);
  const sortedLaunches = sortLaunches(nextLaunches);
  writeStorageItem(LOCAL_CASH_LAUNCHES_STORAGE_KEY, sortedLaunches);
  notifyLocalCashLaunchesUpdated();
  return sortedLaunches;
};

export const deleteLocalCashLaunch = (launchId: string) => {
  const launches = getLocalCashLaunches().filter((launch) => launch.id !== launchId);
  writeStorageItem(LOCAL_CASH_LAUNCHES_STORAGE_KEY, launches);
  notifyLocalCashLaunchesUpdated();
  return launches;
};

export const overwriteLocalCashLaunches = (launches: CashRegisterLaunch[]) => {
  const sortedLaunches = sortLaunches(launches);
  writeStorageItem(LOCAL_CASH_LAUNCHES_STORAGE_KEY, sortedLaunches);
  notifyLocalCashLaunchesUpdated();
  return sortedLaunches;
};

export const getLocalProducts = (): ProductCatalogItem[] => {
  return readStorageItem<ProductCatalogItem>(LOCAL_PRODUCTS_STORAGE_KEY);
};

export const upsertLocalProduct = (product: ProductCatalogItem) => {
  const products = getLocalProducts().filter((existing) => existing.id !== product.id);
  products.push(product);
  writeStorageItem(LOCAL_PRODUCTS_STORAGE_KEY, products);
  return products;
};

export const applyLocalStockAdjustment = ({
  productId,
  previousQuantity,
  nextQuantity,
}: {
  productId: string;
  previousQuantity: number;
  nextQuantity: number;
}) => {
  const products = getLocalProducts();
  const product = products.find((candidate) => candidate.id === productId);

  if (!product) return null;

  const updatedProduct = {
    ...product,
    stockQuantity: nextQuantity,
    updatedAt: new Date().toISOString(),
  };

  upsertLocalProduct(updatedProduct);
  return updatedProduct;
};

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

export const applyLocalStockDeduction = (items: Array<{ productId?: string; variationId?: string; quantity?: number; description?: string }>, products: ProductCatalogItem[] = getLocalProducts()) => (
  adjustLocalStock(items, products, 'deduct')
);

export const applyLocalStockRestore = (items: Array<{ productId?: string; variationId?: string; quantity?: number; description?: string }>, products: ProductCatalogItem[] = getLocalProducts()) => (
  adjustLocalStock(items, products, 'restore')
);
