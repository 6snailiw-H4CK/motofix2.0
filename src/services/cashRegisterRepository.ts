import {
  collection,
  doc,
  runTransaction,
  setDoc,
  updateDoc,
  type DocumentReference,
  type Transaction,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { CashRegisterItem, CashRegisterLaunch, ProductCatalogItem, StockMovement, StockMovementType } from '../types';
import { createFirestoreReplayDescriptor, queueFirestoreVoidWrite } from './firestoreOfflineQueue';
import { createRestoreMetadata, createSoftDeleteMetadata } from './softDelete';
import { validateCashLaunchData } from './cashRegisterValidation';

export type CashRegisterWriteData = Omit<CashRegisterLaunch, 'id'>;
export type CashRegisterUpdateData = Partial<Omit<CashRegisterLaunch, 'id' | 'orderNumber' | 'userId' | 'createdAt'>>;

type StockAction = 'deduct' | 'restore';

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
};

const cashLaunchCollectionPath = (userId: string) => collection(db, 'users', userId, 'cash_launches');
const cashLaunchDocPath = (userId: string, launchId: string) => doc(db, 'users', userId, 'cash_launches', launchId);
const cashLaunchReplayPath = (userId: string, launchId: string) => ['users', userId, 'cash_launches', launchId];
const productDocPath = (userId: string, productId: string) => doc(db, 'users', userId, 'products', productId);
const stockMovementCollectionPath = (userId: string) => collection(db, 'users', userId, 'stock_movements');

const isBrowserOnline = () => (
  typeof navigator === 'undefined' ? true : navigator.onLine !== false
);

const requireOnlineStockSync = () => {
  if (!isBrowserOnline()) {
    throw new Error('Conecte-se para finalizar, restaurar ou estornar O.S. com baixa de estoque.');
  }
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
    const quantity = normalizeQuantity(item.quantity);
    if (!productId || quantity <= 0) return;

    const current = groups.get(productId) || {
      productId,
      quantity: 0,
      itemIds: [],
      sourceCode: item.sourceCode,
      description: item.description,
      variationId: item.variationId,
      variation: item.variation,
    };

    current.quantity += quantity;
    current.itemIds.push(item.id);
    groups.set(productId, current);
  });

  return Array.from(groups.values());
};

