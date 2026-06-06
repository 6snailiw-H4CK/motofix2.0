import { addDoc, collection, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { CashRegisterLaunch } from '../types';

export type CashRegisterWriteData = Omit<CashRegisterLaunch, 'id'>;
export type CashRegisterUpdateData = Partial<Omit<CashRegisterLaunch, 'id' | 'orderNumber' | 'userId' | 'createdAt'>>;

const cashLaunchCollectionPath = (userId: string) => collection(db, 'users', userId, 'cash_launches');

export const cashRegisterRepository = {
  async create(userId: string, data: CashRegisterWriteData) {
    const docRef = await addDoc(cashLaunchCollectionPath(userId), data);
    return docRef.id;
  },

  async update(userId: string, launchId: string, data: CashRegisterUpdateData) {
    const docRef = doc(db, 'users', userId, 'cash_launches', launchId);
    await updateDoc(docRef, data);
  },

  async delete(userId: string, launchId: string) {
    const docRef = doc(db, 'users', userId, 'cash_launches', launchId);
    await deleteDoc(docRef);
  },
};
