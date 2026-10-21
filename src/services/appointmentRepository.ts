import { collection, doc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { createFirestoreReplayDescriptor, queueFirestoreVoidWrite } from './firestoreOfflineQueue';
import { withFirestoreSyncTimestamp } from './firestoreSyncFields';
import { createRestoreMetadata, createSoftDeleteMetadata } from './softDelete';

export type AppointmentWriteData = Record<string, unknown>;

const appointmentCollectionPath = (userId: string) => collection(db, 'users', userId, 'appointments');
const appointmentDocPath = (userId: string, appointmentId: string) => doc(db, 'users', userId, 'appointments', appointmentId);
const appointmentReplayPath = (userId: string, appointmentId: string) => ['users', userId, 'appointments', appointmentId];

export const appointmentRepository = {
  async create(userId: string, data: AppointmentWriteData) {
    const docRef = doc(appointmentCollectionPath(userId));
    const writeData = withFirestoreSyncTimestamp(data);
    await queueFirestoreVoidWrite(
      () => setDoc(docRef, writeData),
      'Criar agendamento',
      createFirestoreReplayDescriptor('set', appointmentReplayPath(userId, docRef.id), writeData)
    );
    return docRef.id;
  },

  async update(userId: string, appointmentId: string, data: AppointmentWriteData) {
    const writeData = withFirestoreSyncTimestamp(data);
    await queueFirestoreVoidWrite(
      () => updateDoc(appointmentDocPath(userId, appointmentId), writeData),
      'Atualizar agendamento',
      createFirestoreReplayDescriptor('update', appointmentReplayPath(userId, appointmentId), writeData)
    );
  },

  async remove(userId: string, appointmentId: string, reason?: string) {
    const metadata = createSoftDeleteMetadata(userId, reason);
    await queueFirestoreVoidWrite(
      () => updateDoc(appointmentDocPath(userId, appointmentId), metadata),
      'Arquivar agendamento',
      createFirestoreReplayDescriptor('update', appointmentReplayPath(userId, appointmentId), metadata)
    );
  },

  async restore(userId: string, appointmentId: string) {
    const metadata = createRestoreMetadata();
    await queueFirestoreVoidWrite(
      () => updateDoc(appointmentDocPath(userId, appointmentId), metadata),
      'Restaurar agendamento',
      createFirestoreReplayDescriptor('update', appointmentReplayPath(userId, appointmentId), metadata)
    );
  },
};
