import { createHash, randomBytes } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import type { AccessProjection, AccountAccessProfile } from "../server/accountAccess";
import { calculateApplicationAccess } from "../server/accountAccess";
import { normalizeOwnerUid } from "../server/ownerIdentity";

export type ProjectionMigrationProfile = {
  uid: string;
  profile: Record<string, unknown>;
};

export type ProjectionMigrationAdapter = {
  projectId: string;
  getOwnerUid: () => Promise<string | null>;
  validateOwner: (uid: string) => Promise<boolean>;
  listProfiles: () => AsyncIterable<ProjectionMigrationProfile>;
  getClaims: (uid: string) => Promise<Record<string, unknown> | null>;
  validateProject: () => Promise<boolean>;
  applyProjection: (
    uid: string,
    expected: AccessProjection,
    ownerUid: string,
    expectedInputFingerprint: string,
  ) => Promise<"updated" | "unchanged" | "stale" | "auth_unavailable" | "owner_identity_changed">;
};

export type ProjectionMigrationRecord = {
  profileRef: string;
  classification: {
    allowedByPolicy: boolean;
    accountState: "active" | "blocked" | "unknown";
    projection: "absent" | "incomplete" | "expired" | "inconsistent" | "consistent";
    entitlement: "owner" | "manual" | "stripe" | "none";
    entitlementsPresent: {
      ownerAccess: boolean;
      manualAccess: boolean;
      stripeBilling: boolean;
    };
  };
  projectionBeforeExisted: boolean;
  projectionBefore: Record<string, unknown> | null;
  projectionProposed: Record<string, unknown>;
  stateFingerprint: string;
  policyStateFingerprint: string;
  divergences: string[];
  ambiguities: string[];
  proposedAction: "none" | "write_projection" | "review";
  result: "analyzed" | "updated" | "unchanged" | "stale" | "failed" | "skipped";
};

export type ProjectionMigrationReport = {
  schemaVersion: 2;
  mode: "dry-run" | "apply";
  projectId: string;
  generatedAt: string;
  interrupted: boolean;
  ownerIdentity: "configured" | "missing_or_invalid";
  ownerPreflight: "valid" | "blocked";
  ownerDiagnostics: string[];
  ownerIdentityFingerprint: string | null;
  policyVersion: string;
  reportHash: string;
  totals: {
    analyzed: number;
    allowed: number;
    blocked: number;
    unknownState: number;
    projection: Record<ProjectionMigrationRecord["classification"]["projection"], number>;
    entitlement: Record<ProjectionMigrationRecord["classification"]["entitlement"], number>;
    ownerAccessPresent: number;
    manualAccessPresent: number;
    stripeBillingPresent: number;
    proposedWrites: number;
    updated: number;
    unchanged: number;
    stale: number;
    ownerIdentityChanged: number;
    failed: number;
    skipped: number;
    claimsCompared: number;
    claimDivergences: number;
    billingDivergences: number;
    ambiguous: number;
  };
  records: ProjectionMigrationRecord[];
};

export type ProjectionMigrationOptions = {
  mode: "dry-run" | "apply";
  expectedProjectId: string;
  now?: number;
  reportSalt?: string;
  shouldStop?: () => boolean;
  onRecord?: (record: ProjectionMigrationRecord, report: ProjectionMigrationReport) => void | Promise<void>;
  approvedReport?: ProjectionMigrationReport;
};

const isObject = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === "object" && !Array.isArray(value)
);

const millis = (value: unknown): number | null => {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (isObject(value) && typeof value.toMillis === "function") {
    const result = (value.toMillis as () => number)();
    return Number.isFinite(result) ? result : null;
  }
  if (isObject(value) && typeof value.toDate === "function") {
    const result = (value.toDate as () => unknown)();
    return result instanceof Date && Number.isFinite(result.getTime()) ? result.getTime() : null;
  }
  if (isObject(value)) {
    const seconds = typeof value.seconds === "number" ? value.seconds : value._seconds;
    const nanoseconds = typeof value.nanoseconds === "number" ? value.nanoseconds : value._nanoseconds;
    if (typeof seconds === "number" && Number.isFinite(seconds)
      && (nanoseconds === undefined || (typeof nanoseconds === "number" && Number.isFinite(nanoseconds)))) {
      const timestampMillis = seconds * 1000 + Math.floor((typeof nanoseconds === "number" ? nanoseconds : 0) / 1_000_000);
      return Number.isFinite(timestampMillis) ? timestampMillis : null;
    }
  }
  return null;
};

export const ACCESS_POLICY_VERSION = "access-v1";

const projectionSources = new Set(["owner", "stripe", "manual", "none"]);
const projectionReasons = new Set([
  "profile_missing",
  "account_inactive",
  "owner_entitlement",
  "manual_entitlement",
  "subscription_active",
  "subscription_inactive",
]);

type ProjectionRepresentation = "firestore" | "report";

const projectionTimestampMillis = (value: unknown, representation: ProjectionRepresentation) => {
  if (representation === "firestore") {
    return value instanceof Timestamp ? value.toMillis() : null;
  }
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value ? parsed : null;
};

const projectionView = (value: unknown, representation: ProjectionRepresentation = "firestore") => {
  if (!isObject(value)) return null;
  const validUntil = Object.prototype.hasOwnProperty.call(value, "validUntil")
    ? value.validUntil === null ? null : projectionTimestampMillis(value.validUntil, representation)
    : undefined;
  const evaluatedAt = projectionTimestampMillis(value.evaluatedAt, representation);
  if (typeof value.allowed !== "boolean"
    || typeof value.source !== "string"
    || !projectionSources.has(value.source)
    || validUntil === undefined
    || (value.validUntil !== null && validUntil === null)
    || evaluatedAt === null
    || value.policyVersion !== ACCESS_POLICY_VERSION
    || typeof value.reason !== "string"
    || !projectionReasons.has(value.reason)) return null;
  const projection = {
    allowed: value.allowed,
    source: value.source,
    validUntil,
    evaluatedAt,
    policyVersion: value.policyVersion,
    reason: value.reason,
  };
  if (!projectionSemanticsValid(projection)) return null;
  return projection;
};

