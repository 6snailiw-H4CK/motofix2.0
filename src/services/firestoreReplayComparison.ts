import type { FirestoreReplayMutation } from './firestoreOfflineQueue';

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

/** Returns null when a persisted Firestore value cannot be compared safely. */
export const firestoreReplayValuesMatch = (expected: unknown, actual: unknown): boolean | null => {
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
      const matches = firestoreReplayValuesMatch(expected[index], actual[index]);
      if (matches === null || !matches) return matches;
    }
    return true;
  }
  if (!isPlainObject(expected) || !isPlainObject(actual)) return null;
  const expectedKeys = Object.keys(expected);
  if (expectedKeys.length !== Object.keys(actual).length) return false;
  for (const key of expectedKeys) {
    if (!Object.prototype.hasOwnProperty.call(actual, key)) return false;
    const matches = firestoreReplayValuesMatch(expected[key], actual[key]);
    if (matches === null || !matches) return matches;
  }
  return true;
};

const getFieldValue = (data: Record<string, unknown>, field: string) => field.split('.').reduce<unknown>(
  (value, segment) => (value && typeof value === 'object' ? (value as Record<string, unknown>)[segment] : undefined),
  data,
);

/**
 * updatedAt is a synchronization cursor, not a business value. Ignore its
 * difference only when the mutation also contains business fields and every
 * one of those fields already matches the server. This lets idempotent writes
 * settle without hiding real concurrent edits.
 */
export const mutationMatchesRemoteData = (
  mutation: FirestoreReplayMutation,
  remoteData: Record<string, unknown>,
): boolean | null => {
  const isFullSet = mutation.operation === 'set' && !mutation.merge;
  if (isFullSet) {
    const expected = { ...mutation.data };
    const remote = { ...remoteData };
    // Old queue entries can be stamped at replay time; that cursor isn't user data.
    if (!Object.prototype.hasOwnProperty.call(expected, 'updatedAt')) delete remote.updatedAt;
    else if (Object.keys(expected).some((key) => key !== 'updatedAt')) {
      delete expected.updatedAt;
      delete remote.updatedAt;
    }
    return firestoreReplayValuesMatch(expected, remote);
  }

  const entries = Object.entries(mutation.data);
  const hasBusinessFields = entries.some(([field]) => field !== 'updatedAt');
  for (const [field, expected] of entries) {
    if (field === 'updatedAt' && hasBusinessFields) continue;
    const actual = getFieldValue(remoteData, field);
    if (actual === undefined) return false;
    const matches = firestoreReplayValuesMatch(expected, actual);
    if (matches === null || !matches) return matches;
  }
  return true;
};

const replayPathKey = (path: string[]) => path.join('/');

/**
 * Checks the stock baseline recorded by an offline stock operation against
 * the current server product. A stale baseline cannot pass the Firestore
 * rules' atomic product/movement pair validation, so it must be surfaced as
 * a conflict before replay instead of retrying a batch that will be rejected.
 * Returns null for descriptors that do not contain a recognizable stock pair.
 */
