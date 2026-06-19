import { collection, deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { queueFirestoreVoidWrite } from './firestoreOfflineQueue';

export type ClientWriteData = Record<string, unknown>;

const clientCollectionPath = (userId: string) => collection(db, 'users', userId, 'clients');

const clientDocPath = (userId: string, clientId: string) => doc(db, 'users', userId, 'clients', clientId);

export const clientRepository = {
  async create(userId: string, data: ClientWriteData) {
    const docRef = doc(clientCollectionPath(userId));
    await queueFirestoreVoidWrite(() => setDoc(docRef, data), 'Criar cliente');
    return docRef.id;
  },

  async update(userId: string, clientId: string, data: ClientWriteData) {
    await queueFirestoreVoidWrite(() => updateDoc(clientDocPath(userId, clientId), data), 'Atualizar cliente');
  },

  async setWithId(userId: string, clientId: string, data: ClientWriteData) {
    await queueFirestoreVoidWrite(
      () => setDoc(clientDocPath(userId, clientId), data, { merge: true }),
      'Salvar cliente com ID'
    );
  },

  async remove(userId: string, clientId: string) {
    await queueFirestoreVoidWrite(() => deleteDoc(clientDocPath(userId, clientId)), 'Remover cliente');
  },
};
