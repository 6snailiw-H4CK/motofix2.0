import {
  collection,
  doc,
  getDoc,
  getDocFromCache,
  getDocs,
  getDocsFromCache,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  type DocumentReference,
  type Transaction,
  type WriteBatch,
  where,
  writeBatch,
} from 'firebase/firestore';

export type CashRegisterSaveResult = {
  savedOffline: boolean;
  id?: string;
  error?: string;
  stockShortageItems?: CashRegisterLaunch['stockShortageItems'];
};
import { db } from '../firebase';
import type {
  CashRegisterItem,
  CashRegisterLaunch,
  ProductCatalogItem,
  ProductCatalogVariation,
  StockMovementOperation,
  StockMovementType,
} from '../types';
import {
  createFirestoreBatchReplayDescriptor,
  createFirestoreReplayDescriptor,
  queueFirestoreVoidWrite,
  type FirestoreReplayMutation,
} from './firestoreOfflineQueue';
import { createRestoreMetadata, createSoftDeleteMetadata } from './softDelete';
import { validateCashLaunchData } from './cashRegisterValidation';
import { applyStockOperation } from './stockTransaction';
import { notifyFirestoreLocalCollectionsChanged } from './firestoreCollectionSync';
import { withFirestoreSyncTimestamp } from './firestoreSyncFields';
import { isFirestoreNetworkEnabled } from './firestoreNetworkControl';

export type CashRegisterWriteData = Omit<CashRegisterLaunch, 'id'>;
export type CashRegisterUpdateData = Partial<Omit<CashRegisterLaunch, 'id' | 'orderNumber' | 'userId' | 'createdAt'>>;

type StockAction = 'deduct' | 'restore';

export type CashRegisterStockShortage = {
  productId: string;
  productDescription: string;
  sourceCode?: string;
  variationId?: string;
  variation?: string;
  availableQuantity: number;
  requestedQuantity: number;
  requiredStock: number;
  quantityToAdd: number;
  usesVariationStock: boolean;
  cashLaunchId?: string;
  cashLaunchOrderNumber?: string;
};

export class InsufficientCashLaunchStockError extends Error {
  constructor(readonly shortage: CashRegisterStockShortage) {
    const itemName = shortage.variation
      ? `${shortage.productDescription} (${shortage.variation})`
      : shortage.productDescription;
    super(`Estoque insuficiente para "${itemName}". Disponivel: ${shortage.availableQuantity}; solicitado: ${shortage.requestedQuantity}.`);
    this.name = 'InsufficientCashLaunchStockError';
  }
}

type StockItemGroup = {
  productId: string;
  quantity: number;
  itemIds: string[];
  sourceCode?: string;
  description?: string;
  variationId?: string;
  variation?: string;
};

type StockAdjustment = {
  group: StockItemGroup;
  product: ProductCatalogItem;
  productRef: DocumentReference;
  previousQuantity: number;
  nextQuantity: number;
  usesVariationStock: boolean;
};

type StockCollection = {
  adjustments: StockAdjustment[];
  shortages: CashRegisterStockShortage[];
};

const cashLaunchCollectionPath = (userId: string) => collection(db, 'users', userId, 'cash_launches');
const cashLaunchDocPath = (userId: string, launchId: string) => doc(db, 'users', userId, 'cash_launches', launchId);
const cashLaunchReplayPath = (userId: string, launchId: string) => ['users', userId, 'cash_launches', launchId];
const productDocPath = (userId: string, productId: string) => doc(db, 'users', userId, 'products', productId);

const isBrowserOnline = () => (
  typeof navigator === 'undefined' ? true : navigator.onLine !== false
);

const requireOnlineStockSync = () => {
  if (!isBrowserOnline() || !isFirestoreNetworkEnabled()) {
    throw new Error('Esta operação requer uma sessão de sincronização aberta.');
  }
};

const shouldUseStockTransaction = (launch?: Partial<CashRegisterLaunch>, nextStatus?: string) => {
  if (!launch && !nextStatus) return false;
  return nextStatus === 'Finalizado' || launch?.stockDeducted === true || launch?.status === 'Finalizado';
};

const createId = (prefix: string) => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};


const normalizeQuantity = (value: unknown) => {
  const quantity = Number(value);
  return Number.isFinite(quantity) ? Math.max(0, Math.floor(quantity)) : 0;
};

const groupStockItems = (items: CashRegisterItem[] = []) => {
  const groups = new Map<string, StockItemGroup>();

  items.forEach((item) => {
    const productId = String(item.productId || '').trim();
    const variationId = String(item.variationId || '').trim();
    const quantity = normalizeQuantity(item.quantity);
    if (!productId || quantity <= 0) return;

    const groupKey = `${productId}:${variationId}`;
    const current = groups.get(groupKey) || {
      productId,
      quantity: 0,
      itemIds: [],
      sourceCode: item.sourceCode,
      description: item.description,
      variationId,
      variation: item.variation,
    };

    current.quantity += quantity;
    current.itemIds.push(item.id);
    groups.set(groupKey, current);
  });

  return Array.from(groups.values());
};

const stockSignature = (items: CashRegisterItem[] = []) => (
  groupStockItems(items)
    .map((group) => `${group.productId}:${group.variationId || ''}:${group.quantity}`)
    .sort()
    .join('|')
);

const toLaunch = (
  launchId: string,
  data: Omit<CashRegisterLaunch, 'id'> | CashRegisterUpdateData
): CashRegisterLaunch => ({
  id: launchId,
  ...(data as Omit<CashRegisterLaunch, 'id'>),
});

const readLaunchInTransaction = async (
  transaction: Transaction,
  userId: string,
  launchId: string
) => {
  const launchRef = cashLaunchDocPath(userId, launchId);
  const snapshot = await transaction.get(launchRef);
  if (!snapshot.exists()) {
    throw new Error('O.S. nao encontrada para atualizar o estoque.');
  }

  return {
    launchRef,
    launch: toLaunch(launchId, snapshot.data() as Omit<CashRegisterLaunch, 'id'>),
  };
};

