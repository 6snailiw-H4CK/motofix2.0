import {
  collection,
  doc,
  getDoc,
  getDocFromCache,
  getDocs,
  getDocsFromCache,
  query,
  serverTimestamp,
  Timestamp,
  where,
  writeBatch,
} from "firebase/firestore";
import { auth, db } from "../firebase";
import { trackFirestoreRead } from "../debug/firestoreDebug";
import { firestoreOfflineQueueReady, getPendingWriteCheckpoint } from "./firestoreOfflineQueue";
import { withFirestoreNetworkSession } from "./firestoreNetworkControl";

export type MasterAdminFilters = {
  search: string;
  status: "all" | "active" | "blocked" | "expiring";
  role: "all" | "user" | "admin" | "master_admin";
  pageSize: number;
};

export type MasterAdminAccount = {
  uid: string;
  displayName: string | null;
  email: string | null;
  role: "user" | "admin" | "master_admin" | null;
  requestStatus: "pending" | "approved" | "blocked";
  directorySource: "access_request" | "legacy_profile_backfill";
  isActive: boolean;
  accountState: "active" | "blocked";
  createdAt: string | null;
  manualAccessExpiresAt: string | null;
  manualAccessState: "active" | "expired" | "none";
  ownerAccess: { enabled: boolean; permanent: boolean };
  accessAllowed: boolean | null;
  entitlementSource: "owner" | "master_admin" | "stripe" | "manual" | "none" | null;
  accessValidUntil: string | null;
  legacyPlan: string | null;
  legacyAutoRenew: boolean | null;
  billingStatus: string | null;
  billingCurrentPeriodEnd: string | null;
};

export type MasterAdminMetrics = {
  total: number;
  active: number;
  blocked: number;
  expiringSoon: number;
  newThisMonth: number;
};

export type MasterAdminListResponse = {
  users: MasterAdminAccount[];
  total: number;
  pageSize: number;
  nextCursor: string | null;
  hasMore: boolean;
  metrics: MasterAdminMetrics;
  dataSource: "cache" | "server";
  cachedAt: string | null;
};

type AuditState = Record<string, unknown>;

export type MasterAdminAuditEvent = {
  id: string;
  actor: string | null;
  action: string | null;
  target: string | null;
  before: AuditState | null;
  after: AuditState | null;
  source: string | null;
  reason: string | null;
  plan: string | null;
  amount: number | null;
  paymentMethod: "pix" | "manual" | "none" | null;
  paymentConfirmed: boolean | null;
  timestamp: string | null;
  claimsSyncStatus: string | null;
  claimsSyncAttempts: number | null;
  claimsSyncError: string | null;
  claimsSyncUpdatedAt: string | null;
  claimsSyncFailureAt: string | null;
  claimsSyncedAt: string | null;
};

export type MasterAdminAccountDetail = {
  dataSource: "cache" | "server";
  account: MasterAdminAccount & {
    accessDecision: {
      allowed: boolean;
      status: string;
      reason: string;
      accountState: string;
      entitlementSource: "owner" | "master_admin" | "stripe" | "manual" | "none";
      expiresAt: string | null;
      evaluatedAt: string;
    };
    accessProjection: {
      allowed: boolean | null;
      source: string | null;
      validUntil: string | null;
      reason: string | null;
      evaluatedAt: string | null;
      policyVersion: string | null;
    };
    manualAccess: {
      enabled: boolean;
      expiresAt: string | null;
      updatedBy: string | null;
      updatedAt: string | null;
    };
    billing: Record<string, string | boolean | null>;
    legacySubscription: { plan: string | null; autoRenew: boolean | null; stripeSubscriptionId: string | null };
  };
  auditEvents: MasterAdminAuditEvent[];
};

const MASTER_ADMIN_DIRECTORY_CACHE_KEY = "motofix:master-admin-directory-cache:v1";
type MasterAdminDirectoryCacheState = Record<string, { requestCount: number; cachedAt: string }>;

const readMasterAdminDirectoryCache = (): MasterAdminDirectoryCacheState => {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(MASTER_ADMIN_DIRECTORY_CACHE_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed as MasterAdminDirectoryCacheState : {};
  } catch {
    return {};
  }
};

