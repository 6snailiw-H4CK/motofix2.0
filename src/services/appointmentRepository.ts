import { collection, deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { queueFirestoreVoidWrite } from './firestoreOfflineQueue';

export type AppointmentWriteData = Record<string, unknown>;

const appointmentCollectionPath = (userId: string) => collection(db, 'users', userId, 'appointments');

const appointmentDocPath = (userId: string, appointmentId: string) => (
  doc(db, 'users', userId, 'appointments', appointmentId)
);

export const appointmentRepository = {
  async create(userId: string, data: AppointmentWriteData) {
    const docRef = doc(appointmentCollectionPath(userId));
    await queueFirestoreVoidWrite(() => setDoc(docRef, data), 'Criar agendamento');
    return docRef.id;
  },

  async update(userId: string, appointmentId: string, data: AppointmentWriteData) {
    await queueFirestoreVoidWrite(
      () => updateDoc(appointmentDocPath(userId, appointmentId), data),
      'Atualizar agendamento'
    );
  },

  async remove(userId: string, appointmentId: string) {
    await queueFirestoreVoidWrite(
      () => deleteDoc(appointmentDocPath(userId, appointmentId)),
      'Remover agendamento'
    );
  },
};