const readLaunchFromCache = async (
  userId: string,
  launchId: string,
  fallback?: CashRegisterLaunch,
) => {
  const launchRef = cashLaunchDocPath(userId, launchId);
  let cachedLaunch: CashRegisterLaunch | null = null;
  try {
    const snapshot = await getDocFromCache(launchRef);
    if (snapshot.exists()) {
      cachedLaunch = toLaunch(launchId, snapshot.data() as Omit<CashRegisterLaunch, 'id'>);
    }
  } catch {
    // A stale view snapshot can still be used when the launch has not yet been
    // materialized in Firestore's local cache.
  }
  if (cachedLaunch) return cachedLaunch;
  if (fallback) return fallback;
  throw new Error('O.S não encontrada no cache local. Sincronize o histórico antes de alterá-la offline.');
};

const collectStockAdjustments = async (
  transaction: Transaction | null,
  userId: string,
  items: CashRegisterItem[],
  action: StockAction,
  cashLaunchId?: string,
  cashLaunchOrderNumber?: string,
): Promise<StockCollection> => {
  const unlinkedItem = items.find((item) => normalizeQuantity(item.quantity) > 0 && !String(item.productId || '').trim());
  if (unlinkedItem) {
    throw new Error(`O item "${unlinkedItem.description || unlinkedItem.id}" nao possui uma mercadoria vinculada. Corrija a referencia antes de finalizar a O.S.`);
  }

  const groups = groupStockItems(items);
  const adjustments: StockAdjustment[] = [];
  const shortages: CashRegisterStockShortage[] = [];
  const legacyVariantQuantities = new Map<string, number>();

  for (const group of groups) {
    const productRef = productDocPath(userId, group.productId);
    let productSnapshot;
    try {
      productSnapshot = transaction
        ? await transaction.get(productRef)
        : await getDocFromCache(productRef);
    } catch (error) {
      if (!transaction) {
        throw new Error(`A mercadoria "${group.description || group.productId}" não está no cache deste aparelho. Sincronize os produtos antes de faturar offline.`);
      }
      throw error;
    }

    if (!productSnapshot.exists()) {
      throw new Error(`A mercadoria vinculada ao item "${group.description || group.productId}" nao foi encontrada. Corrija a referencia antes de finalizar a O.S.`);
    }

    const product = {
      id: productSnapshot.id,
      ...(productSnapshot.data() as Omit<ProductCatalogItem, 'id'>),
    };

    if (product.trackStock !== true) continue;

    const variation = group.variationId
      ? product.variations?.find((candidate) => candidate.id === group.variationId)
      : undefined;
    if (group.variationId && !variation) {
      throw new Error(`A variacao "${group.variation || group.variationId}" nao existe mais em "${product.description || group.description}".`);
    }

    const usesVariationStock = Boolean(
      variation
      && product.variations?.every((candidate) => candidate.stockQuantity !== undefined)
    );
    const previouslyAdjusted = legacyVariantQuantities.get(product.id) || 0;
    const productQuantity = normalizeQuantity(product.stockQuantity);
    const previousQuantity = usesVariationStock
      ? normalizeQuantity(variation?.stockQuantity)
      : action === 'deduct'
        ? productQuantity - previouslyAdjusted
        : productQuantity + previouslyAdjusted;
    const nextQuantity = action === 'deduct'
      ? previousQuantity - group.quantity
      : previousQuantity + group.quantity;

    if (nextQuantity < 0) {
      shortages.push({
        productId: product.id,
        productDescription: product.description || group.description || 'Mercadoria',
        ...(product.sourceCode || group.sourceCode ? { sourceCode: product.sourceCode || group.sourceCode } : {}),
        ...(group.variationId ? { variationId: group.variationId } : {}),
        ...(group.variation ? { variation: group.variation } : {}),
        availableQuantity: previousQuantity,
        requestedQuantity: group.quantity,
        requiredStock: usesVariationStock ? group.quantity : previouslyAdjusted + group.quantity,
        quantityToAdd: -nextQuantity,
        usesVariationStock,
        ...(cashLaunchId ? { cashLaunchId } : {}),
        ...(cashLaunchOrderNumber ? { cashLaunchOrderNumber } : {}),
      });
      if (!usesVariationStock) {
        legacyVariantQuantities.set(product.id, previouslyAdjusted + (action === 'deduct' ? group.quantity : -group.quantity));
      }
      continue;
    }

    adjustments.push({
      group,
      product,
      productRef,
      previousQuantity,
      nextQuantity,
      usesVariationStock,
    });
    if (!usesVariationStock) {
      legacyVariantQuantities.set(product.id, previouslyAdjusted + (action === 'deduct' ? group.quantity : -group.quantity));
    }
  }

  return { adjustments, shortages };
};

const toPersistedStockShortages = (shortages: CashRegisterStockShortage[]) => shortages.map((shortage) => ({
  productId: shortage.productId,
  productDescription: shortage.productDescription,
  ...(shortage.sourceCode ? { sourceCode: shortage.sourceCode } : {}),
  ...(shortage.variationId ? { variationId: shortage.variationId } : {}),
  ...(shortage.variation ? { variation: shortage.variation } : {}),
  availableQuantity: shortage.availableQuantity,
  requestedQuantity: shortage.requestedQuantity,
}));

