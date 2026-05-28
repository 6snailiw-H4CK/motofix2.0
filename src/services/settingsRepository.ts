import { arrayUnion, doc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { Settings } from '../types';

export type SettingsWriteData = Partial<Settings> & Record<string, unknown>;

const settingsConfigDocPath = (userId: string) => doc(db, 'users', userId, 'settings', 'config');

export const settingsRepository = {
  async saveConfig(userId: string, data: SettingsWriteData) {
    await setDoc(settingsConfigDocPath(userId), data, { merge: true });
  },

  async addServiceType(userId: string, serviceType: string) {
    await updateDoc(settingsConfigDocPath(userId), {
      serviceTypes: arrayUnion(serviceType),
    });
  },
};
