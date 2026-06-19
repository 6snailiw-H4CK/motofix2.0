import { collection, deleteDoc, doc, getDocs, getDocsFromCache, query, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { queueFirestoreVoidWrite, readFirestoreWithCacheFallback } from './firestoreOfflineQueue';

export type MaintenanceWriteData = Record<string, unknown>;

const maintenanceCollectionPath = (userId: string) => collection(db, 'users', userId, 'maintenances');

const maintenanceDocPath = (userId: string, maintenanceId: string) => doc(db, 'users', userId, 'maintenances', maintenanceId);

export const maintenanceRepository = {
  async create(userId: string, data: MaintenanceWriteData) {
    const docRef = doc(maintenanceCollectionPath(userId));
    await queueFirestoreVoidWrite(() => setDoc(docRef, data), 'Criar manutencao');
    return docRef.id;
  },

  async update(userId: string, maintenanceId: string, data: MaintenanceWriteData) {
    await queueFirestoreVoidWrite(
      () => updateDoc(maintenanceDocPath(userId, maintenanceId), data),
      'Atualizar manutencao'
    );
  },

  async remove(userId: string, maintenanceId: string) {
    await queueFirestoreVoidWrite(
      () => deleteDoc(maintenanceDocPath(userId, maintenanceId)),
      'Remover manutencao'
    );
  },

  async removeByClientId(userId: string, clientId: string) {
    const maintenanceQuery = query(
      maintenanceCollectionPath(userId),
      where('clientId', '==', clientId)
    );
    const snapshot = await readFirestoreWithCacheFallback(
      () => getDocs(maintenanceQuery),
      () => getDocsFromCache(maintenanceQuery),
      'Listar manutencoes do cliente'
    );

    if (snapshot.empty) {
      return 0;
    }

    const batch = writeBatch(db);
    snapshot.docs.forEach((maintenanceDoc) => {
      batch.delete(maintenanceDoc.ref);
    });
    await queueFirestoreVoidWrite(() => batch.commit(), 'Remover manutencoes do cliente');
    return snapshot.size;
  },
};
