import axios from "axios";
import { API_BASE_URL, authHeaders } from "./apiClient";

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
  isActive: boolean;
  accountState: "active" | "blocked";
  createdAt: string | null;
  manualAccessExpiresAt: string | null;
  manualAccessState: "active" | "expired" | "none";
  ownerAccess: { enabled: boolean; permanent: boolean };
  accessAllowed: boolean | null;
  entitlementSource: "owner" | "stripe" | "manual" | "none" | null;
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
};

type MasterAdminAuditState = Record<string, unknown>;

export type MasterAdminAuditEvent = {
  id: string;
  actor: string | null;
  action: string | null;
  target: string | null;
  before: MasterAdminAuditState | null;
  after: MasterAdminAuditState | null;
  source: string | null;
  reason: string | null;
  timestamp: string | null;
  claimsSyncStatus: string | null;
  claimsSyncAttempts: number | null;
  claimsSyncError: string | null;
  claimsSyncUpdatedAt: string | null;
  claimsSyncFailureAt: string | null;
  claimsSyncedAt: string | null;
};

export type MasterAdminAccountDetail = {
  account: MasterAdminAccount & {
    accessDecision: {
      allowed: boolean;
      status: string;
      reason: string;
      accountState: string;
      entitlementSource: "owner" | "stripe" | "manual" | "none";
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

export class MasterAdminRequestError extends Error {
  constructor(message: string, readonly persisted = false, readonly status: number | null = null) {
    super(message);
    this.name = "MasterAdminRequestError";
  }
}

const toRequestError = (error: unknown) => {
  if (!axios.isAxiosError(error)) {
    return error instanceof Error
      ? new MasterAdminRequestError(error.message)
      : new MasterAdminRequestError("Não foi possível concluir a solicitação administrativa.");
  }

  const status = error.response?.status ?? null;
  const responseData = error.response?.data;
  const message = responseData && typeof responseData === "object" && "error" in responseData
    && typeof responseData.error === "string"
    ? responseData.error
    : status
      ? `Falha na solicitação administrativa (HTTP ${status}).`
      : "Falha de rede ao acessar o serviço administrativo.";
  const persisted = responseData && typeof responseData === "object"
    && "claimsSyncStatus" in responseData
    && responseData.claimsSyncStatus === "failed";
  return new MasterAdminRequestError(message, persisted, status);
};

export const getMasterAdminUsers = async (
  filters: MasterAdminFilters,
  cursor: string | null,
): Promise<MasterAdminListResponse> => {
  try {
    const { data } = await axios.get<MasterAdminListResponse>(`${API_BASE_URL}/api/admin/users`, {
      headers: await authHeaders(true),
      params: { ...filters, ...(cursor ? { cursor } : {}) },
    });
    return data;
  } catch (error) {
    throw toRequestError(error);
  }
};

export const getMasterAdminAccount = async (uid: string): Promise<MasterAdminAccountDetail> => {
  try {
    const { data } = await axios.get<MasterAdminAccountDetail>(
      `${API_BASE_URL}/api/admin/users/${encodeURIComponent(uid)}`,
      { headers: await authHeaders(true) },
    );
    return data;
  } catch (error) {
    throw toRequestError(error);
  }
};

export const updateMasterAdminAccess = async (
  uid: string,
  changes: { isActive?: boolean; role?: "user" | "admin" | "master_admin"; days?: number; reason: string },
) => {
  try {
    const { data } = await axios.patch<{ success: true; action: string; target: string }>(
      `${API_BASE_URL}/api/admin/users/${encodeURIComponent(uid)}/access`,
      changes,
      { headers: await authHeaders(true) },
    );
    if (typeof window !== "undefined") window.dispatchEvent(new Event("motofix:admin-users-changed"));
    return data;
  } catch (error) {
    throw toRequestError(error);
  }
};