const projectionSemanticsValid = (projection: {
  allowed: boolean;
  source: string;
  validUntil: number | null;
  evaluatedAt: number;
  reason: string;
}) => {
  if (!projection.allowed) {
    return projection.source === "none"
      && projection.validUntil === null
      && ["profile_missing", "account_inactive", "subscription_inactive"].includes(projection.reason);
  }
  if (projection.source === "owner") {
    return projection.reason === "owner_entitlement" && projection.validUntil === null;
  }
  if (projection.source === "manual") {
    return projection.reason === "manual_entitlement"
      && projection.validUntil !== null
      && projection.validUntil > projection.evaluatedAt;
  }
  if (projection.source === "stripe") {
    return projection.reason === "subscription_active"
      && projection.validUntil !== null
      && projection.validUntil > projection.evaluatedAt;
  }
  return false;
};

const projectionPartialSemanticsValid = (value: Record<string, unknown>) => {
  if (typeof value.allowed !== "boolean" || typeof value.source !== "string") return true;
  if (!projectionSources.has(value.source)) return true;
  const hasExpiry = Object.prototype.hasOwnProperty.call(value, "validUntil");
  const hasReason = Object.prototype.hasOwnProperty.call(value, "reason");

  if (!value.allowed) {
    return value.source === "none"
      && (!hasExpiry || value.validUntil === null)
      && (!hasReason || (
        typeof value.reason === "string"
        && ["profile_missing", "account_inactive", "subscription_inactive"].includes(value.reason)
      ));
  }
  if (value.source === "none") return false;
  if (value.source === "owner") {
    return (!hasExpiry || value.validUntil === null)
      && (!hasReason || value.reason === "owner_entitlement");
  }
  const expectedReason = value.source === "manual" ? "manual_entitlement" : "subscription_active";
  if ((hasExpiry && value.validUntil === null) || (hasReason && value.reason !== expectedReason)) return false;
  if (hasExpiry && hasReason
    && value.validUntil !== null
    && value.evaluatedAt !== undefined
    && projectionTimestampMillis(value.validUntil, "firestore") !== null
    && projectionTimestampMillis(value.evaluatedAt, "firestore") !== null) {
    return projectionTimestampMillis(value.validUntil, "firestore")! > projectionTimestampMillis(value.evaluatedAt, "firestore")!;
  }
  return true;
};

