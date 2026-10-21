import { collection, doc, setDoc, updateDoc } from 'firebase/firestore';
import { db, waitForPendingWrites } from '../firebase';
import {
  confirmPendingWriteCheckpointRemotely,
  createFirestoreReplayDescriptor,
  queueFirestoreVoidWrite,
  queueFirestoreWrite,
} from './firestoreOfflineQueue';
import { createRestoreMetadata, createSoftDeleteMetadata } from './softDelete';
import { withFirestoreSyncTimestamp } from './firestoreSyncFields';
import { isFirestoreNetworkEnabled } from './firestoreNetworkControl';

export type WarrantyWriteData = Record<string, unknown>;

const warrantyCollectionPath = (userId: string) => collection(db, 'users', userId, 'warranties');
const warrantyDocPath = (userId: string, warrantyId: string) => doc(db, 'users', userId, 'warranties', warrantyId);
const warrantyReplayPath = (userId: string, warrantyId: string) => ['users', userId, 'warranties', warrantyId];

export const warrantyRepository = {
  async create(userId: string, data: WarrantyWriteData) {
    const docRef = doc(warrantyCollectionPath(userId));
    const writeData = withFirestoreSyncTimestamp(data);
    const replay = createFirestoreReplayDescriptor('set', warrantyReplayPath(userId, docRef.id), writeData);
    const queuedWrite = await queueFirestoreWrite(
      () => setDoc(docRef, writeData),
      'Criar garantia',
      replay
    );
    const remoteConfirmed = isFirestoreNetworkEnabled()
      ? await confirmPendingWriteCheckpointRemotely(
        [queuedWrite.writeId],
        () => waitForPendingWrites(db)
      )
      : false;

    return { id: docRef.id, remoteConfirmed };
  },

  async update(userId: string, warrantyId: string, data: WarrantyWriteData) {
    const writeData = withFirestoreSyncTimestamp(data);
    await queueFirestoreVoidWrite(
      () => updateDoc(warrantyDocPath(userId, warrantyId), writeData),
      'Atualizar garantia',
      createFirestoreReplayDescriptor('update', warrantyReplayPath(userId, warrantyId), writeData)
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
