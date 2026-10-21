import { collection, doc, getDocFromCache, runTransaction, updateDoc, writeBatch, type DocumentReference } from 'firebase/firestore';
import { db } from '../firebase';
import type { ProductCatalogFormInput, ProductCatalogItem, ProductCatalogVariation } from '../types';
import {
  createFirestoreBatchReplayDescriptor,
  createFirestoreReplayDescriptor,
  queueFirestoreVoidWrite,
  type FirestoreReplayMutation
} from './firestoreOfflineQueue';
import { createRestoreMetadata, createSoftDeleteMetadata } from './softDelete';
import { applyStockOperation } from './stockTransaction';
import { notifyFirestoreLocalCollectionsChanged } from './firestoreCollectionSync';
import { isFirestoreNetworkEnabled } from './firestoreNetworkControl';

type ProductWriteData = Omit<ProductCatalogItem, 'id' | 'userId' | 'importedAt' | 'createdAt' | 'updatedAt'>;

const productCollectionPath = (userId: string) => collection(db, 'users', userId, 'products');
const productDocPath = (userId: string, productId: string) => doc(db, 'users', userId, 'products', productId);
const productReplayPath = (userId: string, productId: string) => ['users', userId, 'products', productId];

const normalizeDocId = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);

const buildProductId = (sourceCode: string, description: string, variation = '') => {
  const source = sourceCode.trim();
  const variant = variation.trim();
  if (source) return `produto-${normalizeDocId([source, variant].filter(Boolean).join('-'))}`;
  return `produto-${normalizeDocId([description, variant].filter(Boolean).join('-')) || crypto.randomUUID()}`;
};

const makeVariationId = (name: string, index: number) => (
  `${normalizeDocId(name) || 'variacao'}-${index + 1}`
);

const normalizeStockQuantity = (value: unknown) => {
  const quantity = Number(value);
  return Number.isFinite(quantity) ? Math.max(0, Math.floor(quantity)) : 0;
};

const requireOnlineStockWrite = () => {
  if ((typeof navigator !== 'undefined' && navigator.onLine === false) || !isFirestoreNetworkEnabled()) {
    throw new Error('Esta operação de estoque precisa de uma sincronização aberta. Salve as alterações locais e tente novamente durante a sincronização.');
  }
};

const createOfflineProductId = () => {
  const suffix = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `produto-offline-${suffix}`;
};

type ProductStockChange = {
  product: ProductCatalogItem;
  productRef: DocumentReference;
  nextFields: Pick<ProductCatalogItem, 'stockQuantity' | 'variations'>;
  otherFields?: Record<string, unknown>;
  create?: boolean;
};

const stockOperationReplayMutations = (
  userId: string,
  operation: NonNullable<ReturnType<typeof applyStockOperation>>,
  changes: ProductStockChange[],
): FirestoreReplayMutation[] => [
  ...changes.map(({ product, nextFields, otherFields, create }) => ({
    operation: create ? 'set' as const : 'update' as const,
    path: productReplayPath(userId, product.id),
    data: {
      ...otherFields,
      ...nextFields,
      stockMovementId: operation.id,
      updatedAt: operation.data.createdAt,
    },
  })),
  {
    operation: 'set',
    path: ['users', userId, 'stock_movements', operation.id],
    data: operation.data as unknown as Record<string, unknown>,
  },
];

const sanitizeProduct = (input: ProductCatalogFormInput): ProductCatalogFormInput => {
  const variations = (input.variations || [])
    .map((variation, index) => {
      const name = String(variation.name || '').replace(/\s+/g, ' ').trim();
      if (!name) return null;

      return {
        id: String(variation.id || makeVariationId(name, index)).trim(),
        name,
        salePrice: Number(variation.salePrice || 0),
        ...(variation.stockQuantity === undefined
          ? {}
          : { stockQuantity: normalizeStockQuantity(variation.stockQuantity) }),
      };
    })
    .filter((variation): variation is NonNullable<typeof variation> => Boolean(variation));
  const trackStock = Boolean(input.trackStock);

  return {
    sourceCode: String(input.sourceCode || '').trim(),
    description: String(input.description || '').replace(/\s+/g, ' ').trim(),
    variation: String(input.variation || '').replace(/\s+/g, ' ').trim(),
    variations,
    ncm: String(input.ncm || '').replace(/\D/g, '').trim(),
    salePrice: Number(input.salePrice || 0),
    trackStock,
    stockQuantity: trackStock && variations.length > 0 && variations.every((variation) => variation.stockQuantity !== undefined)
      ? variations.reduce((total, variation) => total + variation.stockQuantity, 0)
      : normalizeStockQuantity(input.stockQuantity),
    minStockQuantity: normalizeStockQuantity(input.minStockQuantity),
  };
};