const saveMasterAdminDirectoryCache = (actor: string, requestCount: number, cachedAt: string) => {
  if (typeof window === "undefined") return;
  const state = readMasterAdminDirectoryCache();
  state[actor] = { requestCount, cachedAt };
  try {
    window.localStorage.setItem(MASTER_ADMIN_DIRECTORY_CACHE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn("Nao foi possivel registrar a conclusao do cache Master Admin:", error);
  }
};

export class MasterAdminRequestError extends Error {
  constructor(message: string, readonly status: number | null = null) {
    super(message);
    this.name = "MasterAdminRequestError";
  }
}

type AccessRequestRecord = {
  uid: string;
  email?: string;
  displayName?: string;
  status: "pending" | "approved" | "blocked";
  createdAt?: unknown;
  lastAuditId?: string;
  manualAccessExpiresAt?: unknown;
  accessDetails?: Record<string, unknown>;
  source?: unknown;
};

type UserProfileRecord = {
  email?: unknown;
  displayName?: unknown;
  role?: unknown;
  isActive?: unknown;
  ownerAccess?: { enabled?: unknown; permanent?: unknown };
  manualAccess?: { enabled?: unknown; expiresAt?: unknown; updatedAt?: unknown; updatedBy?: unknown };
  accessProjection?: {
    allowed?: unknown;
    source?: unknown;
    validUntil?: unknown;
    reason?: unknown;
    evaluatedAt?: unknown;
    policyVersion?: unknown;
  };
  subscription?: { plan?: unknown; autoRenew?: unknown; currentPeriodEnd?: unknown };
  billing?: { status?: unknown; currentPeriodEnd?: unknown };
  createdAt?: unknown;
};

type AccessDecisionRecord = {
  actor?: unknown;
  targetUid?: unknown;
  action?: unknown;
  before?: unknown;
  after?: unknown;
  details?: { reason?: unknown; plan?: unknown; amount?: unknown; paymentMethod?: unknown; paymentConfirmed?: unknown };
  createdAt?: unknown;
};

const dateValue = (value: unknown): Date | null => {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    const parsed = value.toDate();
    return parsed instanceof Date && Number.isFinite(parsed.getTime()) ? parsed : null;
  }
  return null;
};

const isoValue = (value: unknown): string | null => dateValue(value)?.toISOString() ?? null;

const record = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);

const roleValue = (value: unknown): MasterAdminAccount["role"] => (
  value === "user" || value === "admin" || value === "master_admin" ? value : null
);

const accessExpiryFromProfile = (profile: UserProfileRecord): Date | null => (
  profile.manualAccess?.enabled === true ? dateValue(profile.manualAccess.expiresAt) : null
);

const accessAllowedForProfile = (profile: UserProfileRecord, now: number) => {
  if (profile.isActive !== true) return false;
  if (profile.role === "master_admin") return true;
  if (profile.ownerAccess?.enabled === true && profile.ownerAccess.permanent === true) return true;
  const expiry = accessExpiryFromProfile(profile);
  if (profile.manualAccess?.enabled === true && !!expiry && expiry.getTime() > now) return true;
  const projectedExpiry = dateValue(profile.accessProjection?.validUntil);
  return profile.accessProjection?.allowed === true && !!projectedExpiry && projectedExpiry.getTime() > now;
};

