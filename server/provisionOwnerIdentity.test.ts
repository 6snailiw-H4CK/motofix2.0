import assert from "node:assert/strict";
import { test } from "node:test";
import {
  OWNER_IDENTITY_PROVISION_CONFIRMATION,
  OWNER_IDENTITY_REFERENCES_CONFIRMATION,
  provisionOwnerIdentity,
  type OwnerIdentityProvisionAuth,
  type OwnerIdentityProvisionDatabase,
  type OwnerIdentityProvisionTransaction,
} from "./provisionOwnerIdentity";

const expectedPrincipal = "provisioner@appmotofix.iam.gserviceaccount.com";
class FakeAuth implements OwnerIdentityProvisionAuth {
  customClaims: Record<string, unknown> = {
    unrelated_claim: "preserve-me",
    motofix_owner: true,
  };
  userUid = "confirmed-owner-uid";
  onSecondRead?: () => void;
  private userReads = 0;

  async getUser() {
    this.userReads += 1;
    if (this.userReads === 2) this.onSecondRead?.();
    return { uid: this.userUid, customClaims: this.customClaims };
  }
}

const validOptions = (db: OwnerIdentityProvisionDatabase, auth = new FakeAuth()) => ({
  db,
  auth,
  expectedProjectId: "appmotofix",
  credentialProjectId: "appmotofix",
  expectedExecutionPrincipal: expectedPrincipal,
  credentialPrincipal: expectedPrincipal,
  ownerUid: "confirmed-owner-uid",
  independentlyConfirmedOwnerUid: "confirmed-owner-uid",
  externalReferencesConfirmation: OWNER_IDENTITY_REFERENCES_CONFIRMATION,
  operationConfirmation: OWNER_IDENTITY_PROVISION_CONFIRMATION,
  identityValidationReference: "IDENTITY-VERIFICATION-456",
  approvalReference: "CHANGE-123",
  reason: "Provision canonical owner identity after independent verification.",
  emulatorDetected: false,
  serverTimestamp: "server-timestamp",
  auditEventId: "audit-provision-1",
});

class FakeFirestore implements OwnerIdentityProvisionDatabase {
  private readonly documents = new Map<string, Record<string, unknown>>();
  private queue: Promise<void> = Promise.resolve();
  transactionCount = 0;
  failTransactionNumbers = new Set<number>();

  constructor(initialOwnerUid?: unknown) {
    if (initialOwnerUid !== undefined) {
      this.documents.set("system/access_config", { ownerUid: initialOwnerUid });
    }
    this.documents.set("users/confirmed-owner-uid", {
      uid: "confirmed-owner-uid",
      role: "master_admin",
      isActive: true,
      ownerAccess: { enabled: true, permanent: true },
    });
  }

  async runTransaction<T>(
    operation: (transaction: OwnerIdentityProvisionTransaction) => Promise<T>,
  ): Promise<T> {
    this.transactionCount += 1;
    if (this.failTransactionNumbers.has(this.transactionCount)) {
      throw new Error("synthetic_firestore_failure");
    }
    const previous = this.queue;
    let release!: () => void;
    this.queue = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      const pending: Array<{ path: string; value: Record<string, unknown>; mode: "create" | "update" | "set"; merge?: boolean }> = [];
      const transaction: OwnerIdentityProvisionTransaction = {
        get: async ({ path }) => {
          const value = this.documents.get(path);
          return {
            exists: value !== undefined,
            get: (field) => value?.[field],
            data: () => value,
          };
        },
        create: ({ path }, value) => pending.push({ path, value, mode: "create" }),
        update: ({ path }, value) => pending.push({ path, value, mode: "update" }),
        set: ({ path }, value, merge) => pending.push({ path, value, mode: "set", merge }),
      };
      const result = await operation(transaction);
      for (const write of pending) {
        const current = this.documents.get(write.path);
        if (write.mode === "create" && current) throw new Error("already_exists");
        if (write.mode === "update" && !current) throw new Error("not_found");
      }
      for (const write of pending) {
        const current = write.mode === "set" && !write.merge
          ? {}
          : this.documents.get(write.path) ?? {};
        this.documents.set(write.path, { ...current, ...write.value });
      }
      return result;
    } finally {
      release();
    }
  }

  get(path: string) {
    return this.documents.get(path);
  }

  seed(path: string, value: Record<string, unknown>) {
    this.documents.set(path, value);
  }
}

test("rejects a credential targeting a different project", async () => {
  const db = new FakeFirestore();
  await assert.rejects(
    provisionOwnerIdentity({ ...validOptions(db), credentialProjectId: "another-project" }),
    { message: "firebase_project_mismatch" },
  );
  assert.equal(db.get("system/access_config"), undefined);
});