export class ProductStockResetError extends Error {
  constructor(
    readonly completedCount: number,
    readonly originalError: unknown
  ) {
    super(
      completedCount > 0
        ? `Ocorreu um erro depois de zerar ${completedCount} mercadoria(s).`
        : 'Nao foi possivel zerar o estoque das mercadorias.'
    );
    this.name = 'ProductStockResetError';
  }
}

export const productRepository = {
  async zeroStockMany(userId: string, products: Array<Pick<ProductCatalogItem, 'id' | 'variations'>>) {
    const uniqueProducts = Array.from(
      new Map(products.filter((product) => product.id).map((product) => [product.id, product])).values()
    );
    let updated = 0;

    if (!isFirestoreNetworkEnabled()) {
      for (let start = 0; start < uniqueProducts.length; start += 10) {
        const chunk = uniqueProducts.slice(start, start + 10);
        try {
          const batch = writeBatch(db);
          const changes: ProductStockChange[] = [];
          for (const item of chunk) {
            const ref = productDocPath(userId, item.id);
            let snapshot;
            try {
              snapshot = await getDocFromCache(ref);
            } catch {
              throw new Error(`A mercadoria ${item.id} não está no cache local. Sincronize os produtos antes de zerar o estoque offline.`);
            }
            if (!snapshot.exists()) continue;
            const current = snapshot.data() as ProductCatalogItem;
            if (current.deletedAt) continue;
            const variations = (current.variations || []).map((variation) => ({ ...variation, stockQuantity: 0 }));
            if (normalizeStockQuantity(current.stockQuantity) === 0
              && JSON.stringify(current.variations || []) === JSON.stringify(variations)) continue;
            changes.push({
              product: { ...current, id: snapshot.id, userId },
              productRef: snapshot.ref,
              nextFields: { stockQuantity: 0, variations },
            });
          }
          if (changes.length === 0) continue;
          const now = new Date().toISOString();
          const operation = applyStockOperation(batch, userId, changes, {
            type: 'ajuste_manual',
            batchId: `zerar-estoque-${now}`,
            note: 'Zeramento manual do estoque.',
            createdAt: now,
          });
          if (!operation) continue;
          await queueFirestoreVoidWrite(
            () => batch.commit(),
            'Zerar estoque localmente',
            createFirestoreBatchReplayDescriptor(stockOperationReplayMutations(userId, operation, changes)),
            userId,
          );
          updated += changes.length;
        } catch (error) {
          if (updated > 0) notifyFirestoreLocalCollectionsChanged(userId, ['products', 'stock_movements']);
          throw new ProductStockResetError(updated, error);
        }
      }
      if (updated > 0) notifyFirestoreLocalCollectionsChanged(userId, ['products', 'stock_movements']);
      return updated;
    }

    requireOnlineStockWrite();

    for (let start = 0; start < uniqueProducts.length; start += 10) {
      const chunk = uniqueProducts.slice(start, start + 10);
      try {
        const updatedInChunk = await runTransaction(db, async (transaction) => {
          const refs = chunk.map((product) => productDocPath(userId, product.id));
          const snapshots = await Promise.all(refs.map((ref) => transaction.get(ref)));
          const changes = snapshots.flatMap((snapshot) => {
            if (!snapshot.exists()) return [];
            const current = snapshot.data() as ProductCatalogItem;
            if (current.deletedAt) return [];
            const variations = (current.variations || []).map((variation) => ({
              ...variation,
              stockQuantity: 0,
            }));
            if (normalizeStockQuantity(current.stockQuantity) === 0
              && JSON.stringify(current.variations || []) === JSON.stringify(variations)) return [];
            return [{
              product: { ...current, id: snapshot.id, userId },
              productRef: snapshot.ref,
              nextFields: {
                stockQuantity: 0,
                ...(current.variations?.length ? { variations } : {}),
              },
            }];
          });
          applyStockOperation(transaction, userId, changes, {
            type: 'ajuste_manual',
            batchId: `zerar-estoque-${new Date().toISOString()}`,
            note: 'Zeramento manual do estoque.',
            createdAt: new Date().toISOString(),
          });
          return changes.length;
        });
        updated += updatedInChunk;
      } catch (error) {
        if (updated > 0) notifyFirestoreLocalCollectionsChanged(userId, ['products', 'stock_movements']);
        throw new ProductStockResetError(updated, error);
      }
    }

    if (updated > 0) notifyFirestoreLocalCollectionsChanged(userId, ['products', 'stock_movements']);
    return updated;
  },

  async upsertMany(userId: string, products: ProductWriteData[]) {
    const importedAt = new Date().toISOString();
    let imported = 0;

    if (!isFirestoreNetworkEnabled()) {
      for (let start = 0; start < products.length; start += 10) {
        const chunk = products.slice(start, start + 10);
        const batch = writeBatch(db);
        const changes: ProductStockChange[] = [];
        const replayWrites: FirestoreReplayMutation[] = [];

        for (const product of chunk) {
          let productId = buildProductId(product.sourceCode, product.description, product.variation);
          let ref = doc(productCollectionPath(userId), productId);
          let snapshot = null;
          try {
            snapshot = await getDocFromCache(ref);
          } catch {
            // Use a new local ID when this device cannot prove the generated ID is unused.
          }
          const current = snapshot?.exists() ? snapshot.data() as ProductCatalogItem : undefined;
          if (!current) {
            productId = createOfflineProductId();
            ref = doc(productCollectionPath(userId), productId);
          }
          const data = {
            ...product,
            id: productId,
            userId,
            importedAt,
            updatedAt: importedAt,
          };
          const stockChanged = !current
            || normalizeStockQuantity(current.stockQuantity) !== normalizeStockQuantity(product.stockQuantity)
            || JSON.stringify(current.variations || []) !== JSON.stringify(product.variations || []);

          if (stockChanged) {
            const { stockQuantity, variations, ...otherFields } = data;
            changes.push({
              product: current ? { ...current, id: productId, userId } : {
                ...data,
                stockQuantity: 0,
                variations: [],
              },
              productRef: ref,
              nextFields: {
                stockQuantity: normalizeStockQuantity(stockQuantity),
                variations: (variations || []) as ProductCatalogVariation[],
              },
              otherFields,
              create: !current,
            });
          } else {
            const nextData = {
              ...data,
              ...(current?.stockMovementId ? { stockMovementId: current.stockMovementId } : {}),
            };
            batch.set(ref, nextData, { merge: true });
            replayWrites.push({
              operation: 'set',
              path: productReplayPath(userId, productId),
              data: nextData,
              merge: true,
            });
          }
        }

        const operation = applyStockOperation(batch, userId, changes, {
          type: 'entrada_manual',
          batchId: `importar-mercadorias-${importedAt}-${start}`,
          note: 'Importacao de mercadorias.',
          createdAt: importedAt,
        });
        if (operation) replayWrites.push(...stockOperationReplayMutations(userId, operation, changes));
        if (replayWrites.length > 0) {
          await queueFirestoreVoidWrite(
            () => batch.commit(),
            'Importar mercadorias localmente',
            createFirestoreBatchReplayDescriptor(replayWrites),
            userId,
          );
          notifyFirestoreLocalCollectionsChanged(userId, ['products', 'stock_movements']);
        }
        imported += chunk.length;
      }
      return imported;
    }

    requireOnlineStockWrite();

    for (let start = 0; start < products.length; start += 10) {
      const chunk = products.slice(start, start + 10);
      await runTransaction(db, async (transaction) => {
        const refs = chunk.map((product) => {
          const productId = buildProductId(product.sourceCode, product.description, product.variation);
          return doc(productCollectionPath(userId), productId);
        });
        const snapshots = await Promise.all(refs.map((ref) => transaction.get(ref)));
        const changes = [];

        snapshots.forEach((snapshot, index) => {
          const product = chunk[index];
          const productId = snapshot.id;
          const data = {
            ...product,
            id: productId,
            userId,
            importedAt,
            updatedAt: importedAt,
          };
          const current = snapshot.exists() ? snapshot.data() as ProductCatalogItem : undefined;
          const stockChanged = !current
            || normalizeStockQuantity(current.stockQuantity) !== normalizeStockQuantity(product.stockQuantity)
            || JSON.stringify(current.variations || []) !== JSON.stringify(product.variations || []);

          if (stockChanged) {
            const { stockQuantity, variations, ...otherFields } = data;
            changes.push({
              product: current ? { ...current, id: productId, userId } : {
                ...data,
                stockQuantity: 0,
                variations: [],
              },
              productRef: snapshot.ref,
              nextFields: {
                stockQuantity: normalizeStockQuantity(stockQuantity),
                variations: (variations || []) as ProductCatalogVariation[],
              },
              otherFields,
              create: !current,
            });
          } else {
            transaction.set(snapshot.ref, {
              ...data,
              ...(current?.stockMovementId ? { stockMovementId: current.stockMovementId } : {}),
            }, { merge: true });
          }
        });

        applyStockOperation(transaction, userId, changes, {
          type: 'entrada_manual',
          batchId: `importar-mercadorias-${importedAt}`,
          note: 'Importacao de mercadorias.',
          createdAt: importedAt,
        });
      });
      if (chunk.length > 0) notifyFirestoreLocalCollectionsChanged(userId, ['products', 'stock_movements']);
      imported += chunk.length;
    }

    return imported;
  },

  async save(userId: string, input: ProductCatalogFormInput, productId?: string) {
    const product = sanitizeProduct(input);

    if (!product.description) {
      throw new Error('Descricao da mercadoria e obrigatoria.');
    }

    if (!Number.isFinite(product.salePrice) || product.salePrice < 0) {
      throw new Error('Valor de venda invalido.');
    }

    if ((product.variations || []).some((variation) => !Number.isFinite(variation.salePrice) || variation.salePrice < 0)) {
      throw new Error('Valor de variacao invalido.');
    }

    if (!Number.isFinite(product.stockQuantity || 0) || Number(product.stockQuantity || 0) < 0) {
      throw new Error('Quantidade em estoque invalida.');
    }

    if (!Number.isFinite(product.minStockQuantity || 0) || Number(product.minStockQuantity || 0) < 0) {
      throw new Error('Estoque minimo invalido.');
    }

    const now = new Date().toISOString();
    let id = productId || buildProductId(product.sourceCode, product.description, product.variation);
    let ref = productDocPath(userId, id);
    let data = {
      ...product,
      id,
      userId,
      updatedAt: now,
      ...(productId ? {} : { importedAt: now, createdAt: now }),
    };

    if (isFirestoreNetworkEnabled()) {
      await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(ref);
        const current = snapshot.exists() ? snapshot.data() as ProductCatalogItem : undefined;
        const stockChanged = !current
          || normalizeStockQuantity(current.stockQuantity) !== product.stockQuantity
          || JSON.stringify(current.variations || []) !== JSON.stringify(product.variations || []);

        if (!stockChanged) {
          transaction.set(ref, {
            ...data,
            ...(current?.stockMovementId ? { stockMovementId: current.stockMovementId } : {}),
          }, { merge: true });
          return;
        }

        const { stockQuantity, variations, ...otherFields } = data;
        applyStockOperation(transaction, userId, [{
          product: current ? { ...current, id, userId } : {
            ...data,
            importedAt: now,
            createdAt: now,
            stockQuantity: 0,
            variations: [],
          },
          productRef: ref,
          nextFields: {
            stockQuantity: normalizeStockQuantity(stockQuantity),
            variations: (variations || []) as ProductCatalogVariation[],
          },
          otherFields,
          create: !current,
        }], {
          type: current ? 'ajuste_manual' : 'entrada_manual',
          note: current ? 'Ajuste manual de estoque.' : 'Estoque inicial da mercadoria.',
          createdAt: now,
        });
      });
    } else {
      let snapshot = null;
      try {
        snapshot = await getDocFromCache(ref);
      } catch {
        // A missing cache entry cannot safely identify an existing remote product.
      }
      const current = snapshot?.exists() ? snapshot.data() as ProductCatalogItem : undefined;
      if (!current && productId) {
        throw new Error('Esta mercadoria ainda não está no cache local. Sincronize os produtos antes de editá-la offline.');
      }
      if (!current) {
        // A generated ID can exist on the server without being cached on this device.
        id = createOfflineProductId();
        ref = productDocPath(userId, id);
        data = { ...data, id };
      }

      const stockChanged = !current
        || normalizeStockQuantity(current.stockQuantity) !== product.stockQuantity
        || JSON.stringify(current.variations || []) !== JSON.stringify(product.variations || []);
      const batch = writeBatch(db);
      const replayWrites: FirestoreReplayMutation[] = [];

      if (!stockChanged) {
        const nextData = {
          ...data,
          ...(current?.stockMovementId ? { stockMovementId: current.stockMovementId } : {}),
        };
        batch.set(ref, nextData, { merge: true });
        replayWrites.push({
          operation: 'set',
          path: productReplayPath(userId, id),
          data: nextData,
          merge: true,
        });
      } else {
        const { stockQuantity, variations, ...otherFields } = data;
        const nextFields = {
          stockQuantity: normalizeStockQuantity(stockQuantity),
          variations: (variations || []) as ProductCatalogVariation[],
        };
        const operation = applyStockOperation(batch, userId, [{
          product: current ? { ...current, id, userId } : {
            ...data,
            importedAt: now,
            createdAt: now,
            stockQuantity: 0,
            variations: [],
          },
          productRef: ref,
          nextFields,
          otherFields,
          create: !current,
        }], {
          type: current ? 'ajuste_manual' : 'entrada_manual',
          note: current ? 'Ajuste manual de estoque.' : 'Estoque inicial da mercadoria.',
          createdAt: now,
        });
        if (!operation) throw new Error('Não foi possível preparar a movimentação local do estoque.');

        replayWrites.push({
          operation: current ? 'update' : 'set',
          path: productReplayPath(userId, id),
          data: {
            ...otherFields,
            ...nextFields,
            stockMovementId: operation.id,
            updatedAt: now,
          },
        });
        replayWrites.push({
          operation: 'set',
          path: ['users', userId, 'stock_movements', operation.id],
          data: operation.data as unknown as Record<string, unknown>,
        });
      }

      await queueFirestoreVoidWrite(
        () => batch.commit(),
        'Salvar mercadoria localmente',
        createFirestoreBatchReplayDescriptor(replayWrites)
      );
    }

    notifyFirestoreLocalCollectionsChanged(userId, ['products', 'stock_movements']);
    return id;
  },

  async delete(userId: string, productId: string, reason?: string) {
    const metadata = createSoftDeleteMetadata(userId, reason);
    await queueFirestoreVoidWrite(
      () => updateDoc(productDocPath(userId, productId), metadata),
      'Arquivar mercadoria',
      createFirestoreReplayDescriptor('update', productReplayPath(userId, productId), metadata)
    );
  },

  async deleteMany(userId: string, productIds: string[], reason?: string) {
    const uniqueProductIds = Array.from(new Set(productIds.filter(Boolean)));
    if (uniqueProductIds.length === 0) return 0;

    const metadata = createSoftDeleteMetadata(userId, reason);
    let deleted = 0;

    for (let start = 0; start < uniqueProductIds.length; start += 400) {
      const batch = writeBatch(db);
      const chunk = uniqueProductIds.slice(start, start + 400);
      const replayWrites: FirestoreReplayMutation[] = [];

      chunk.forEach((productId) => {
        batch.update(productDocPath(userId, productId), metadata);
        replayWrites.push({
          operation: 'update',
          path: productReplayPath(userId, productId),
          data: metadata,
        });
      });

      await queueFirestoreVoidWrite(
        () => batch.commit(),
        'Arquivar mercadorias',
        createFirestoreBatchReplayDescriptor(replayWrites)
      );
      deleted += chunk.length;
    }

    return deleted;
  },

  async restore(userId: string, productId: string) {
    const metadata = createRestoreMetadata();
    await queueFirestoreVoidWrite(
      () => updateDoc(productDocPath(userId, productId), metadata),
      'Restaurar mercadoria',
      createFirestoreReplayDescriptor('update', productReplayPath(userId, productId), metadata)
    );
  },

  async restoreMany(userId: string, productIds: string[]) {
    const uniqueProductIds = Array.from(new Set(productIds.filter(Boolean)));
    if (uniqueProductIds.length === 0) return 0;

    const metadata = createRestoreMetadata();
    let restored = 0;

    for (let start = 0; start < uniqueProductIds.length; start += 400) {
      const batch = writeBatch(db);
      const chunk = uniqueProductIds.slice(start, start + 400);
      const replayWrites: FirestoreReplayMutation[] = [];

      chunk.forEach((productId) => {
        batch.update(productDocPath(userId, productId), metadata);
        replayWrites.push({
          operation: 'update',
          path: productReplayPath(userId, productId),
          data: metadata,
        });
      });

      await queueFirestoreVoidWrite(
        () => batch.commit(),
        'Restaurar mercadorias',
        createFirestoreBatchReplayDescriptor(replayWrites)
      );
      restored += chunk.length;
    }

    return restored;
  },
};
