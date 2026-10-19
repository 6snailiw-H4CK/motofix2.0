import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  Timestamp,
  where,
  writeBatch,
} from "firebase/firestore";
import { auth, db } from "../firebase";
import type { AccessRequestStatus } from "../types/accessRequest";
import type { UserRole } from "../types";

export type MasterAdminFilters = {
  search: string;
  status: "all" | "active" | "blocked";
  role: "all" | UserRole;
  pageSize: number;
};

export type MasterAdminAccount = {
  uid: string;
  displayName: string | null;
  email: string | null;
  role: UserRole | null;
  isActive: boolean;
  accountState: "active" | "blocked";
  createdAt: string | null;
  manualAccessExpiresAt: string | null;
  manualAccessState: "active" | "expired" | "none";
  ownerAccess: { enabled: boolean; permanent: boolean };
  accessAllowed: boolean;
  entitlementSource: "owner" | "manual" | "none";
  accessValidUntil: string | null;
  legacyPlan: string | null;
  legacyAutoRenew: boolean | null;
  billingStatus: string | null;
  billingCurrentPeriodEnd: string | null;
  requestStatus: AccessRequestStatus;
  plan: string | null;
  amount: number | null;
  paymentMethod: "pix" | "manual" | "none" | null;
  paymentConfirmed: boolean;
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
};

