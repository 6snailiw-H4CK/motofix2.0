import { collection, doc, getDoc, getDocFromCache, getDocs, getDocsFromCache, query, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { createFirestoreReplayDescriptor, queueFirestoreVoidWrite, readFirestoreWithCacheFallback } from './firestoreOfflineQueue';
import { createRestoreMetadata, createSoftDeleteMetadata, isSoftDeleted } from './softDelete';

export type ClientWriteData = Record<string, unknown>;

const clientCollectionPath = (userId: string) => collection(db, 'users', userId, 'clients');
const clientDocPath = (userId: string, clientId: string) => doc(db, 'users', userId, 'clients', clientId);
const clientReplayPath = (userId: string, clientId: string) => ['users', userId, 'clients', clientId];
const maintenanceCollectionPath = (userId: string) => collection(db, 'users', userId, 'maintenances');
const SAFE_BATCH_LIMIT = 450;

const getClientMaintenances = (userId: string, clientId: string) => {
  const maintenanceQuery = query(maintenanceCollectionPath(userId), where('clientId', '==', clientId));
  return readFirestoreWithCacheFallback(
    () => getDocs(maintenanceQuery),
    () => getDocsFromCache(maintenanceQuery),
    'Listar manutencoes vinculadas ao cliente'
  );
};

export const clientRepository = {
  async create(userId: string, data: ClientWriteData) {
    const docRef = doc(clientCollectionPath(userId));
    await queueFirestoreVoidWrite(
      () => setDoc(docRef, data),
      'Criar cliente',
      createFirestoreReplayDescriptor('set', clientReplayPath(userId, docRef.id), data)
    );
    return docRef.id;
  },

  async update(userId: string, clientId: string, data: ClientWriteData) {
    await queueFirestoreVoidWrite(
      () => updateDoc(clientDocPath(userId, clientId), data),
      'Atualizar cliente',
      createFirestoreReplayDescriptor('update', clientReplayPath(userId, clientId), data)
    );
  },

  async setWithId(userId: string, clientId: string, data: ClientWriteData) {
    await queueFirestoreVoidWrite(
      () => setDoc(clientDocPath(userId, clientId), data, { merge: true }),
      'Salvar cliente com ID',
      createFirestoreReplayDescriptor('set', clientReplayPath(userId, clientId), data, true)
    );
  },

  async remove(userId: string, clientId: string, reason?: string) {
    const metadata = createSoftDeleteMetadata(userId, reason);
    await queueFirestoreVoidWrite(
      () => updateDoc(clientDocPath(userId, clientId), metadata),
      'Arquivar cliente',
      createFirestoreReplayDescriptor('update', clientReplayPath(userId, clientId), metadata)
    );
  },

  async removeWithMaintenances(userId: string, clientId: string, reason?: string) {
    const snapshot = await getClientMaintenances(userId, clientId);
    const activeMaintenances = snapshot.docs.filter((maintenanceDoc) => !isSoftDeleted(maintenanceDoc.data()));
    if (activeMaintenances.length >= SAFE_BATCH_LIMIT) {
      throw new Error('Cliente possui historico grande demais para arquivamento seguro automatico. Exporte um backup antes.');
    }

    const metadata = createSoftDeleteMetadata(userId, reason || 'Cliente e historico arquivados pelo usuario');
    const batch = writeBatch(db);
    activeMaintenances.forEach((maintenanceDoc) => batch.update(maintenanceDoc.ref, metadata));
    batch.update(clientDocPath(userId, clientId), metadata);
    await queueFirestoreVoidWrite(() => batch.commit(), 'Arquivar cliente e historico');
    return activeMaintenances.length;
  },

  async restoreWithMaintenances(userId: string, clientId: string) {
    const clientRef = clientDocPath(userId, clientId);
    const [snapshot, clientSnapshot] = await Promise.all([
      getClientMaintenances(userId, clientId),
      readFirestoreWithCacheFallback(
        () => getDoc(clientRef),
        () => getDocFromCache(clientRef),
        'Carregar cliente para restauracao'
      ),
    ]);
    if (!clientSnapshot.exists()) throw new Error('Cliente nao encontrado para restauracao.');
    const deletionTimestamp = clientSnapshot.data().deletedAt;
    if (!deletionTimestamp) return 0;

    const sameDeletionBatch = snapshot.docs.filter(
      (maintenanceDoc) => maintenanceDoc.data().deletedAt === deletionTimestamp
    );
    if (sameDeletionBatch.length >= SAFE_BATCH_LIMIT) {
      throw new Error('Cliente possui historico grande demais para restauracao automatica.');
    }

    const metadata = createRestoreMetadata();
    const batch = writeBatch(db);
    sameDeletionBatch.forEach((maintenanceDoc) => batch.update(maintenanceDoc.ref, metadata));
    batch.update(clientRef, metadata);
    await queueFirestoreVoidWrite(() => batch.commit(), 'Restaurar cliente e historico');
    return sameDeletionBatch.length;
  },
};
