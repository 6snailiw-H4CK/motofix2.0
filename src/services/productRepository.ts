import { collection, doc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import type { ProductCatalogItem } from '../types';

type ProductWriteData = Omit<ProductCatalogItem, 'id' | 'userId' | 'importedAt'>;

const productCollectionPath = (userId: string) => collection(db, 'users', userId, 'products');

export const productRepository = {
  async upsertMany(userId: string, products: ProductWriteData[]) {
    const importedAt = new Date().toISOString();
    let imported = 0;

    for (let start = 0; start < products.length; start += 400) {
      const batch = writeBatch(db);
      const chunk = products.slice(start, start + 400);

      chunk.forEach((product) => {
        const productId = product.sourceCode
          ? `produto-${String(product.sourceCode).replace(/[^a-zA-Z0-9_-]/g, '-')}`
          : `produto-${crypto.randomUUID()}`;
        const ref = doc(productCollectionPath(userId), productId);
        batch.set(ref, {
          ...product,
          id: productId,
          userId,
          importedAt,
        }, { merge: true });
      });

      await batch.commit();
      imported += chunk.length;
    }

    return imported;
  },
};
