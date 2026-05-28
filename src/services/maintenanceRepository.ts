import { addDoc, collection, deleteDoc, doc, getDocs, query, updateDoc, where, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';

export type MaintenanceWriteData = Record<string, unknown>;

const maintenanceCollectionPath = (userId: string) => collection(db, 'users', userId, 'maintenances');

const maintenanceDocPath = (userId: string, maintenanceId: string) => doc(db, 'users', userId, 'maintenances', maintenanceId);

export const maintenanceRepository = {
  async create(userId: string, data: MaintenanceWriteData) {
    const docRef = await addDoc(maintenanceCollectionPath(userId), data);
    return docRef.id;
  },

  async update(userId: string, maintenanceId: string, data: MaintenanceWriteData) {
    await updateDoc(maintenanceDocPath(userId, maintenanceId), data);
  },

  async remove(userId: string, maintenanceId: string) {
    await deleteDoc(maintenanceDocPath(userId, maintenanceId));
  },

  async removeByClientId(userId: string, clientId: string) {
    const snapshot = await getDocs(query(
      maintenanceCollectionPath(userId),
      where('clientId', '==', clientId)
    ));

    if (snapshot.empty) {
      return 0;
    }

    const batch = writeBatch(db);
    snapshot.docs.forEach((maintenanceDoc) => {
      batch.delete(maintenanceDoc.ref);
    });
    await batch.commit();
    return snapshot.size;
  },
};
