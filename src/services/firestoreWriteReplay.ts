import { doc, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { db, waitForPendingWrites } from '../firebase';
import type { FirestoreReplayDescriptor, FirestoreReplayMutation } from './firestoreOfflineQueue';

const replayTarget = (path: string[]) => {
  const [rootPath, ...pathSegments] = path;
  return doc(db, rootPath, ...pathSegments);
};

const applyBatchMutation = (batch: ReturnType<typeof writeBatch>, mutation: FirestoreReplayMutation) => {
  const target = replayTarget(mutation.path);
  if (mutation.operation === 'set') {
    if (mutation.merge) {
      batch.set(target, mutation.data, { merge: true });
    } else {
      batch.set(target, mutation.data);
    }
  } else {
    batch.update(target, mutation.data);
  }
};

const replaySingleMutation = async (mutation: FirestoreReplayMutation) => {
  const target = replayTarget(mutation.path);
  if (mutation.operation === 'set') {
    await setDoc(target, mutation.data, mutation.merge ? { merge: true } : undefined);
  } else {
    await updateDoc(target, mutation.data);
  }
};

export const replayFirestoreWrite = async (descriptor: FirestoreReplayDescriptor) => {
  if (descriptor.operation === 'batch') {
    const batch = writeBatch(db);
    descriptor.writes.forEach((mutation) => applyBatchMutation(batch, mutation));
    await batch.commit();
  } else {
    await replaySingleMutation(descriptor);
  }

  await waitForPendingWrites(db);
};
