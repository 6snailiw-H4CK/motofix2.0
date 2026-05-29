import { addDoc, collection } from 'firebase/firestore';
import { db } from '../firebase';
import type { CashRegisterLaunch } from '../types';

export type CashRegisterWriteData = Omit<CashRegisterLaunch, 'id'>;

const cashLaunchCollectionPath = (userId: string) => collection(db, 'users', userId, 'cash_launches');

export const cashRegisterRepository = {
  async create(userId: string, data: CashRegisterWriteData) {
    const docRef = await addDoc(cashLaunchCollectionPath(userId), data);
    return docRef.id;
  },
};
