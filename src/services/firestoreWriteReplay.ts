import { doc, getDocFromServer, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { db, waitForPendingWrites } from '../firebase';
import { withFirestoreSyncTimestamp } from './firestoreSyncFields';
import type { FirestoreReplayDescriptor, FirestoreReplayMutation } from './firestoreOfflineQueue';

const incrementallySyncedCollections = new Set([
  'clients',
  'maintenances',
  'warranties',
  'appointments',
  'expenses',
  'products',
  'cash_launches',
  'message_logs',
]);

const stampLegacyReplayMutation = (mutation: FirestoreReplayMutation): FirestoreReplayMutation => {
  if (mutation.path[0] !== 'users' || !incrementallySyncedCollections.has(mutation.path[2] || '')) {
    return mutation;
  }
  if (typeof mutation.data.updatedAt === 'string') return mutation;
  return {
    ...mutation,
    data: withFirestoreSyncTimestamp(mutation.data),
  };
};

const replayTarget = (path: string[]) => {
  const [rootPath, ...pathSegments] = path;
  return doc(db, rootPath, ...pathSegments);
};

const applyBatchMutation = (batch: ReturnType<typeof writeBatch>, mutation: FirestoreReplayMutation) => {
  const stampedMutation = stampLegacyReplayMutation(mutation);
  const target = replayTarget(stampedMutation.path);
  if (stampedMutation.operation === 'set') {
    if (stampedMutation.merge) {
      batch.set(target, stampedMutation.data, { merge: true });
    } else {
      batch.set(target, stampedMutation.data);
    }
  } else {
    batch.update(target, stampedMutation.data);
  }
};

const replaySingleMutation = async (mutation: FirestoreReplayMutation) => {
  const stampedMutation = stampLegacyReplayMutation(mutation);
  const target = replayTarget(stampedMutation.path);
  if (stampedMutation.operation === 'set') {
    await setDoc(target, stampedMutation.data, stampedMutation.merge ? { merge: true } : undefined);
  } else {
    await updateDoc(target, stampedMutation.data);
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

export type FirestoreReplayInspection =
  | { status: 'already-applied' }
  | { status: 'not-applied' }
  | { status: 'conflict'; reason: string };

const dateValueInMillis = (value: unknown): number | null => {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string' && value.includes('T')) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (!value || typeof value !== 'object') return null;
  const candidate = value as {
    toMillis?: () => number;
    seconds?: number;
    nanoseconds?: number;
  };
  if (typeof candidate.toMillis === 'function') {
    const millis = candidate.toMillis();
    return Number.isFinite(millis) ? millis : null;
  }
  if (typeof candidate.seconds === 'number' && typeof candidate.nanoseconds === 'number') {
    return candidate.seconds * 1000 + candidate.nanoseconds / 1_000_000;
  }
  return null;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

/** Returns null when the persisted replay payload contains an unsupported Firestore value. */
const valuesMatch = (expected: unknown, actual: unknown): boolean | null => {
  const expectedMillis = dateValueInMillis(expected);
  const actualMillis = dateValueInMillis(actual);
  if (expectedMillis !== null || actualMillis !== null) {
    return expectedMillis !== null && actualMillis !== null && expectedMillis === actualMillis;
  }
  if (expected === null || actual === null || typeof expected !== 'object' || typeof actual !== 'object') {
    return Object.is(expected, actual);
  }
  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (!Array.isArray(expected) || !Array.isArray(actual) || expected.length !== actual.length) return false;
    for (let index = 0; index < expected.length; index += 1) {
      const matches = valuesMatch(expected[index], actual[index]);
      if (matches === null || !matches) return matches;
    }
    return true;
  }
  if (!isPlainObject(expected) || !isPlainObject(actual)) return null;
  const expectedKeys = Object.keys(expected);
  if (expectedKeys.length !== Object.keys(actual).length) return false;
  for (const key of expectedKeys) {
    if (!Object.prototype.hasOwnProperty.call(actual, key)) return false;
    const matches = valuesMatch(expected[key], actual[key]);
    if (matches === null || !matches) return matches;
  }
  return true;
};

const getFieldValue = (data: Record<string, unknown>, field: string) => field.split('.').reduce<unknown>(
  (value, segment) => (value && typeof value === 'object' ? (value as Record<string, unknown>)[segment] : undefined),
  data,
);

const mutationMatchesRemoteData = (
  mutation: FirestoreReplayMutation,
  remoteData: Record<string, unknown>,
): boolean | null => {
  const isFullSet = mutation.operation === 'set' && !mutation.merge;
  if (isFullSet) {
    const expected = { ...mutation.data };
    const remote = { ...remoteData };
    // Old queue entries may get updatedAt when replayed. It is a sync cursor,
    // not part of the user's original payload in that case.
    if (!Object.prototype.hasOwnProperty.call(expected, 'updatedAt')) delete remote.updatedAt;
    return valuesMatch(expected, remote);
  }

  for (const [field, expected] of Object.entries(mutation.data)) {
    const actual = getFieldValue(remoteData, field);
    if (actual === undefined) return false;
    const matches = valuesMatch(expected, actual);
    if (matches === null || !matches) return matches;
  }
  return true;
};

const mutationMatchesStableCreation = (
  mutation: FirestoreReplayMutation,
  remoteData: Record<string, unknown>,
) => {
  if (mutation.operation !== 'set' || mutation.merge) return false;
  return ['createdAt', 'timestamp'].some((field) => {
    if (!Object.prototype.hasOwnProperty.call(mutation.data, field)) return false;
    const actual = remoteData[field];
    return actual !== undefined && valuesMatch(mutation.data[field], actual) === true;
  });
};

/**
 * Checks a failed/restored replay against server documents before another write.
 * This prevents a stale local checkpoint from applying an already-accepted
 * create or stock batch a second time.
 */
export const inspectFirestoreReplay = async (
  descriptor: FirestoreReplayDescriptor,
  queuedAt?: string,
): Promise<FirestoreReplayInspection> => {
  const mutations = descriptor.operation === 'batch' ? descriptor.writes : [descriptor];
  const remoteResults: Array<{
    mutation: FirestoreReplayMutation;
    exists: boolean;
    data: Record<string, unknown> | null;
    matches: boolean | null;
    creationMatches: boolean;
  }> = [];
  const chunkSize = 20;

  for (let start = 0; start < mutations.length; start += chunkSize) {
    const chunk = mutations.slice(start, start + chunkSize);
    const snapshots = await Promise.all(chunk.map((mutation) => getDocFromServer(replayTarget(mutation.path))));
    snapshots.forEach((snapshot, index) => {
      const mutation = chunk[index];
      const data = snapshot.exists() ? snapshot.data() as Record<string, unknown> : null;
      remoteResults.push({
        mutation,
        exists: Boolean(data),
        data,
        matches: data ? mutationMatchesRemoteData(mutation, data) : false,
        creationMatches: data ? mutationMatchesStableCreation(mutation, data) : false,
      });
    });
  }

  if (remoteResults.every((result) => result.exists && (result.matches === true || result.creationMatches))) {
    return { status: 'already-applied' };
  }

  const unsupportedComparison = remoteResults.some((result) => result.exists && result.matches === null);
  if (unsupportedComparison) {
    return {
      status: 'conflict',
      reason: 'O Firebase encontrou campos que não podem ser comparados automaticamente. Revise a gravação antes de reenviar.',
    };
  }

  const alreadyMatching = remoteResults.some((result) => result.exists && result.matches === true);
  if (alreadyMatching && mutations.length > 1) {
    return {
      status: 'conflict',
      reason: 'Parte do lote já aparece no servidor. O sistema bloqueou o reenvio para evitar duplicidade ou alteração de estoque.',
    };
  }

  for (const result of remoteResults) {
    if (result.exists && result.matches !== true) {
      const remoteData = result.data as Record<string, unknown>;
      const remoteUpdatedAt = dateValueInMillis(remoteData.updatedAt);
      const intendedUpdatedAt = dateValueInMillis(result.mutation.data.updatedAt)
        ?? (queuedAt ? Date.parse(queuedAt) : null);
      if (remoteUpdatedAt !== null && intendedUpdatedAt !== null && remoteUpdatedAt > intendedUpdatedAt + 120_000) {
        return {
          status: 'conflict',
          reason: 'O documento foi alterado no servidor depois desta gravação local. O reenvio foi bloqueado para preservar a versão mais recente.',
        };
      }
    }
    if (result.mutation.operation === 'set' && !result.mutation.merge && result.exists) {
      return {
        status: 'conflict',
        reason: 'O documento já existe no servidor com dados diferentes. O sistema bloqueou a substituição automática.',
      };
    }
    if (result.mutation.operation === 'update' && !result.exists) {
      return {
        status: 'conflict',
        reason: 'O documento que deveria ser atualizado não existe no servidor. Revise o registro na tela de origem.',
      };
    }
  }

  return { status: 'not-applied' };
};
