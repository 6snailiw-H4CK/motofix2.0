import { createHash } from "node:crypto";
import { normalizeOwnerUid } from "./ownerIdentity";
import { calculateApplicationAccess } from "./accountAccess";

export const OWNER_IDENTITY_PROVISION_CONFIRMATION = "PROVISION MOTOFIX OWNER IDENTITY";
export const OWNER_IDENTITY_REFERENCES_CONFIRMATION = "REFERENCES VERIFIED EXTERNALLY";

export type OwnerIdentityProvisionReference = { path: string };

export type OwnerIdentityProvisionTransaction = {
  get: (reference: OwnerIdentityProvisionReference) => Promise<{
    exists: boolean;
    get: (field: string) => unknown;
    data: () => Record<string, unknown> | undefined;
  }>;
  create: (reference: OwnerIdentityProvisionReference, value: Record<string, unknown>) => void;
  update: (reference: OwnerIdentityProvisionReference, value: Record<string, unknown>) => void;
  set: (reference: OwnerIdentityProvisionReference, value: Record<string, unknown>, merge: boolean) => void;
};

export type OwnerIdentityProvisionAuth = {
  getUser: (uid: string) => Promise<{ uid: string; customClaims?: Record<string, unknown> | null }>;
};

export type OwnerIdentityProvisionDatabase = {
  runTransaction: <T>(
    operation: (transaction: OwnerIdentityProvisionTransaction) => Promise<T>,
  ) => Promise<T>;
};

export type ProvisionOwnerIdentityOptions = {
  db: OwnerIdentityProvisionDatabase;
  auth: OwnerIdentityProvisionAuth;
  expectedProjectId: string;
  credentialProjectId: string | null;
  expectedExecutionPrincipal: string;
  credentialPrincipal: string;
  ownerUid: string;
  independentlyConfirmedOwnerUid: string;
  externalReferencesConfirmation: string;
  operationConfirmation: string;
  identityValidationReference: string;
  approvalReference: string;
  reason: string;
  emulatorDetected: boolean;
  serverTimestamp: unknown;
  auditEventId?: string;
};

export const validateOwnerIdentityProvisioning = (
  options: Omit<ProvisionOwnerIdentityOptions, "db" | "auth" | "serverTimestamp" | "auditEventId">,
) => {
  const expectedProjectId = options.expectedProjectId.trim();
  if (!expectedProjectId || expectedProjectId !== options.credentialProjectId) {
    throw new Error("firebase_project_mismatch");
  }
  if (options.emulatorDetected) throw new Error("firebase_emulator_not_allowed");
  if (!isServiceAccountPrincipal(options.expectedExecutionPrincipal)
    || options.expectedExecutionPrincipal !== options.credentialPrincipal) {
    throw new Error("firebase_execution_identity_mismatch");
  }

  const ownerUid = normalizeOwnerUid(options.ownerUid);
  if (!ownerUid || normalizeOwnerUid(options.independentlyConfirmedOwnerUid) !== ownerUid) {
    throw new Error("owner_identity_confirmation_mismatch");
  }
  if (options.externalReferencesConfirmation !== OWNER_IDENTITY_REFERENCES_CONFIRMATION) {
    throw new Error("owner_identity_external_references_not_confirmed");
  }
  if (options.operationConfirmation !== OWNER_IDENTITY_PROVISION_CONFIRMATION) {
    throw new Error("owner_identity_operation_confirmation_required");
  }

  const approvalReference = options.approvalReference.trim();
  const identityValidationReference = options.identityValidationReference.trim();
  const reason = options.reason.trim();
  if (!identityValidationReference
    || identityValidationReference.length > 200
    || !approvalReference
    || approvalReference.length > 200
    || !reason
    || reason.length > 500) {
    throw new Error("owner_identity_validation_reference_and_approval_required");
  }

  return { expectedProjectId, ownerUid, approvalReference, identityValidationReference, reason };
};

const isServiceAccountPrincipal = (value: string) => (
  /^[^@\s]+@[^@\s]+\.iam\.gserviceaccount\.com$/.test(value)
);

const stableProvisioningAuditId = (projectId: string, ownerUid: string, approvalReference: string) => (
  `owner-identity-provision-${createHash("sha256")
    .update(`${projectId}\n${ownerUid}\n${approvalReference}`)
    .digest("hex")}`
);

const timestampMillis = (value: unknown): number | null => {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.getTime();
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function") {
    const parsed = value.toMillis();
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    const date = value.toDate();
    return date instanceof Date && Number.isFinite(date.getTime()) ? date.getTime() : null;
  }
  return null;
};

const sameProjectionDecision = (current: unknown, expected: {
  allowed: boolean;
  source: string;
  validUntil: unknown;
  policyVersion: string;
  reason: string;
}) => {
  if (!current || typeof current !== "object") return false;
  const projection = current as Record<string, unknown>;
  if (expected.validUntil === null && projection.validUntil !== null) return false;
  return projection.allowed === expected.allowed
    && projection.source === expected.source
    && timestampMillis(projection.validUntil) === timestampMillis(expected.validUntil)
    && projection.policyVersion === expected.policyVersion
    && projection.reason === expected.reason;
};

