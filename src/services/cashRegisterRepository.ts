import { collection, deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { CashRegisterLaunch } from '../types';
import { queueFirestoreVoidWrite } from './firestoreOfflineQueue';

export type CashRegisterWriteData = Omit<CashRegisterLaunch, 'id'>;
export type CashRegisterUpdateData = Partial<Omit<CashRegisterLaunch, 'id' | 'orderNumber' | 'userId' | 'createdAt'>>;

const cashLaunchCollectionPath = (userId: string) => collection(db, 'users', userId, 'cash_launches');

export const cashRegisterRepository = {
  async create(userId: string, data: CashRegisterWriteData) {
    const docRef = doc(cashLaunchCollectionPath(userId));
    await queueFirestoreVoidWrite(() => setDoc(docRef, data), 'Criar lancamento de caixa');
    return docRef.id;
  },

  async update(userId: string, launchId: string, data: CashRegisterUpdateData) {
    const docRef = doc(db, 'users', userId, 'cash_launches', launchId);
    await queueFirestoreVoidWrite(() => updateDoc(docRef, data), 'Atualizar lancamento de caixa');
  },

  async delete(userId: string, launchId: string) {
    const docRef = doc(db, 'users', userId, 'cash_launches', launchId);
    await queueFirestoreVoidWrite(() => deleteDoc(docRef), 'Remover lancamento de caixa');
  },
};
