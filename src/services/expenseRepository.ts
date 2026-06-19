import { collection, deleteDoc, doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { queueFirestoreVoidWrite } from './firestoreOfflineQueue';

export type ExpenseWriteData = Record<string, unknown>;

const expenseCollectionPath = (userId: string) => collection(db, 'users', userId, 'expenses');

const expenseDocPath = (userId: string, expenseId: string) => doc(db, 'users', userId, 'expenses', expenseId);

export const expenseRepository = {
  async create(userId: string, data: ExpenseWriteData) {
    const docRef = doc(expenseCollectionPath(userId));
    await queueFirestoreVoidWrite(() => setDoc(docRef, data), 'Criar gasto');
    return docRef.id;
  },

  async remove(userId: string, expenseId: string) {
    await queueFirestoreVoidWrite(() => deleteDoc(expenseDocPath(userId, expenseId)), 'Remover gasto');
  },
};
