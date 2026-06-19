import { collection, deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { queueFirestoreVoidWrite } from './firestoreOfflineQueue';

export type WarrantyWriteData = Record<string, unknown>;

const warrantyCollectionPath = (userId: string) => collection(db, 'users', userId, 'warranties');

const warrantyDocPath = (userId: string, warrantyId: string) => doc(db, 'users', userId, 'warranties', warrantyId);

export const warrantyRepository = {
  async create(userId: string, data: WarrantyWriteData) {
    const docRef = doc(warrantyCollectionPath(userId));
    await queueFirestoreVoidWrite(() => setDoc(docRef, data), 'Criar garantia');
    return docRef.id;
  },

  async update(userId: string, warrantyId: string, data: WarrantyWriteData) {
    await queueFirestoreVoidWrite(
      () => updateDoc(warrantyDocPath(userId, warrantyId), data),
      'Atualizar garantia'
    );
  },

  async remove(userId: string, warrantyId: string) {
    await queueFirestoreVoidWrite(() => deleteDoc(warrantyDocPath(userId, warrantyId)), 'Remover garantia');
  },
};