const accountFromRequest = (
  request: AccessRequestRecord,
  profile?: UserProfileRecord,
  now = Date.now(),
): MasterAdminAccount => {
  const expiry = profile ? accessExpiryFromProfile(profile) : dateValue(request.manualAccessExpiresAt);
  const isActive = profile ? profile.isActive === true : request.status === "approved";
  const ownerEnabled = profile?.ownerAccess?.enabled === true;
  const ownerPermanent = ownerEnabled && profile?.ownerAccess?.permanent === true;
  const manualEnabled = profile ? profile.manualAccess?.enabled === true : request.status === "approved";
  const manualAccessState = manualEnabled
    ? expiry && expiry.getTime() > now ? "active" : "expired"
    : "none";
  const accessAllowed = profile
    ? accessAllowedForProfile(profile, now)
    : request.status === "approved" && !!expiry && expiry.getTime() > now;
  const projectedSource = profile?.accessProjection?.source;
  const source = accessAllowed
    ? profile?.role === "master_admin" ? "master_admin"
      : ownerPermanent ? "owner"
      : manualEnabled ? "manual"
        : projectedSource === "stripe" ? "stripe"
          : projectedSource === "manual" ? "manual" : "none"
    : "none";
  const subscription = profile?.subscription;

  return {
    uid: request.uid,
    displayName: request.displayName ?? (typeof profile?.displayName === "string" ? profile.displayName : null),
    email: request.email ?? (typeof profile?.email === "string" ? profile.email : null),
    role: profile ? roleValue(profile.role) : "user",
    requestStatus: request.status,
    directorySource: request.source === "legacy_profile_backfill" ? "legacy_profile_backfill" : "access_request",
    isActive,
    accountState: request.status === "blocked" || !isActive ? "blocked" : "active",
    createdAt: isoValue(request.createdAt),
    manualAccessExpiresAt: isoValue(expiry),
    manualAccessState,
    ownerAccess: { enabled: ownerEnabled, permanent: ownerPermanent },
    accessAllowed,
    entitlementSource: source,
    accessValidUntil: isoValue(expiry),
    legacyPlan: typeof subscription?.plan === "string" ? subscription.plan : null,
    legacyAutoRenew: typeof subscription?.autoRenew === "boolean" ? subscription.autoRenew : null,
    billingStatus: typeof profile?.billing?.status === "string" ? profile.billing.status : null,
    billingCurrentPeriodEnd: isoValue(profile?.billing?.currentPeriodEnd ?? subscription?.currentPeriodEnd),
  };
};

const isBrowserOnline = () => typeof navigator === "undefined" || navigator.onLine !== false;

const buildMasterAdminListResponse = (
  allAccounts: MasterAdminAccount[],
  filters: MasterAdminFilters,
  cursor: string | null,
  dataSource: MasterAdminListResponse["dataSource"],
  cachedAt: string | null,
): MasterAdminListResponse => {
  const now = Date.now();
  const normalizedSearch = filters.search.trim().toLocaleLowerCase();
  const filtered = allAccounts.filter((account) => {
    const searchMatch = !normalizedSearch
      || account.uid.toLocaleLowerCase() === normalizedSearch
      || account.email?.toLocaleLowerCase() === normalizedSearch;
    const expiry = account.manualAccessExpiresAt ? Date.parse(account.manualAccessExpiresAt) : NaN;
    const statusMatch = filters.status === "all"
      || (filters.status === "active" ? account.accessAllowed === true
        : filters.status === "blocked" ? account.requestStatus === "blocked"
          || (account.directorySource === "legacy_profile_backfill" && !account.isActive)
          : Number.isFinite(expiry) && expiry > now && expiry <= now + 7 * 86_400_000);
    const roleMatch = filters.role === "all" || account.role === filters.role;
    return searchMatch && statusMatch && roleMatch;
  });
  const requestedPageSize = Number.isFinite(filters.pageSize) ? Math.floor(filters.pageSize) : 50;
  const pageSize = Math.max(1, Math.min(50, requestedPageSize));
  const offset = cursor === null ? 0 : Number(cursor);
  if (!Number.isInteger(offset) || offset < 0) {
    throw new MasterAdminRequestError("Cursor de paginação inválido.");
  }
  const users = filtered.slice(offset, offset + pageSize);
  const monthStart = new Date(new Date(now).getFullYear(), new Date(now).getMonth(), 1).getTime();
  const metrics = {
    total: allAccounts.length,
    active: allAccounts.filter((account) => account.accessAllowed).length,
    blocked: allAccounts.filter((account) => account.requestStatus === "blocked"
      || (account.directorySource === "legacy_profile_backfill" && !account.isActive)).length,
    expiringSoon: allAccounts.filter((account) => {
      const expiry = account.manualAccessExpiresAt ? Date.parse(account.manualAccessExpiresAt) : NaN;
      return Number.isFinite(expiry) && expiry > now && expiry <= now + 7 * 86_400_000;
    }).length,
    newThisMonth: allAccounts.filter((account) => !!account.createdAt && Date.parse(account.createdAt) >= monthStart).length,
  };
  const nextOffset = offset + users.length;
  return {
    users,
    total: filtered.length,
    pageSize,
    nextCursor: nextOffset < filtered.length ? String(nextOffset) : null,
    hasMore: nextOffset < filtered.length,
    metrics,
    dataSource,
    cachedAt,
  };
};

