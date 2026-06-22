import { collection, doc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { createFirestoreReplayDescriptor, queueFirestoreVoidWrite } from './firestoreOfflineQueue';
import { createRestoreMetadata, createSoftDeleteMetadata } from './softDelete';

export type AppointmentWriteData = Record<string, unknown>;

const appointmentCollectionPath = (userId: string) => collection(db, 'users', userId, 'appointments');
const appointmentDocPath = (userId: string, appointmentId: string) => doc(db, 'users', userId, 'appointments', appointmentId);
const appointmentReplayPath = (userId: string, appointmentId: string) => ['users', userId, 'appointments', appointmentId];

export const appointmentRepository = {
  async create(userId: string, data: AppointmentWriteData) {
    const docRef = doc(appointmentCollectionPath(userId));
    await queueFirestoreVoidWrite(
      () => setDoc(docRef, data),
      'Criar agendamento',
      createFirestoreReplayDescriptor('set', appointmentReplayPath(userId, docRef.id), data)
    );
    return docRef.id;
  },

  async update(userId: string, appointmentId: string, data: AppointmentWriteData) {
    await queueFirestoreVoidWrite(
      () => updateDoc(appointmentDocPath(userId, appointmentId), data),
      'Atualizar agendamento',
      createFirestoreReplayDescriptor('update', appointmentReplayPath(userId, appointmentId), data)
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
