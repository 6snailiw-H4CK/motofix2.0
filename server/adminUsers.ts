import type { QueryDocumentSnapshot } from "firebase-admin/firestore";

export type AdminUserFilters = {
  search: string;
  status: "all" | "active" | "blocked" | "expiring";
  role: "all" | "user" | "admin" | "master_admin";
};

export type AdminUserListItem = {
  uid: string;
  displayName: string | null;
  email: string | null;
  role: string | null;
  isActive: boolean;
  accountState: "active" | "blocked";
  createdAt: string | null;
  manualAccessExpiresAt: string | null;
  manualAccessState: "active" | "expired" | "none";
  ownerAccess: {
    enabled: boolean;
    permanent: boolean;
  };
  accessAllowed: boolean | null;
  entitlementSource: "owner" | "stripe" | "manual" | "none" | null;
  accessValidUntil: string | null;
  legacyPlan: string | null;
  legacyAutoRenew: boolean | null;
  billingStatus: string | null;
  billingCurrentPeriodEnd: string | null;
};

export type AdminUserMetrics = {
  total: number;
  active: number;
  blocked: number;
  expiringSoon: number;
  newThisMonth: number;
};

const dateValue = (value: unknown): Date | null => {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    const date = (value.toDate as () => Date)();
    return date instanceof Date && Number.isFinite(date.getTime()) ? date : null;
  }
  return null;
};

const isoDate = (value: unknown) => dateValue(value)?.toISOString() ?? null;

const getManualAccessState = (expiresAt: string | null, now: number): AdminUserListItem["manualAccessState"] => {
  if (!expiresAt) return "none";
  return Date.parse(expiresAt) > now ? "active" : "expired";
};

export const mapAdminUser = (
  uid: string,
  data: Record<string, unknown>,
  now = Date.now(),
): AdminUserListItem => {
  const subscription = data.subscription && typeof data.subscription === "object"
    ? data.subscription as Record<string, unknown>
    : {};
  const billing = data.billing && typeof data.billing === "object"
    ? data.billing as Record<string, unknown>
    : {};
  const manualAccess = data.manualAccess && typeof data.manualAccess === "object"
    ? data.manualAccess as Record<string, unknown>
    : {};
  const ownerAccess = data.ownerAccess && typeof data.ownerAccess === "object"
    ? data.ownerAccess as Record<string, unknown>
    : {};
  const accessProjection = data.accessProjection && typeof data.accessProjection === "object"
    ? data.accessProjection as Record<string, unknown>
    : {};
  const manualAccessExpiresAt = manualAccess.enabled === true ? isoDate(manualAccess.expiresAt) : null;
  const projectionSource = accessProjection.source;
  return {
    uid,
    displayName: typeof data.displayName === "string" ? data.displayName : null,
    email: typeof data.email === "string" ? data.email : null,
    role: data.role === "user" || data.role === "admin" || data.role === "master_admin" ? data.role : null,
    isActive: data.isActive === true,
    accountState: data.isActive === true ? "active" : "blocked",
    createdAt: isoDate(data.createdAt),
    manualAccessExpiresAt,
    manualAccessState: getManualAccessState(manualAccessExpiresAt, now),
    ownerAccess: {
      enabled: ownerAccess.enabled === true,
      permanent: ownerAccess.permanent === true,
    },
    accessAllowed: typeof accessProjection.allowed === "boolean" ? accessProjection.allowed : null,
    entitlementSource: projectionSource === "owner" || projectionSource === "stripe" || projectionSource === "manual" || projectionSource === "none"
      ? projectionSource
      : null,
    accessValidUntil: isoDate(accessProjection.validUntil),
    legacyPlan: typeof subscription.plan === "string" ? subscription.plan : null,
    legacyAutoRenew: typeof subscription.autoRenew === "boolean" ? subscription.autoRenew : null,
    billingStatus: typeof billing.status === "string" ? billing.status : null,
    billingCurrentPeriodEnd: isoDate(billing.currentPeriodEnd),
  };
};

export const mapAdminUserDocument = (document: QueryDocumentSnapshot, now = Date.now()) => (
  mapAdminUser(document.id, document.data() as Record<string, unknown>, now)
);

const encode = (value: string) => Buffer.from(value, "utf8").toString("base64url");
const decode = (value: string) => Buffer.from(value, "base64url").toString("utf8");

export const encodeAdminUsersCursor = (lastUid: string, queryKey: string) => (
  encode(JSON.stringify({ lastUid, queryKey }))
);

export const decodeAdminUsersCursor = (cursor: string, queryKey: string) => {
  try {
    const payload = JSON.parse(decode(cursor)) as { lastUid?: unknown; queryKey?: unknown };
    if (typeof payload.lastUid !== "string" || !payload.lastUid || payload.queryKey !== queryKey) {
      return null;
    }
    return payload.lastUid;
  } catch {
    return null;
  }
};