const requireAdminSession = () => {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new MasterAdminRequestError("Sessão Firebase ausente.", 401);
  return uid;
};

const withAdminNetworkSession = async <T,>(task: () => Promise<T>) => {
  const actor = requireAdminSession();
  await firestoreOfflineQueueReady;
  if (getPendingWriteCheckpoint().length > 0) {
    throw new MasterAdminRequestError(
      "Há alterações operacionais locais aguardando envio. Sincronize pelo app antes de abrir os dados administrativos.",
      409,
    );
  }
  return withFirestoreNetworkSession(actor, task);
};

const requestError = (error: unknown) => {
  if (error instanceof MasterAdminRequestError) return error;
  const code = record(error)?.code;
  if (code === "permission-denied") {
    return new MasterAdminRequestError(
      "O Firestore recusou o acesso. Confirme se a conta tem claim Master Admin e perfil ativo.",
      403,
    );
  }
  if (code === "resource-exhausted" || code === 8 || code === "8") {
    return new MasterAdminRequestError(
      "A cota de leitura do Firestore foi excedida. Consulte o uso do projeto ou tente novamente após a cota ser restaurada.",
      429,
    );
  }
  if (code === "unauthenticated" || code === "auth/user-token-expired") {
    return new MasterAdminRequestError("A sessão Firebase expirou. Entre novamente.", 401);
  }
  return new MasterAdminRequestError(
    error instanceof Error ? error.message : "Não foi possível concluir a operação no Firestore.",
  );
};

const getMasterAdminUsersInSession = async (
  filters: MasterAdminFilters,
  cursor: string | null,
): Promise<MasterAdminListResponse> => {
  requireAdminSession();
  try {
    // Admin claims can be repaired while a browser session remains open.
    // Refresh before the access_requests Rules check so the new claim is used.
    await auth.currentUser?.getIdToken(true);
    const snapshot = await trackFirestoreRead("master:access_requests", getDocs(query(
      collection(db, "access_requests"),
      where("status", "in", ["pending", "approved", "blocked"]),
    )));
    const now = Date.now();
    const allAccounts = (await Promise.all(snapshot.docs.map(async (item) => {
      const profile = await trackFirestoreRead(
        "master:user_profile",
        getDoc(doc(db, "users", item.id)),
      );
      return accountFromRequest(
        item.data() as AccessRequestRecord,
        profile.exists() ? profile.data() as UserProfileRecord : undefined,
        now,
      );
    })))
      .sort((left, right) => (right.createdAt ?? "").localeCompare(left.createdAt ?? ""));
    const cachedAt = new Date(now).toISOString();
    saveMasterAdminDirectoryCache(auth.currentUser!.uid, snapshot.size, cachedAt);
    return buildMasterAdminListResponse(allAccounts, filters, cursor, "server", cachedAt);
  } catch (error) {
    throw requestError(error);
  }
};

const getMasterAdminUsersFromCache = async (
  filters: MasterAdminFilters,
  cursor: string | null,
): Promise<MasterAdminListResponse> => {
  const actor = requireAdminSession();
  const cachedDirectory = readMasterAdminDirectoryCache()[actor];
  if (!cachedDirectory || !Number.isInteger(cachedDirectory.requestCount) || typeof cachedDirectory.cachedAt !== "string") {
    throw new MasterAdminRequestError(
      "A lista Master Admin ainda não foi carregada neste aparelho. Conecte-se e use Atualizar dados uma vez.",
      503,
    );
  }

  try {
    const snapshot = await trackFirestoreRead("master:access_requests:cache", getDocsFromCache(query(
      collection(db, "access_requests"),
      where("status", "in", ["pending", "approved", "blocked"]),
    )));
    if (snapshot.size !== cachedDirectory.requestCount) {
      throw new MasterAdminRequestError(
        "O cache local da lista administrativa está incompleto. Conecte-se e atualize os dados antes de trabalhar offline.",
        503,
      );
    }
    const now = Date.now();
    const allAccounts = (await Promise.all(snapshot.docs.map(async (item) => {
      const profile = await trackFirestoreRead(
        "master:user_profile:cache",
        getDocFromCache(doc(db, "users", item.id)),
      );
      return accountFromRequest(
        item.data() as AccessRequestRecord,
        profile.exists() ? profile.data() as UserProfileRecord : undefined,
        now,
      );
    }))).sort((left, right) => (right.createdAt ?? "").localeCompare(left.createdAt ?? ""));
    return buildMasterAdminListResponse(allAccounts, filters, cursor, "cache", cachedDirectory.cachedAt);
  } catch (error) {
    throw requestError(error);
  }
};

