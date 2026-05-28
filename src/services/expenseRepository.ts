import { addDoc, collection, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';

export type ExpenseWriteData = Record<string, unknown>;

const expenseCollectionPath = (userId: string) => collection(db, 'users', userId, 'expenses');

const expenseDocPath = (userId: string, expenseId: string) => doc(db, 'users', userId, 'expenses', expenseId);

export const expenseRepository = {
  async create(userId: string, data: ExpenseWriteData) {
    const docRef = await addDoc(expenseCollectionPath(userId), data);
    return docRef.id;
  },

  async remove(userId: string, expenseId: string) {
    await deleteDoc(expenseDocPath(userId, expenseId));
  },
};
