import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { db, waitForPendingWrites } from '../firebase';
import type { FirestoreReplayDescriptor } from './firestoreOfflineQueue';

export const replayFirestoreWrite = async (descriptor: FirestoreReplayDescriptor) => {
  const [rootPath, ...pathSegments] = descriptor.path;
  const target = doc(db, rootPath, ...pathSegments);

  if (descriptor.operation === 'set') {
    await setDoc(target, descriptor.data, descriptor.merge ? { merge: true } : undefined);
  } else {
    await updateDoc(target, descriptor.data);
  }
  await waitForPendingWrites(db);
};
