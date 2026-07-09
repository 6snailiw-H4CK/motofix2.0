import { collection, doc, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import type { ProductCatalogFormInput, ProductCatalogItem } from '../types';
import {
  createFirestoreBatchReplayDescriptor,
  createFirestoreReplayDescriptor,
  queueFirestoreVoidWrite,
  type FirestoreReplayMutation
} from './firestoreOfflineQueue';
import { createRestoreMetadata, createSoftDeleteMetadata } from './softDelete';

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

const sanitizeProduct = (input: ProductCatalogFormInput): ProductCatalogFormInput => {
  const variations = (input.variations || [])
    .map((variation, index) => {
      const name = String(variation.name || '').replace(/\s+/g, ' ').trim();
      if (!name) return null;

      return {
        id: String(variation.id || makeVariationId(name, index)).trim(),
        name,
        salePrice: Number(variation.salePrice || 0),
      };
    })
    .filter((variation): variation is NonNullable<typeof variation> => Boolean(variation));

  return {
    sourceCode: String(input.sourceCode || '').trim(),
    description: String(input.description || '').replace(/\s+/g, ' ').trim(),
    variation: String(input.variation || '').replace(/\s+/g, ' ').trim(),
    variations,
    ncm: String(input.ncm || '').replace(/\D/g, '').trim(),
    salePrice: Number(input.salePrice || 0),
  };
};

export const productRepository = {
  async upsertMany(userId: string, products: ProductWriteData[]) {
    const importedAt = new Date().toISOString();
    let imported = 0;

    for (let start = 0; start < products.length; start += 400) {
      const batch = writeBatch(db);
      const chunk = products.slice(start, start + 400);
      const replayWrites: FirestoreReplayMutation[] = [];

      chunk.forEach((product) => {
        const productId = buildProductId(product.sourceCode, product.description, product.variation);
        const ref = doc(productCollectionPath(userId), productId);
        const data = {
          ...product,
          id: productId,
          userId,
          importedAt,
          updatedAt: importedAt,
        };
        batch.set(ref, data, { merge: true });
        replayWrites.push({
          operation: 'set',
          path: productReplayPath(userId, productId),
          data,
          merge: true,
        });
      });

      await queueFirestoreVoidWrite(
        () => batch.commit(),
        'Importar mercadorias',
        createFirestoreBatchReplayDescriptor(replayWrites)
      );
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

    const now = new Date().toISOString();
    const id = productId || buildProductId(product.sourceCode, product.description, product.variation);
    const ref = productDocPath(userId, id);

    const data = {
      ...product,
      id,
      userId,
      updatedAt: now,
      ...(productId ? {} : { importedAt: now, createdAt: now }),
    };
    await queueFirestoreVoidWrite(
      () => setDoc(ref, data, { merge: true }),
      'Salvar mercadoria',
      createFirestoreReplayDescriptor('set', productReplayPath(userId, id), data, true)
    );

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
