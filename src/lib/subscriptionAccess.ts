import { isBefore, parseISO } from "date-fns";
import type { AccountAccessResponse } from "../services/accountAccessService";
import type { UserProfile } from "../types";

const DESIGNATED_OWNER_UID = "o5XNtNFwKMQzZj28WfTEiGSFN0A3";

export const isDesignatedOwnerSession = (authenticatedUid: string | null | undefined) => (
  authenticatedUid === DESIGNATED_OWNER_UID
);

const accessTimestamp = (value: unknown): number | null => {
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    const date = value.toDate();
    return date instanceof Date && Number.isFinite(date.getTime()) ? date.getTime() : null;
  }
  return null;
};

export const evaluateSessionAccountAccess = (
  authenticatedUid: string | null | undefined,
  profile: UserProfile | null | undefined,
  now = Date.now(),
): AccountAccessResponse | null => {
  if (!authenticatedUid) return null;
  if (isDesignatedOwnerSession(authenticatedUid)) {
    return {
      allowed: true,
      status: "active",
      reason: "designated_owner_session",
      accountState: "active",
      entitlementSource: "owner",
      expiresAt: null,
      evaluatedAt: new Date(now).toISOString(),
    };
  }
  if (!profile || profile.uid !== authenticatedUid) {
    return {
      allowed: false,
      status: "missing",
      reason: "profile_missing",
      accountState: "missing",
      entitlementSource: "none",
      expiresAt: null,
      evaluatedAt: new Date(now).toISOString(),
    };
  }
  if (profile.isActive !== true) {
    return {
      allowed: false,
      status: "inactive",
      reason: "account_inactive",
      accountState: "blocked",
      entitlementSource: "none",
      expiresAt: null,
      evaluatedAt: new Date(now).toISOString(),
    };
  }

  const expiry = profile.manualAccess?.enabled === true
    ? accessTimestamp(profile.manualAccess.expiresAt)
    : null;
  const projectedExpiry = accessTimestamp(profile.accessProjection?.validUntil);
  const projectionMatches = profile.accessProjection?.allowed === true
    && profile.accessProjection.source === "manual"
    && projectedExpiry === expiry;
  const allowed = expiry !== null && expiry > now && projectionMatches;
  const expired = expiry !== null && expiry <= now;
  return {
    allowed,
    status: allowed ? "active" : expired ? "expired" : "pending",
    reason: allowed ? "manual_entitlement" : expired ? "manual_access_expired" : "manual_access_required",
    accountState: "active",
    entitlementSource: allowed ? "manual" : "none",
    expiresAt: expiry === null ? null : new Date(expiry).toISOString(),
    evaluatedAt: new Date(now).toISOString(),
  };
};

export const mapAccountAccess = (decision: AccountAccessResponse) => ({
  subscriptionActive: decision.allowed,
  isExpired: !decision.allowed && decision.reason === "manual_access_expired",
  shouldBlock: !decision.allowed,
  reason: decision.reason,
});

const toDate = (value: unknown): Date | null => {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string") {
    const parsed = parseISO(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    const parsed = value.toDate();
    return parsed instanceof Date && !Number.isNaN(parsed.getTime()) ? parsed : null;
  }
  return null;
};

export const getSubscriptionTimerDelay = (currentPeriodEnd: unknown, now = new Date()) => {
  const periodEnd = toDate(currentPeriodEnd);
  if (!periodEnd) return null;
  if (!isBefore(now, periodEnd)) return null;
  return periodEnd.getTime() - now.getTime() + 10;
};

export const scheduleSubscriptionExpiry = (
  currentPeriodEnd: unknown,
  now: Date,
  onExpire: () => void,
  schedule: typeof setTimeout = setTimeout,
  cancel: typeof clearTimeout = clearTimeout,
) => {
  const delay = getSubscriptionTimerDelay(currentPeriodEnd, now);
  if (delay === null) return () => undefined;
  const timer = schedule(onExpire, delay);
  return () => cancel(timer);
};
