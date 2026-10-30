const STORAGE_PREFIX = 'motofix:server-confirmed-operational-logs:';
const MAX_REMEMBERED_LOG_IDS = 100;

const storageKey = (userId: string) => `${STORAGE_PREFIX}${userId}`;

const readConfirmedIds = (userId: string): string[] => {
  if (typeof window === 'undefined') return [];

  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey(userId)) || '[]');
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === 'string')
      : [];
  } catch {
    return [];
  }
};

/** Remembers which recent log documents were actually returned by a server read. */
export const rememberServerConfirmedOperationalLogs = (userId: string, logIds: string[]) => {
  if (typeof window === 'undefined' || logIds.length === 0) return;

  const existing = readConfirmedIds(userId);
  const next = Array.from(new Set([...logIds, ...existing])).slice(0, MAX_REMEMBERED_LOG_IDS);
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(next));
  } catch (error) {
    console.warn('Nao foi possivel guardar a confirmacao local dos logs sincronizados:', error);
  }
};

export const getServerConfirmedOperationalLogIds = (userId: string) => (
  new Set(readConfirmedIds(userId))
);
