import { collection, doc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { createFirestoreReplayDescriptor, queueFirestoreVoidWrite } from './firestoreOfflineQueue';
import { createRestoreMetadata, createSoftDeleteMetadata } from './softDelete';

export type ExpenseWriteData = Record<string, unknown>;

const expenseCollectionPath = (userId: string) => collection(db, 'users', userId, 'expenses');
const expenseDocPath = (userId: string, expenseId: string) => doc(db, 'users', userId, 'expenses', expenseId);
const expenseReplayPath = (userId: string, expenseId: string) => ['users', userId, 'expenses', expenseId];

export const expenseRepository = {
  async create(userId: string, data: ExpenseWriteData) {
    const docRef = doc(expenseCollectionPath(userId));
    await queueFirestoreVoidWrite(
      () => setDoc(docRef, data),
      'Criar gasto',
      createFirestoreReplayDescriptor('set', expenseReplayPath(userId, docRef.id), data)
    );
    return docRef.id;
  },

  async remove(userId: string, expenseId: string, reason?: string) {
    const metadata = createSoftDeleteMetadata(userId, reason);
    await queueFirestoreVoidWrite(
      () => updateDoc(expenseDocPath(userId, expenseId), metadata),
      'Arquivar gasto',
      createFirestoreReplayDescriptor('update', expenseReplayPath(userId, expenseId), metadata)
    );
  },

  async restore(userId: string, expenseId: string) {
    const metadata = createRestoreMetadata();
    await queueFirestoreVoidWrite(
      () => updateDoc(expenseDocPath(userId, expenseId), metadata),
      'Restaurar gasto',
      createFirestoreReplayDescriptor('update', expenseReplayPath(userId, expenseId), metadata)
    );
  },
};