const addStockForCashLaunchShortage = async (
  userId: string,
  shortage: CashRegisterStockShortage,
  cashLaunchId?: string,
) => {
  if (!Number.isInteger(shortage.requiredStock) || shortage.requiredStock < 0) {
    throw new Error('Quantidade necessaria para reposicao invalida.');
  }

  if (!isFirestoreNetworkEnabled()) {
    const productRef = productDocPath(userId, shortage.productId);
    let productSnapshot;
    try {
      productSnapshot = await getDocFromCache(productRef);
    } catch {
      throw new Error('A mercadoria não está no cache deste aparelho. Sincronize os produtos antes de repor estoque offline.');
    }
    if (!productSnapshot.exists()) throw new Error('A mercadoria não existe mais no estoque local.');
    const product = { id: productSnapshot.id, ...(productSnapshot.data() as Omit<ProductCatalogItem, 'id'>) };
    if (product.trackStock !== true) {
      throw new Error('O controle de estoque desta mercadoria foi desativado. Atualize a O.S. e tente novamente.');
    }
    const now = new Date().toISOString();
    const batchId = createId('stock-os-reposicao');
    let nextQuantity: number;
    let nextVariations = product.variations || [];
    if (shortage.usesVariationStock) {
      const variation = nextVariations.find((candidate) => candidate.id === shortage.variationId);
      if (!variation) throw new Error('A variação não existe mais nesta mercadoria.');
      const previousQuantity = normalizeQuantity(variation.stockQuantity);
      nextQuantity = Math.max(previousQuantity, shortage.requiredStock);
      nextVariations = nextVariations.map((candidate) => candidate.id === variation.id
        ? { ...candidate, stockQuantity: nextQuantity }
        : candidate);
      if (nextVariations.reduce((total, item) => total + normalizeQuantity(item.stockQuantity), 0) > 10_000_000) {
        throw new Error('A quantidade de estoque excede o limite permitido.');
      }
    } else {
      const previousQuantity = normalizeQuantity(product.stockQuantity);
      nextQuantity = Math.max(previousQuantity, shortage.requiredStock);
    }
    const totalStock = shortage.usesVariationStock
      ? nextVariations.reduce((total, item) => total + normalizeQuantity(item.stockQuantity), 0)
      : nextQuantity;
    if (totalStock > 10_000_000) throw new Error('A quantidade de estoque excede o limite permitido.');
    const quantity = shortage.usesVariationStock
      ? nextVariations.reduce((total, item) => total + normalizeQuantity(item.stockQuantity), 0)
        - (product.variations || []).reduce((total, item) => total + normalizeQuantity(item.stockQuantity), 0)
      : nextQuantity - normalizeQuantity(product.stockQuantity);
    if (quantity === 0) return 0;

    const batch = writeBatch(db);
    const note = `Reposicao para faturar O.S.${cashLaunchId || shortage.cashLaunchOrderNumber || shortage.cashLaunchId
      ? ` ${cashLaunchId || shortage.cashLaunchOrderNumber || shortage.cashLaunchId}`
      : ''}`;
    const operation = applyStockOperation(batch, userId, [{
      product,
      productRef,
      nextFields: { stockQuantity: totalStock, variations: nextVariations },
    }], {
      type: 'entrada_manual',
      batchId,
      note,
      createdAt: now,
      ...(cashLaunchId || shortage.cashLaunchId ? { cashLaunchId: cashLaunchId || shortage.cashLaunchId } : {}),
      ...(shortage.cashLaunchOrderNumber ? { cashLaunchOrderNumber: shortage.cashLaunchOrderNumber } : {}),
    });
    if (!operation) return 0;
    const replayWrites: FirestoreReplayMutation[] = [
      {
        operation: 'update',
        path: ['users', userId, 'products', product.id],
        data: { stockQuantity: totalStock, variations: nextVariations, stockMovementId: operation.id, updatedAt: now },
      },
      {
        operation: 'set',
        path: ['users', userId, 'stock_movements', operation.id],
        data: operation.data as unknown as Record<string, unknown>,
      },
    ];
    await queueFirestoreVoidWrite(
      () => batch.commit(),
      'Repor estoque localmente',
      createFirestoreBatchReplayDescriptor(replayWrites)
    );
    notifyFirestoreLocalCollectionsChanged(userId, ['products', 'stock_movements']);
    return quantity;
  }

  requireOnlineStockSync();

  const addedQuantity = await runTransaction(db, async (transaction) => {
    const productRef = productDocPath(userId, shortage.productId);
    const productSnapshot = await transaction.get(productRef);
    if (!productSnapshot.exists()) throw new Error('A mercadoria nao existe mais no estoque.');

    const product = {
      id: productSnapshot.id,
      ...(productSnapshot.data() as Omit<ProductCatalogItem, 'id'>),
    };
    if (product.trackStock !== true) {
      throw new Error('O controle de estoque desta mercadoria foi desativado. Atualize a O.S. e tente novamente.');
    }

    const now = new Date().toISOString();
    const batchId = createId('stock-os-reposicao');
    let previousQuantity: number;
    let nextQuantity: number;
    let productUpdate: Record<string, unknown>;

    if (shortage.usesVariationStock) {
      const variations = product.variations || [];
      const variation = variations.find((candidate) => candidate.id === shortage.variationId);
      if (!variation) throw new Error('A variacao nao existe mais nesta mercadoria.');

      previousQuantity = normalizeQuantity(variation.stockQuantity);
      nextQuantity = Math.max(previousQuantity, shortage.requiredStock);
      if (nextQuantity > 10_000_000) throw new Error('A quantidade de estoque excede o limite permitido.');

      const nextVariations: ProductCatalogVariation[] = variations.map((candidate) => (
        candidate.id === variation.id
          ? { ...candidate, stockQuantity: nextQuantity }
          : candidate
      ));
      const totalStock = nextVariations.reduce((total, candidate) => total + normalizeQuantity(candidate.stockQuantity), 0);
      if (totalStock > 10_000_000) throw new Error('A quantidade de estoque excede o limite permitido.');
      productUpdate = {
        variations: nextVariations,
        stockQuantity: totalStock,
        updatedAt: now,
      };
    } else {
      previousQuantity = normalizeQuantity(product.stockQuantity);
      nextQuantity = Math.max(previousQuantity, shortage.requiredStock);
      if (nextQuantity > 10_000_000) throw new Error('A quantidade de estoque excede o limite permitido.');
      productUpdate = { stockQuantity: nextQuantity, updatedAt: now };
    }

    const quantity = nextQuantity - previousQuantity;
    if (quantity === 0) return 0;

    const note = `Reposicao para faturar O.S.${cashLaunchId || shortage.cashLaunchOrderNumber || shortage.cashLaunchId
      ? ` ${cashLaunchId || shortage.cashLaunchOrderNumber || shortage.cashLaunchId}`
      : ''}`;
    applyStockOperation(transaction, userId, [{
      product,
      productRef,
      nextFields: {
        stockQuantity: Number(productUpdate.stockQuantity ?? product.stockQuantity ?? 0),
        variations: (productUpdate.variations as ProductCatalogVariation[] | undefined) || product.variations || [],
      },
    }], {
      type: 'entrada_manual',
      batchId,
      note,
      createdAt: now,
      ...(cashLaunchId || shortage.cashLaunchId ? { cashLaunchId: cashLaunchId || shortage.cashLaunchId } : {}),
      ...(shortage.cashLaunchOrderNumber ? { cashLaunchOrderNumber: shortage.cashLaunchOrderNumber } : {}),
    });
    return quantity;
  });
  notifyFirestoreLocalCollectionsChanged(userId, ['products', 'stock_movements']);
  return addedQuantity;
};

