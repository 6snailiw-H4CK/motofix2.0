export type OfflineQueueAuditStatus = 'valid' | 'divergent' | 'unknown' | 'invalid' | 'unavailable' | 'unreadable';

export type LocalStorageQueueRead =
  | { status: 'available'; raw: string | null }
  | { status: 'unavailable' }
  | { status: 'unreadable' };

export type IndexedDbQueueRead =
  | { status: 'available'; databaseExists: boolean; raw: unknown | null }
  | { status: 'unavailable' }
  | { status: 'unreadable' };

export type OfflineQueueStorageAudit = {
  status: OfflineQueueAuditStatus;
  safeToUse: boolean;
  hasDivergence: boolean;
  localStorageEntryCount: number | null;
  indexedDbEntryCount: number | null;
  invalidEntryCount: number;
  unknownEntryCount: number;
  duplicateIdCount: number;
  issues: string[];
};

const ROOT_FIELDS = new Set([
  'writes', 'lastQueuedAt', 'lastSettledAt', 'lastError', 'failureCount', 'confirmedCount',
  'retryCount', 'persistenceFailureCount', 'lastPersistenceError',
]);
const WRITE_FIELDS = new Set([
  'id', 'context', 'ownerId', 'queuedAt', 'status', 'lastUpdatedAt', 'errorMessage',
  'replay', 'retryCount', 'lastRetryAt',
]);
const MUTATION_FIELDS = new Set(['operation', 'path', 'data', 'merge']);
const DESCRIPTOR_FIELDS = new Set(['version', 'operation', 'path', 'data', 'merge', 'writes']);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).filter((key) => value[key] !== undefined).sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
};

type SnapshotInspection = {
  value: Record<string, unknown> | null;
  invalid: number;
  unknown: number;
  duplicates: number;
  entryCount: number | null;
};

const inspectReplayMutation = (value: unknown): { invalid: number; unknown: number } => {
  if (!isRecord(value)) return { invalid: 1, unknown: 0 };
  let invalid = 0;
  let unknown = 0;
  for (const key of Object.keys(value)) if (!MUTATION_FIELDS.has(key)) unknown += 1;
  if (typeof value.operation !== 'string') invalid += 1;
  else if (value.operation !== 'set' && value.operation !== 'update') unknown += 1;
  if (!Array.isArray(value.path)
    || !value.path.length
    || !value.path.every((part) => typeof part === 'string' && part.length > 0)
    || !isRecord(value.data)
    || (value.merge !== undefined && typeof value.merge !== 'boolean')) invalid += 1;
  return { invalid, unknown };
};

const inspectReplayDescriptor = (value: unknown): { invalid: number; unknown: number } => {
  if (!isRecord(value)) return { invalid: 1, unknown: 0 };
  let invalid = 0;
  let unknown = 0;
  for (const key of Object.keys(value)) if (!DESCRIPTOR_FIELDS.has(key)) unknown += 1;
  if (!Number.isSafeInteger(value.version)) invalid += 1;
  else if (value.version !== 1) unknown += 1;
  if (typeof value.operation !== 'string') invalid += 1;
  else if (value.operation !== 'batch' && value.operation !== 'set' && value.operation !== 'update') unknown += 1;
  if (value.operation === 'batch') {
    if (!Array.isArray(value.writes) || value.writes.length === 0) invalid += 1;
    else for (const mutation of value.writes) {
      const result = inspectReplayMutation(mutation);
      invalid += result.invalid;
      unknown += result.unknown;
    }
  } else if (value.operation === 'set' || value.operation === 'update') {
    const mutation = { ...value };
    delete mutation.version;
    const result = inspectReplayMutation(mutation);
    invalid += result.invalid;
    unknown += result.unknown;
  }
  return { invalid, unknown };
};

