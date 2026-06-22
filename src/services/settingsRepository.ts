import { arrayUnion, doc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { Settings } from '../types';
import { createFirestoreReplayDescriptor, queueFirestoreVoidWrite } from './firestoreOfflineQueue';

export type SettingsWriteData = Partial<Settings> & Record<string, unknown>;

const settingsConfigDocPath = (userId: string) => doc(db, 'users', userId, 'settings', 'config');

export const settingsRepository = {
  async saveConfig(userId: string, data: SettingsWriteData) {
    await queueFirestoreVoidWrite(
      () => setDoc(settingsConfigDocPath(userId), data, { merge: true }),
      'Salvar configuracoes',
      createFirestoreReplayDescriptor('set', ['users', userId, 'settings', 'config'], { ...data }, true)
    );
  },

  async addServiceType(userId: string, serviceType: string) {
    await queueFirestoreVoidWrite(
      () => updateDoc(settingsConfigDocPath(userId), {
        serviceTypes: arrayUnion(serviceType),
      }),
      'Adicionar tipo de servico'
    );
  },
};