const applyStockAdjustments = (
  transaction: Transaction | WriteBatch,
  userId: string,
  launch: CashRegisterLaunch,
  adjustments: StockAdjustment[],
  action: StockAction,
  now: string,
  batchId: string
 ) => {
  const movementType: StockMovementType = action === 'deduct' ? 'saida_os' : 'estorno_os';
  const productGroups = new Map<string, StockAdjustment[]>();
  adjustments.forEach((adjustment) => {
    const group = productGroups.get(adjustment.product.id) || [];
    group.push(adjustment);
    productGroups.set(adjustment.product.id, group);
  });
  const changes = Array.from(productGroups.values()).map((relatedAdjustments) => {
    const adjustment = relatedAdjustments[0];
    const variantAdjustments = relatedAdjustments.filter((candidate) => candidate.usesVariationStock);
    const productLevelAdjustments = relatedAdjustments.filter((candidate) => !candidate.usesVariationStock);
    if (variantAdjustments.length && productLevelAdjustments.length) {
      throw new Error(`Nao foi possivel sincronizar simultaneamente o estoque geral e as variacoes de "${adjustment.product.description}".`);
    }

    if (variantAdjustments.length) {
      const nextVariations = (adjustment.product.variations || []).map((variation) => {
        const variantAdjustment = variantAdjustments.find((candidate) => candidate.group.variationId === variation.id);
        return variantAdjustment
          ? { ...variation, stockQuantity: variantAdjustment.nextQuantity }
          : variation;
      });
      return {
        product: adjustment.product,
        productRef: adjustment.productRef,
        nextFields: {
          variations: nextVariations,
          stockQuantity: nextVariations.reduce((sum, variation) => sum + normalizeQuantity(variation.stockQuantity), 0),
        },
      };
    }
    return {
      product: adjustment.product,
      productRef: adjustment.productRef,
      nextFields: {
        stockQuantity: productLevelAdjustments[productLevelAdjustments.length - 1].nextQuantity,
        variations: adjustment.product.variations || [],
      },
    };
  });

  return applyStockOperation(transaction, userId, changes, {
    type: movementType,
    batchId,
    note: action === 'deduct' ? 'Baixa automatica ao finalizar O.S.' : 'Estorno automatico da O.S.',
    createdAt: now,
    cashLaunchId: launch.id,
    cashLaunchOrderNumber: launch.orderNumber,
    itemIds: Array.from(new Set(adjustments.flatMap((adjustment) => adjustment.group.itemIds))),
  });
};

const resolveOriginalMovementId = async (
  userId: string,
  launch: CashRegisterLaunch,
  offline: boolean,
): Promise<string> => {
  if (launch.stockMovementId) return launch.stockMovementId;
  const batchId = launch.stockMovementBatchId;
  if (!batchId) {
    throw new Error('A O.S. indica baixa de estoque, mas nao possui vinculo com o lote de movimentacao. Revise o historico antes de estornar.');
  }

  const movements = collection(db, 'users', userId, 'stock_movements');
  const matchingBatch = query(movements, where('batchId', '==', batchId));
  const snapshot = offline ? await getDocsFromCache(matchingBatch) : await getDocs(matchingBatch);
  const candidates = snapshot.docs.filter((entry) => {
    const data = entry.data() as Partial<StockMovementOperation>;
    return data.type === 'saida_os'
      && data.batchId === batchId
      && (!data.cashLaunchId || data.cashLaunchId === launch.id);
  });
  if (candidates.length !== 1) {
    throw new Error(candidates.length
      ? 'O lote da O.S. aponta para mais de uma baixa de estoque. O estorno foi bloqueado para evitar devolucao duplicada.'
      : 'A baixa original da O.S. nao foi encontrada no cache local. Sincronize antes de cancelar ou excluir esta O.S.');
  }
  return candidates[0].id;
};

const readOriginalMovement = async (
  userId: string,
  launch: CashRegisterLaunch,
  movementId: string,
  transaction?: Transaction,
): Promise<StockMovementOperation> => {
  const movementRef = doc(db, 'users', userId, 'stock_movements', movementId);
  const snapshot = transaction
    ? await transaction.get(movementRef)
    : await getDocFromCache(movementRef);
  if (!snapshot.exists()) throw new Error('A movimentacao original da O.S. nao foi encontrada; estorno bloqueado para proteger o estoque.');
  const movement = snapshot.data() as StockMovementOperation;
  if (
    movement.userId !== userId
    || movement.type !== 'saida_os'
    || (movement.cashLaunchId && movement.cashLaunchId !== launch.id)
    || (launch.stockMovementBatchId && movement.batchId !== launch.stockMovementBatchId)
    || !Array.isArray(movement.productIds)
    || !movement.changes
  ) {
    throw new Error('A movimentacao original nao corresponde a esta O.S.; estorno bloqueado para proteger o estoque.');
  }
  return movement;
};

