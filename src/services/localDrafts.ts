export const LOCAL_DRAFTS_EVENT = 'motofix:local-drafts';

const DRAFT_PREFIX = 'motofix:draft:';

export type LocalDraftRecord<T = unknown> = {
  key: string;
  label: string;
  scope: string;
  createdAt?: string;
  updatedAt: string;
  /** Field names only; never stores/display field values in the audit summary. */
  changedFields?: string[];
  data: T;
};

export type LocalDraftSummary = {
  label: string;
  scope: string;
  createdAt: string;
  updatedAt: string;
  changedFields: string[];
  legacy: boolean;
};

const AUTO_FILLED_FIELDS = new Set([
  'createdAt', 'updatedAt', 'date', 'openingDate', 'expectedDate', 'serviceDate',
  'paidAt', 'status', 'statusPagamento', 'paymentMethod', 'isRecurringRevenue',
  'isInvoiced', 'recurrenceDays', 'workTab',
]);

const isMeaningfulValue = (value: unknown) => {
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value) && value !== 0;
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === 'object') return Object.keys(value).length > 0;
  return false;
};

const changedDataFields = (before: unknown, after: unknown) => {
  if (!after || typeof after !== 'object' || Array.isArray(after)) return [] as string[];
  const nextData = after as Record<string, unknown>;
  const previousData = before && typeof before === 'object' && !Array.isArray(before)
    ? before as Record<string, unknown>
    : null;

  return Object.keys(nextData).filter((field) => {
    if (['id', 'userId', 'createdAt', 'updatedAt'].includes(field)) return false;
    if (!previousData) return !AUTO_FILLED_FIELDS.has(field) && isMeaningfulValue(nextData[field]);
    return JSON.stringify(previousData[field]) !== JSON.stringify(nextData[field]);
  });
};

const canUseStorage = () => {
  try {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
  } catch {
    return false;
  }
};

const emitDraftsChanged = () => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(LOCAL_DRAFTS_EVENT, {
    detail: { count: getLocalDraftCount() },
  }));
};

const storageKey = (key: string) => `${DRAFT_PREFIX}${key}`;

export const saveLocalDraft = <T,>(key: string, label: string, scope: string, data: T) => {
  if (!canUseStorage()) return;

  const existing = loadLocalDraft<T>(key);
  const now = new Date().toISOString();
  const changedFields = Array.from(new Set([
    ...(existing?.changedFields || (existing ? changedDataFields(null, existing.data) : [])),
    ...changedDataFields(existing?.data, data),
  ]));
  const record: LocalDraftRecord<T> = {
    key,
    label,
    scope,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    changedFields,
    data,
  };

  try {
    window.localStorage.setItem(storageKey(key), JSON.stringify(record));
    emitDraftsChanged();
  } catch (error) {
    console.warn('Nao foi possivel salvar o draft local:', error);
  }
};

export const loadLocalDraft = <T,>(key: string): LocalDraftRecord<T> | null => {
  if (!canUseStorage()) return null;

  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(storageKey(key));
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    return JSON.parse(raw) as LocalDraftRecord<T>;
  } catch {
    window.localStorage.removeItem(storageKey(key));
    emitDraftsChanged();
    return null;
  }
};

export const clearLocalDraft = (key: string) => {
  if (!canUseStorage()) return;
  try {
    window.localStorage.removeItem(storageKey(key));
    emitDraftsChanged();
  } catch (error) {
    console.warn('Nao foi possivel remover o draft local:', error);
  }
};

export const listLocalDrafts = () => {
  if (!canUseStorage()) return [] as LocalDraftRecord[];

  let storageKeys: string[] = [];
  try {
    storageKeys = Array.from({ length: window.localStorage.length }, (_, index) => (
      window.localStorage.key(index)
    )).filter((key): key is string => Boolean(key));
  } catch {
    return [] as LocalDraftRecord[];
  }

  return storageKeys
    .filter((key) => key.startsWith(DRAFT_PREFIX))
    .map((key) => {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .map((raw) => {
      try {
        return JSON.parse(String(raw)) as LocalDraftRecord;
      } catch {
        return null;
      }
    })
    .filter((record): record is LocalDraftRecord => Boolean(record))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
};

/** Read-only storage audit used by the portable backup preflight. It never clears malformed drafts. */
export const inspectLocalDraftStorage = () => {
  if (!canUseStorage()) return { readable: false, malformedCount: 0, records: [] as LocalDraftRecord[] };

  try {
    const keys = Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index))
      .filter((key): key is string => Boolean(key));
    const draftKeys = keys.filter((key) => key.startsWith(DRAFT_PREFIX));
    const records: LocalDraftRecord[] = [];
    let malformedCount = 0;
    for (const key of draftKeys) {
      const raw = window.localStorage.getItem(key);
      if (raw === null) {
        malformedCount += 1;
        continue;
      }
      try {
        const record = JSON.parse(raw) as LocalDraftRecord;
        if (!record || typeof record.key !== 'string' || storageKey(record.key) !== key
          || typeof record.label !== 'string' || typeof record.scope !== 'string'
          || typeof record.updatedAt !== 'string' || !('data' in record)) malformedCount += 1;
        else records.push(record);
      } catch {
        malformedCount += 1;
      }
    }
    return { readable: malformedCount === 0, malformedCount, records };
  } catch {
    return { readable: false, malformedCount: 0, records: [] as LocalDraftRecord[] };
  }
};

export const getLocalDraftCount = () => listLocalDrafts().length;

const summarizeLocalDraft = (record: LocalDraftRecord): LocalDraftSummary => ({
  label: record.label,
  scope: record.scope,
  createdAt: record.createdAt || record.updatedAt,
  updatedAt: record.updatedAt,
  changedFields: record.changedFields?.length
    ? record.changedFields
    : changedDataFields(null, record.data),
  legacy: !record.changedFields,
});

export const getLocalDraftSummaries = (userId: string | null | undefined) => {
  if (!userId) return [] as LocalDraftSummary[];
  const userDraftPrefix = `${userId}:`;
  return listLocalDrafts()
    .filter((record) => record.key.startsWith(userDraftPrefix))
    .map(summarizeLocalDraft);
};

export const subscribeLocalDrafts = (
  listener: (drafts: LocalDraftSummary[]) => void,
  userId: string | null | undefined,
) => {
  if (typeof window === 'undefined') return () => {};

  const handleChange = () => listener(getLocalDraftSummaries(userId));
  window.addEventListener(LOCAL_DRAFTS_EVENT, handleChange);
  window.addEventListener('storage', handleChange);
  handleChange();

  return () => {
    window.removeEventListener(LOCAL_DRAFTS_EVENT, handleChange);
    window.removeEventListener('storage', handleChange);
  };
};
