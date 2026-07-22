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

export const applyLocalStockDeduction = (items: Array<{ productId?: string; quantity?: number; description?: string }>, products: ProductCatalogItem[] = getLocalProducts()) => {
  const nextProducts = products.map((product) => {
    const matchingItems = items.filter((item) => item.productId === product.id);
    const requestedQuantity = matchingItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);

    if (!product.trackStock || requestedQuantity <= 0) {
      return product;
    }

    const previousQuantity = Number(product.stockQuantity || 0);
    const nextQuantity = Math.max(0, previousQuantity - requestedQuantity);

    return {
      ...product,
      stockQuantity: nextQuantity,
      updatedAt: new Date().toISOString(),
    };
  });

  writeStorageItem(LOCAL_PRODUCTS_STORAGE_KEY, nextProducts);
  return nextProducts;
};

export const applyLocalStockRestore = (items: Array<{ productId?: string; quantity?: number; description?: string }>, products: ProductCatalogItem[] = getLocalProducts()) => {
  const nextProducts = products.map((product) => {
    const matchingItems = items.filter((item) => item.productId === product.id);
    const requestedQuantity = matchingItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);

    if (!product.trackStock || requestedQuantity <= 0) {
      return product;
    }

    const previousQuantity = Number(product.stockQuantity || 0);
    const nextQuantity = previousQuantity + requestedQuantity;

    return {
      ...product,
      stockQuantity: nextQuantity,
      updatedAt: new Date().toISOString(),
    };
  });

  writeStorageItem(LOCAL_PRODUCTS_STORAGE_KEY, nextProducts);
  return nextProducts;
};