const collectExactReversalAdjustments = async (
  transaction: Transaction | null,
  userId: string,
  movement: StockMovementOperation,
): Promise<StockAdjustment[]> => {
  const adjustments: StockAdjustment[] = [];
  for (const productId of movement.productIds) {
    const change = movement.changes[productId];
    if (!change || change.productId !== productId) {
      throw new Error('A movimentacao original tem um vinculo de produto invalido; estorno bloqueado.');
    }

    const previousVariations = change.previousVariations || [];
    const nextVariations = change.nextVariations || [];
    const variationChanges = previousVariations.flatMap((previousVariation) => {
      const nextVariation = nextVariations.find((candidate) => candidate.id === previousVariation.id);
      if (!nextVariation) throw new Error(`A variacao ${previousVariation.id} nao esta na movimentacao original; estorno bloqueado.`);
      const delta = normalizeQuantity(previousVariation.stockQuantity) - normalizeQuantity(nextVariation.stockQuantity);
      if (delta < 0) throw new Error('A movimentacao de saida contem aumento de estoque; estorno bloqueado para revisao.');
      return delta > 0 ? [{ variationId: previousVariation.id, quantity: delta }] : [];
    });
    if (variationChanges.length === 0 && previousVariations.length !== nextVariations.length) {
      throw new Error('A lista de variacoes mudou desde a baixa original; estorno bloqueado para revisao.');
    }

    const productDelta = normalizeQuantity(change.previousQuantity) - normalizeQuantity(change.nextQuantity);
    if (productDelta < 0) throw new Error('A movimentacao de saida contem aumento de estoque; estorno bloqueado para revisao.');
    const usesVariationStock = variationChanges.length > 0;
    if (usesVariationStock && variationChanges.reduce((sum, item) => sum + item.quantity, 0) !== productDelta) {
      throw new Error('As quantidades de estoque geral e variacoes divergem na baixa original; estorno bloqueado para revisao.');
    }
    const groups = usesVariationStock
      ? variationChanges
      : productDelta > 0 ? [{ variationId: '', quantity: productDelta }] : [];
    if (!groups.length) continue;

    const productRef = productDocPath(userId, productId);
    const productSnapshot = transaction
      ? await transaction.get(productRef)
      : await getDocFromCache(productRef);
    if (!productSnapshot.exists()) {
      throw new Error(`A mercadoria ${productId} da baixa original nao existe mais; estorno bloqueado para evitar inconsistencia.`);
    }
    const product = { id: productSnapshot.id, ...(productSnapshot.data() as Omit<ProductCatalogItem, 'id'>) };

    for (const group of groups) {
      const variation = group.variationId
        ? product.variations?.find((candidate) => candidate.id === group.variationId)
        : undefined;
      if (group.variationId && !variation) {
        throw new Error(`A variacao ${group.variationId} da baixa original nao existe mais; estorno bloqueado.`);
      }
      const previousQuantity = variation
        ? normalizeQuantity(variation.stockQuantity)
        : normalizeQuantity(product.stockQuantity);
      const nextQuantity = previousQuantity + group.quantity;
      if (nextQuantity > 10_000_000) throw new Error('O estorno ultrapassaria o limite permitido de estoque.');
      adjustments.push({
        group: {
          productId,
          quantity: group.quantity,
          itemIds: movement.itemIds || [],
          sourceCode: product.sourceCode,
          description: product.description,
          variationId: group.variationId,
          variation: product.variations?.find((candidate) => candidate.id === group.variationId)?.name,
        },
        product,
        productRef,
        previousQuantity,
        nextQuantity,
        usesVariationStock: Boolean(variation),
      });
    }
  }
  if (!adjustments.length) throw new Error('A movimentacao original nao contem uma baixa efetiva para estornar.');
  return adjustments;
};

const stockOperationReplayMutations = (
  userId: string,
  operation: ReturnType<typeof applyStockOperation>,
  adjustments: StockAdjustment[],
  now: string,
): FirestoreReplayMutation[] => {
  if (!operation) return [];
  const productWrites: FirestoreReplayMutation[] = adjustments
    .filter((adjustment, index, list) => (
      list.findIndex((candidate) => candidate.product.id === adjustment.product.id) === index
    ))
    .map(({ product, nextQuantity, usesVariationStock }) => {
      const relatedAdjustments = adjustments.filter((item) => item.product.id === product.id);
      const variantAdjustments = relatedAdjustments.filter((item) => item.usesVariationStock);
      let variations = product.variations || [];
      let stockQuantity = nextQuantity;
      if (usesVariationStock) {
        variations = variations.map((variation) => {
          const matched = variantAdjustments.find((item) => item.group.variationId === variation.id);
          return matched ? { ...variation, stockQuantity: matched.nextQuantity } : variation;
        });
        stockQuantity = variations.reduce((sum, variation) => sum + normalizeQuantity(variation.stockQuantity), 0);
      } else if (relatedAdjustments.length > 1) {
        stockQuantity = relatedAdjustments[relatedAdjustments.length - 1].nextQuantity;
      }
      return {
        operation: 'update' as const,
        path: ['users', userId, 'products', product.id],
        data: {
          stockQuantity,
          variations,
          stockMovementId: operation.id,
          updatedAt: now,
        },
      };
    });
  return [
    ...productWrites,
    {
      operation: 'set',
      path: ['users', userId, 'stock_movements', operation.id],
      data: operation.data as unknown as Record<string, unknown>,
    },
  ];
};

const stockMetadata = (hasMovements: boolean, now: string, batchId: string, movementId: string | null = null) => ({
  stockDeducted: hasMovements,
  stockDeductedAt: hasMovements ? now : null,
  stockMovementBatchId: hasMovements ? batchId : null,
  stockMovementId: hasMovements ? movementId : null,
});

const finalizeWithStockTransaction = async (
  userId: string,
  launchRef: DocumentReference,
  launchId: string,
  data: CashRegisterWriteData
): Promise<{ stockShortageItems: CashRegisterLaunch['stockShortageItems']; savedOffline: boolean }> => {
  const now = data.updatedAt || new Date().toISOString();
  const batchId = createId(`stock-${launchId}`);

  if (!isFirestoreNetworkEnabled()) {
    const { adjustments, shortages } = await collectStockAdjustments(
      null,
      userId,
      data.items,
      'deduct',
      launchId,
      data.orderNumber,
    );
    const batch = writeBatch(db);
    const launch = toLaunch(launchId, data);
    const operation = applyStockAdjustments(batch, userId, launch, adjustments, 'deduct', now, batchId);
    const launchData = {
      ...data,
      ...stockMetadata(adjustments.length > 0, now, batchId, operation?.id || null),
      stockShortageItems: toPersistedStockShortages(shortages),
    };
    batch.set(launchRef, launchData);
    const replayWrites: FirestoreReplayMutation[] = [
      ...stockOperationReplayMutations(userId, operation, adjustments, now),
      { operation: 'set', path: cashLaunchReplayPath(userId, launchId), data: launchData },
    ];
    const result = await queueFirestoreVoidWrite(
      () => batch.commit(),
      'Finalizar O.S. localmente',
      createFirestoreBatchReplayDescriptor(replayWrites)
    );
    notifyFirestoreLocalCollectionsChanged(userId, ['cash_launches', 'products', 'stock_movements']);
    return { stockShortageItems: toPersistedStockShortages(shortages), savedOffline: result.status === 'queued' };
  }

  requireOnlineStockSync();

  const shortages = await runTransaction(db, async (transaction) => {
    const launch = toLaunch(launchId, data);
    const { adjustments, shortages } = await collectStockAdjustments(
      transaction,
      userId,
      data.items,
      'deduct',
      launchId,
      data.orderNumber,
    );
    const operation = applyStockAdjustments(transaction, userId, launch, adjustments, 'deduct', now, batchId);

    transaction.set(launchRef, {
      ...data,
      ...stockMetadata(adjustments.length > 0, now, batchId, operation?.id || null),
      stockShortageItems: toPersistedStockShortages(shortages),
    });
    return toPersistedStockShortages(shortages);
  });
  notifyFirestoreLocalCollectionsChanged(userId, ['cash_launches', 'products', 'stock_movements']);
  return { stockShortageItems: shortages, savedOffline: false };
};

