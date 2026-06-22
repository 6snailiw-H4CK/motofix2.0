import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { createFirestoreReplayDescriptor, queueFirestoreVoidWrite } from './firestoreOfflineQueue';

export type UserWriteData = Record<string, unknown>;

const userDocPath = (userId: string) => doc(db, 'users', userId);

export const userRepository = {
  async update(userId: string, data: UserWriteData) {
    await queueFirestoreVoidWrite(
      () => updateDoc(userDocPath(userId), data),
      'Atualizar usuario',
      createFirestoreReplayDescriptor('update', ['users', userId], data)
    );
  },
};
