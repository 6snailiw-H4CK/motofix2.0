export const LOCAL_DRAFTS_EVENT = 'motofix:local-drafts';

const DRAFT_PREFIX = 'motofix:draft:';

export type LocalDraftRecord<T = unknown> = {
  key: string;
  label: string;
  scope: string;
  updatedAt: string;
  data: T;
};

const canUseStorage = () => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const emitDraftsChanged = () => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(LOCAL_DRAFTS_EVENT, {
    detail: { count: getLocalDraftCount() },
  }));
};

const storageKey = (key: string) => `${DRAFT_PREFIX}${key}`;

export const saveLocalDraft = <T,>(key: string, label: string, scope: string, data: T) => {
  if (!canUseStorage()) return;

  const record: LocalDraftRecord<T> = {
    key,
    label,
    scope,
    updatedAt: new Date().toISOString(),
    data,
  };

  window.localStorage.setItem(storageKey(key), JSON.stringify(record));
  emitDraftsChanged();
};

export const loadLocalDraft = <T,>(key: string): LocalDraftRecord<T> | null => {
  if (!canUseStorage()) return null;

  const raw = window.localStorage.getItem(storageKey(key));
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
  window.localStorage.removeItem(storageKey(key));
  emitDraftsChanged();
};

export const listLocalDrafts = () => {
  if (!canUseStorage()) return [] as LocalDraftRecord[];

  return Object.keys(window.localStorage)
    .filter((key) => key.startsWith(DRAFT_PREFIX))
    .map((key) => window.localStorage.getItem(key))
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

export const getLocalDraftCount = () => listLocalDrafts().length;

export const subscribeLocalDrafts = (listener: (count: number) => void) => {
  if (typeof window === 'undefined') return () => {};

  const handleChange = () => listener(getLocalDraftCount());
  window.addEventListener(LOCAL_DRAFTS_EVENT, handleChange);
  window.addEventListener('storage', handleChange);
  handleChange();

  return () => {
    window.removeEventListener(LOCAL_DRAFTS_EVENT, handleChange);
    window.removeEventListener('storage', handleChange);
  };
};