const updateWithStockTransaction = async (
  userId: string,
  launchId: string,
  data: CashRegisterUpdateData
 ,
  previousLaunch?: CashRegisterLaunch,
): Promise<{ stockShortageItems: CashRegisterLaunch['stockShortageItems']; savedOffline: boolean }> => {
  const now = data.updatedAt || new Date().toISOString();
  const updateData = { ...data, userId };

  if (!isFirestoreNetworkEnabled()) {
    const launchRef = cashLaunchDocPath(userId, launchId);
    const currentLaunch = await readLaunchFromCache(userId, launchId, previousLaunch);
    const nextStatus = data.status || currentLaunch.status;
    const nextItems = data.items || currentLaunch.items || [];
    const nextLaunch = { ...currentLaunch, ...updateData, items: nextItems, status: nextStatus };
    if (
      currentLaunch.stockDeducted === true
      && nextStatus === 'Finalizado'
      && data.items
      && stockSignature(currentLaunch.items) !== stockSignature(data.items)
    ) {
      throw new Error('Para alterar itens de uma O.S. finalizada, mude o status antes para ajustar o estoque com segurança.');
    }

    const batch = writeBatch(db);
    const replayWrites: FirestoreReplayMutation[] = [];
    let resultShortages: CashRegisterLaunch['stockShortageItems'] = currentLaunch.stockShortageItems || [];

    if (nextStatus === 'Finalizado' && currentLaunch.stockDeducted !== true) {
      const batchId = createId(`stock-${launchId}`);
      const { adjustments, shortages } = await collectStockAdjustments(
        null, userId, nextItems, 'deduct', launchId, nextLaunch.orderNumber
      );
      const operation = applyStockAdjustments(batch, userId, nextLaunch, adjustments, 'deduct', now, batchId);
      const launchPatch = {
        ...updateData,
        ...stockMetadata(adjustments.length > 0, now, batchId, operation?.id || null),
        stockShortageItems: toPersistedStockShortages(shortages),
      };
      batch.update(launchRef, launchPatch);
      replayWrites.push(
        ...stockOperationReplayMutations(userId, operation, adjustments, now),
        { operation: 'update', path: cashLaunchReplayPath(userId, launchId), data: launchPatch },
      );
      resultShortages = toPersistedStockShortages(shortages);
    } else if (currentLaunch.stockDeducted === true && nextStatus !== 'Finalizado') {
      const batchId = createId(`stock-${launchId}-estorno`);
      const movementId = await resolveOriginalMovementId(userId, currentLaunch, true);
      const originalMovement = await readOriginalMovement(userId, currentLaunch, movementId);
      const adjustments = await collectExactReversalAdjustments(null, userId, originalMovement);
      const operation = applyStockAdjustments(batch, userId, currentLaunch, adjustments, 'restore', now, batchId);
      const launchPatch = {
        ...updateData,
        stockDeducted: false,
        stockDeductedAt: null,
        stockMovementBatchId: operation?.data.batchId || null,
        stockMovementId: operation?.id || null,
      };
      batch.update(launchRef, launchPatch);
      replayWrites.push(
        ...stockOperationReplayMutations(userId, operation, adjustments, now),
        { operation: 'update', path: cashLaunchReplayPath(userId, launchId), data: launchPatch },
      );
      resultShortages = [];
    } else {
      batch.update(launchRef, updateData);
      replayWrites.push({ operation: 'update', path: cashLaunchReplayPath(userId, launchId), data: updateData });
    }

    const result = await queueFirestoreVoidWrite(
      () => batch.commit(),
      'Atualizar O.S. localmente',
      createFirestoreBatchReplayDescriptor(replayWrites)
    );
    notifyFirestoreLocalCollectionsChanged(userId, ['cash_launches', 'products', 'stock_movements']);
    return { stockShortageItems: resultShortages, savedOffline: result.status === 'queued' };
  }

  requireOnlineStockSync();

  // Legacy O.S. records have a batch id but may not yet have the exact movement
  // id. Resolve that immutable movement before the transaction; the transaction
  // below rereads the O.S. and confirms the same link before restoring stock.
  let legacyMovementId: string | null = null;
  if (data.status && data.status !== 'Finalizado') {
    const candidateSnapshot = await getDoc(cashLaunchDocPath(userId, launchId));
    if (!candidateSnapshot.exists()) throw new Error('O.S. nao encontrada para atualizar o estoque.');
    const candidate = toLaunch(launchId, candidateSnapshot.data() as Omit<CashRegisterLaunch, 'id'>);
    if (candidate.stockDeducted === true && !candidate.stockMovementId) {
      legacyMovementId = await resolveOriginalMovementId(userId, candidate, false);
    }
  }

  const shortages = await runTransaction(db, async (transaction) => {
    const launchRef = cashLaunchDocPath(userId, launchId);
    // Read the authoritative launch inside the transaction. The UI snapshot may be
    // stale by the time inventory and the order are updated together.
    const currentLaunch = (await readLaunchInTransaction(transaction, userId, launchId)).launch;
    const nextStatus = data.status || currentLaunch.status;
    const nextItems = data.items || currentLaunch.items || [];
    const nextLaunch = {
      ...currentLaunch,
      ...updateData,
      items: nextItems,
      status: nextStatus,
    };

    if (
      currentLaunch.stockDeducted === true
      && nextStatus === 'Finalizado'
      && data.items
      && stockSignature(currentLaunch.items) !== stockSignature(data.items)
    ) {
      throw new Error('Para alterar itens de uma O.S. finalizada, mude o status antes para ajustar o estoque com seguranca.');
    }

    if (nextStatus === 'Finalizado' && currentLaunch.stockDeducted !== true) {
      const batchId = createId(`stock-${launchId}`);
      const { adjustments, shortages } = await collectStockAdjustments(
        transaction,
        userId,
        nextItems,
        'deduct',
        launchId,
        nextLaunch.orderNumber,
      );
      const operation = applyStockAdjustments(transaction, userId, nextLaunch, adjustments, 'deduct', now, batchId);
      transaction.update(launchRef, {
        ...updateData,
        ...stockMetadata(adjustments.length > 0, now, batchId, operation?.id || null),
        stockShortageItems: toPersistedStockShortages(shortages),
      });
      return toPersistedStockShortages(shortages);
    }

    if (currentLaunch.stockDeducted === true && nextStatus !== 'Finalizado') {
      const batchId = createId(`stock-${launchId}-estorno`);
      const movementId = currentLaunch.stockMovementId || legacyMovementId;
      if (!movementId) throw new Error('Nao foi possivel identificar a baixa original desta O.S.; estorno bloqueado para proteger o estoque.');
      if (currentLaunch.stockMovementId && legacyMovementId && currentLaunch.stockMovementId !== legacyMovementId) {
        throw new Error('A O.S. foi alterada durante a tentativa de estorno. Atualize a tela e tente novamente.');
      }
      const originalMovement = await readOriginalMovement(userId, currentLaunch, movementId, transaction);
      const adjustments = await collectExactReversalAdjustments(transaction, userId, originalMovement);
      const operation = applyStockAdjustments(transaction, userId, currentLaunch, adjustments, 'restore', now, batchId);
      transaction.update(launchRef, {
        ...updateData,
        stockDeducted: false,
        stockDeductedAt: null,
        stockMovementBatchId: operation?.data.batchId || null,
        stockMovementId: operation?.id || null,
      });
      return [];
    }

    transaction.update(launchRef, updateData);
    return currentLaunch.stockShortageItems || [];
  });
  notifyFirestoreLocalCollectionsChanged(userId, ['cash_launches', 'products', 'stock_movements']);
  return { stockShortageItems: shortages, savedOffline: false };
};