export const getMasterAdminUsers = async (
  filters: MasterAdminFilters,
  cursor: string | null,
  forceRemote = false,
): Promise<MasterAdminListResponse> => {
  if (!forceRemote) {
    try {
      return await getMasterAdminUsersFromCache(filters, cursor);
    } catch (cacheError) {
      if (!isBrowserOnline()) throw cacheError;
      if (cacheError instanceof MasterAdminRequestError && cacheError.status === 401) throw cacheError;
    }
  }
  if (!isBrowserOnline()) return getMasterAdminUsersFromCache(filters, cursor);
  return withAdminNetworkSession(() => getMasterAdminUsersInSession(filters, cursor));
};

const mapAuditEvent = (id: string, data: AccessDecisionRecord): MasterAdminAuditEvent => {
  const details = data.details;
  const before = record(data.before);
  const after = record(data.after);
  const normalizedState = (state: Record<string, unknown> | null) => (
    state ? { ...state, manualAccessExpiresAt: isoValue(state.manualAccessExpiresAt) } : null
  );
  return {
    id,
    actor: typeof data.actor === "string" ? data.actor : null,
    action: typeof data.action === "string" ? data.action : null,
    target: typeof data.targetUid === "string" ? data.targetUid : null,
    before: normalizedState(before),
    after: normalizedState(after),
    source: "master_admin",
    reason: typeof details?.reason === "string" ? details.reason : null,
    plan: typeof details?.plan === "string" ? details.plan : null,
    amount: typeof details?.amount === "number" ? details.amount : null,
    paymentMethod: details?.paymentMethod === "pix" || details?.paymentMethod === "manual" || details?.paymentMethod === "none"
      ? details.paymentMethod
      : null,
    paymentConfirmed: typeof details?.paymentConfirmed === "boolean" ? details.paymentConfirmed : null,
    timestamp: isoValue(data.createdAt),
    claimsSyncStatus: null,
    claimsSyncAttempts: null,
    claimsSyncError: null,
    claimsSyncUpdatedAt: null,
    claimsSyncFailureAt: null,
    claimsSyncedAt: null,
  };
};

