import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { createFirestoreReplayDescriptor, queueFirestoreVoidWrite } from './firestoreOfflineQueue';
import { createRestoreMetadata, createSoftDeleteMetadata } from './softDelete';

const messageLogDocPath = (userId: string, messageLogId: string) => doc(db, 'users', userId, 'message_logs', messageLogId);
const messageLogReplayPath = (userId: string, messageLogId: string) => ['users', userId, 'message_logs', messageLogId];

export const messageLogRepository = {
  async remove(userId: string, messageLogId: string, reason?: string) {
    const metadata = createSoftDeleteMetadata(userId, reason);
    await queueFirestoreVoidWrite(
      () => updateDoc(messageLogDocPath(userId, messageLogId), metadata),
      'Arquivar log de mensagem',
      createFirestoreReplayDescriptor('update', messageLogReplayPath(userId, messageLogId), metadata)
    );
  },

  async restore(userId: string, messageLogId: string) {
    const metadata = createRestoreMetadata();
    await queueFirestoreVoidWrite(
      () => updateDoc(messageLogDocPath(userId, messageLogId), metadata),
      'Restaurar log de mensagem',
      createFirestoreReplayDescriptor('update', messageLogReplayPath(userId, messageLogId), metadata)
    );
  },
};