test("rejects missing operation confirmation before writing", async () => {
  const db = new FakeFirestore();
  await assert.rejects(
    provisionOwnerIdentity({ ...validOptions(db), operationConfirmation: "" }),
    { message: "owner_identity_operation_confirmation_required" },
  );
  assert.equal(db.get("system/access_config"), undefined);
});

test("requires explicit operator attestation that references were independently verified", async () => {
  const db = new FakeFirestore();
  await assert.rejects(
    provisionOwnerIdentity({ ...validOptions(db), externalReferencesConfirmation: "" }),
    { message: "owner_identity_external_references_not_confirmed" },
  );
  assert.equal(db.get("system/access_config"), undefined);
});

test("rejects an execution principal that differs from the approved principal", async () => {
  const db = new FakeFirestore();
  await assert.rejects(
    provisionOwnerIdentity({ ...validOptions(db), credentialPrincipal: "other@appmotofix.iam.gserviceaccount.com" }),
    { message: "firebase_execution_identity_mismatch" },
  );
  assert.equal(db.get("system/access_config"), undefined);
});

test("refuses an existing divergent canonical identity", async () => {
  const db = new FakeFirestore("different-owner");
  await assert.rejects(
    provisionOwnerIdentity(validOptions(db)),
    { message: "owner_identity_conflict" },
  );
  assert.equal(db.get("system/access_config")?.ownerUid, "different-owner");
});

test("updates only ownerUid when the config document exists without an identity", async () => {
  const db = new FakeFirestore();
  db.seed("system/access_config", { unrelatedSetting: "preserved" });
  const result = await provisionOwnerIdentity(validOptions(db));
  assert.deepEqual(db.get("system/access_config"), {
    unrelatedSetting: "preserved",
    ownerUid: "confirmed-owner-uid",
  });
  assert.equal(result.syncStatus, "synced");
});

test("refuses an explicitly null ownerUid as ambiguous configuration", async () => {
  const db = new FakeFirestore(null);
  await assert.rejects(
    provisionOwnerIdentity(validOptions(db)),
    { message: "owner_identity_configuration_ambiguous" },
  );
});

test("concurrent operations for the same canonical identity are idempotent", async () => {
  const db = new FakeFirestore();
  const options = validOptions(db);
  const outcomes = await Promise.allSettled([
    provisionOwnerIdentity(options),
    provisionOwnerIdentity({ ...options, auditEventId: "audit-provision-2" }),
  ]);
  assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 2);
  assert.equal(db.get("system/access_config")?.ownerUid, options.ownerUid);
});

test("provisions identity and projection without changing any existing claims", async () => {
  const db = new FakeFirestore();
  const auth = new FakeAuth();
  const claimsBefore = { ...auth.customClaims };
  const result = await provisionOwnerIdentity(validOptions(db, auth));
  assert.equal(db.get("system/access_config")?.ownerUid, "confirmed-owner-uid");
  const profile = db.get("users/confirmed-owner-uid")!;
  assert.deepEqual(profile.accessProjection && {
    allowed: (profile.accessProjection as Record<string, unknown>).allowed,
    source: (profile.accessProjection as Record<string, unknown>).source,
    validUntil: (profile.accessProjection as Record<string, unknown>).validUntil,
    reason: (profile.accessProjection as Record<string, unknown>).reason,
  }, {
    allowed: true,
    source: "owner",
    validUntil: null,
    reason: "owner_entitlement",
  });
  assert.deepEqual(auth.customClaims, claimsBefore);
  assert.deepEqual(db.get("audit_events/audit-provision-1"), {
    actor: expectedPrincipal,
    action: "owner_identity_provisioned",
    targetType: "canonical_owner_identity",
    source: "admin",
    reason: "Provision canonical owner identity after independent verification.",
    identityValidationReference: "IDENTITY-VERIFICATION-456",
    approvalReference: "CHANGE-123",
    operatorAttestedExternalReferences: true,
    before: { ownerUid: null, accessProjection: null },
    after: {
      ownerUid: "confirmed-owner-uid",
      accessProjection: profile.accessProjection,
    },
    timestamp: "server-timestamp",
    ownerIdentitySyncStatus: "synced",
    ownerIdentitySyncAttempts: 1,
    ownerIdentitySyncUpdatedAt: "server-timestamp",
    ownerIdentitySyncFailureAt: null,
    ownerIdentityClaimVerifiedAt: "server-timestamp",
    ownerIdentitySyncError: null,
    ownerIdentitySyncedAt: "server-timestamp",
  });
  assert.equal(result.auditEventId, "audit-provision-1");
  assert.equal(result.syncStatus, "synced");
  assert.equal(result.operationalAccessVerified, false);
});

test("refuses to proceed without a pre-existing owner claim before any Firestore read or write", async () => {
  const db = new FakeFirestore();
  const auth = new FakeAuth();
  delete auth.customClaims.motofix_owner;

  await assert.rejects(
    provisionOwnerIdentity(validOptions(db, auth)),
    { message: "owner_claim_sync_requires_concurrency_guarantee" },
  );
  assert.equal(db.transactionCount, 0);
  assert.equal(db.get("system/access_config"), undefined);
  assert.equal(db.get("audit_events/audit-provision-1"), undefined);
});