export type MasterAdminAccountDetail = {
  account: MasterAdminAccount & {
    accessDecision: {
      allowed: boolean;
      status: string;
      reason: string;
      accountState: string;
      entitlementSource: "owner" | "manual" | "none";
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
  auditEvents: Array<{
    id: string;
    actor: string | null;
    action: string | null;
    target: string | null;
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
    source: string | null;
    reason: string | null;
    plan: string | null;
    amount: number | null;
    paymentMethod: string | null;
    paymentConfirmed: boolean | null;
    timestamp: string | null;
  }>;
};

export class MasterAdminRequestError extends Error {
  constructor(message: string, readonly persisted = false, readonly status: number | null = null) {
    super(message);
    this.name = "MasterAdminRequestError";
  }
}

type AccessRequestDocument = {
  uid: string;
  email: string;
  displayName: string;
  status: AccessRequestStatus;
  createdAt?: unknown;
  lastAuditId?: string;
  manualAccessExpiresAt?: unknown;
  accessDetails?: {
    plan?: string;
    amount?: number;
    paymentMethod?: "pix" | "manual" | "none";
    paymentConfirmed?: boolean;
    reason?: string;
  };
};

type AuditDocument = {
  actor?: string;
  targetUid?: string;
  action?: string;
  fromStatus?: string;
  toStatus?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  details?: {
    plan?: string;
    amount?: number;
    paymentMethod?: string;
    paymentConfirmed?: boolean;
    reason?: string;
  };
  createdAt?: unknown;
};

const dateValue = (value: unknown): Date | null => {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (typeof value === "string" && Number.isFinite(Date.parse(value))) return new Date(value);
  return null;
};

const isoValue = (value: unknown) => dateValue(value)?.toISOString() ?? null;
const auditState = (value: Record<string, unknown> | undefined) => value
  ? {
      ...value,
      manualAccessExpiresAt: isoValue(value.manualAccessExpiresAt),
    }
  : null;

const accountFromRequest = (request: AccessRequestDocument, now = Date.now()): MasterAdminAccount => {
  const expiresAt = dateValue(request.manualAccessExpiresAt);
  const isApproved = request.status === "approved";
  const isExpired = !!expiresAt && expiresAt.getTime() <= now;
  const accessAllowed = isApproved && !!expiresAt && expiresAt.getTime() > now;
  return {
    uid: request.uid,
    displayName: request.displayName || null,
    email: request.email || null,
    role: "user",
    isActive: isApproved,
    accountState: isApproved ? "active" : "blocked",
    createdAt: isoValue(request.createdAt),
    manualAccessExpiresAt: expiresAt?.toISOString() ?? null,
    manualAccessState: accessAllowed ? "active" : isExpired ? "expired" : "none",
    ownerAccess: { enabled: false, permanent: false },
    accessAllowed,
    entitlementSource: accessAllowed ? "manual" : "none",
    accessValidUntil: expiresAt?.toISOString() ?? null,
    legacyPlan: null,
    legacyAutoRenew: null,
    billingStatus: null,
    billingCurrentPeriodEnd: null,
    requestStatus: request.status,
    plan: request.accessDetails?.plan ?? null,
    amount: typeof request.accessDetails?.amount === "number" ? request.accessDetails.amount : null,
    paymentMethod: request.accessDetails?.paymentMethod ?? null,
    paymentConfirmed: request.accessDetails?.paymentConfirmed === true,
  };
};

const requireAdminSession = () => {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new MasterAdminRequestError("Sessão Firebase ausente.");
  return uid;
};

export const getMasterAdminUsers = async (
  filters: MasterAdminFilters,
  cursor: string | null,
): Promise<MasterAdminListResponse> => {
  requireAdminSession();
  try {
    const snapshot = await getDocs(query(
      collection(db, "access_requests"),
      where("status", "in", ["pending", "approved", "blocked"]),
    ));
    const allAccounts = snapshot.docs
      .map((item) => accountFromRequest(item.data() as AccessRequestDocument))
      .sort((left, right) => (right.createdAt ?? "").localeCompare(left.createdAt ?? ""));
    const filtered = allAccounts.filter((account) => {
      const searchMatch = !filters.search
        || account.uid === filters.search
        || account.email?.toLocaleLowerCase() === filters.search.toLocaleLowerCase();
      const statusMatch = filters.status === "all"
        || (filters.status === "active" ? account.accessAllowed : !account.accessAllowed);
      return searchMatch && statusMatch;
    });
    const pageSize = Math.max(1, Math.min(50, filters.pageSize));
    const offset = cursor ? Number(cursor) : 0;
    const users = filtered.slice(offset, offset + pageSize);
    const now = Date.now();
    const monthStart = new Date(new Date(now).getFullYear(), new Date(now).getMonth(), 1).getTime();
    const metrics = {
      total: allAccounts.length,
      active: allAccounts.filter((account) => account.isActive && account.accessAllowed).length,
      blocked: allAccounts.filter((account) => account.requestStatus === "blocked").length,
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
    };
  } catch (error) {
    throw new MasterAdminRequestError(error instanceof Error ? error.message : "Não foi possível consultar as solicitações.");
  }
};

export const getMasterAdminAccount = async (uid: string): Promise<MasterAdminAccountDetail> => {
  requireAdminSession();
  try {
    const requestSnapshot = await getDoc(doc(db, "access_requests", uid));
    if (!requestSnapshot.exists()) throw new MasterAdminRequestError("Solicitação de acesso não encontrada.");
    const request = requestSnapshot.data() as AccessRequestDocument;
    const account = accountFromRequest(request);
    const auditSnapshot = await getDocs(query(
      collection(db, "access_decisions"),
      where("targetUid", "==", uid),
    ));
    const auditEvents = auditSnapshot.docs.map((item) => {
      const event = item.data() as AuditDocument;
      return {
        id: item.id,
        actor: event.actor ?? null,
        action: event.action ?? null,
        target: event.targetUid ?? uid,
        before: auditState(event.before),
        after: auditState(event.after),
        source: "master_admin",
        reason: event.details?.reason ?? null,
        plan: event.details?.plan ?? null,
        amount: event.details?.amount ?? null,
        paymentMethod: event.details?.paymentMethod ?? null,
        paymentConfirmed: event.details?.paymentConfirmed ?? null,
        timestamp: isoValue(event.createdAt),
      };
    }).sort((left, right) => (right.timestamp ?? "").localeCompare(left.timestamp ?? ""));
    const lastAudit = auditEvents[0];
    return {
      account: {
        ...account,
        accessDecision: {
          allowed: account.accessAllowed,
          status: account.manualAccessState,
          reason: account.accessAllowed ? "manual_entitlement" : account.requestStatus,
          accountState: account.accountState,
          entitlementSource: account.entitlementSource,
          expiresAt: account.manualAccessExpiresAt,
          evaluatedAt: new Date().toISOString(),
        },
        accessProjection: {
          allowed: account.accessAllowed,
          source: account.entitlementSource,
          validUntil: account.manualAccessExpiresAt,
          reason: account.accessAllowed ? "manual_entitlement" : account.requestStatus,
          evaluatedAt: lastAudit?.timestamp ?? null,
          policyVersion: "access-v1",
        },
        manualAccess: {
          enabled: account.manualAccessState === "active",
          expiresAt: account.manualAccessExpiresAt,
          updatedBy: lastAudit?.actor ?? null,
          updatedAt: lastAudit?.timestamp ?? null,
        },
        billing: {},
        legacySubscription: { plan: null, autoRenew: null, stripeSubscriptionId: null },
      },
      auditEvents,
    };
  } catch (error) {
    if (error instanceof MasterAdminRequestError) throw error;
    throw new MasterAdminRequestError(error instanceof Error ? error.message : "Não foi possível consultar a auditoria.");
  }
};

export const updateMasterAdminAccess = async (
  uid: string,
  changes: {
    isActive?: boolean;
    subscriptionExpiresAt?: string | null;
    manualAccess?: { enabled: boolean; expiresAt: string | null };
    days?: number;
    reason: string;
    plan: string;
    amount: number;
    paymentMethod: "pix" | "manual" | "none";
    paymentConfirmed: boolean;
  },
) => {
  const actor = requireAdminSession();
  if (actor === uid) throw new MasterAdminRequestError("Autoalteração de acesso não é permitida.");
  if (!changes.reason.trim() || !changes.plan.trim() || !Number.isFinite(changes.amount) || changes.amount < 0 || changes.amount > 1_000_000) {
    throw new MasterAdminRequestError("Informe motivo, plano e valor válido.");
  }
  try {
    const requestRef = doc(db, "access_requests", uid);
    const requestSnapshot = await getDoc(requestRef);
    if (!requestSnapshot.exists()) throw new MasterAdminRequestError("Solicitação de acesso não encontrada.");
    const request = requestSnapshot.data() as AccessRequestDocument;
    const beforeStatus = request.status;
    let beforeExpiry = dateValue(request.manualAccessExpiresAt);
    if (!beforeExpiry && request.lastAuditId) {
      const previousDecision = await getDoc(doc(db, "access_decisions", request.lastAuditId));
      const previousAfter = previousDecision.data()?.after;
      if (previousAfter && typeof previousAfter === "object" && "manualAccessExpiresAt" in previousAfter) {
        beforeExpiry = dateValue(previousAfter.manualAccessExpiresAt);
      }
    }
    const nextExpiryInput = changes.manualAccess?.expiresAt ?? changes.subscriptionExpiresAt;
    const nextExpiry = changes.days !== undefined
      ? new Date(Date.now() + changes.days * 86_400_000)
      : nextExpiryInput
        ? new Date(nextExpiryInput)
        : null;
    const approved = changes.isActive === false ? false : changes.manualAccess?.enabled ?? true;
    if (approved && (!nextExpiry || !Number.isFinite(nextExpiry.getTime()) || nextExpiry.getTime() <= Date.now())) {
      throw new MasterAdminRequestError("A vigência deve terminar no futuro.");
    }
    if (!approved && beforeStatus === "blocked") throw new MasterAdminRequestError("A conta já está suspensa.");
    const toStatus: AccessRequestStatus = approved ? "approved" : "blocked";
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
    const expiresAt = approved ? Timestamp.fromDate(nextExpiry as Date) : null;
    const auditId = crypto.randomUUID();
    const batch = writeBatch(db);
    batch.update(requestRef, {
      status: toStatus,
      lastAuditId: auditId,
      manualAccessExpiresAt: expiresAt,
      accessDetails: {
        plan: changes.plan.trim().slice(0, 80),
        amount: changes.amount,
        paymentMethod: changes.paymentMethod,
        paymentConfirmed: changes.paymentConfirmed,
        reason: changes.reason.trim().slice(0, 500),
      },
    });
    batch.update(doc(db, "users", uid), {
      isActive: approved,
      manualAccess: { enabled: approved, expiresAt },
      accessProjection: {
        allowed: approved,
        source: approved ? "manual" : "none",
        validUntil: expiresAt,
        evaluatedAt: serverTimestamp(),
        policyVersion: "access-v1",
        reason: approved ? "manual_entitlement" : "account_inactive",
      },
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, "access_decisions", auditId), {
      actor,
      targetUid: uid,
      action,
      fromStatus: beforeStatus,
      toStatus,
      before: {
        isActive: beforeStatus === "approved",
        manualAccessEnabled: beforeStatus === "approved" && !!beforeExpiry,
        manualAccessExpiresAt: beforeExpiry ? Timestamp.fromDate(beforeExpiry) : null,
      },
      after: {
        isActive: approved,
        manualAccessEnabled: approved,
        manualAccessExpiresAt: expiresAt,
      },
      details: {
        plan: changes.plan.trim().slice(0, 80),
        amount: changes.amount,
        paymentMethod: changes.paymentMethod,
        paymentConfirmed: changes.paymentConfirmed,
        reason: changes.reason.trim().slice(0, 500),
      },
      manualAccessExpiresAt: expiresAt,
      createdAt: serverTimestamp(),
    });
    await batch.commit();
    return { success: true as const, action, target: uid };
  } catch (error) {
    if (error instanceof MasterAdminRequestError) throw error;
    throw new MasterAdminRequestError(error instanceof Error ? error.message : "A alteração foi recusada pelas Rules.");
  }
};
