import { Dispatch, SetStateAction, useCallback, useEffect, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import {
  collection,
  doc,
  getDocFromCache,
  getDocFromServer,
  getDocsFromCache,
  getDocsFromServer,
  limit,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
  type DocumentSnapshot,
  type Query,
  type QuerySnapshot,
} from 'firebase/firestore';
import { db, waitForPendingWrites } from '../firebase';
import {
  createFirestoreReplayDescriptor,
  firestoreOfflineQueueReady,
  getFailedWriteCheckpoint,
  getFailedWrites,
  getPendingWriteCheckpoint,
  getPendingWriteOwners,
  queueFirestoreVoidWrite,
  reconcilePendingWriteCheckpointRemotely,
} from '../services/firestoreOfflineQueue';
import { getLocalCashLaunches, LOCAL_CASH_LAUNCHES_UPDATED_EVENT } from '../services/localCashLaunchRepository';
import { isSoftDeleted } from '../services/softDelete';
import {
  clearFirestoreCollectionSyncFailure,
  getFirestoreCollectionSyncFailure,
  getFirestoreIncrementalSyncStart,
  getFirestoreCollectionSyncRecord,
  isFirestoreCollectionSyncBackedOff,
  isFirestoreCollectionSyncDue,
  isFirestoreCollectionFullAuditDue,
  markFirestoreCollectionSyncFailure,
  saveFirestoreCollectionSyncRecord,
  subscribeFirestoreLocalCollectionMutations,
  withFirestoreCollectionSyncLock,
} from '../services/firestoreCollectionSync';
import {
  Appointment,
  AppView,
  CashRegisterLaunch,
  Client,
  ExpenseRecord,
  FiscalCompany,
  FiscalInvoice,
  FiscalLog,
  MaintenanceRecord,
  MessageLog,
  OperationalLog,
  ProductCatalogItem,
  Settings,
  UserProfile,
  Warranty,
} from '../types';
import { DEFAULT_SETTINGS } from '../constants/appDefaults';
import { recordFirestoreReadResult } from '../debug/firestoreDebug';
import { getUserCollectionsForView, type UserCollectionKey } from './userCollectionScopes';
import { allUserCollectionKeys } from './userCollectionScopes';
import {
  canMarkFirestoreSyncCompleted,
  getLastFirestoreSyncAt,
  deferInitialFirestoreSync,
  isFirestoreSyncDue,
  markFirestoreSyncCompleted,
  withFirestoreNetworkSession,
} from '../services/firestoreNetworkControl';
import { preloadUserOfflineData, shouldPreloadOfflineData } from '../services/offlineDataPreload';
import { recordFirestorePreload } from '../debug/firestoreDebug';

export type CollectionListenerIssue = {
  key: string;
  label: string;
  message: string;
  at: string;
};

type UseUserCollectionsParams = {
  user: User | null;
  userProfile: UserProfile | null;
  isNewUser: boolean | null;
  hasAccountAccess: boolean;
  view: AppView;
};

type CollectionSyncResult = {
  updatedCollections: string[];
  updatedDocuments: number;
  failedCollections: string[];
};

type UseUserCollectionsResult = {
  clients: Client[];
  maintenances: MaintenanceRecord[];
  warranties: Warranty[];
  settings: Settings;
  setSettings: Dispatch<SetStateAction<Settings>>;
  settingsLoaded: boolean;
  messageLogs: MessageLog[];
  appointments: Appointment[];
  expenseEntries: ExpenseRecord[];
  productCatalog: ProductCatalogItem[];
  cashLaunches: CashRegisterLaunch[];
  cashLaunchesLoaded: boolean;
  fiscalCompanies: FiscalCompany[];
  fiscalInvoices: FiscalInvoice[];
  fiscalLogs: FiscalLog[];
  operationalLogs: OperationalLog[];
  collectionListenerIssues: CollectionListenerIssue[];
  refreshCurrentView: () => Promise<CollectionSyncResult>;
  isRefreshingCollections: boolean;
  lastCollectionsSyncedAt: string | null;
};

const buildSettings = (userId: string, data: Record<string, any>): Settings => ({
  userId,
  whatsappTemplate: data.whatsappTemplate || DEFAULT_SETTINGS.whatsappTemplate,
  oilTypes: data.oilTypes || DEFAULT_SETTINGS.oilTypes,
  serviceTypes: Array.isArray(data.serviceTypes) ? data.serviceTypes : [],
  disabledDefaultServiceTypes: Array.isArray(data.disabledDefaultServiceTypes) ? data.disabledDefaultServiceTypes : [],
  warrantyCategories: data.warrantyCategories || DEFAULT_SETTINGS.warrantyCategories,
  businessName: data.businessName || '',
  businessPhone: data.businessPhone || '',
  businessEmail: data.businessEmail || '',
  businessInstagram: data.businessInstagram || '',
  businessAddress: data.businessAddress || '',
  isProfileComplete: data.isProfileComplete || false
});

const buildInitialSettings = (userId: string, isNewUser: boolean | null): Settings => ({
  ...DEFAULT_SETTINGS,
  userId,
  businessName: '',
  isProfileComplete: !isNewUser
});

const mapActiveDocuments = <T,>(documents: Array<{ id: string; data: () => Record<string, unknown> }>): T[] => (
  documents.flatMap((documentSnapshot) => {
    const data = documentSnapshot.data();
    return isSoftDeleted(data) ? [] : [{ id: documentSnapshot.id, ...data } as T];
  })
);

const getReadErrorMessage = (error: unknown) => (
  error instanceof Error ? error.message : String(error)
);

const isQuotaLikeReadError = (error: unknown) => {
  const message = getReadErrorMessage(error).toLowerCase();
  return message.includes('429')
    || message.includes('resource-exhausted')
    || message.includes('quota exceeded')
    || message.includes('too many requests');
};

const mergeCashLaunches = (remoteLaunches: CashRegisterLaunch[]) => {
  const localLaunches = getLocalCashLaunches();
  const combined = [...remoteLaunches, ...localLaunches];
  const byId = new Map<string, CashRegisterLaunch>();

  combined.forEach((launch) => {
    if (!launch?.id || isSoftDeleted(launch)) return;
    const existing = byId.get(launch.id);
    if (!existing || new Date(launch.updatedAt || launch.createdAt).getTime() >= new Date(existing.updatedAt || existing.createdAt).getTime()) {
      byId.set(launch.id, launch);
    }
  });

  return Array.from(byId.values()).sort((left, right) => (
    new Date(right.updatedAt || right.createdAt).getTime() - new Date(left.updatedAt || left.createdAt).getTime()
  ));
};

const collectionLabel: Record<UserCollectionKey, string> = {
  clients: 'Clientes',
  maintenances: 'Historico de servicos',
  warranties: 'Garantias',
  settings: 'Configuracoes',
  message_logs: 'Avisos enviados',
  appointments: 'Agenda',
  expenses: 'Gastos',
  products: 'Mercadorias',
  cash_launches: 'Lancamentos caixa',
  fiscal_companies: 'Empresas fiscais',
  fiscal_invoices: 'Notas fiscais',
  fiscal_logs: 'Logs fiscais',
  operational_logs: 'Logs operacionais',
};

const buildCollectionQuery = (userId: string, key: UserCollectionKey): Query<DocumentData> => {
  const collectionRef = collection(db, 'users', userId, key);
  if (key === 'operational_logs') {
    return query(collectionRef, orderBy('timestamp', 'desc'), limit(50));
  }
  return query(collectionRef);
};

const incrementalCollectionKeys = new Set<UserCollectionKey>([
  'clients',
  'maintenances',
  'warranties',
  'appointments',
  'expenses',
  'products',
  'cash_launches',
  'message_logs',
]);

const buildIncrementalCollectionQuery = (
  userId: string,
  key: UserCollectionKey,
  changedSince: string | null
): Query<DocumentData> => {
  if (!changedSince || !incrementalCollectionKeys.has(key)) return buildCollectionQuery(userId, key);
  return query(
    collection(db, 'users', userId, key),
    where('updatedAt', '>=', changedSince)
  );
};

const latestSyncTime = (userId: string, keys: Iterable<UserCollectionKey>) => {
  const times = Array.from(keys)
    .map((key) => getFirestoreCollectionSyncRecord(userId, key)?.completedAt || null)
    .filter((value): value is string => Boolean(value));
  return times.sort((left, right) => right.localeCompare(left))[0] || null;
};

export function useUserCollections({
  user,
  userProfile,
  isNewUser,
  hasAccountAccess,
  view,
}: UseUserCollectionsParams): UseUserCollectionsResult {
  const [clients, setClients] = useState<Client[]>([]);
  const [maintenances, setMaintenances] = useState<MaintenanceRecord[]>([]);
  const [warranties, setWarranties] = useState<Warranty[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [messageLogs, setMessageLogs] = useState<MessageLog[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [expenseEntries, setExpenseEntries] = useState<ExpenseRecord[]>([]);
  const [productCatalog, setProductCatalog] = useState<ProductCatalogItem[]>([]);
  const [cashLaunches, setCashLaunches] = useState<CashRegisterLaunch[]>([]);
  const [cashLaunchesLoaded, setCashLaunchesLoaded] = useState(false);
  const [fiscalCompanies, setFiscalCompanies] = useState<FiscalCompany[]>([]);
  const [fiscalInvoices, setFiscalInvoices] = useState<FiscalInvoice[]>([]);
  const [fiscalLogs, setFiscalLogs] = useState<FiscalLog[]>([]);
  const [operationalLogs, setOperationalLogs] = useState<OperationalLog[]>([]);
  const [collectionListenerIssuesByKey, setCollectionListenerIssuesByKey] = useState<Record<string, CollectionListenerIssue>>({});
  const collectionIssueRef = useRef<Record<string, CollectionListenerIssue>>({});
  const [isRefreshingCollections, setIsRefreshingCollections] = useState(false);
  const [lastCollectionsSyncedAt, setLastCollectionsSyncedAt] = useState<string | null>(null);
  const loadedCollections = useRef(new Set<string>());
  const inFlightSyncs = useRef(new Map<string, Promise<number>>());
  const networkSyncInFlight = useRef<{ userId: string; promise: Promise<CollectionSyncResult> } | null>(null);
  const syncCount = useRef(0);
  const currentUserId = user?.uid;
  const activeUserId = useRef<string | undefined>(currentUserId);
  activeUserId.current = currentUserId && userProfile && hasAccountAccess ? currentUserId : undefined;

  const syncLocalCashLaunches = useCallback(() => {
    if (!currentUserId || !hasAccountAccess) {
      setCashLaunches([]);
      return;
    }
    setCashLaunches((currentLaunches) => {
      const localIds = new Set(getLocalCashLaunches().map((launch) => launch.id));
      return mergeCashLaunches(currentLaunches.filter((launch) => !localIds.has(launch.id)));
    });
  }, [currentUserId, hasAccountAccess]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.addEventListener(LOCAL_CASH_LAUNCHES_UPDATED_EVENT, syncLocalCashLaunches);
    syncLocalCashLaunches();
    return () => window.removeEventListener(LOCAL_CASH_LAUNCHES_UPDATED_EVENT, syncLocalCashLaunches);
  }, [syncLocalCashLaunches]);

  const clearCollectionIssue = useCallback((key: string) => {
    setCollectionListenerIssuesByKey((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      collectionIssueRef.current = next;
      return next;
    });
  }, []);

  const recordCollectionIssue = useCallback((key: string, error: unknown) => {
    const message = getReadErrorMessage(error);
    if (collectionIssueRef.current[key]?.message === message) return;
    if (isQuotaLikeReadError(error)) {
      console.warn(`${collectionLabel[key as UserCollectionKey] || key} sync quota issue:`, error);
    } else {
      console.error(`${collectionLabel[key as UserCollectionKey] || key} sync error:`, error);
    }
    setCollectionListenerIssuesByKey((current) => {
      const next = {
        ...current,
        [key]: {
        key,
        label: collectionLabel[key as UserCollectionKey] || key,
          message,
        at: new Date().toISOString(),
        },
      };
      collectionIssueRef.current = next;
      return next;
    });
  }, []);

  const applyQuerySnapshot = useCallback((
    key: UserCollectionKey,
    snapshot: QuerySnapshot<DocumentData>,
    userId: string
  ) => {
    if (activeUserId.current !== userId) return;
    switch (key) {
      case 'clients':
        setClients(mapActiveDocuments<Client>(snapshot.docs));
        break;
      case 'maintenances':
        setMaintenances(mapActiveDocuments<MaintenanceRecord>(snapshot.docs)
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
        break;
      case 'warranties':
        setWarranties(mapActiveDocuments<Warranty>(snapshot.docs)
          .sort((a, b) => b.warrantyNumber - a.warrantyNumber));
        break;
      case 'appointments':
        setAppointments(mapActiveDocuments<Appointment>(snapshot.docs)
          .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate)));
        break;
      case 'expenses':
        setExpenseEntries(mapActiveDocuments<ExpenseRecord>(snapshot.docs)
          .sort((a, b) => b.date.localeCompare(a.date)));
        break;
      case 'products':
        setProductCatalog(mapActiveDocuments<ProductCatalogItem>(snapshot.docs)
          .sort((a, b) => a.description.localeCompare(b.description)));
        break;
      case 'cash_launches':
        setCashLaunches(mergeCashLaunches(mapActiveDocuments<CashRegisterLaunch>(snapshot.docs)));
        setCashLaunchesLoaded(true);
        break;
      case 'fiscal_companies':
        setFiscalCompanies(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as FiscalCompany))
          .sort((a, b) => a.legalName.localeCompare(b.legalName)));
        break;
      case 'fiscal_invoices':
        setFiscalInvoices(mapActiveDocuments<FiscalInvoice>(snapshot.docs)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
        break;
      case 'fiscal_logs':
        setFiscalLogs(mapActiveDocuments<FiscalLog>(snapshot.docs)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
        break;
      case 'operational_logs':
        setOperationalLogs(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as OperationalLog)));
        break;
      case 'message_logs':
        setMessageLogs(mapActiveDocuments<MessageLog>(snapshot.docs)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
        break;
      case 'settings':
        break;
      default:
        break;
    }
    loadedCollections.current.add(`${userId}:${key}`);
  }, []);

  const applySettingsSnapshot = useCallback((
    snapshot: DocumentSnapshot<DocumentData>,
    userId: string,
    fromServer: boolean
  ) => {
    if (activeUserId.current !== userId) return;
    if (snapshot.exists()) {
      const data = snapshot.data();
      const updatedSettings = buildSettings(userId, data);
      setSettings(updatedSettings);
      setSettingsLoaded(true);

      const needsUpdate = !data.oilTypes || !data.warrantyCategories || data.isProfileComplete === undefined;
      if (fromServer && needsUpdate) {
        const defaultsPatch = {
          oilTypes: updatedSettings.oilTypes,
          warrantyCategories: updatedSettings.warrantyCategories,
          isProfileComplete: updatedSettings.isProfileComplete,
        };
        queueFirestoreVoidWrite(
          () => updateDoc(snapshot.ref, defaultsPatch),
          'Atualizar configuracoes padrao',
          createFirestoreReplayDescriptor('update', ['users', userId, 'settings', 'config'], defaultsPatch),
          userId,
        ).catch((error) => console.error('Error updating settings with defaults', error));
      }
    } else {
      const initialSettings = buildInitialSettings(userId, isNewUser);
      setSettings(initialSettings);
      setSettingsLoaded(true);
      if (fromServer) {
        queueFirestoreVoidWrite(
          () => setDoc(doc(db, 'users', userId, 'settings', 'config'), initialSettings),
          'Criar configuracoes iniciais',
          createFirestoreReplayDescriptor(
            'set',
            ['users', userId, 'settings', 'config'],
            initialSettings as unknown as Record<string, unknown>,
          ),
          userId,
        ).catch((error) => console.error('Error creating settings', error));
      }
    }
    loadedCollections.current.add(`${userId}:settings`);
  }, [isNewUser]);

  const loadCollectionFromCache = useCallback(async (key: UserCollectionKey, userId: string) => {
    try {
      if (key === 'settings') {
        const snapshot = await getDocFromCache(doc(db, 'users', userId, 'settings', 'config'));
        applySettingsSnapshot(snapshot, userId, false);
        recordFirestoreReadResult(`cache:${key}`, snapshot);
        return snapshot.exists() ? 1 : 0;
      }
      const snapshot = await getDocsFromCache(buildCollectionQuery(userId, key));
      applyQuerySnapshot(key, snapshot, userId);
      recordFirestoreReadResult(`cache:${key}`, snapshot);
      return snapshot.size;
    } catch {
      // A missing cache entry is expected on the first visit; fetch from the server below.
      return null;
    }
  }, [applyQuerySnapshot, applySettingsSnapshot]);

  const loadCollectionFromServer = useCallback(async (
    key: UserCollectionKey,
    userId: string,
    force: boolean
  ): Promise<number> => {
    // Reading IndexedDB does not consume Firestore server reads. Refresh state from it
    // before deciding whether a network sync is due, and detect an evicted cache.
    const cacheCount = await loadCollectionFromCache(key, userId);
    const effectiveCacheCount = cacheCount ?? 0;
    if (!force && isFirestoreCollectionSyncBackedOff(userId, key)) {
      const failure = getFirestoreCollectionSyncFailure(userId, key);
      if (failure) {
        recordCollectionIssue(key, new Error(
          `${failure.message} A nova tentativa automatica sera feita apos ${new Date(failure.retryAfter).toLocaleTimeString('pt-BR')}.`
        ));
      }
      return 0;
    }
    const currentSyncRecord = getFirestoreCollectionSyncRecord(userId, key);
    const requiresIncrementalBaseline = incrementalCollectionKeys.has(key)
      && (!currentSyncRecord?.changeCursor || isFirestoreCollectionFullAuditDue(currentSyncRecord));
    if (!force && !requiresIncrementalBaseline && !isFirestoreCollectionSyncDue(userId, key, effectiveCacheCount)) return 0;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      if (cacheCount === null) recordCollectionIssue(key, new Error('Sem conexao e sem dados locais desta colecao.'));
      return 0;
    }

    const syncKey = `${userId}:${key}`;
    const existingSync = inFlightSyncs.current.get(syncKey);
    if (existingSync) return existingSync;

    const syncPromise = (async () => {
      syncCount.current += 1;
      setIsRefreshingCollections(true);
      try {
        const locked = await withFirestoreCollectionSyncLock(userId, key, async () => {
          const latestRecord = getFirestoreCollectionSyncRecord(userId, key);
          const syncedRecently = latestRecord
            && Date.now() - Date.parse(latestRecord.completedAt) < 15_000;
          const requiresIncrementalBaseline = incrementalCollectionKeys.has(key)
            && (!latestRecord?.changeCursor || isFirestoreCollectionFullAuditDue(latestRecord));
          if (!force && !requiresIncrementalBaseline && !isFirestoreCollectionSyncDue(userId, key, effectiveCacheCount)) return null;
          if (force && syncedRecently) return null;

          if (key === 'settings') {
            const snapshot = await getDocFromServer(doc(db, 'users', userId, 'settings', 'config'));
            recordFirestoreReadResult(key, snapshot);
            applySettingsSnapshot(snapshot, userId, true);
            saveFirestoreCollectionSyncRecord(userId, key, {
              completedAt: new Date().toISOString(),
              documentCount: snapshot.exists() ? 1 : 0,
            });
            clearFirestoreCollectionSyncFailure(userId, key);
            return snapshot.exists() ? 1 : 0;
          }

          const syncStartedAt = new Date().toISOString();
          const canUseIncremental = incrementalCollectionKeys.has(key)
            && Boolean(latestRecord?.changeCursor)
            && cacheCount !== null
            && !((latestRecord?.documentCount || 0) > 0 && cacheCount < (latestRecord?.documentCount || 0))
            && !isFirestoreCollectionFullAuditDue(latestRecord);
          const changedSince = canUseIncremental
            ? getFirestoreIncrementalSyncStart(latestRecord, syncStartedAt)
            : null;
          const snapshot = await getDocsFromServer(
            buildIncrementalCollectionQuery(userId, key, changedSince)
          );
          recordFirestoreReadResult(key, snapshot);

          let cachedDocumentCount = snapshot.size;
          if (changedSince) {
            // The server query updates only changed documents in Firestore's persistent
            // cache. Re-read the full cache locally so unchanged records remain visible.
            const cachedSnapshot = await getDocsFromCache(buildCollectionQuery(userId, key));
            applyQuerySnapshot(key, cachedSnapshot, userId);
            cachedDocumentCount = cachedSnapshot.size;
          } else {
            applyQuerySnapshot(key, snapshot, userId);
          }
          saveFirestoreCollectionSyncRecord(userId, key, {
            completedAt: new Date().toISOString(),
            documentCount: cachedDocumentCount,
            ...(incrementalCollectionKeys.has(key) ? { changeCursor: syncStartedAt } : {}),
            ...(!changedSince && incrementalCollectionKeys.has(key)
              ? { lastFullSyncAt: syncStartedAt }
              : latestRecord?.lastFullSyncAt ? { lastFullSyncAt: latestRecord.lastFullSyncAt } : {}),
          });
          clearFirestoreCollectionSyncFailure(userId, key);
          return snapshot.size;
        });

        if (!locked.acquired) {
          // Another tab is syncing this same collection. Reuse its shared IndexedDB cache afterward.
          await new Promise((resolve) => window.setTimeout(resolve, 350));
          await loadCollectionFromCache(key, userId);
          return 0;
        }
        if (locked.value === null || locked.value === undefined) return 0;
        clearCollectionIssue(key);
        setLastCollectionsSyncedAt(new Date().toISOString());
        return locked.value;
      } catch (error) {
        markFirestoreCollectionSyncFailure(userId, key, error);
        recordCollectionIssue(key, error);
        return 0;
      } finally {
        syncCount.current = Math.max(0, syncCount.current - 1);
        setIsRefreshingCollections(syncCount.current > 0);
        inFlightSyncs.current.delete(syncKey);
      }
    })();
    inFlightSyncs.current.set(syncKey, syncPromise);
    return syncPromise;
  }, [applyQuerySnapshot, applySettingsSnapshot, clearCollectionIssue, loadCollectionFromCache, recordCollectionIssue]);

  const syncCollections = useCallback(async (
    keys: Iterable<UserCollectionKey>,
    force: boolean
  ): Promise<CollectionSyncResult> => {
    if (!currentUserId || !userProfile || !hasAccountAccess) {
      return { updatedCollections: [], updatedDocuments: 0, failedCollections: [] };
    }
    const requestedKeys = Array.from(new Set(keys));
    await firestoreOfflineQueueReady;
    const activeSync = networkSyncInFlight.current;
    if (activeSync) {
      const activeResult = await activeSync.promise;
      if (activeSync.userId === currentUserId) return activeResult;
    }
    if (!force && !getLastFirestoreSyncAt(currentUserId) && getPendingWriteCheckpoint().length > 0) {
      // On an upgraded browser, do not send an older pending queue at startup.
      // Start the four-hour cycle and let the user trigger an earlier sync.
      deferInitialFirestoreSync(currentUserId);
      for (const key of requestedKeys) await loadCollectionFromCache(key, currentUserId);
      return { updatedCollections: [], updatedDocuments: 0, failedCollections: [] };
    }
    const fullSyncDue = isFirestoreSyncDue(currentUserId);
    const shouldSyncCloud = force || fullSyncDue;
    if (!shouldSyncCloud || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
      // Routine navigation stays cache-only. Firestore enables reads and writes
      // together, so opening a read session here could upload a concurrent edit.
      for (const key of requestedKeys) await loadCollectionFromCache(key, currentUserId);
      return { updatedCollections: [], updatedDocuments: 0, failedCollections: [] };
    }

    const pendingOwners = getPendingWriteOwners();
    const otherOwners = pendingOwners.userIds.filter((ownerId) => ownerId !== currentUserId);
    if (otherOwners.length > 0) {
      const error = new Error('Há alterações locais de outra conta aguardando envio. Entre nessa conta e sincronize antes de trocar o usuário.');
      recordCollectionIssue('sync', error);
      return { updatedCollections: [], updatedDocuments: 0, failedCollections: ['sync'] };
    }

    const syncPromise = (async (): Promise<CollectionSyncResult> => {
      try {
      const syncResult = await withFirestoreNetworkSession(currentUserId, async () => {
        const updatedCollections: string[] = [];
        const failedCollections: string[] = [];
        let updatedDocuments = 0;
        const pendingCheckpoint = getPendingWriteCheckpoint();
        // A manual sync also re-checks previously rejected writes. This lets
        // the server confirm stale queue rows that were actually accepted,
        // while scheduled background sync avoids repeatedly retrying errors.
        const failedCheckpoint = force ? getFailedWriteCheckpoint(currentUserId) : [];
        await reconcilePendingWriteCheckpointRemotely(
          Array.from(new Set([...pendingCheckpoint, ...failedCheckpoint])),
          currentUserId,
          () => waitForPendingWrites(db),
        );
        // A scheduled full cycle refreshes every collection. A manual sync sends
        // every queued write but only forces reads for the currently open view.
        const keysToRefresh = fullSyncDue ? allUserCollectionKeys : requestedKeys;
        for (const key of keysToRefresh) {
          const before = getFirestoreCollectionSyncRecord(currentUserId, key)?.completedAt || null;
          const forceCollectionRefresh = force && !fullSyncDue;
          const count = await loadCollectionFromServer(key, currentUserId, forceCollectionRefresh);
          const after = getFirestoreCollectionSyncRecord(currentUserId, key)?.completedAt || null;
          if (after && after !== before) {
            updatedCollections.push(key);
            updatedDocuments += count;
          }
          if (collectionIssueRef.current[key]) failedCollections.push(key);
        }

        if (shouldPreloadOfflineData(currentUserId)) {
          const preloadStartedAt = Date.now();
          try {
            const preloadResult = await preloadUserOfflineData({ userId: currentUserId });
            recordFirestorePreload('scheduled-sync', Date.now() - preloadStartedAt, {
              status: preloadResult.status,
              loadedDocuments: preloadResult.loadedDocuments,
              failedTargets: preloadResult.failedTargets,
            });
            if (preloadResult.status === 'partial') {
              console.warn('Dados offline preparados parcialmente:', preloadResult.failedTargets);
            }
          } catch (error) {
            console.warn('Falha ao preparar dados para uso offline:', error);
          }
        }

        if (failedCollections.length === 0) clearCollectionIssue('sync');
          return { updatedCollections, updatedDocuments, failedCollections };
      });
      const failedWrites = getFailedWrites().filter((write) => (
        write.ownerId === null || write.ownerId === currentUserId
      ));
      const pendingWrites = getPendingWriteCheckpoint().length;
      if (failedWrites.length > 0) {
        const error = new Error(`${failedWrites.length} alteração(ões) local(is) foram recusadas ao sincronizar. Consulte a fila de falhas.`);
        recordCollectionIssue('sync', error);
        return {
          ...syncResult,
          failedCollections: [...syncResult.failedCollections, 'fila de gravações'],
        };
      }
      if (pendingWrites > 0) {
        const error = new Error(`${pendingWrites} alteração(ões) ainda não receberam confirmação individual do Firestore.`);
        recordCollectionIssue('sync', error);
        return {
          ...syncResult,
          failedCollections: [...syncResult.failedCollections, 'fila de gravações'],
        };
      }
      if (fullSyncDue && canMarkFirestoreSyncCompleted({
        failedCollections: syncResult.failedCollections.length,
        pendingWrites,
        failedWrites: failedWrites.length,
      })) {
        markFirestoreSyncCompleted(currentUserId);
        setLastCollectionsSyncedAt(getLastFirestoreSyncAt(currentUserId));
      }
      return syncResult;
      } catch (error) {
        recordCollectionIssue('sync', error);
        return { updatedCollections: [], updatedDocuments: 0, failedCollections: ['sync'] };
      }
    })();
    networkSyncInFlight.current = { userId: currentUserId, promise: syncPromise };
    try {
      return await syncPromise;
    } finally {
      if (networkSyncInFlight.current?.promise === syncPromise) networkSyncInFlight.current = null;
    }
  }, [currentUserId, hasAccountAccess, loadCollectionFromCache, loadCollectionFromServer, userProfile]);

  const activeCollections = getUserCollectionsForView(view);
  const refreshCurrentView = useCallback(
    () => syncCollections(activeCollections, true),
    [activeCollections, syncCollections]
  );

  useEffect(() => {
    const resetCollections = () => {
      setCollectionListenerIssuesByKey({});
      collectionIssueRef.current = {};
      setClients([]);
      setMaintenances([]);
      setWarranties([]);
      setSettings(DEFAULT_SETTINGS);
      setSettingsLoaded(false);
      setMessageLogs([]);
      setAppointments([]);
      setExpenseEntries([]);
      setProductCatalog([]);
      setCashLaunches([]);
      setCashLaunchesLoaded(false);
      setFiscalCompanies([]);
      setFiscalInvoices([]);
      setFiscalLogs([]);
      setOperationalLogs([]);
      loadedCollections.current.clear();
      inFlightSyncs.current.clear();
      setLastCollectionsSyncedAt(null);
    };

    if (!currentUserId || !userProfile || !hasAccountAccess) {
      resetCollections();
      return;
    }
    resetCollections();
  }, [currentUserId, hasAccountAccess, !!userProfile]);

  useEffect(() => {
    if (!currentUserId || !userProfile || !hasAccountAccess) return;
    setLastCollectionsSyncedAt(getLastFirestoreSyncAt(currentUserId)
      || latestSyncTime(currentUserId, getUserCollectionsForView(view)));
    void syncCollections(getUserCollectionsForView(view), false);
    // Recheck the four-hour sync deadline on foreground/network return; timers do
    // not run reliably while a PWA is suspended.
    const syncIfVisible = () => {
      if (document.visibilityState === 'visible') {
        void syncCollections(getUserCollectionsForView(view), false);
      }
    };
    // Check freshness periodically; this performs no Firestore read unless a collection is at least four hours old.
    const intervalId = window.setInterval(
      () => syncIfVisible(),
      5 * 60 * 1000
    );
    window.addEventListener('online', syncIfVisible);
    window.addEventListener('focus', syncIfVisible);
    document.addEventListener('visibilitychange', syncIfVisible);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('online', syncIfVisible);
      window.removeEventListener('focus', syncIfVisible);
      document.removeEventListener('visibilitychange', syncIfVisible);
    };
  }, [currentUserId, hasAccountAccess, syncCollections, userProfile, view]);

  useEffect(() => {
    if (!currentUserId || !userProfile || !hasAccountAccess) return;
    const active = getUserCollectionsForView(view);
    return subscribeFirestoreLocalCollectionMutations(({ userId, collections: changedCollections }) => {
      if (userId !== currentUserId) return;
      const keys = changedCollections.filter((key): key is UserCollectionKey => (
        active.has(key as UserCollectionKey)
      ));
      if (keys.length === 0) return;
      // Firestore updates its persistent cache optimistically for local writes; reread that cache only.
      window.setTimeout(() => {
        keys.forEach((key) => {
          void loadCollectionFromCache(key, currentUserId);
        });
      }, 80);
    });
  }, [currentUserId, hasAccountAccess, loadCollectionFromCache, userProfile, view]);

  return {
    clients,
    maintenances,
    warranties,
    settings,
    setSettings,
    settingsLoaded,
    messageLogs,
    appointments,
    expenseEntries,
    productCatalog,
    cashLaunches,
    cashLaunchesLoaded,
    fiscalCompanies,
    fiscalInvoices,
    fiscalLogs,
    operationalLogs,
    collectionListenerIssues: Object.values(collectionListenerIssuesByKey).sort((a, b) => b.at.localeCompare(a.at)),
    refreshCurrentView,
    isRefreshingCollections,
    lastCollectionsSyncedAt,
  };
}