const getMasterAdminAccountInSession = async (
  uid: string,
  dataSource: MasterAdminAccountDetail["dataSource"],
): Promise<MasterAdminAccountDetail> => {
  requireAdminSession();
  try {
    const readDoc = dataSource === "cache" ? getDocFromCache : getDoc;
    const readDocs = dataSource === "cache" ? getDocsFromCache : getDocs;
    const requestSnapshot = await trackFirestoreRead(
      dataSource === "cache" ? "master:access_request:cache" : "master:access_request",
      readDoc(doc(db, "access_requests", uid)),
    );
    if (!requestSnapshot.exists()) throw new MasterAdminRequestError("Solicitação de acesso não encontrada.", 404);
    const request = requestSnapshot.data() as AccessRequestRecord;
    const [profileSnapshot, auditSnapshot] = await Promise.all([
      trackFirestoreRead(
        dataSource === "cache" ? "master:user_profile:cache" : "master:user_profile",
        readDoc(doc(db, "users", uid)),
      ),
      trackFirestoreRead(
        dataSource === "cache" ? "master:access_decisions:cache" : "master:access_decisions",
        readDocs(query(collection(db, "access_decisions"), where("targetUid", "==", uid))),
      ),
    ]);
    if (!profileSnapshot.exists()) throw new MasterAdminRequestError("Perfil da conta não encontrado.", 404);

    const profile = profileSnapshot.data() as UserProfileRecord;
    const account = accountFromRequest(request, profile);
    const auditEvents = auditSnapshot.docs
      .map((item) => mapAuditEvent(item.id, item.data() as AccessDecisionRecord))
      .sort((left, right) => (right.timestamp ?? "").localeCompare(left.timestamp ?? ""));
    const lastAudit = auditEvents[0];
    const projection = profile.accessProjection;
    const manualAccess = profile.manualAccess;
    const accessDecision = {
      allowed: account.accessAllowed === true,
      status: account.manualAccessState,
      reason: typeof projection?.reason === "string" ? projection.reason : "account_inactive",
      accountState: account.accountState,
      entitlementSource: account.entitlementSource ?? "none",
      expiresAt: account.accessValidUntil,
      evaluatedAt: isoValue(projection?.evaluatedAt) ?? new Date().toISOString(),
    } as const;

    return {
      dataSource,
      account: {
        ...account,
        accessDecision,
        accessProjection: {
          allowed: typeof projection?.allowed === "boolean" ? projection.allowed : null,
          source: typeof projection?.source === "string" ? projection.source : null,
          validUntil: isoValue(projection?.validUntil),
          reason: typeof projection?.reason === "string" ? projection.reason : null,
          evaluatedAt: isoValue(projection?.evaluatedAt),
          policyVersion: typeof projection?.policyVersion === "string" ? projection.policyVersion : null,
        },
        manualAccess: {
          enabled: manualAccess?.enabled === true,
          expiresAt: isoValue(manualAccess?.expiresAt),
          updatedBy: typeof manualAccess?.updatedBy === "string" ? manualAccess.updatedBy : lastAudit?.actor ?? null,
          updatedAt: isoValue(manualAccess?.updatedAt) ?? lastAudit?.timestamp ?? null,
        },
        billing: {},
        legacySubscription: {
          plan: account.legacyPlan,
          autoRenew: account.legacyAutoRenew,
          stripeSubscriptionId: null,
        },
      },
      auditEvents,
    };
  } catch (error) {
    throw requestError(error);
  }
};

export const getMasterAdminAccount = async (
  uid: string,
  forceRemote = false,
): Promise<MasterAdminAccountDetail> => {
  if (!forceRemote) {
    try {
      return await getMasterAdminAccountInSession(uid, "cache");
    } catch (cacheError) {
      if (!isBrowserOnline()) throw cacheError;
      if (cacheError instanceof MasterAdminRequestError && cacheError.status === 401) throw cacheError;
    }
  }
  if (!isBrowserOnline()) return getMasterAdminAccountInSession(uid, "cache");
  return withAdminNetworkSession(() => getMasterAdminAccountInSession(uid, "server"));
};

