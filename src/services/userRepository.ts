import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

export type UserWriteData = Record<string, unknown>;

const userDocPath = (userId: string) => doc(db, 'users', userId);

export const userRepository = {
  async update(userId: string, data: UserWriteData) {
    await updateDoc(userDocPath(userId), data);
  },
};