export const inspectStockReplayBaseline = (
  mutations: FirestoreReplayMutation[],
  remoteByPath: ReadonlyMap<string, Record<string, unknown> | null>,
): string | null => {
  const stockMovementMutations = mutations.filter((mutation) => (
    mutation.path[0] === 'users'
    && mutation.path[2] === 'stock_movements'
  ));
  if (stockMovementMutations.length === 0) return null;

  const pairedProductMutationPaths = new Set<string>();
  for (const movementMutation of stockMovementMutations) {
    const [, userId, , movementId] = movementMutation.path;
    const movement = movementMutation.data;
    const productIds = Array.isArray(movement.productIds)
      ? movement.productIds.filter((value): value is string => typeof value === 'string')
      : [];
    const changeMap = isPlainObject(movement.changes) ? movement.changes : null;
    if (movementMutation.operation !== 'set'
      || movementMutation.path.length !== 4
      || movement.userId !== userId
      || productIds.length === 0
      || new Set(productIds).size !== productIds.length
      || !changeMap
      || Object.keys(changeMap).length !== productIds.length) {
      return 'A movimentação local não contém um vínculo válido com as mercadorias alteradas. Atualize as mercadorias e refaça o ajuste.';
    }

    for (const productId of productIds) {
      const matchingProductMutations = mutations.filter((mutation) => (
        mutation.path[0] === 'users'
        && mutation.path[1] === userId
        && mutation.path[2] === 'products'
        && mutation.path[3] === productId
        && mutation.data.stockMovementId === movementId
        && (Object.prototype.hasOwnProperty.call(mutation.data, 'stockQuantity')
          || Object.prototype.hasOwnProperty.call(mutation.data, 'variations'))
      ));
      if (matchingProductMutations.length !== 1) {
        return 'A movimentação local não está pareada com cada mercadoria do lote. Atualize as mercadorias e refaça o ajuste.';
      }

      const productMutation = matchingProductMutations[0];
      const productPath = replayPathKey(productMutation.path);
      pairedProductMutationPaths.add(productPath);
      const change = changeMap[productId];
      if (!isPlainObject(change)) {
        return 'A movimentação local não contém os dados de saldo da mercadoria. Atualize as mercadorias e refaça o ajuste.';
      }

      const previousQuantity = change.previousQuantity;
      const nextQuantity = change.nextQuantity;
      const previousVariations = change.previousVariations;
      const nextVariations = change.nextVariations;
      if (change.productId !== productId
        || typeof previousQuantity !== 'number'
        || !Number.isFinite(previousQuantity)
        || previousQuantity < 0
        || typeof nextQuantity !== 'number'
        || !Number.isFinite(nextQuantity)
        || nextQuantity < 0
        || !Array.isArray(previousVariations)
        || !Array.isArray(nextVariations)
        || productMutation.data.stockQuantity !== nextQuantity
        || firestoreReplayValuesMatch(productMutation.data.variations ?? [], nextVariations) !== true) {
        return 'Os dados da movimentação e do saldo local não são compatíveis. Atualize as mercadorias e refaça o ajuste.';
      }

      const remoteProduct = remoteByPath.get(productPath) ?? null;
      if (productMutation.operation === 'set' && !productMutation.merge) {
        if (remoteProduct) {
          return 'A mercadoria já existe no Firebase e o lote offline tentaria criá-la novamente. Atualize as mercadorias e refaça o ajuste.';
        }
        if (previousQuantity !== 0 || previousVariations.length !== 0) {
          return 'O saldo inicial registrado no lote offline é inconsistente. Atualize as mercadorias e refaça o ajuste.';
        }
        continue;
      }

      if (productMutation.operation !== 'update' || !remoteProduct) {
        return 'A mercadoria do lote de estoque não está disponível no Firebase. Atualize as mercadorias e refaça o ajuste.';
      }

      const quantityMatches = firestoreReplayValuesMatch(previousQuantity, remoteProduct.stockQuantity ?? 0);
      const variationsMatch = firestoreReplayValuesMatch(previousVariations, remoteProduct.variations ?? []);
      if (quantityMatches !== true || variationsMatch !== true) {
        return 'O saldo desta mercadoria mudou no Firebase desde que o ajuste foi salvo localmente. Nada foi reenviado para evitar saldo incorreto. Atualize as mercadorias e refaça o ajuste.';
      }
    }
  }

  const productMutationsReferencingStockMovements = mutations.filter((mutation) => (
    mutation.path[0] === 'users'
    && mutation.path[2] === 'products'
    && typeof mutation.data.stockMovementId === 'string'
    && (Object.prototype.hasOwnProperty.call(mutation.data, 'stockQuantity')
      || Object.prototype.hasOwnProperty.call(mutation.data, 'variations'))
    && stockMovementMutations.some((movement) => (
      movement.path[1] === mutation.path[1]
      && movement.path[3] === mutation.data.stockMovementId
    ))
  ));
  if (productMutationsReferencingStockMovements.some((mutation) => (
    !pairedProductMutationPaths.has(replayPathKey(mutation.path))
  ))) {
    return 'Foi encontrada uma mercadoria vinculada a uma movimentação sem correspondência completa. Atualize as mercadorias e refaça o ajuste.';
  }

  return null;
};
