import { addDoc, collection, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

export type AppointmentWriteData = Record<string, unknown>;

const appointmentCollectionPath = (userId: string) => collection(db, 'users', userId, 'appointments');

const appointmentDocPath = (userId: string, appointmentId: string) => (
  doc(db, 'users', userId, 'appointments', appointmentId)
);

export const appointmentRepository = {
  async create(userId: string, data: AppointmentWriteData) {
    const docRef = await addDoc(appointmentCollectionPath(userId), data);
    return docRef.id;
  },

  async update(userId: string, appointmentId: string, data: AppointmentWriteData) {
    await updateDoc(appointmentDocPath(userId, appointmentId), data);
  },

  async remove(userId: string, appointmentId: string) {
    await deleteDoc(appointmentDocPath(userId, appointmentId));
  },
};