const deleteWithStockTransaction = async (
  userId: string,
  launchId: string,
  metadata: ReturnType<typeof createSoftDeleteMetadata>,
  previousLaunch?: CashRegisterLaunch
) => {
  const now = metadata.deletedAt || new Date().toISOString();

  if (!isFirestoreNetworkEnabled()) {
    const launchRef = cashLaunchDocPath(userId, launchId);
    const launch = await readLaunchFromCache(userId, launchId, previousLaunch);
    const batch = writeBatch(db);
    const replayWrites: FirestoreReplayMutation[] = [];
    let launchPatch: Record<string, unknown> = { ...metadata };
    if (launch.stockDeducted === true) {
      const batchId = createId(`stock-${launchId}-exclusao`);
      const movementId = await resolveOriginalMovementId(userId, launch, true);
      const originalMovement = await readOriginalMovement(userId, launch, movementId);
      const adjustments = await collectExactReversalAdjustments(null, userId, originalMovement);
      const operation = applyStockAdjustments(batch, userId, launch, adjustments, 'restore', now, batchId);
      launchPatch = {
        ...metadata,
        stockDeducted: false,
        stockDeductedAt: null,
        stockMovementBatchId: operation?.data.batchId || null,
        stockMovementId: operation?.id || null,
      };
      replayWrites.push(...stockOperationReplayMutations(userId, operation, adjustments, now));
    }
    batch.update(launchRef, launchPatch);
    replayWrites.push({ operation: 'update', path: cashLaunchReplayPath(userId, launchId), data: launchPatch });
    await queueFirestoreVoidWrite(
      () => batch.commit(),
      'Excluir O.S. localmente',
      createFirestoreBatchReplayDescriptor(replayWrites)
    );
    notifyFirestoreLocalCollectionsChanged(userId, ['cash_launches', 'products', 'stock_movements']);
    return;
  }

  requireOnlineStockSync();

  const candidateSnapshot = await getDoc(cashLaunchDocPath(userId, launchId));
  if (!candidateSnapshot.exists()) throw new Error('O.S. nao encontrada para excluir.');
  const candidate = toLaunch(launchId, candidateSnapshot.data() as Omit<CashRegisterLaunch, 'id'>);
  const legacyMovementId = candidate.stockDeducted === true && !candidate.stockMovementId
    ? await resolveOriginalMovementId(userId, candidate, false)
    : null;

  await runTransaction(db, async (transaction) => {
    const launchRef = cashLaunchDocPath(userId, launchId);
    const launch = (await readLaunchInTransaction(transaction, userId, launchId)).launch;

    if (launch.stockDeducted === true) {
      const batchId = createId(`stock-${launchId}-exclusao`);
      const movementId = launch.stockMovementId || legacyMovementId;
      if (!movementId) throw new Error('Nao foi possivel identificar a baixa original desta O.S.; estorno bloqueado para proteger o estoque.');
      const originalMovement = await readOriginalMovement(userId, launch, movementId, transaction);
      const adjustments = await collectExactReversalAdjustments(transaction, userId, originalMovement);
      const operation = applyStockAdjustments(transaction, userId, launch, adjustments, 'restore', now, batchId);
      transaction.update(launchRef, {
        ...metadata,
        stockDeducted: false,
        stockDeductedAt: null,
        stockMovementBatchId: operation?.data.batchId || null,
        stockMovementId: operation?.id || null,
      });
      return;
    }

    transaction.update(launchRef, metadata);
  });
  notifyFirestoreLocalCollectionsChanged(userId, ['cash_launches', 'products', 'stock_movements']);
};

