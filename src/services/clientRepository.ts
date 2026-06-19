import { collection, deleteDoc, doc, getDocs, getDocsFromCache, query, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { queueFirestoreVoidWrite, readFirestoreWithCacheFallback } from './firestoreOfflineQueue';

export type ClientWriteData = Record<string, unknown>;

const clientCollectionPath = (userId: string) => collection(db, 'users', userId, 'clients');

const clientDocPath = (userId: string, clientId: string) => doc(db, 'users', userId, 'clients', clientId);

const maintenanceCollectionPath = (userId: string) => collection(db, 'users', userId, 'maintenances');

const SAFE_DELETE_BATCH_LIMIT = 450;

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

  async removeWithMaintenances(userId: string, clientId: string) {
    const maintenanceQuery = query(
      maintenanceCollectionPath(userId),
      where('clientId', '==', clientId)
    );
    const snapshot = await readFirestoreWithCacheFallback(
      () => getDocs(maintenanceQuery),
      () => getDocsFromCache(maintenanceQuery),
      'Listar manutencoes para excluir cliente'
    );

    if (snapshot.size >= SAFE_DELETE_BATCH_LIMIT) {
      throw new Error('Cliente possui historico grande demais para exclusao segura automatica.');
    }

    const batch = writeBatch(db);
    snapshot.docs.forEach((maintenanceDoc) => {
      batch.delete(maintenanceDoc.ref);
    });
    batch.delete(clientDocPath(userId, clientId));

    await queueFirestoreVoidWrite(() => batch.commit(), 'Remover cliente e historico');
    return snapshot.size;
  },
};