export const provisionOwnerIdentity = async (options: ProvisionOwnerIdentityOptions) => {
  const validated = validateOwnerIdentityProvisioning(options);
  const {
    expectedProjectId,
    ownerUid,
    approvalReference,
    identityValidationReference,
    reason,
  } = validated;

  const ownerIdentityRef = { path: "system/access_config" };
  const userRef = { path: `users/${ownerUid}` };
  const auditEventId = options.auditEventId
    ?? stableProvisioningAuditId(expectedProjectId, ownerUid, approvalReference);
  const auditRef = { path: `audit_events/${auditEventId}` };

  const initialAuthUser = await options.auth.getUser(ownerUid);
  if (initialAuthUser.uid !== ownerUid) throw new Error("owner_auth_uid_mismatch");
  if (initialAuthUser.customClaims?.motofix_owner !== true) {
    throw new Error("owner_claim_sync_requires_concurrency_guarantee");
  }

  const syncAttempt = await options.db.runTransaction(async (transaction) => {
    const [current, profileSnapshot, auditSnapshot] = await Promise.all([
      transaction.get(ownerIdentityRef),
      transaction.get(userRef),
      transaction.get(auditRef),
    ]);
    const currentOwnerUid = current.exists ? current.get("ownerUid") : undefined;
    if (currentOwnerUid !== undefined && normalizeOwnerUid(currentOwnerUid) !== ownerUid) {
      if (normalizeOwnerUid(currentOwnerUid)) throw new Error("owner_identity_conflict");
      throw new Error("owner_identity_configuration_ambiguous");
    }
    if (auditSnapshot.exists
      && (auditSnapshot.get("action") !== "owner_identity_provisioned"
        || auditSnapshot.get("targetType") !== "canonical_owner_identity"
        || auditSnapshot.get("approvalReference") !== approvalReference
        || auditSnapshot.get("identityValidationReference") !== identityValidationReference)) {
      throw new Error("owner_identity_audit_conflict");
    }

    if (!profileSnapshot.exists) throw new Error("owner_profile_not_found");
    const profile = profileSnapshot.data() ?? {};
    if (profile.uid !== undefined && profile.uid !== ownerUid) throw new Error("owner_profile_uid_mismatch");
    const ownerAccess = profile.ownerAccess && typeof profile.ownerAccess === "object" && !Array.isArray(profile.ownerAccess)
      ? profile.ownerAccess as Record<string, unknown>
      : null;
    if (profile.isActive !== true || profile.role !== "master_admin"
      || ownerAccess?.enabled !== true || ownerAccess.permanent !== true) {
      throw new Error("owner_profile_not_eligible");
    }

    const projection = calculateApplicationAccess(profile, Date.now(), ownerUid, ownerUid);
    if (!projection.allowed || projection.source !== "owner" || projection.validUntil !== null) {
      throw new Error("owner_projection_not_allowed");
    }

    if (currentOwnerUid === undefined) {
      if (current.exists) transaction.update(ownerIdentityRef, { ownerUid });
      else transaction.create(ownerIdentityRef, { ownerUid });
    }

    if (!sameProjectionDecision(profile.accessProjection, projection)) {
      transaction.update(userRef, {
        accessProjection: projection,
        updatedAt: options.serverTimestamp,
      });
    }

    const attempts = (Number(auditSnapshot.get("ownerIdentitySyncAttempts")) || 0) + 1;
    transaction.set(auditRef, {
      actor: options.credentialPrincipal,
      action: "owner_identity_provisioned",
      targetType: "canonical_owner_identity",
      source: "admin",
      reason,
      identityValidationReference,
      approvalReference,
      operatorAttestedExternalReferences: true,
      before: auditSnapshot.get("before") ?? {
        ownerUid: currentOwnerUid ?? null,
        accessProjection: profile.accessProjection ?? null,
      },
      after: {
        ownerUid,
        accessProjection: projection,
      },
      timestamp: auditSnapshot.get("timestamp") ?? options.serverTimestamp,
      ownerIdentitySyncStatus: "pending",
      ownerIdentitySyncAttempts: attempts,
      ownerIdentitySyncUpdatedAt: options.serverTimestamp,
      ownerIdentitySyncFailureAt: null,
      ownerIdentitySyncedAt: null,
      ownerIdentityClaimVerifiedAt: null,
      ownerIdentitySyncError: null,
    }, true);
    return attempts;
  });

  try {
    const user = await options.auth.getUser(ownerUid);
    if (user.uid !== ownerUid) throw new Error("owner_auth_uid_mismatch");
    if (user.customClaims?.motofix_owner !== true) {
      throw new Error("owner_claim_changed_during_sync");
    }

    await options.db.runTransaction(async (transaction) => {
      const audit = await transaction.get(auditRef);
      if (!audit.exists) throw new Error("owner_identity_audit_missing");
      transaction.update(auditRef, {
        ownerIdentitySyncStatus: "synced",
        ownerIdentitySyncAttempts: syncAttempt,
        ownerIdentitySyncUpdatedAt: options.serverTimestamp,
        ownerIdentitySyncFailureAt: null,
        ownerIdentitySyncedAt: options.serverTimestamp,
        ownerIdentityClaimVerifiedAt: options.serverTimestamp,
        ownerIdentitySyncError: null,
      });
    });
  } catch {
    try {
      await options.db.runTransaction(async (transaction) => {
        const audit = await transaction.get(auditRef);
        if (!audit.exists) throw new Error("owner_identity_audit_missing");
        transaction.update(auditRef, {
          ownerIdentitySyncStatus: "failed",
          ownerIdentitySyncAttempts: syncAttempt,
          ownerIdentitySyncUpdatedAt: options.serverTimestamp,
          ownerIdentitySyncFailureAt: options.serverTimestamp,
          ownerIdentitySyncError: "owner_identity_sync_failed",
        });
      });
    } catch {
      throw new Error("owner_identity_sync_audit_failed");
    }
    throw new Error("owner_identity_sync_failed");
  }

  return {
    projectId: expectedProjectId,
    auditEventId,
    syncStatus: "synced" as const,
    operationalAccessVerified: false as const,
  };
};
