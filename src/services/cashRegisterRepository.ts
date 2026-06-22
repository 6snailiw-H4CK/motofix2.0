import { collection, doc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { CashRegisterLaunch } from '../types';
import { createFirestoreReplayDescriptor, queueFirestoreVoidWrite } from './firestoreOfflineQueue';
import { createRestoreMetadata, createSoftDeleteMetadata } from './softDelete';
import { validateCashLaunchData } from './cashRegisterValidation';

export type CashRegisterWriteData = Omit<CashRegisterLaunch, 'id'>;
export type CashRegisterUpdateData = Partial<Omit<CashRegisterLaunch, 'id' | 'orderNumber' | 'userId' | 'createdAt'>>;

const cashLaunchCollectionPath = (userId: string) => collection(db, 'users', userId, 'cash_launches');
const cashLaunchDocPath = (userId: string, launchId: string) => doc(db, 'users', userId, 'cash_launches', launchId);
const cashLaunchReplayPath = (userId: string, launchId: string) => ['users', userId, 'cash_launches', launchId];

export const cashRegisterRepository = {
  async create(userId: string, data: CashRegisterWriteData) {
    validateCashLaunchData(data);
    const docRef = doc(cashLaunchCollectionPath(userId));
    await queueFirestoreVoidWrite(
      () => setDoc(docRef, data),
      'Criar lancamento de caixa',
      createFirestoreReplayDescriptor('set', cashLaunchReplayPath(userId, docRef.id), { ...data })
    );
    return docRef.id;
  },

  async update(userId: string, launchId: string, data: CashRegisterUpdateData) {
    validateCashLaunchData(data as Partial<CashRegisterLaunch>);
    await queueFirestoreVoidWrite(
      () => updateDoc(cashLaunchDocPath(userId, launchId), data),
      'Atualizar lancamento de caixa',
      createFirestoreReplayDescriptor('update', cashLaunchReplayPath(userId, launchId), { ...data })
    );
  },

  async delete(userId: string, launchId: string, reason?: string) {
    const metadata = createSoftDeleteMetadata(userId, reason);
    await queueFirestoreVoidWrite(
      () => updateDoc(cashLaunchDocPath(userId, launchId), metadata),
      'Arquivar lancamento de caixa',
      createFirestoreReplayDescriptor('update', cashLaunchReplayPath(userId, launchId), metadata)
    );
  },

  async restore(userId: string, launchId: string) {
    const metadata = createRestoreMetadata();
    await queueFirestoreVoidWrite(
      () => updateDoc(cashLaunchDocPath(userId, launchId), metadata),
      'Restaurar lancamento de caixa',
      createFirestoreReplayDescriptor('update', cashLaunchReplayPath(userId, launchId), metadata)
    );
  },
};
