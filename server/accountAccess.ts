import type { DecodedIdToken } from "firebase-admin/auth";
import { Timestamp } from "firebase-admin/firestore";
import { isDesignatedOwnerUid } from "./ownerIdentity";

type BillingProjection = {
  status?: string | null;
  currentPeriodEnd?: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
};

type SubscriptionProjection = {
  status?: string | null;
  currentPeriodEnd?: string | null;
  expiresAt?: string | null;
  stripeSubscriptionId?: string | null;
};

type ManualAccessProjection = {
  enabled?: boolean;
  expiresAt?: Date | number | string | { toDate?: () => Date } | Timestamp | null;
};

type OwnerAccessProjection = {
  enabled?: boolean;
  permanent?: boolean;
};

export type AccountAccessProfile = {
  role?: string;
  isActive?: boolean;
  billing?: BillingProjection;
  subscription?: SubscriptionProjection;
  subscriptionExpiresAt?: string | null;
  manualAccess?: ManualAccessProjection;
  ownerAccess?: OwnerAccessProjection;
  accessProjection?: AccessProjection;
};

export type AccessProjection = {
  allowed: boolean;
  source: "owner" | "stripe" | "manual" | "none";
  validUntil: Timestamp | null;
  evaluatedAt: Timestamp;
  policyVersion: string;
  reason: AccessDecisionReason;
};

type AccessDecisionReason =
  | "profile_missing"
  | "account_inactive"
  | "owner_entitlement"
  | "manual_entitlement"
  | "manual_access_expired"
  | "manual_access_required";

export type AccountAccessDecision = {
  allowed: boolean;
  status: string | null;
  reason: AccessDecisionReason;
  accountState: "active" | "blocked" | "missing";
  entitlementSource: "owner" | "stripe" | "manual" | "none";
  expiresAt: string | null;
};

const toTimestampValue = (value: unknown): Timestamp | null => {
  if (value instanceof Timestamp) return value;
  if (value instanceof Date && Number.isFinite(value.getTime())) return Timestamp.fromDate(value);
  if (typeof value === "number" && Number.isFinite(value)) return Timestamp.fromMillis(value);
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return Timestamp.fromDate(new Date(parsed));
  }
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    const date = value.toDate();
    if (date instanceof Date && Number.isFinite(date.getTime())) return Timestamp.fromDate(date);
  }
  return null;
};

const toIsoString = (value: unknown): string | null => {
  const timestamp = toTimestampValue(value);
  return timestamp ? timestamp.toDate().toISOString() : null;
};

const isFutureDate = (value: unknown, now: number) => {
  const timestamp = toTimestampValue(value);
  return !!timestamp && timestamp.toMillis() > now;
};

const getManualAccess = (profile: AccountAccessProfile) => {
  if (profile.manualAccess && typeof profile.manualAccess === "object") {
    const enabled = profile.manualAccess.enabled === true;
    return {
      enabled,
      expiresAt: enabled ? toTimestampValue(profile.manualAccess.expiresAt) : null,
    };
  }

  return {
    enabled: false,
    expiresAt: null,
  };
};

export const calculateApplicationAccess = (
  profile: AccountAccessProfile | null,
  now = Date.now(),
  uid?: string | null,
  _ownerUid?: string | null,
): AccessProjection => {
  const evaluatedAt = Timestamp.fromMillis(now);
  if (!profile) {
    return {
      allowed: false,
      source: "none",
      validUntil: null,
      evaluatedAt,
      policyVersion: "access-v1",
      reason: "profile_missing",
    };
  }

  if (profile.isActive !== true) {
    return {
      allowed: false,
      source: "none",
      validUntil: null,
      evaluatedAt,
      policyVersion: "access-v1",
      reason: "account_inactive",
    };
  }

  if (isDesignatedOwnerUid(uid)
    && profile.role === "master_admin"
    && profile.ownerAccess?.enabled === true
    && profile.ownerAccess.permanent === true) {
    return {
      allowed: true,
      source: "owner",
      validUntil: null,
      evaluatedAt,
      policyVersion: "access-v1",
      reason: "owner_entitlement",
    };
  }

  const manualAccess = getManualAccess(profile);
  if (manualAccess.enabled && manualAccess.expiresAt && isFutureDate(manualAccess.expiresAt, now)
  ) {
    return {
      allowed: true,
      source: "manual",
      validUntil: manualAccess.expiresAt,
      evaluatedAt,
      policyVersion: "access-v1",
      reason: "manual_entitlement",
    };
  }

  const manualExpiry = profile.manualAccess?.enabled === true
    ? toTimestampValue(profile.manualAccess.expiresAt)
    : null;
  const manualExpiryElapsed = !!manualExpiry && manualExpiry.toMillis() <= now;

  return {
    allowed: false,
    source: "none",
    validUntil: null,
    evaluatedAt,
    policyVersion: "access-v1",
    reason: manualExpiryElapsed ? "manual_access_expired" : "manual_access_required",
  };
};

export const canAccessApplication = (
  decoded: Pick<DecodedIdToken, "uid"> | null,
  profile: AccountAccessProfile | null,
  now = Date.now(),
  _ownerUid?: string | null,
): AccountAccessDecision => {
  if (!decoded || !profile) {
    return {
      allowed: false,
      status: null,
      reason: "profile_missing",
      accountState: "missing",
      entitlementSource: "none",
      expiresAt: null,
    };
  }

  const projection = calculateApplicationAccess(profile, now, decoded.uid);
  const storedProjectionExpiry = toTimestampValue(profile.accessProjection?.validUntil);
  const hasMatchingManualProjection = projection.source !== "manual"
    || (profile.accessProjection?.allowed === true
      && profile.accessProjection.source === "manual"
      && storedProjectionExpiry?.toMillis() === projection.validUntil?.toMillis());
  if (!hasMatchingManualProjection) {
    return {
      allowed: false,
      status: "pending",
      reason: "manual_access_required",
      accountState: "active",
      entitlementSource: "none",
      expiresAt: toIsoString(projection.validUntil),
    };
  }
  return {
    allowed: projection.allowed,
    status: profile.isActive !== true
      ? "inactive"
      : projection.allowed
        ? "active"
        : projection.reason === "manual_access_expired"
          ? "expired"
          : "pending",
    reason: projection.reason,
    accountState: profile.isActive === true ? "active" : "blocked",
    entitlementSource: projection.source,
    expiresAt: toIsoString(projection.validUntil),
  };
};
