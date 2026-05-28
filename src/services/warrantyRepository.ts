import { addDoc, collection, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

export type WarrantyWriteData = Record<string, unknown>;

const warrantyCollectionPath = (userId: string) => collection(db, 'users', userId, 'warranties');

const warrantyDocPath = (userId: string, warrantyId: string) => doc(db, 'users', userId, 'warranties', warrantyId);

export const warrantyRepository = {
  async create(userId: string, data: WarrantyWriteData) {
    const docRef = await addDoc(warrantyCollectionPath(userId), data);
    return docRef.id;
  },

  async update(userId: string, warrantyId: string, data: WarrantyWriteData) {
    await updateDoc(warrantyDocPath(userId, warrantyId), data);
  },

  async remove(userId: string, warrantyId: string) {
    await deleteDoc(warrantyDocPath(userId, warrantyId));
  },
};