const updateMasterAdminAccessInSession = async (
  uid: string,
  changes: {
    isActive: boolean;
    days: number;
    reason: string;
    plan: string;
    amount: number;
    paymentMethod: "pix" | "manual" | "none";
    paymentConfirmed: boolean;
  },
) => {
  const actor = requireAdminSession();
  if (actor === uid) throw new MasterAdminRequestError("Autoalteração de acesso não é permitida.");
  const plan = changes.plan.trim().slice(0, 80);
  const reason = changes.reason.trim().slice(0, 500);
  if (!plan || !reason || !Number.isFinite(changes.amount) || changes.amount < 0 || changes.amount > 1_000_000) {
    throw new MasterAdminRequestError("Informe plano, motivo e valor válido.");
  }
  if (changes.isActive && (
    !Number.isInteger(changes.days)
    || changes.days < 1
    || changes.days > 3650
    || changes.amount <= 0
    || changes.paymentMethod === "none"
    || changes.paymentConfirmed !== true
  )) {
    throw new MasterAdminRequestError("Para liberar acesso, informe a vigência e confirme um pagamento válido.");
  }

  try {
    const requestRef = doc(db, "access_requests", uid);
    const [requestSnapshot, profileSnapshot] = await Promise.all([
      trackFirestoreRead("master:access_request", getDoc(requestRef)),
      trackFirestoreRead("master:user_profile", getDoc(doc(db, "users", uid))),
    ]);
    if (!requestSnapshot.exists()) throw new MasterAdminRequestError("Solicitação de acesso não encontrada.", 404);
    if (!profileSnapshot.exists()) throw new MasterAdminRequestError("Perfil da conta não encontrado.", 404);
    const request = requestSnapshot.data() as AccessRequestRecord;
    const profile = profileSnapshot.data() as UserProfileRecord;
    if (profile.role !== "user") {
      throw new MasterAdminRequestError("O painel só altera vigência de contas com perfil de usuário.");
    }
    if (profile.ownerAccess?.enabled === true && profile.ownerAccess.permanent === true) {
      throw new MasterAdminRequestError("A conta proprietária possui acesso permanente protegido.");
    }
    const beforeStatus = request.status;
    const beforeExpiryValue = profile.manualAccess?.expiresAt ?? null;
    const beforeExpiry = dateValue(beforeExpiryValue);
    const nextExpiry = changes.isActive ? new Date(Date.now() + changes.days * 86_400_000) : null;
    if (changes.isActive && (!nextExpiry || nextExpiry.getTime() <= Date.now())) {
      throw new MasterAdminRequestError("A vigência deve terminar no futuro.");
    }
    if (!changes.isActive && beforeStatus === "blocked") {
      throw new MasterAdminRequestError("A conta já está suspensa.");
    }
    const toStatus = changes.isActive ? "approved" : "blocked";
    const action = toStatus === "blocked"
      ? "blocked"
      : beforeStatus === "pending"
        ? "approved"
        : beforeStatus === "blocked"
          ? "released"
          : "renewed";
    if (toStatus === "approved" && beforeStatus === "approved"
      && beforeExpiry?.getTime() === nextExpiry?.getTime()) {
      throw new MasterAdminRequestError("A renovação precisa alterar a data de vigência.");
    }
    if (toStatus === "approved" && beforeStatus === "approved" && !(beforeExpiryValue instanceof Timestamp)) {
      throw new MasterAdminRequestError("A vigência armazenada precisa ser migrada antes da renovação.");
    }

    const expiresAt = nextExpiry ? Timestamp.fromDate(nextExpiry) : null;
    const auditRef = doc(collection(db, "access_decisions"));
    const details = {
      plan,
      amount: changes.amount,
      paymentMethod: changes.paymentMethod,
      paymentConfirmed: changes.paymentConfirmed,
      reason,
    };
    const batch = writeBatch(db);
    batch.update(requestRef, {
      status: toStatus,
      lastAuditId: auditRef.id,
      manualAccessExpiresAt: expiresAt,
      accessDetails: details,
    });
    batch.update(doc(db, "users", uid), {
      isActive: changes.isActive,
      manualAccess: { enabled: changes.isActive, expiresAt },
      accessProjection: {
        allowed: changes.isActive,
        source: changes.isActive ? "manual" : "none",
        validUntil: expiresAt,
        evaluatedAt: serverTimestamp(),
        policyVersion: "access-v1",
        reason: changes.isActive ? "manual_entitlement" : "account_inactive",
      },
      updatedAt: serverTimestamp(),
    });
    batch.set(auditRef, {
      actor,
      targetUid: uid,
      action,
      fromStatus: beforeStatus,
      toStatus,
      before: {
        isActive: profile.isActive === true,
        manualAccessEnabled: profile.manualAccess?.enabled === true,
        manualAccessExpiresAt: beforeExpiryValue,
      },
      after: {
        isActive: changes.isActive,
        manualAccessEnabled: changes.isActive,
        manualAccessExpiresAt: expiresAt,
      },
      details,
      manualAccessExpiresAt: expiresAt,
      createdAt: serverTimestamp(),
    });
    await batch.commit();
    window.dispatchEvent(new Event("motofix:admin-users-changed"));
    return { success: true as const, action, target: uid };
  } catch (error) {
    throw requestError(error);
  }
};

export const updateMasterAdminAccess = (
  uid: string,
  changes: Parameters<typeof updateMasterAdminAccessInSession>[1],
) => withAdminNetworkSession(() => updateMasterAdminAccessInSession(uid, changes));