test("does not report synchronization complete if the owner claim changes during the operation", async () => {
  const db = new FakeFirestore();
  const auth = new FakeAuth();
  auth.onSecondRead = () => { delete auth.customClaims.motofix_owner; };

  await assert.rejects(
    provisionOwnerIdentity(validOptions(db, auth)),
    { message: "owner_identity_sync_failed" },
  );
  assert.equal(db.get("system/access_config")?.ownerUid, "confirmed-owner-uid");
  assert.equal(db.get("audit_events/audit-provision-1")?.ownerIdentitySyncStatus, "failed");
  assert.equal(db.get("audit_events/audit-provision-1")?.ownerIdentityClaimVerifiedAt, null);
  assert.equal(auth.customClaims.unrelated_claim, "preserve-me");
});

test("rejects a profile whose UID diverges from the confirmed canonical owner", async () => {
  const db = new FakeFirestore();
  db.seed("users/confirmed-owner-uid", {
    uid: "different-owner",
    role: "master_admin",
    isActive: true,
    ownerAccess: { enabled: true, permanent: true },
  });
  const auth = new FakeAuth();
  await assert.rejects(
    provisionOwnerIdentity(validOptions(db, auth)),
    { message: "owner_profile_uid_mismatch" },
  );
  assert.equal(db.get("system/access_config"), undefined);
  assert.equal(db.get("audit_events/audit-provision-1"), undefined);
  assert.deepEqual(auth.customClaims, {
    unrelated_claim: "preserve-me",
    motofix_owner: true,
  });
});

test("records partial synchronization failure and does not report success", async () => {
  const db = new FakeFirestore();
  db.failTransactionNumbers.add(2);
  await assert.rejects(
    provisionOwnerIdentity(validOptions(db)),
    { message: "owner_identity_sync_failed" },
  );
  assert.equal(db.get("system/access_config")?.ownerUid, "confirmed-owner-uid");
  assert.equal((db.get("users/confirmed-owner-uid")?.accessProjection as Record<string, unknown>).source, "owner");
  assert.equal(db.get("audit_events/audit-provision-1")?.ownerIdentitySyncStatus, "failed");
  assert.equal(db.get("audit_events/audit-provision-1")?.ownerIdentitySyncError, "owner_identity_sync_failed");
});

test("retry after partial failure completes the same operation idempotently", async () => {
  const db = new FakeFirestore();
  db.failTransactionNumbers.add(2);
  await assert.rejects(provisionOwnerIdentity(validOptions(db)), { message: "owner_identity_sync_failed" });
  db.failTransactionNumbers.delete(2);

  const result = await provisionOwnerIdentity(validOptions(db));

  assert.equal(result.auditEventId, "audit-provision-1");
  assert.equal(result.syncStatus, "synced");
  assert.equal(db.get("audit_events/audit-provision-1")?.ownerIdentitySyncStatus, "synced");
  assert.equal(db.get("audit_events/audit-provision-1")?.ownerIdentitySyncAttempts, 2);
});

test("repeated successful synchronization leaves the already correct claim unchanged", async () => {
  const db = new FakeFirestore("confirmed-owner-uid");
  const auth = new FakeAuth();
  const claimsBefore = { ...auth.customClaims };
  const options = validOptions(db, auth);

  await provisionOwnerIdentity(options);
  const profileBeforeRetry = db.get("users/confirmed-owner-uid")?.accessProjection;
  await provisionOwnerIdentity(options);

  assert.deepEqual(auth.customClaims, claimsBefore);
  assert.deepEqual(db.get("users/confirmed-owner-uid")?.accessProjection, profileBeforeRetry);
  assert.equal(db.get("audit_events/audit-provision-1")?.ownerIdentitySyncStatus, "synced");
  assert.equal(db.get("audit_events/audit-provision-1")?.ownerIdentitySyncAttempts, 2);
});

test("repairs an owner projection that omits the required explicit null expiry", async () => {
  const db = new FakeFirestore("confirmed-owner-uid");
  db.seed("users/confirmed-owner-uid", {
    uid: "confirmed-owner-uid",
    role: "master_admin",
    isActive: true,
    ownerAccess: { enabled: true, permanent: true },
    accessProjection: {
      allowed: true,
      source: "owner",
      policyVersion: "access-v1",
      reason: "owner_entitlement",
    },
  });
  const auth = new FakeAuth();
  auth.customClaims.motofix_owner = true;

  await provisionOwnerIdentity(validOptions(db, auth));

  assert.equal(
    (db.get("users/confirmed-owner-uid")?.accessProjection as Record<string, unknown>).validUntil,
    null,
  );
});
