import { collection, doc, getDocs, getDocsFromCache, query, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { createFirestoreReplayDescriptor, queueFirestoreVoidWrite, readFirestoreWithCacheFallback } from './firestoreOfflineQueue';
import { createRestoreMetadata, createSoftDeleteMetadata, isSoftDeleted } from './softDelete';

export type MaintenanceWriteData = Record<string, unknown>;

const maintenanceCollectionPath = (userId: string) => collection(db, 'users', userId, 'maintenances');
const maintenanceDocPath = (userId: string, maintenanceId: string) => doc(db, 'users', userId, 'maintenances', maintenanceId);
const maintenanceReplayPath = (userId: string, maintenanceId: string) => ['users', userId, 'maintenances', maintenanceId];

export const maintenanceRepository = {
  async create(userId: string, data: MaintenanceWriteData) {
    const docRef = doc(maintenanceCollectionPath(userId));
    await queueFirestoreVoidWrite(
      () => setDoc(docRef, data),
      'Criar manutencao',
      createFirestoreReplayDescriptor('set', maintenanceReplayPath(userId, docRef.id), data)
    );
    return docRef.id;
  },

  async update(userId: string, maintenanceId: string, data: MaintenanceWriteData) {
    await queueFirestoreVoidWrite(
      () => updateDoc(maintenanceDocPath(userId, maintenanceId), data),
      'Atualizar manutencao',
      createFirestoreReplayDescriptor('update', maintenanceReplayPath(userId, maintenanceId), data)
    );
  },

  async remove(userId: string, maintenanceId: string, reason?: string) {
    const metadata = createSoftDeleteMetadata(userId, reason);
    await queueFirestoreVoidWrite(
      () => updateDoc(maintenanceDocPath(userId, maintenanceId), metadata),
      'Arquivar manutencao',
      createFirestoreReplayDescriptor('update', maintenanceReplayPath(userId, maintenanceId), metadata)
    );
  },

  async restore(userId: string, maintenanceId: string) {
    const metadata = createRestoreMetadata();
    await queueFirestoreVoidWrite(
      () => updateDoc(maintenanceDocPath(userId, maintenanceId), metadata),
      'Restaurar manutencao',
      createFirestoreReplayDescriptor('update', maintenanceReplayPath(userId, maintenanceId), metadata)
    );
  },

  async removeByClientId(userId: string, clientId: string, reason?: string) {
    const maintenanceQuery = query(maintenanceCollectionPath(userId), where('clientId', '==', clientId));
    const snapshot = await readFirestoreWithCacheFallback(
      () => getDocs(maintenanceQuery),
      () => getDocsFromCache(maintenanceQuery),
      'Listar manutencoes do cliente'
    );
    if (snapshot.empty) return 0;
    const activeMaintenances = snapshot.docs.filter((maintenanceDoc) => !isSoftDeleted(maintenanceDoc.data()));
    if (activeMaintenances.length === 0) return 0;

    const metadata = createSoftDeleteMetadata(userId, reason || 'Historico do cliente arquivado');
    const batch = writeBatch(db);
    activeMaintenances.forEach((maintenanceDoc) => batch.update(maintenanceDoc.ref, metadata));
    await queueFirestoreVoidWrite(() => batch.commit(), 'Arquivar manutencoes do cliente');
    return activeMaintenances.length;
  },
};
