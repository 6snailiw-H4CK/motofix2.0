import { collection, doc, setDoc, updateDoc } from 'firebase/firestore';
import { db, waitForPendingWrites } from '../firebase';
import {
  confirmPendingWriteCheckpointRemotely,
  createFirestoreReplayDescriptor,
  queueFirestoreVoidWrite,
  queueFirestoreWrite,
} from './firestoreOfflineQueue';
import { createRestoreMetadata, createSoftDeleteMetadata } from './softDelete';

export type WarrantyWriteData = Record<string, unknown>;

const warrantyCollectionPath = (userId: string) => collection(db, 'users', userId, 'warranties');
const warrantyDocPath = (userId: string, warrantyId: string) => doc(db, 'users', userId, 'warranties', warrantyId);
const warrantyReplayPath = (userId: string, warrantyId: string) => ['users', userId, 'warranties', warrantyId];

export const warrantyRepository = {
  async create(userId: string, data: WarrantyWriteData) {
    const docRef = doc(warrantyCollectionPath(userId));
    const replay = createFirestoreReplayDescriptor('set', warrantyReplayPath(userId, docRef.id), data);
    const queuedWrite = await queueFirestoreWrite(
      () => setDoc(docRef, data),
      'Criar garantia',
      replay
    );
    const remoteConfirmed = await confirmPendingWriteCheckpointRemotely(
      [queuedWrite.writeId],
      () => waitForPendingWrites(db)
    );

    return { id: docRef.id, remoteConfirmed };
  },

  async update(userId: string, warrantyId: string, data: WarrantyWriteData) {
    await queueFirestoreVoidWrite(
      () => updateDoc(warrantyDocPath(userId, warrantyId), data),
      'Atualizar garantia',
      createFirestoreReplayDescriptor('update', warrantyReplayPath(userId, warrantyId), data)
    );
  },

  async remove(userId: string, warrantyId: string, reason?: string) {
    const metadata = createSoftDeleteMetadata(userId, reason);
    await queueFirestoreVoidWrite(
      () => updateDoc(warrantyDocPath(userId, warrantyId), metadata),
      'Arquivar garantia',
      createFirestoreReplayDescriptor('update', warrantyReplayPath(userId, warrantyId), metadata)
    );
  },

  async restore(userId: string, warrantyId: string) {
    const metadata = createRestoreMetadata();
    await queueFirestoreVoidWrite(
      () => updateDoc(warrantyDocPath(userId, warrantyId), metadata),
      'Restaurar garantia',
      createFirestoreReplayDescriptor('update', warrantyReplayPath(userId, warrantyId), metadata)
    );
  },
};
