import { addDoc, collection, deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

export type ClientWriteData = Record<string, unknown>;

const clientCollectionPath = (userId: string) => collection(db, 'users', userId, 'clients');

const clientDocPath = (userId: string, clientId: string) => doc(db, 'users', userId, 'clients', clientId);

export const clientRepository = {
  async create(userId: string, data: ClientWriteData) {
    const docRef = await addDoc(clientCollectionPath(userId), data);
    return docRef.id;
  },

  async update(userId: string, clientId: string, data: ClientWriteData) {
    await updateDoc(clientDocPath(userId, clientId), data);
  },

  async setWithId(userId: string, clientId: string, data: ClientWriteData) {
    await setDoc(clientDocPath(userId, clientId), data, { merge: true });
  },

  async remove(userId: string, clientId: string) {
    await deleteDoc(clientDocPath(userId, clientId));
  },
};