const stockSignature = (items: CashRegisterItem[] = []) => (
  groupStockItems(items)
    .map((group) => `${group.productId}:${group.quantity}`)
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

const collectStockAdjustments = async (
  transaction: Transaction,
  userId: string,
  items: CashRegisterItem[],
  action: StockAction
): Promise<StockAdjustment[]> => {
  const groups = groupStockItems(items);
  const adjustments: StockAdjustment[] = [];

  for (const group of groups) {
    const productRef = productDocPath(userId, group.productId);
    const productSnapshot = await transaction.get(productRef);

    if (!productSnapshot.exists()) {
      throw new Error(`Mercadoria "${group.description || group.productId}" nao encontrada para baixa de estoque.`);
    }

    const product = {
      id: productSnapshot.id,
      ...(productSnapshot.data() as Omit<ProductCatalogItem, 'id'>),
    };

    if (product.trackStock !== true) continue;

    const previousQuantity = normalizeQuantity(product.stockQuantity);
    const nextQuantity = action === 'deduct'
      ? previousQuantity - group.quantity
      : previousQuantity + group.quantity;

    if (nextQuantity < 0) {
      throw new Error(`Estoque insuficiente para "${product.description || group.description}". Disponivel: ${previousQuantity}; solicitado: ${group.quantity}.`);
    }

    adjustments.push({
      group,
      product,
      productRef,
      previousQuantity,
      nextQuantity,
    });
  }

  return adjustments;
};

const applyStockAdjustments = (
  transaction: Transaction,
  userId: string,
  launch: CashRegisterLaunch,
  adjustments: StockAdjustment[],
  action: StockAction,
  now: string,
  batchId: string
) => {
  const movementType: StockMovementType = action === 'deduct' ? 'saida_os' : 'estorno_os';

  adjustments.forEach((adjustment) => {
    transaction.update(adjustment.productRef, {
      stockQuantity: adjustment.nextQuantity,
      updatedAt: now,
    });

    const movement: StockMovement = {
      userId,
      productId: adjustment.group.productId,
      productDescription: adjustment.product.description || adjustment.group.description || 'Mercadoria',
      type: movementType,
      quantity: adjustment.group.quantity,
      previousQuantity: adjustment.previousQuantity,
      nextQuantity: adjustment.nextQuantity,
      cashLaunchId: launch.id,
      cashLaunchOrderNumber: launch.orderNumber,
      itemIds: adjustment.group.itemIds,
      batchId,
      note: action === 'deduct' ? 'Baixa automatica ao finalizar O.S.' : 'Estorno automatico da O.S.',
      createdAt: now,
      ...(adjustment.product.sourceCode || adjustment.group.sourceCode
        ? { sourceCode: adjustment.product.sourceCode || adjustment.group.sourceCode }
        : {}),
      ...(adjustment.group.variationId ? { variationId: adjustment.group.variationId } : {}),
      ...(adjustment.group.variation ? { variation: adjustment.group.variation } : {}),
    };

    transaction.set(doc(stockMovementCollectionPath(userId)), movement);
  });
};

const stockMetadata = (hasMovements: boolean, now: string, batchId: string) => ({
  stockDeducted: hasMovements,
  stockDeductedAt: hasMovements ? now : null,
  stockMovementBatchId: hasMovements ? batchId : null,
});

const finalizeWithStockTransaction = async (
  userId: string,
  launchRef: DocumentReference,
  launchId: string,
  data: CashRegisterWriteData
) => {
  requireOnlineStockSync();
  const now = data.updatedAt || new Date().toISOString();
  const batchId = createId(`stock-${launchId}`);

  await runTransaction(db, async (transaction) => {
    const launch = toLaunch(launchId, data);
    const adjustments = await collectStockAdjustments(transaction, userId, data.items, 'deduct');
    applyStockAdjustments(transaction, userId, launch, adjustments, 'deduct', now, batchId);

    transaction.set(launchRef, {
      ...data,
      ...stockMetadata(adjustments.length > 0, now, batchId),
    });
  });
};

const updateWithStockTransaction = async (
  userId: string,
  launchId: string,
  data: CashRegisterUpdateData
) => {
  requireOnlineStockSync();
  const now = data.updatedAt || new Date().toISOString();

  await runTransaction(db, async (transaction) => {
    const { launchRef, launch: previousLaunch } = await readLaunchInTransaction(transaction, userId, launchId);
    const nextStatus = data.status || previousLaunch.status;
    const nextItems = data.items || previousLaunch.items || [];
    const nextLaunch = {
      ...previousLaunch,
      ...data,
      items: nextItems,
      status: nextStatus,
    };

    if (
      previousLaunch.stockDeducted === true
      && nextStatus === 'Finalizado'
      && data.items
      && stockSignature(previousLaunch.items) !== stockSignature(data.items)
    ) {
      throw new Error('Para alterar itens de uma O.S. finalizada, mude o status antes para ajustar o estoque com seguranca.');
    }

    if (nextStatus === 'Finalizado' && previousLaunch.stockDeducted !== true) {
      const batchId = createId(`stock-${launchId}`);
      const adjustments = await collectStockAdjustments(transaction, userId, nextItems, 'deduct');
      applyStockAdjustments(transaction, userId, nextLaunch, adjustments, 'deduct', now, batchId);
      transaction.update(launchRef, {
        ...data,
        ...stockMetadata(adjustments.length > 0, now, batchId),
      });
      return;
    }

    if (previousLaunch.stockDeducted === true && nextStatus !== 'Finalizado') {
      const batchId = createId(`stock-${launchId}-estorno`);
      const adjustments = await collectStockAdjustments(transaction, userId, previousLaunch.items || [], 'restore');
      applyStockAdjustments(transaction, userId, previousLaunch, adjustments, 'restore', now, batchId);
      transaction.update(launchRef, {
        ...data,
        stockDeducted: false,
        stockDeductedAt: null,
        stockMovementBatchId: null,
      });
      return;
    }

    transaction.update(launchRef, data);
  });
};

const deleteWithStockTransaction = async (
  userId: string,
  launchId: string,
  metadata: ReturnType<typeof createSoftDeleteMetadata>
) => {
  requireOnlineStockSync();
  const now = metadata.deletedAt || new Date().toISOString();

  await runTransaction(db, async (transaction) => {
    const { launchRef, launch } = await readLaunchInTransaction(transaction, userId, launchId);

    if (launch.stockDeducted === true) {
      const batchId = createId(`stock-${launchId}-exclusao`);
      const adjustments = await collectStockAdjustments(transaction, userId, launch.items || [], 'restore');
      applyStockAdjustments(transaction, userId, launch, adjustments, 'restore', now, batchId);
      transaction.update(launchRef, {
        ...metadata,
        stockDeducted: false,
        stockDeductedAt: null,
        stockMovementBatchId: null,
      });
      return;
    }

    transaction.update(launchRef, metadata);
  });
};

const restoreWithStockTransaction = async (userId: string, launchId: string) => {
  requireOnlineStockSync();
  const metadata = createRestoreMetadata();
  const now = new Date().toISOString();

  await runTransaction(db, async (transaction) => {
    const { launchRef, launch } = await readLaunchInTransaction(transaction, userId, launchId);

    if (launch.status === 'Finalizado' && launch.stockDeducted !== true) {
      const batchId = createId(`stock-${launchId}-restauracao`);
      const adjustments = await collectStockAdjustments(transaction, userId, launch.items || [], 'deduct');
      applyStockAdjustments(transaction, userId, launch, adjustments, 'deduct', now, batchId);
      transaction.update(launchRef, {
        ...metadata,
        ...stockMetadata(adjustments.length > 0, now, batchId),
        updatedAt: now,
      });
      return;
    }

    transaction.update(launchRef, {
      ...metadata,
      updatedAt: now,
    });
  });
};

export const cashRegisterRepository = {
  async create(userId: string, data: CashRegisterWriteData) {
    validateCashLaunchData(data);
    const docRef = doc(cashLaunchCollectionPath(userId));

    if (data.status === 'Finalizado') {
      await finalizeWithStockTransaction(userId, docRef, docRef.id, data);
      return docRef.id;
    }

    await queueFirestoreVoidWrite(
      () => setDoc(docRef, data),
      'Criar lancamento de caixa',
      createFirestoreReplayDescriptor('set', cashLaunchReplayPath(userId, docRef.id), { ...data })
    );
    return docRef.id;
  },

  async update(
    userId: string,
    launchId: string,
    data: CashRegisterUpdateData,
    previousLaunch?: CashRegisterLaunch
  ) {
    validateCashLaunchData(data as Partial<CashRegisterLaunch>);

    const nextStatus = data.status || previousLaunch?.status;
    const needsStockTransaction = nextStatus === 'Finalizado' || previousLaunch?.stockDeducted === true;

    if (needsStockTransaction) {
      await updateWithStockTransaction(userId, launchId, data);
      return;
    }

    await queueFirestoreVoidWrite(
      () => updateDoc(cashLaunchDocPath(userId, launchId), data),
      'Atualizar lancamento de caixa',
      createFirestoreReplayDescriptor('update', cashLaunchReplayPath(userId, launchId), { ...data })
    );
  },

  async delete(userId: string, launchId: string, reason?: string, previousLaunch?: CashRegisterLaunch) {
    const metadata = createSoftDeleteMetadata(userId, reason);

    if (previousLaunch?.stockDeducted === true || previousLaunch?.status === 'Finalizado') {
      await deleteWithStockTransaction(userId, launchId, metadata);
      return;
    }

    await queueFirestoreVoidWrite(
      () => updateDoc(cashLaunchDocPath(userId, launchId), metadata),
      'Arquivar lancamento de caixa',
      createFirestoreReplayDescriptor('update', cashLaunchReplayPath(userId, launchId), metadata)
    );
  },

  async restore(userId: string, launchId: string) {
    await restoreWithStockTransaction(userId, launchId);
  },
};