const restoreWithStockTransaction = async (userId: string, launchId: string, previousLaunch?: CashRegisterLaunch) => {
  const metadata = createRestoreMetadata();
  const now = new Date().toISOString();

  if (!isFirestoreNetworkEnabled()) {
    const launchRef = cashLaunchDocPath(userId, launchId);
    const launch = await readLaunchFromCache(userId, launchId, previousLaunch);
    const batch = writeBatch(db);
    const replayWrites: FirestoreReplayMutation[] = [];
    let launchPatch: Record<string, unknown> = { ...metadata, updatedAt: now };
    if (launch.status === 'Finalizado' && launch.stockDeducted !== true) {
      const batchId = createId(`stock-${launchId}-restauracao`);
      const { adjustments, shortages } = await collectStockAdjustments(null, userId, launch.items || [], 'deduct');
      const operation = applyStockAdjustments(batch, userId, launch, adjustments, 'deduct', now, batchId);
      launchPatch = {
        ...metadata,
        ...stockMetadata(adjustments.length > 0, now, batchId, operation?.id || null),
        stockShortageItems: toPersistedStockShortages(shortages),
        updatedAt: now,
      };
      replayWrites.push(...stockOperationReplayMutations(userId, operation, adjustments, now));
    }
    batch.update(launchRef, launchPatch);
    replayWrites.push({ operation: 'update', path: cashLaunchReplayPath(userId, launchId), data: launchPatch });
    await queueFirestoreVoidWrite(
      () => batch.commit(),
      'Restaurar O.S. localmente',
      createFirestoreBatchReplayDescriptor(replayWrites)
    );
    notifyFirestoreLocalCollectionsChanged(userId, ['cash_launches', 'products', 'stock_movements']);
    return;
  }

  requireOnlineStockSync();

  await runTransaction(db, async (transaction) => {
    const launchRef = cashLaunchDocPath(userId, launchId);
    const launch = (await readLaunchInTransaction(transaction, userId, launchId)).launch;

    if (launch.status === 'Finalizado' && launch.stockDeducted !== true) {
      const batchId = createId(`stock-${launchId}-restauracao`);
      const { adjustments, shortages } = await collectStockAdjustments(transaction, userId, launch.items || [], 'deduct');
      const operation = applyStockAdjustments(transaction, userId, launch, adjustments, 'deduct', now, batchId);
      transaction.update(launchRef, {
        ...metadata,
        ...stockMetadata(adjustments.length > 0, now, batchId, operation?.id || null),
        stockShortageItems: toPersistedStockShortages(shortages),
        updatedAt: now,
      });
      return;
    }

    transaction.update(launchRef, {
      ...metadata,
      updatedAt: now,
    });
  });
  notifyFirestoreLocalCollectionsChanged(userId, ['cash_launches', 'products', 'stock_movements']);
};

export const cashRegisterRepository = {
  addStockForInsufficientLaunch: addStockForCashLaunchShortage,

  async recordCardSettlement(userId: string, launch: CashRegisterLaunch, paymentEntryId: string, settledAt: string) {
    const entries = launch.paymentEntries || [];
    const target = entries.find((entry) => entry.id === paymentEntryId);
    if (!target || target.settledAt || !['Debito', 'Credito'].includes(target.method)) return false;
    const patch = withFirestoreSyncTimestamp({
      accountingVersion: 1,
      paymentEntries: entries.map((entry) => entry.id === paymentEntryId ? { ...entry, settledAt } : entry),
      updatedAt: new Date().toISOString(),
    });
    await queueFirestoreVoidWrite(
      () => updateDoc(cashLaunchDocPath(userId, launch.id), patch),
      'Registrar repasse da operadora',
      createFirestoreReplayDescriptor('update', cashLaunchReplayPath(userId, launch.id), patch),
    );
    notifyFirestoreLocalCollectionsChanged(userId, ['cash_launches']);
    return true;
  },

  async create(userId: string, data: CashRegisterWriteData): Promise<CashRegisterSaveResult> {
    validateCashLaunchData(data);
    const docRef = doc(cashLaunchCollectionPath(userId));
    const writeData = withFirestoreSyncTimestamp(data);

    if (writeData.status === 'Finalizado') {
      const result = await finalizeWithStockTransaction(userId, docRef, docRef.id, writeData);
      return { id: docRef.id, ...result };
    }

    const result = await queueFirestoreVoidWrite(
      () => setDoc(docRef, writeData),
      'Criar lancamento de caixa',
      createFirestoreReplayDescriptor('set', cashLaunchReplayPath(userId, docRef.id), { ...writeData })
    );
    return { id: docRef.id, savedOffline: result.status === 'queued' };
  },

  async update(
    userId: string,
    launchId: string,
    data: CashRegisterUpdateData,
    previousLaunch?: CashRegisterLaunch
  ): Promise<CashRegisterSaveResult> {
    validateCashLaunchData(data as Partial<CashRegisterLaunch>);
    const writeData = withFirestoreSyncTimestamp({ ...data, userId });

    const nextStatus = writeData.status || previousLaunch?.status;
    const needsStockTransaction = isFirestoreNetworkEnabled()
      || shouldUseStockTransaction(previousLaunch, nextStatus);

    if (needsStockTransaction) {
      return updateWithStockTransaction(userId, launchId, writeData, previousLaunch);
    }

    const result = await queueFirestoreVoidWrite(
      () => setDoc(cashLaunchDocPath(userId, launchId), writeData, { merge: true }),
      'Atualizar lancamento de caixa',
      createFirestoreReplayDescriptor('update', cashLaunchReplayPath(userId, launchId), writeData)
    );
    return { savedOffline: result.status === 'queued' };
  },

  async delete(userId: string, launchId: string, reason?: string, previousLaunch?: CashRegisterLaunch) {
    const metadata = createSoftDeleteMetadata(userId, reason);
    await deleteWithStockTransaction(userId, launchId, metadata, previousLaunch);
  },

  async restore(userId: string, launchId: string, previousLaunch?: CashRegisterLaunch) {
    await restoreWithStockTransaction(userId, launchId, previousLaunch);
  },
};
