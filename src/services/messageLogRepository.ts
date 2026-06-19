import { deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { queueFirestoreVoidWrite } from './firestoreOfflineQueue';

const messageLogDocPath = (userId: string, messageLogId: string) => (
  doc(db, 'users', userId, 'message_logs', messageLogId)
);

export const messageLogRepository = {
  async remove(userId: string, messageLogId: string) {
    await queueFirestoreVoidWrite(
      () => deleteDoc(messageLogDocPath(userId, messageLogId)),
      'Remover log de mensagem'
    );
  },
};