const inspectSnapshot = (value: unknown): SnapshotInspection => {
  if (!isRecord(value)) return { value: null, invalid: 1, unknown: 0, duplicates: 0, entryCount: null };
  let invalid = 0;
  let unknown = 0;
  let duplicates = 0;
  for (const key of Object.keys(value)) if (!ROOT_FIELDS.has(key)) unknown += 1;
  if (!Array.isArray(value.writes)) {
    return { value, invalid: invalid + 1, unknown, duplicates, entryCount: null };
  }
  const seenIds = new Set<string>();
  for (const item of value.writes) {
    if (!isRecord(item)) {
      invalid += 1;
      continue;
    }
    for (const key of Object.keys(item)) if (!WRITE_FIELDS.has(key)) unknown += 1;
    if (typeof item.id !== 'string' || item.id.length === 0
      || typeof item.context !== 'string' || typeof item.queuedAt !== 'string'
      || typeof item.status !== 'string'
      || (item.ownerId !== undefined && item.ownerId !== null && typeof item.ownerId !== 'string')
      || (item.lastUpdatedAt !== undefined && item.lastUpdatedAt !== null && typeof item.lastUpdatedAt !== 'string')
      || (item.errorMessage !== undefined && item.errorMessage !== null && typeof item.errorMessage !== 'string')
      || (item.retryCount !== undefined && (!Number.isSafeInteger(item.retryCount) || Number(item.retryCount) < 0))
      || (item.lastRetryAt !== undefined && item.lastRetryAt !== null && typeof item.lastRetryAt !== 'string')) {
      invalid += 1;
    }
    if (typeof item.status === 'string' && item.status !== 'pending' && item.status !== 'failed') unknown += 1;
    if (typeof item.id === 'string' && item.id.length > 0) {
      if (seenIds.has(item.id)) duplicates += 1;
      seenIds.add(item.id);
    }
    if (item.replay !== undefined) {
      const replay = inspectReplayDescriptor(item.replay);
      invalid += replay.invalid;
      unknown += replay.unknown;
    }
  }
  for (const key of ['lastQueuedAt', 'lastSettledAt', 'lastError', 'lastPersistenceError']) {
    if (value[key] !== undefined && value[key] !== null && typeof value[key] !== 'string') invalid += 1;
  }
  for (const key of ['failureCount', 'confirmedCount', 'retryCount', 'persistenceFailureCount']) {
    if (value[key] !== undefined && (!Number.isSafeInteger(value[key]) || Number(value[key]) < 0)) invalid += 1;
  }
  return { value, invalid, unknown, duplicates, entryCount: value.writes.length };
};

const unavailableSummary = (status: 'unavailable' | 'unreadable'): OfflineQueueStorageAudit => ({
  status,
  safeToUse: false,
  hasDivergence: false,
  localStorageEntryCount: null,
  indexedDbEntryCount: null,
  invalidEntryCount: 0,
  unknownEntryCount: 0,
  duplicateIdCount: 0,
  issues: [status === 'unavailable' ? 'queue_storage_unavailable' : 'queue_storage_unreadable'],
});

/** Inspects the raw mirrors without normalizing, merging, or mutating either input. */
export const auditRawFirestoreOfflineQueue = (
  localStorageRead: LocalStorageQueueRead,
  indexedDbRead: IndexedDbQueueRead,
): OfflineQueueStorageAudit => {
  if (localStorageRead.status === 'unavailable' || indexedDbRead.status === 'unavailable') return unavailableSummary('unavailable');
  if (localStorageRead.status === 'unreadable' || indexedDbRead.status === 'unreadable') return unavailableSummary('unreadable');

  let localValue: unknown = null;
  const localHasSnapshot = localStorageRead.raw !== null;
  let localParseInvalid = false;
  if (localHasSnapshot) {
    try {
      localValue = JSON.parse(localStorageRead.raw) as unknown;
    } catch {
      localParseInvalid = true;
    }
  }
  const idbValue = indexedDbRead.databaseExists ? indexedDbRead.raw : null;
  const local = localParseInvalid
    ? { value: null, invalid: 1, unknown: 0, duplicates: 0, entryCount: null }
    : !localHasSnapshot
      ? { value: null, invalid: 0, unknown: 0, duplicates: 0, entryCount: 0 }
      : inspectSnapshot(localValue);
  const indexedDb = idbValue === null
    ? { value: null, invalid: 0, unknown: 0, duplicates: 0, entryCount: 0 }
    : inspectSnapshot(idbValue);

  const hasDivergence = localParseInvalid
    ? false
    : stableJson(local.value) !== stableJson(indexedDb.value);
  const invalidEntryCount = local.invalid + indexedDb.invalid;
  const unknownEntryCount = local.unknown + indexedDb.unknown;
  const duplicateIdCount = local.duplicates + indexedDb.duplicates;
  const issues: string[] = [];
  if (localParseInvalid) issues.push('local_storage_queue_json_invalid');
  if (invalidEntryCount > 0) issues.push('queue_entries_invalid');
  if (unknownEntryCount > 0) issues.push('queue_entries_unknown');
  if (duplicateIdCount > 0) issues.push('queue_duplicate_ids');
  if (hasDivergence) issues.push('queue_mirrors_diverge');

  const status: OfflineQueueAuditStatus = invalidEntryCount > 0 || duplicateIdCount > 0 ? 'invalid'
    : unknownEntryCount > 0 ? 'unknown'
      : hasDivergence ? 'divergent' : 'valid';
  return {
    status,
    safeToUse: status === 'valid',
    hasDivergence,
    localStorageEntryCount: local.entryCount,
    indexedDbEntryCount: indexedDb.entryCount,
    invalidEntryCount,
    unknownEntryCount,
    duplicateIdCount,
    issues,
  };
};