const stableJson = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "undefined";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(",")}}`;
};

export const sameAccessDecision = (
  left: unknown,
  right: unknown,
  representation: ProjectionRepresentation = "firestore",
) => {
  const leftView = projectionView(left, representation);
  const rightView = projectionView(right, representation);
  if (!leftView || !rightView) return false;
  const decisionOnly = (projection: typeof leftView) => ({
    allowed: projection.allowed,
    source: projection.source,
    validUntil: projection.validUntil,
    policyVersion: projection.policyVersion,
    reason: projection.reason,
  });
  return stableJson(decisionOnly(leftView)) === stableJson(decisionOnly(rightView));
};

const fieldState = (value: unknown, present: boolean) => {
  if (!present) return { present: false };
  if (value === null) return { present: true, value: null };
  if (value instanceof Date) return { present: true, value: millis(value) ?? "invalid_timestamp" };
  if (isObject(value) && typeof value.toMillis === "function") {
    return { present: true, value: millis(value) ?? "invalid_timestamp" };
  }
  if (isObject(value) && typeof value.toDate === "function") {
    return { present: true, value: millis(value) ?? "invalid_timestamp" };
  }
  if (isObject(value)) return { present: true, value: stableJson(value) };
  return { present: true, value };
};

const nestedFieldState = (value: unknown, key: string) => {
  const object = isObject(value) ? value : {};
  return fieldState(object[key], Object.prototype.hasOwnProperty.call(object, key));
};

const projectionFingerprintState = (profile: Record<string, unknown>) => {
  if (!Object.prototype.hasOwnProperty.call(profile, "accessProjection")) return { present: false };
  if (!isObject(profile.accessProjection)) return { present: true, object: false };
  const projection = profile.accessProjection;
  const evaluatedAt = nestedFieldState(projection, "evaluatedAt");
  const evaluatedAtValue = "value" in evaluatedAt
    ? evaluatedAt.value === null
      ? null
      : typeof evaluatedAt.value === "number"
        ? "valid_timestamp"
        : "invalid_timestamp"
    : undefined;
  return {
    present: true,
    object: true,
    allowed: nestedFieldState(projection, "allowed"),
    source: nestedFieldState(projection, "source"),
    validUntil: nestedFieldState(projection, "validUntil"),
    evaluatedAt: { present: "present" in evaluatedAt ? evaluatedAt.present : false, value: evaluatedAtValue },
    policyVersion: nestedFieldState(projection, "policyVersion"),
    reason: nestedFieldState(projection, "reason"),
  };
};

const migrationInputState = (profile: Record<string, unknown>) => ({
  role: fieldState(profile.role, Object.prototype.hasOwnProperty.call(profile, "role")),
  isActive: fieldState(profile.isActive, Object.prototype.hasOwnProperty.call(profile, "isActive")),
  billing: {
    present: Object.prototype.hasOwnProperty.call(profile, "billing"),
    status: nestedFieldState(profile.billing, "status"),
    currentPeriodEnd: nestedFieldState(profile.billing, "currentPeriodEnd"),
  },
  subscription: {
    present: Object.prototype.hasOwnProperty.call(profile, "subscription"),
    status: nestedFieldState(profile.subscription, "status"),
    currentPeriodEnd: nestedFieldState(profile.subscription, "currentPeriodEnd"),
  },
  manualAccess: {
    present: Object.prototype.hasOwnProperty.call(profile, "manualAccess"),
    enabled: nestedFieldState(profile.manualAccess, "enabled"),
    expiresAt: nestedFieldState(profile.manualAccess, "expiresAt"),
  },
  ownerAccess: {
    present: Object.prototype.hasOwnProperty.call(profile, "ownerAccess"),
    enabled: nestedFieldState(profile.ownerAccess, "enabled"),
    permanent: nestedFieldState(profile.ownerAccess, "permanent"),
  },
  accessProjection: projectionFingerprintState(profile),
});

export const projectionInputFingerprint = (profile: Record<string, unknown>) => createHash("sha256")
  .update(stableJson(migrationInputState(profile)))
  .digest("hex");

const profileFingerprints = (profile: Record<string, unknown>, uid: string, projectId: string, salt: string) => {
  const policyState = migrationInputState(profile);
  const digest = (value: unknown) => createHash("sha256")
    .update(`${salt}\0${projectId}\0${uid}\0${stableJson(value)}`)
    .digest("hex");
  return {
    policyStateFingerprint: digest(policyState),
    stateFingerprint: digest(policyState),
  };
};

export const ownerIdentityMatches = (expectedOwnerUid: string, currentOwnerUid: string | null) => (
  normalizeOwnerUid(currentOwnerUid) === expectedOwnerUid
);

export const revalidateProjection = (
  profile: Record<string, unknown> | null,
  uid: string,
  ownerUid: string | null,
  expected: AccessProjection,
  now = Date.now(),
): { result: "updated" | "unchanged" | "stale"; projection: AccessProjection | null } => {
  if (!profile || !ownerUid || isAccessProfileAmbiguous(profile, uid, ownerUid).length > 0) {
    return { result: "stale", projection: null };
  }
  const latest = calculateApplicationAccess(profile as AccountAccessProfile, now, uid, ownerUid);
  if (!sameAccessDecision(latest, expected)) return { result: "stale", projection: latest };
  return {
    result: sameAccessDecision(profile.accessProjection, latest) ? "unchanged" : "updated",
    projection: latest,
  };
};

export const isAccessProfileAmbiguous = (
  profile: Record<string, unknown>,
  uid: string,
  ownerUid: string | null,
  claimsReadable = true,
) => {
  const reasons: string[] = [];
  if (!claimsReadable) reasons.push("auth_claim_read_failed");
  const rawProjection = profile.accessProjection;
  if (profile.isActive !== true && profile.isActive !== false) reasons.push("is_active_missing_or_invalid");
  if (profile.role !== "user" && profile.role !== "admin" && profile.role !== "master_admin") {
    reasons.push("role_missing_or_invalid");
  }
  if (isObject(profile.ownerAccess)
    && profile.ownerAccess.enabled === true
    && profile.ownerAccess.permanent === true
    && (!ownerUid || uid !== ownerUid)) {
    reasons.push("owner_entitlement_uid_mismatch");
  }
  if (isObject(rawProjection) && rawProjection.source === "owner"
    && (!ownerUid || uid !== ownerUid)) {
    reasons.push("owner_projection_uid_mismatch");
  }
  if (Object.prototype.hasOwnProperty.call(profile, "accessProjection")) {
    if (!isObject(rawProjection)) {
      reasons.push("projection_value_unrecognized");
    } else {
      const knownFields = new Set(["allowed", "source", "validUntil", "evaluatedAt", "policyVersion", "reason"]);
      if (Object.keys(rawProjection).some((key) => !knownFields.has(key))) {
        reasons.push("unknown_projection_fields");
      }
      for (const field of ["validUntil", "evaluatedAt"]) {
        const value = rawProjection[field];
        if (value !== undefined
          && !(field === "validUntil" && value === null)
          && projectionTimestampMillis(value, "firestore") === null) {
          reasons.push(`projection_${field}_unrecognized`);
        }
      }
      const invalidPresentField = (
        (Object.prototype.hasOwnProperty.call(rawProjection, "allowed") && typeof rawProjection.allowed !== "boolean")
        || (Object.prototype.hasOwnProperty.call(rawProjection, "source")
          && (typeof rawProjection.source !== "string" || !projectionSources.has(rawProjection.source)))
        || (Object.prototype.hasOwnProperty.call(rawProjection, "policyVersion")
          && rawProjection.policyVersion !== ACCESS_POLICY_VERSION)
        || (Object.prototype.hasOwnProperty.call(rawProjection, "reason")
          && (typeof rawProjection.reason !== "string" || !projectionReasons.has(rawProjection.reason)))
      );
      if (!projectionView(rawProjection) && (
        invalidPresentField || !projectionPartialSemanticsValid(rawProjection)
      )) {
        reasons.push("projection_structure_or_semantics_invalid");
      }
    }
  }

  const billing = isObject(profile.billing) ? profile.billing : null;
  const subscription = isObject(profile.subscription) ? profile.subscription : null;
  if (billing?.status && subscription?.status && billing.status !== subscription.status) {
    reasons.push("billing_status_conflict");
  }
  if (billing?.stripeSubscriptionId && subscription?.stripeSubscriptionId
    && billing.stripeSubscriptionId !== subscription.stripeSubscriptionId) {
    reasons.push("stripe_subscription_id_conflict");
  }
  if (billing?.currentPeriodEnd && subscription?.currentPeriodEnd) {
    const billingEnd = millis(billing.currentPeriodEnd);
    const subscriptionEnd = millis(subscription.currentPeriodEnd);
    if (billingEnd === null || subscriptionEnd === null || billingEnd !== subscriptionEnd) {
      reasons.push("billing_period_end_conflict");
    }
  }
  return reasons;
};

const projectionState = (profile: Record<string, unknown>, expected: AccessProjection, now: number) => {
  if (!Object.prototype.hasOwnProperty.call(profile, "accessProjection")) return "absent" as const;
  const current = projectionView(profile.accessProjection);
  if (!current) {
    return "incomplete" as const;
  }
  if (current.allowed === true && current.validUntil !== null && current.validUntil <= now) {
    return "expired" as const;
  }
  return sameAccessDecision(profile.accessProjection, expected) ? "consistent" as const : "inconsistent" as const;
};

const fingerprint = (uid: string, projectId: string, salt: string) => createHash("sha256")
  .update(`${salt}\0${projectId}\0${uid}`)
  .digest("hex")
  .slice(0, 20);

const safeProjectionSnapshot = (profile: Record<string, unknown>) => {
  if (!isObject(profile.accessProjection)) return null;
  const snapshot: Record<string, unknown> = {};
  for (const field of ["allowed", "source", "validUntil", "evaluatedAt", "policyVersion", "reason"]) {
    if (!Object.prototype.hasOwnProperty.call(profile.accessProjection, field)) continue;
    const value = profile.accessProjection[field];
    if (field === "validUntil" || field === "evaluatedAt") {
      const timestamp = value === null && field === "validUntil" ? null : millis(value);
      snapshot[field] = timestamp === null
        ? (value === null && field === "validUntil" ? null : "invalid")
        : new Date(timestamp).toISOString();
    } else if (field === "allowed") snapshot[field] = typeof value === "boolean" ? value : "invalid";
    else if (field === "source") snapshot[field] = typeof value === "string" && projectionSources.has(value) ? value : "invalid";
    else if (field === "policyVersion") snapshot[field] = value === ACCESS_POLICY_VERSION ? value : "invalid";
    else snapshot[field] = typeof value === "string" && projectionReasons.has(value) ? value : "invalid";
  }
  return snapshot;
};

const safeProjectionDecision = (projection: AccessProjection) => ({
  allowed: projection.allowed,
  source: projection.source,
  validUntil: projection.validUntil?.toDate().toISOString() ?? null,
  evaluatedAt: projection.evaluatedAt.toDate().toISOString(),
  policyVersion: projection.policyVersion,
  reason: projection.reason,
});

const safeErrorLabel = (error: unknown) => {
  const label = typeof error === "object" && error !== null && "code" in error
    ? (error as { code?: unknown }).code
    : typeof error === "object" && error !== null && "name" in error
      ? (error as { name?: unknown }).name
      : null;
  return typeof label === "string" && /^[A-Za-z0-9_.-]{1,80}$/.test(label)
    ? label
    : "unknown";
};

const expectedManagedClaims = (uid: string, profile: Record<string, unknown>, ownerUid: string | null) => ({
  admin: profile.isActive === true && (profile.role === "admin" || profile.role === "master_admin"),
  master_admin: profile.isActive === true && profile.role === "master_admin",
  isActive: profile.isActive === true,
  motofix_owner: !!ownerUid
    && uid === ownerUid
    && profile.isActive === true
    && profile.role === "master_admin"
    && isObject(profile.ownerAccess)
    && profile.ownerAccess.enabled === true
    && profile.ownerAccess.permanent === true,
});

const compareClaims = (claims: Record<string, unknown> | null, expected: ReturnType<typeof expectedManagedClaims>) => {
  if (!claims) return ["auth_user_missing_or_unreadable"];
  return Object.entries(expected)
    .filter(([key, value]) => (claims[key] === true) !== value)
    .map(([key]) => `claim_${key}_divergence`);
};

const newReport = (mode: "dry-run" | "apply", projectId: string): ProjectionMigrationReport => ({
  schemaVersion: 2,
  mode,
  projectId,
  generatedAt: new Date().toISOString(),
  interrupted: false,
  ownerIdentity: "missing_or_invalid",
  ownerPreflight: "blocked",
  ownerDiagnostics: [],
  ownerIdentityFingerprint: null,
  policyVersion: ACCESS_POLICY_VERSION,
  reportHash: "",
  totals: {
    analyzed: 0,
    allowed: 0,
    blocked: 0,
    unknownState: 0,
    projection: { absent: 0, incomplete: 0, expired: 0, inconsistent: 0, consistent: 0 },
    entitlement: { owner: 0, manual: 0, stripe: 0, none: 0 },
    ownerAccessPresent: 0,
    manualAccessPresent: 0,
    stripeBillingPresent: 0,
    proposedWrites: 0,
    updated: 0,
    unchanged: 0,
    stale: 0,
    ownerIdentityChanged: 0,
    failed: 0,
    skipped: 0,
    claimsCompared: 0,
    claimDivergences: 0,
    billingDivergences: 0,
    ambiguous: 0,
  },
  records: [],
});

const ownerProfileIsValid = (profile: Record<string, unknown> | null, ownerUid: string | null) => (
  !!profile
  && !!ownerUid
  && (profile.uid === undefined || profile.uid === ownerUid)
  && profile.isActive === true
  && profile.role === "master_admin"
  && isObject(profile.ownerAccess)
  && profile.ownerAccess.enabled === true
  && profile.ownerAccess.permanent === true
);

export const canonicalReportHash = (report: ProjectionMigrationReport) => {
  const unsigned = { ...report, reportHash: "" };
  return createHash("sha256").update(stableJson(unsigned)).digest("hex");
};

const exactKeys = (value: Record<string, unknown>, keys: string[]) => (
  Object.keys(value).length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
);

const isNonNegativeInteger = (value: unknown): value is number => (
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0
);

const isIsoTimestamp = (value: unknown) => (
  typeof value === "string"
  && Number.isFinite(Date.parse(value))
  && new Date(value).toISOString() === value
);

const isHexDigest = (value: unknown, length: number) => (
  typeof value === "string" && new RegExp(`^[a-f0-9]{${length}}$`).test(value)
);

const isStringArray = (value: unknown): value is string[] => (
  Array.isArray(value) && value.every((entry) => typeof entry === "string")
);

const isProjectionSnapshot = (value: unknown) => {
  if (!isObject(value)) return false;
  const allowedKeys = ["allowed", "source", "validUntil", "evaluatedAt", "policyVersion", "reason"];
  if (Object.keys(value).some((key) => !allowedKeys.includes(key))) return false;
  if ("allowed" in value && typeof value.allowed !== "boolean" && value.allowed !== "invalid") return false;
  if ("source" in value && !(typeof value.source === "string" && projectionSources.has(value.source))
    && value.source !== "invalid") return false;
  if ("validUntil" in value && value.validUntil !== null
    && value.validUntil !== "invalid" && !isIsoTimestamp(value.validUntil)) return false;
  if ("evaluatedAt" in value && value.evaluatedAt !== "invalid" && !isIsoTimestamp(value.evaluatedAt)) return false;
  if ("policyVersion" in value && value.policyVersion !== ACCESS_POLICY_VERSION && value.policyVersion !== "invalid") return false;
  if ("reason" in value && !(typeof value.reason === "string" && projectionReasons.has(value.reason))
    && value.reason !== "invalid") return false;
  return true;
};

const reportTotalsMatchRecords = (report: Record<string, unknown>) => {
  const totals = report.totals as Record<string, unknown>;
  const records = report.records as Record<string, unknown>[];
  const recordTotals = {
    analyzed: records.length,
    allowed: 0,
    blocked: 0,
    unknownState: 0,
    projection: { absent: 0, incomplete: 0, expired: 0, inconsistent: 0, consistent: 0 },
    entitlement: { owner: 0, manual: 0, stripe: 0, none: 0 },
    ownerAccessPresent: 0,
    manualAccessPresent: 0,
    stripeBillingPresent: 0,
    proposedWrites: 0,
    skipped: 0,
    claimsCompared: records.length,
    claimDivergences: 0,
    billingDivergences: 0,
    ambiguous: 0,
  };

  for (const record of records) {
    const classification = record.classification as Record<string, unknown>;
    const entitlementsPresent = classification.entitlementsPresent as Record<string, unknown>;
    if (classification.allowedByPolicy === true) recordTotals.allowed += 1;
    else if (classification.accountState === "unknown") recordTotals.unknownState += 1;
    else recordTotals.blocked += 1;
    recordTotals.projection[classification.projection as keyof typeof recordTotals.projection] += 1;
    recordTotals.entitlement[classification.entitlement as keyof typeof recordTotals.entitlement] += 1;
    if (entitlementsPresent.ownerAccess) recordTotals.ownerAccessPresent += 1;
    if (entitlementsPresent.manualAccess) recordTotals.manualAccessPresent += 1;
    if (entitlementsPresent.stripeBilling) recordTotals.stripeBillingPresent += 1;
    if (record.proposedAction === "write_projection") recordTotals.proposedWrites += 1;
    if (record.proposedAction === "review") recordTotals.skipped += 1;
    if ((record.ambiguities as string[]).length > 0) recordTotals.ambiguous += 1;
    const divergences = record.divergences as string[];
    if (divergences.some((entry) => entry.startsWith("claim_") || entry === "auth_user_missing_or_unreadable")) {
      recordTotals.claimDivergences += 1;
    }
    if (divergences.some((entry) => entry.startsWith("billing_"))) recordTotals.billingDivergences += 1;
  }

  const nestedTotalsMatch = (key: "projection" | "entitlement") => {
    const expected = recordTotals[key];
    const actual = totals[key];
    return isObject(actual)
      && exactKeys(actual, Object.keys(expected))
      && Object.entries(expected).every(([entry, count]) => actual[entry] === count);
  };
  return Object.entries(recordTotals)
    .filter(([key]) => key !== "projection" && key !== "entitlement")
    .every(([key, expected]) => totals[key] === expected)
    && nestedTotalsMatch("projection")
    && nestedTotalsMatch("entitlement")
    && (totals.updated as number) === 0
    && (totals.unchanged as number) === 0
    && (totals.stale as number) === 0
    && (totals.ownerIdentityChanged as number) === 0
    && (totals.failed as number) === 0;
};

export const approvedReportValidationError = (
  value: unknown,
  suppliedHash: string,
  expectedProjectId: string,
) => {
  if (!isObject(value)) return "report_structure_invalid";
  if (value.schemaVersion !== 2) return "report_schema_invalid";
  if (value.policyVersion !== ACCESS_POLICY_VERSION) return "report_policy_mismatch";
  if (value.mode !== "dry-run") return "report_mode_invalid";
  if (value.projectId !== expectedProjectId) return "report_project_mismatch";
  if (value.ownerPreflight !== "valid"
    || !Array.isArray(value.ownerDiagnostics)
    || value.ownerDiagnostics.length > 0
    || value.ownerIdentity !== "configured"
    || !isHexDigest(value.ownerIdentityFingerprint, 20)) return "report_owner_preflight_blocked";
  if (value.interrupted !== false) return "report_interrupted";
  if (!isIsoTimestamp(value.generatedAt)
    || typeof value.reportHash !== "string"
    || !isHexDigest(value.reportHash, 64)) return "report_structure_invalid";
  if (value.reportHash !== suppliedHash) return "report_hash_mismatch";

  const topLevelKeys = [
    "schemaVersion", "mode", "projectId", "generatedAt", "interrupted", "ownerIdentity",
    "ownerPreflight", "ownerDiagnostics", "ownerIdentityFingerprint", "policyVersion",
    "reportHash", "totals", "records",
  ];
  const totalKeys = [
    "analyzed", "allowed", "blocked", "unknownState", "projection", "entitlement",
    "ownerAccessPresent", "manualAccessPresent", "stripeBillingPresent", "proposedWrites",
    "updated", "unchanged", "stale", "ownerIdentityChanged", "failed", "skipped",
    "claimsCompared", "claimDivergences", "billingDivergences", "ambiguous",
  ];
  if (!exactKeys(value, topLevelKeys) || !isStringArray(value.ownerDiagnostics)
    || !isObject(value.totals) || !exactKeys(value.totals, totalKeys)
    || !Array.isArray(value.records)) return "report_structure_invalid";

  const totals = value.totals;
  if (Object.entries(totals)
    .filter(([key]) => key !== "projection" && key !== "entitlement")
    .some(([, count]) => !isNonNegativeInteger(count))) return "report_structure_invalid";
  if (!isObject(totals.projection)
    || !exactKeys(totals.projection, ["absent", "incomplete", "expired", "inconsistent", "consistent"])
    || Object.values(totals.projection).some((count) => !isNonNegativeInteger(count))
    || !isObject(totals.entitlement)
    || !exactKeys(totals.entitlement, ["owner", "manual", "stripe", "none"])
    || Object.values(totals.entitlement).some((count) => !isNonNegativeInteger(count))) {
    return "report_structure_invalid";
  }

  const recordKeys = [
    "profileRef", "classification", "projectionBeforeExisted", "projectionBefore",
    "projectionProposed", "stateFingerprint", "policyStateFingerprint", "divergences",
    "ambiguities", "proposedAction", "result",
  ];
  const references = new Set<string>();
  let ownerRecordCount = 0;
  for (const record of value.records) {
    if (!isObject(record) || !exactKeys(record, recordKeys)
      || !isHexDigest(record.profileRef, 20)
      || references.has(record.profileRef as string)
      || !isObject(record.classification)
      || !exactKeys(record.classification, ["allowedByPolicy", "accountState", "projection", "entitlement", "entitlementsPresent"])
      || typeof record.classification.allowedByPolicy !== "boolean"
      || !["active", "blocked", "unknown"].includes(String(record.classification.accountState))
      || !["absent", "incomplete", "expired", "inconsistent", "consistent"].includes(String(record.classification.projection))
      || !["owner", "manual", "stripe", "none"].includes(String(record.classification.entitlement))
      || !isObject(record.classification.entitlementsPresent)
      || !exactKeys(record.classification.entitlementsPresent, ["ownerAccess", "manualAccess", "stripeBilling"])
      || Object.values(record.classification.entitlementsPresent).some((flag) => typeof flag !== "boolean")
      || typeof record.projectionBeforeExisted !== "boolean"
      || (record.projectionBefore !== null && !isProjectionSnapshot(record.projectionBefore))
      || (record.projectionBeforeExisted === false && record.projectionBefore !== null)
      || !isObject(record.projectionProposed)
      || !exactKeys(record.projectionProposed, ["allowed", "source", "validUntil", "evaluatedAt", "policyVersion", "reason"])
      || !projectionView(record.projectionProposed, "report")
      || !isHexDigest(record.stateFingerprint, 64)
      || !isHexDigest(record.policyStateFingerprint, 64)
      || !isStringArray(record.divergences)
      || !isStringArray(record.ambiguities)
      || !["none", "write_projection", "review"].includes(String(record.proposedAction))
      || !["analyzed", "updated", "unchanged", "stale", "failed", "skipped"].includes(String(record.result))) {
      return "report_structure_invalid";
    }
    references.add(record.profileRef as string);
    if (record.classification.entitlement === "owner") {
      ownerRecordCount += 1;
      if (record.classification.allowedByPolicy !== true
        || record.classification.accountState !== "active"
        || record.classification.entitlementsPresent.ownerAccess !== true
        || record.ambiguities.length > 0) return "report_owner_preflight_blocked";
    }
    if (record.projectionProposed.allowed !== record.classification.allowedByPolicy
      || record.projectionProposed.source !== record.classification.entitlement) {
      return "report_structure_invalid";
    }
    if (record.proposedAction === "write_projection"
      && (record.result !== "analyzed" || record.ambiguities.length > 0
        || record.projectionBeforeExisted && record.projectionBefore === null)) {
      return "report_structure_invalid";
    }
    if (record.proposedAction === "review"
      && (record.result !== "skipped" || record.ambiguities.length === 0)) return "report_structure_invalid";
    if (record.proposedAction === "none"
      && (record.result !== "analyzed" || record.classification.projection !== "consistent"
        || record.ambiguities.length > 0
        || !sameAccessDecision(record.projectionBefore, record.projectionProposed, "report"))) {
      return "report_structure_invalid";
    }
  }

  if (value.records.length === 0 || ownerRecordCount !== 1) return "report_owner_preflight_blocked";
  if (!reportTotalsMatchRecords(value)) return "report_totals_inconsistent";
  try {
    if (canonicalReportHash(value as unknown as ProjectionMigrationReport) !== suppliedHash) {
      return "report_hash_mismatch";
    }
  } catch {
    return "report_structure_invalid";
  }
  return null;
};

export const verifyApprovedReport = (
  report: unknown,
  suppliedHash: string,
  expectedProjectId: string,
) => approvedReportValidationError(report, suppliedHash, expectedProjectId) === null;

/**
 * Domain engine only: adapters determine their own trust boundary.
 * This function accepts in-memory adapters for unit tests and is not authorization.
 * Production callers must use the CLI and protected Firestore adapter; new operational
 * entry points must independently enforce authorization before adapter I/O.
 */
export const runAccessProjectionMigration = async (
  adapter: ProjectionMigrationAdapter,
  options: ProjectionMigrationOptions,
): Promise<ProjectionMigrationReport> => {
  if (!options.expectedProjectId || adapter.projectId !== options.expectedProjectId) {
    throw new Error("firebase_project_mismatch");
  }
  if (!(await adapter.validateProject())) throw new Error("firebase_project_mismatch");
  const ownerUid = normalizeOwnerUid(await adapter.getOwnerUid());
  const now = options.now ?? Date.now();
  const salt = options.reportSalt || randomBytes(32).toString("hex");
  const report = newReport(options.mode, adapter.projectId);
  report.ownerIdentity = ownerUid ? "configured" : "missing_or_invalid";
  report.ownerIdentityFingerprint = ownerUid ? fingerprint(ownerUid, adapter.projectId, salt) : null;
  let permanentOwnerEntitlements = 0;
  let ownerProfile: Record<string, unknown> | null = null;
  let ownerClaimsReadable = false;
  let ownerClaims: Record<string, unknown> | null = null;
  const candidatesByFingerprint = new Map<string, {
    uid: string;
    decision: AccessProjection;
    record: ProjectionMigrationRecord;
    inputFingerprint: string;
  }>();

  for await (const item of adapter.listProfiles()) {
    if (options.shouldStop?.()) {
      report.interrupted = true;
      break;
    }

    report.totals.analyzed += 1;
    const profile = item.profile;
    const accountState = profile.isActive === true
      ? "active"
      : profile.isActive === false
        ? "blocked"
        : "unknown";
    const decision = calculateApplicationAccess(
      profile as AccountAccessProfile,
      now,
      item.uid,
      ownerUid,
    );
    const state = projectionState(profile, decision, now);
    let claimsReadable = true;
    let claims: Record<string, unknown> | null = null;
    try {
      claims = await adapter.getClaims(item.uid);
    } catch {
      claimsReadable = false;
    }
    const ambiguities = isAccessProfileAmbiguous(profile, item.uid, ownerUid, claimsReadable);
    if (item.uid === ownerUid) {
      ownerProfile = profile;
      ownerClaimsReadable = claimsReadable && claims !== null;
      ownerClaims = claims;
    }
    if (isObject(profile.ownerAccess)
      && profile.ownerAccess.enabled === true
      && profile.ownerAccess.permanent === true) permanentOwnerEntitlements += 1;

    const billing = isObject(profile.billing) ? profile.billing : {};
    const subscription = isObject(profile.subscription) ? profile.subscription : {};
    const ownerAccess = isObject(profile.ownerAccess) ? profile.ownerAccess : {};
    const manualAccess = isObject(profile.manualAccess) ? profile.manualAccess : {};
    const entitlementsPresent = {
      ownerAccess: ownerAccess.enabled === true && ownerAccess.permanent === true,
      manualAccess: manualAccess.enabled === true,
      stripeBilling: typeof billing.status === "string" || typeof subscription.status === "string",
    };
    const divergences: string[] = [];
    report.totals.claimsCompared += 1;
    if (claimsReadable) {
      divergences.push(...compareClaims(claims, expectedManagedClaims(item.uid, profile, ownerUid)));
    } else {
      divergences.push("auth_claim_read_failed");
    }
    if (billing.status && subscription.status && billing.status !== subscription.status) {
      divergences.push("billing_status_conflict");
    }
    if (!sameAccessDecision(profile.accessProjection, decision)) divergences.push("projection_policy_divergence");
    if (state === "expired") divergences.push("projection_expired");

    const action = ambiguities.length > 0
      ? "review" as const
      : state === "consistent"
        ? "none" as const
        : "write_projection" as const;
    const result: ProjectionMigrationRecord["result"] = action === "review" ? "skipped" : "analyzed";

    if (decision.allowed) report.totals.allowed += 1;
    else if (accountState === "unknown") report.totals.unknownState += 1;
    else report.totals.blocked += 1;
    report.totals.projection[state] += 1;
    report.totals.entitlement[decision.source] += 1;
    if (entitlementsPresent.ownerAccess) report.totals.ownerAccessPresent += 1;
    if (entitlementsPresent.manualAccess) report.totals.manualAccessPresent += 1;
    if (entitlementsPresent.stripeBilling) report.totals.stripeBillingPresent += 1;
    if (action === "write_projection") report.totals.proposedWrites += 1;
    if (ambiguities.length > 0) report.totals.ambiguous += 1;
    if (divergences.some((entry) => entry.startsWith("claim_") || entry === "auth_user_missing_or_unreadable")) {
      report.totals.claimDivergences += 1;
    }
    if (divergences.some((entry) => entry.startsWith("billing_"))) report.totals.billingDivergences += 1;

    if (action === "review") report.totals.skipped += 1;

    const ids = profileFingerprints(profile, item.uid, adapter.projectId, salt);
    const record: ProjectionMigrationRecord = {
      profileRef: fingerprint(item.uid, adapter.projectId, salt),
      classification: {
        allowedByPolicy: decision.allowed,
        accountState,
        projection: state,
        entitlement: decision.source,
        entitlementsPresent,
      },
      projectionBeforeExisted: Object.prototype.hasOwnProperty.call(profile, "accessProjection"),
      projectionBefore: safeProjectionSnapshot(profile),
      projectionProposed: safeProjectionDecision(decision),
      ...ids,
      divergences: [...new Set(divergences)],
      ambiguities: [...new Set(ambiguities)],
      proposedAction: action,
      result,
    };
    report.records.push(record);
    if (action === "write_projection") {
      candidatesByFingerprint.set(record.profileRef, {
        uid: item.uid,
        decision,
        record,
        inputFingerprint: projectionInputFingerprint(profile),
      });
    }
    await options.onRecord?.(record, report);
  }

  const ownerProfileValid = !!ownerUid
    && ownerProfileIsValid(ownerProfile, ownerUid)
    && calculateApplicationAccess(ownerProfile as AccountAccessProfile, now, ownerUid, ownerUid).source === "owner";
  if (!ownerUid) report.ownerDiagnostics.push("owner_identity_missing_or_invalid");
  else if (!ownerProfile) report.ownerDiagnostics.push("owner_profile_missing");
  else if (!ownerProfileIsValid(ownerProfile, ownerUid)) report.ownerDiagnostics.push("owner_profile_inactive_or_not_permanent_master_admin");
  else if (calculateApplicationAccess(ownerProfile as AccountAccessProfile, now, ownerUid, ownerUid).source !== "owner") {
    report.ownerDiagnostics.push("owner_policy_divergence");
  }
  if (permanentOwnerEntitlements !== 1) report.ownerDiagnostics.push(
    permanentOwnerEntitlements === 0 ? "owner_entitlement_missing" : "multiple_permanent_owner_entitlements",
  );
  if (!ownerClaimsReadable) report.ownerDiagnostics.push("owner_auth_claim_read_failed");
  if (ownerProfile && ownerClaimsReadable && ownerClaims
    && compareClaims(ownerClaims, expectedManagedClaims(ownerUid!, ownerProfile, ownerUid)).length > 0) {
    report.ownerDiagnostics.push("owner_auth_claims_divergent");
  }
  report.ownerDiagnostics = [...new Set(report.ownerDiagnostics)];
  report.ownerPreflight = report.ownerDiagnostics.length === 0 ? "valid" : "blocked";

  if (report.ownerDiagnostics.length > 0) {
    report.totals.ambiguous += 1;
    report.totals.skipped += 1;
    report.records.push({
      profileRef: "global",
      classification: {
        allowedByPolicy: false,
        accountState: "unknown",
        projection: "inconsistent",
        entitlement: permanentOwnerEntitlements > 1 ? "owner" : "none",
        entitlementsPresent: { ownerAccess: false, manualAccess: false, stripeBilling: false },
      },
      projectionBeforeExisted: false,
      projectionBefore: null,
      projectionProposed: {
        allowed: false,
        source: "none",
        validUntil: null,
        evaluatedAt: new Date(now).toISOString(),
        policyVersion: "access-v1",
        reason: "global_preflight_block",
      },
      stateFingerprint: "",
      policyStateFingerprint: "",
      divergences: [],
      ambiguities: report.ownerDiagnostics,
      proposedAction: "review",
      result: "skipped",
    });
  }

  if (options.mode === "dry-run") {
    report.reportHash = canonicalReportHash(report);
    return report;
  }

  if (!options.approvedReport
    || !verifyApprovedReport(options.approvedReport, options.approvedReport.reportHash, options.expectedProjectId)) {
    throw new Error("approved_dry_run_required");
  }

  if (options.mode === "apply") {
    if (report.ownerPreflight !== "valid" || !ownerUid) {
      report.totals.ownerIdentityChanged += 1;
      report.interrupted = true;
      report.reportHash = canonicalReportHash(report);
      return report;
    }
    if (options.approvedReport.ownerDiagnostics.length > 0) throw new Error("approved_report_owner_preflight_blocked");
    if (report.ownerIdentityFingerprint !== options.approvedReport.ownerIdentityFingerprint) {
      report.totals.ownerIdentityChanged += 1;
      report.ownerPreflight = "blocked";
      report.ownerDiagnostics.push("owner_identity_changed_since_approved_dry_run");
      report.interrupted = true;
      report.reportHash = canonicalReportHash(report);
      return report;
    }
    if (!(await adapter.validateOwner(ownerUid))) {
      report.totals.ownerIdentityChanged += 1;
      report.ownerPreflight = "blocked";
      report.ownerDiagnostics.push("owner_identity_or_profile_changed_before_apply");
      report.interrupted = true;
      report.reportHash = canonicalReportHash(report);
      return report;
    }
    for (const record of report.records) {
      if (options.shouldStop?.()) {
        report.interrupted = true;
        break;
      }
      if (record.proposedAction !== "write_projection") continue;
      const approvedRecord = options.approvedReport.records.find((candidate) => candidate.profileRef === record.profileRef);
      if (!approvedRecord
        || approvedRecord.proposedAction !== "write_projection"
        || approvedRecord.stateFingerprint !== record.stateFingerprint
        || approvedRecord.policyStateFingerprint !== record.policyStateFingerprint
        || !sameAccessDecision(approvedRecord.projectionProposed, record.projectionProposed, "report")) {
        record.result = "stale";
        record.divergences.push("state_changed_since_approved_dry_run");
        report.totals.stale += 1;
        continue;
      }
      if (record.ambiguities.length > 0 || record.divergences.includes("auth_claim_read_failed")) {
        record.result = "skipped";
        report.totals.skipped += 1;
        continue;
      }
      if (sameAccessDecision(record.projectionBefore, record.projectionProposed, "report")
        && approvedRecord.projectionBeforeExisted) {
        record.result = "unchanged";
        report.totals.unchanged += 1;
        continue;
      }
      if (approvedRecord.policyStateFingerprint === record.policyStateFingerprint
        && sameAccessDecision(record.projectionBefore, approvedRecord.projectionProposed, "report")
        && approvedRecord.projectionBeforeExisted) {
        record.result = "unchanged";
        report.totals.unchanged += 1;
        continue;
      }
      const candidate = candidatesByFingerprint.get(record.profileRef);
      if (!candidate) {
        record.result = "stale";
        record.divergences.push("approved_profile_mapping_missing");
        report.totals.stale += 1;
        continue;
      }
      try {
        const writeResult = await adapter.applyProjection(
          candidate.uid,
          candidate.decision,
          ownerUid,
          candidate.inputFingerprint,
        );
        if (writeResult === "owner_identity_changed") report.totals.ownerIdentityChanged += 1;
        else if (writeResult === "auth_unavailable") report.totals.skipped += 1;
        else report.totals[writeResult] += 1;
        if (writeResult === "owner_identity_changed") {
          report.ownerPreflight = "blocked";
          report.ownerDiagnostics.push("owner_identity_changed_during_apply");
          report.interrupted = true;
          break;
        }
        if (writeResult === "auth_unavailable") {
          record.result = "skipped";
          record.ambiguities.push("auth_claim_read_failed_before_write");
        } else {
          record.result = writeResult;
        }
      } catch (error) {
        record.result = "failed";
        record.ambiguities.push(`projection_write_failed:${safeErrorLabel(error)}`);
        report.totals.failed += 1;
        if (error instanceof Error && error.message === "firebase_project_mismatch") {
          report.interrupted = true;
          break;
        }
      }
      await options.onRecord?.(record, report);
    }
  }
  report.reportHash = canonicalReportHash(report);
  return report;
};
