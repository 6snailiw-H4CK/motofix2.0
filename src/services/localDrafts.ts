export const LOCAL_DRAFTS_EVENT = 'motofix:local-drafts';

const DRAFT_PREFIX = 'motofix:draft:';

export type LocalDraftRecord<T = unknown> = {
  key: string;
  label: string;
  scope: string;
  updatedAt: string;
  data: T;
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

  const record: LocalDraftRecord<T> = {
    key,
    label,
    scope,
    updatedAt: new Date().toISOString(),
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
