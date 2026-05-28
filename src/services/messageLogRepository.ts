import { deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';

const messageLogDocPath = (userId: string, messageLogId: string) => (
  doc(db, 'users', userId, 'message_logs', messageLogId)
);

export const messageLogRepository = {
  async remove(userId: string, messageLogId: string) {
    await deleteDoc(messageLogDocPath(userId, messageLogId));
  },
};
