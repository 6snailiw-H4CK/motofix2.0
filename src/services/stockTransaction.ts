import {
  collection,
  doc,
  type DocumentReference,
  type Transaction,
  type WriteBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import type {
  ProductCatalogItem,
  ProductCatalogVariation,
  StockMovementOperation,
  StockMovementOperationChange,
  StockMovementType,
} from '../types';

type ProductStockFields = Pick<ProductCatalogItem, 'stockQuantity' | 'variations'>;

type StockOperationChangeInput = {
  product: ProductCatalogItem;
  productRef: DocumentReference;
  nextFields: ProductStockFields;
  otherFields?: Record<string, unknown>;
  create?: boolean;
};

type StockOperationMetadata = {
  type: StockMovementType;
  note?: string;
  createdAt: string;
  batchId?: string;
  cashLaunchId?: string;
  cashLaunchOrderNumber?: string;
  itemIds?: string[];
};

const movementCollectionPath = (userId: string) => collection(db, 'users', userId, 'stock_movements');

const createOperationId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `stock-op-${crypto.randomUUID()}`;
  }
  return `stock-op-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const normalizeQuantity = (value: unknown) => {
  const quantity = Number(value);
  return Number.isFinite(quantity) ? Math.max(0, Math.floor(quantity)) : 0;
};

const normalizeVariations = (variations: ProductCatalogVariation[] | undefined) => (
  variations || []
);

const getStockChangeQuantity = (
  previousQuantity: number,
  nextQuantity: number,
  previousVariations: ProductCatalogVariation[],
  nextVariations: ProductCatalogVariation[]
) => {
  if (previousVariations.length === 0 && nextVariations.length === 0) {
    return Math.abs(nextQuantity - previousQuantity);
  }

  const previousById = new Map(previousVariations.map((variation) => [
    variation.id,
    normalizeQuantity(variation.stockQuantity),
  ]));
  const nextById = new Map(nextVariations.map((variation) => [
    variation.id,
    normalizeQuantity(variation.stockQuantity),
  ]));
  const variationIds = new Set([...previousById.keys(), ...nextById.keys()]);
  return Array.from(variationIds).reduce((total, variationId) => (
    total + Math.abs((nextById.get(variationId) || 0) - (previousById.get(variationId) || 0))
  ), 0);
};

export const applyStockOperation = (
  transaction: Transaction | WriteBatch,
  userId: string,
  changes: StockOperationChangeInput[],
  metadata: StockOperationMetadata
): { id: string; data: StockMovementOperation } | null => {
  if (changes.length === 0) return null;

  const operationId = createOperationId();
  const productIds = changes.map(({ product }) => product.id);
  if (new Set(productIds).size !== productIds.length) {
    throw new Error('Uma operação de estoque não pode alterar o mesmo produto mais de uma vez.');
  }

  const changeMap: Record<string, StockMovementOperationChange> = {};
  for (const { product, productRef, nextFields, otherFields, create } of changes) {
    const previousQuantity = normalizeQuantity(product.stockQuantity);
    const nextQuantity = normalizeQuantity(nextFields.stockQuantity);
    const previousVariations = normalizeVariations(product.variations);
    const nextVariations = normalizeVariations(nextFields.variations);

    changeMap[product.id] = {
      productId: product.id,
      productDescription: product.description,
      previousQuantity,
      nextQuantity,
      quantity: getStockChangeQuantity(
        previousQuantity,
        nextQuantity,
        previousVariations,
        nextVariations
      ),
      previousVariations,
      nextVariations,
    };

    const productUpdate = {
      ...nextFields,
      ...otherFields,
      stockMovementId: operationId,
      updatedAt: metadata.createdAt,
    };
    if (create) {
      const initialProduct = {
        ...otherFields,
        ...nextFields,
        stockMovementId: operationId,
        updatedAt: metadata.createdAt,
      };
      if ('commit' in transaction) {
        (transaction as WriteBatch).set(productRef, initialProduct);
      } else {
        (transaction as Transaction).set(productRef, initialProduct);
      }
    } else {
      if ('commit' in transaction) {
        (transaction as WriteBatch).update(productRef, productUpdate);
      } else {
        (transaction as Transaction).update(productRef, productUpdate);
      }
    }
  }

  const operation: StockMovementOperation = {
    userId,
    type: metadata.type,
    batchId: metadata.batchId || operationId,
    createdAt: metadata.createdAt,
    productIds,
    changes: changeMap,
    ...(metadata.note ? { note: metadata.note } : {}),
    ...(metadata.cashLaunchId ? { cashLaunchId: metadata.cashLaunchId } : {}),
    ...(metadata.cashLaunchOrderNumber ? { cashLaunchOrderNumber: metadata.cashLaunchOrderNumber } : {}),
    ...(metadata.itemIds ? { itemIds: metadata.itemIds } : {}),
  };
  const movementRef = doc(movementCollectionPath(userId), operationId);
  if ('commit' in transaction) {
    (transaction as WriteBatch).set(movementRef, operation);
  } else {
    (transaction as Transaction).set(movementRef, operation);
  }
  return { id: operationId, data: operation };
};
