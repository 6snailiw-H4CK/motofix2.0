import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";
import { Timestamp, type Firestore } from "firebase-admin/firestore";
import {
  createAccessProjectionFirestoreAdapter,
  readAuthUserWithTimeout,
} from "./access-projection-firestore-adapter";
import {
  approvedReportValidationError,
  canonicalReportHash,
  ownerIdentityMatches,
  revalidateProjection,
  runAccessProjectionMigration,
  verifyApprovedReport,
  type ProjectionMigrationReport,
  type ProjectionMigrationAdapter,
  type ProjectionMigrationProfile,
} from "./access-projection-backfill";
import {
  isApprovedFirestoreEndpoint,
  isApprovedFirestoreEnvironment,
  isApprovedFirestoreProject,
} from "../server/firestoreProjectIdentity";
import { calculateApplicationAccess } from "../server/accountAccess";
import { MOTOFIX_OWNER_UID } from "../server/ownerIdentity";
import {
  canonicalizeOperationalAuthorizationPayload,
  verifyOperationalAuthorizationSignature,
  verifyTrustedOperationalAuthorization,
} from "./access-projection-operational-authorization";
import {
  assertSupportedFirebaseCredentialIdentity,
  explicitServiceAccountIdentity,
} from "../server/firebaseCredentialIdentity";
import {
  claimOperationalAuthorizationExecution,
  reserveOperationalAuthorizationOnce,
  type AuthorizationReplayScope,
  type OperationalAuthorizationReplayRegistry,
} from "./access-projection-replay-registry";

const projectId = "motofix-emulator-test";
const ownerUid = MOTOFIX_OWNER_UID;
const now = Date.parse("2026-10-01T00:00:00.000Z");
const future = Timestamp.fromMillis(now + 60_000);
const past = Timestamp.fromMillis(now - 60_000);
const cloneProfile = (data: Record<string, unknown>) => ({ ...data });

const profile = (values: Record<string, unknown> = {}) => ({
  role: "user",
  isActive: true,
  ...values,
});

const adapterFor = (
  profiles: ProjectionMigrationProfile[],
  options: {
    owner?: string | null;
    claims?: Record<string, Record<string, unknown>>;
    claimError?: Error;
    ownerValidation?: boolean;
    failClaimsFor?: string[];
  } = {},
) => {
  let writes = 0;
  const initial = profiles.map(({ uid, profile: data }) => [uid, cloneProfile(data)] as const);
  if (options.owner !== null && !initial.some(([uid]) => uid === ownerUid)) {
    const ownerProfile: Record<string, unknown> = {
      role: "master_admin",
      isActive: true,
      ownerAccess: { enabled: true, permanent: true },
    };
    ownerProfile.accessProjection = calculateApplicationAccess(ownerProfile, now, ownerUid, ownerUid);
    initial.push([ownerUid, ownerProfile]);
  }
  const store = new Map(initial);
  const identity = options.owner === undefined ? ownerUid : options.owner;
  const makeClaims = (uid: string) => {
    const user = store.get(uid);
    if (!user) return null;
    const isOwner = uid === identity
      && user.role === "master_admin"
      && user.isActive === true
      && (user.ownerAccess as Record<string, unknown> | undefined)?.enabled === true
      && (user.ownerAccess as Record<string, unknown> | undefined)?.permanent === true;
    return {
      ...(user.isActive === true && (user.role === "admin" || user.role === "master_admin") ? { admin: true } : {}),
      ...(user.isActive === true && user.role === "master_admin" ? { master_admin: true } : {}),
      ...(user.isActive === true ? { isActive: true } : {}),
      ...(isOwner ? { motofix_owner: true } : {}),
    };
  };
  const adapter: ProjectionMigrationAdapter = {
    projectId,
    validateProject: async () => true,
    getOwnerUid: async () => identity,
    validateOwner: async (uid) => options.ownerValidation !== false
      && uid === identity
      && !!makeClaims(uid)?.motofix_owner
      && !!store.get(uid),
    async *listProfiles() {
      for (const [uid, data] of store) yield { uid, profile: cloneProfile(data) };
    },
    getClaims: async (uid) => {
      if ((options.claimError && uid === ownerUid) || options.failClaimsFor?.includes(uid)) {
        throw options.claimError ?? new Error("auth unavailable");
      }
      return options.claims?.[uid] ?? makeClaims(uid);
    },
    applyProjection: async (uid, expected, configuredOwnerUid) => {
      const latest = store.get(uid);
      if (!latest || configuredOwnerUid !== identity) return "owner_identity_changed";
      const claimState = options.claims?.[uid] ?? makeClaims(uid);
      if (!claimState) return "auth_unavailable";
      const currentDecision = calculateApplicationAccess(latest, now, uid, configuredOwnerUid);
      if (
        currentDecision.allowed !== expected.allowed
        || currentDecision.source !== expected.source
        || currentDecision.validUntil?.toMillis() !== expected.validUntil?.toMillis()
      ) return "stale";
      const current = latest.accessProjection as typeof expected | undefined;
      if (
        current?.allowed === expected.allowed
        && current.source === expected.source
        && Object.prototype.hasOwnProperty.call(current, "validUntil")
        && (current.validUntil === null
          ? expected.validUntil === null
          : current.validUntil?.toMillis() === expected.validUntil?.toMillis())
        && current.policyVersion === expected.policyVersion
        && current.reason === expected.reason
      ) return "unchanged";
      store.set(uid, { ...latest, accessProjection: expected });
      writes += 1;
      return "updated";
    },
  };
  return { adapter, store, identity, get writes() { return writes; } };
};

const approvedReportFor = async (adapter: ProjectionMigrationAdapter): Promise<ProjectionMigrationReport> => (
  runAccessProjectionMigration(adapter, {
    mode: "dry-run",
    expectedProjectId: projectId,
    now,
    reportSalt: "fixed-test-salt",
  })
);

test("in-memory adapter unit test analyzes and proposes without Firebase access or writes", async () => {
  const fixture = adapterFor([{ uid: "active", profile: profile() }]);
  const report = await runAccessProjectionMigration(fixture.adapter, {
    mode: "dry-run",
    expectedProjectId: projectId,
    now,
    reportSalt: "fixed-test-salt",
  });
  assert.equal(fixture.writes, 0);
  assert.equal(report.mode, "dry-run");
  assert.equal(report.totals.analyzed, 2);
  assert.equal(report.totals.proposedWrites, 1);
  const activeRecord = report.records.find((record) => record.proposedAction === "write_projection");
  assert.ok(activeRecord);
  assert.equal(activeRecord.profileRef.includes("active"), false);
});

test("dry-run report omits UID, email, tokens, and unknown profile secrets", async () => {
  const privateValues = [
    "user-secret@example.invalid",
    "opaque-auth-token",
    "service-account-private-key",
  ];
  const fixture = adapterFor([{
    uid: privateValues[0],
    profile: profile({
      email: privateValues[0],
      accessToken: privateValues[1],
      credential: privateValues[2],
    }),
  }]);
  const report = await runAccessProjectionMigration(fixture.adapter, {
    mode: "dry-run",
    expectedProjectId: projectId,
    now,
    reportSalt: "fixed-test-salt",
  });
  const serialized = JSON.stringify(report);
  for (const privateValue of privateValues) assert.equal(serialized.includes(privateValue), false);
});

test("incomplete projections are materialized without granting access; canonical null is unchanged", async () => {
  const missingExpiry = adapterFor([{
    uid: "missing-expiry",
    profile: profile({
      accessProjection: {
        allowed: false,
        source: "none",
        evaluatedAt: Timestamp.fromMillis(now - 1),
        policyVersion: "access-v1",
        reason: "subscription_inactive",
      },
    }),
  }]);
  const missingReport = await runAccessProjectionMigration(missingExpiry.adapter, {
    mode: "dry-run",
    expectedProjectId: projectId,
    now,
    reportSalt: "fixed-test-salt",
  });
  const missingRecord = missingReport.records.find((record) => (
    record.classification.projection === "incomplete"
  ));
  assert.ok(missingRecord);
  assert.equal(missingRecord.proposedAction, "write_projection");
  assert.equal(missingExpiry.writes, 0);

  const applyReport = await runAccessProjectionMigration(missingExpiry.adapter, {
    mode: "apply",
    expectedProjectId: projectId,
    now,
    reportSalt: "fixed-test-salt",
    approvedReport: missingReport,
  });
  assert.equal(applyReport.totals.updated, 1, JSON.stringify(applyReport.records));
  assert.equal((missingExpiry.store.get("missing-expiry")?.accessProjection as { allowed: boolean }).allowed, false);
  assert.equal((missingExpiry.store.get("missing-expiry")?.accessProjection as { validUntil: unknown }).validUntil, null);

  const canonicalProjection = calculateApplicationAccess(profile(), now, "canonical", ownerUid);
  const canonical = adapterFor([{
    uid: "canonical",
    profile: profile({ accessProjection: canonicalProjection }),
  }]);
  const canonicalReport = await runAccessProjectionMigration(canonical.adapter, {
    mode: "dry-run",
    expectedProjectId: projectId,
    now,
    reportSalt: "fixed-test-salt",
  });
  const canonicalRecord = canonicalReport.records.find((record) => (
    record.classification.projection === "consistent"
  ));
  assert.ok(canonicalRecord);
  assert.equal(canonicalRecord.proposedAction, "none");
  assert.equal(canonical.writes, 0);
});

test("malformed projection fields are incomplete and never treated as canonical", async () => {
  const fixture = adapterFor([{
    uid: "malformed",
    profile: profile({
      accessProjection: {
        allowed: false,
        source: "none",
        validUntil: "not-a-timestamp",
        evaluatedAt: Timestamp.fromMillis(now),
        policyVersion: "access-v1",
        reason: "subscription_inactive",
      },
    }),
  }]);
  const report = await runAccessProjectionMigration(fixture.adapter, {
    mode: "dry-run",
    expectedProjectId: projectId,
    now,
    reportSalt: "fixed-test-salt",
  });
  const record = report.records.find((entry) => entry.classification.projection === "incomplete");
  assert.ok(record);
  assert.equal(record.proposedAction, "review");
  assert.ok(record.ambiguities.includes("projection_validUntil_unrecognized"));
  assert.equal(fixture.writes, 0);
});

test("Firestore projections require Timestamp values and preserve explicit null", async () => {
  const invalidValues: Array<[string, Record<string, unknown>]> = [
    ["missing", {
      allowed: false,
      source: "none",
      evaluatedAt: Timestamp.fromMillis(now),
      policyVersion: "access-v1",
      reason: "subscription_inactive",
    }],
    ["ISO string", {
      allowed: false,
      source: "none",
      validUntil: new Date(now).toISOString(),
      evaluatedAt: Timestamp.fromMillis(now),
      policyVersion: "access-v1",
      reason: "subscription_inactive",
    }],
    ["number", {
      allowed: false,
      source: "none",
      validUntil: now,
      evaluatedAt: Timestamp.fromMillis(now),
      policyVersion: "access-v1",
      reason: "subscription_inactive",
    }],
    ["malformed object", {
      allowed: false,
      source: "none",
      validUntil: { seconds: "invalid", nanoseconds: 0 },
      evaluatedAt: Timestamp.fromMillis(now),
      policyVersion: "access-v1",
      reason: "subscription_inactive",
    }],
    ["ISO evaluatedAt", {
      allowed: false,
      source: "none",
      validUntil: null,
      evaluatedAt: new Date(now).toISOString(),
      policyVersion: "access-v1",
      reason: "subscription_inactive",
    }],
  ];

  for (const [label, accessProjection] of invalidValues) {
    const fixture = adapterFor([{
      uid: `invalid-${label}`,
      profile: profile({ accessProjection }),
    }]);
    const report = await runAccessProjectionMigration(fixture.adapter, {
      mode: "dry-run",
      expectedProjectId: projectId,
      now,
      reportSalt: "fixed-test-salt",
    });
    const record = report.records.find((entry) => entry.classification.projection === "incomplete");
    assert.ok(record, label);
    if (label === "missing") {
      assert.equal(record.proposedAction, "write_projection");
      assert.equal(record.projectionProposed.allowed, false);
    } else {
      assert.equal(record.proposedAction, "review", label);
      assert.ok(
        record.ambiguities.includes(label === "ISO evaluatedAt"
          ? "projection_evaluatedAt_unrecognized"
          : "projection_structure_or_semantics_invalid"),
        label,
      );
    }
    assert.equal(fixture.writes, 0, label);
  }

  const canonicalDenied = calculateApplicationAccess(profile(), now, "denied", ownerUid);
  assert.equal(canonicalDenied.validUntil, null);
  assert.ok(canonicalDenied.evaluatedAt instanceof Timestamp);
  const canonical = adapterFor([{
    uid: "canonical-null",
    profile: profile({ accessProjection: canonicalDenied }),
  }]);
  const canonicalReport = await runAccessProjectionMigration(canonical.adapter, {
    mode: "dry-run",
    expectedProjectId: projectId,
    now,
    reportSalt: "fixed-test-salt",
  });
  assert.ok(canonicalReport.records.some((entry) => (
    entry.classification.projection === "consistent" && entry.proposedAction === "none"
  )));
});

test("semantically contradictory projections are ambiguous and never written", async () => {
  const contradictory = [
    {
      allowed: false,
      source: "manual",
      validUntil: future,
      reason: "manual_entitlement",
    },
    {
      allowed: true,
      source: "none",
      validUntil: null,
      reason: "subscription_inactive",
    },
    {
      allowed: true,
      source: "manual",
      validUntil: future,
      reason: "subscription_active",
    },
    {
      allowed: true,
      source: "manual",
      validUntil: null,
      reason: "manual_entitlement",
    },
    {
      allowed: true,
      source: "stripe",
      validUntil: future,
      reason: "manual_entitlement",
    },
    {
      allowed: true,
      source: "owner",
      validUntil: future,
      reason: "owner_entitlement",
    },
    {
      allowed: false,
      source: "none",
      validUntil: future,
      reason: "subscription_inactive",
    },
  ];
  for (const [index, accessProjection] of contradictory.entries()) {
    const fixture = adapterFor([{
      uid: `contradictory-${index}`,
      profile: profile({
        accessProjection: {
          ...accessProjection,
          evaluatedAt: Timestamp.fromMillis(now),
          policyVersion: "access-v1",
        },
      }),
    }]);
    const report = await runAccessProjectionMigration(fixture.adapter, {
      mode: "dry-run",
      expectedProjectId: projectId,
      now,
      reportSalt: "fixed-test-salt",
    });
    const record = report.records.find((entry) => (
      entry.ambiguities.includes("projection_structure_or_semantics_invalid")
    ));
    assert.ok(record);
    assert.equal(record.proposedAction, "review");
    assert.equal(fixture.writes, 0);
  }
});

test("valid owner, manual, Stripe, and denied projections are canonical", async () => {
  const cases: Array<{ uid: string; values: Record<string, unknown> }> = [
    {
      uid: ownerUid,
      values: {
        role: "master_admin",
        ownerAccess: { enabled: true, permanent: true },
      },
    },
    {
      uid: "manual-access",
      values: { manualAccess: { enabled: true, expiresAt: future.toDate().toISOString() } },
    },
    {
      uid: "stripe-access",
      values: { billing: { status: "active", currentPeriodEnd: future.toDate().toISOString() } },
    },
    { uid: "denied-access", values: {} },
  ];
  const profiles = cases.map(({ uid, values }) => {
    const data = profile(values);
    return {
      uid,
      profile: {
        ...data,
        accessProjection: calculateApplicationAccess(data, now, uid, ownerUid),
      },
    };
  });
  const fixture = adapterFor(profiles);
  const report = await runAccessProjectionMigration(fixture.adapter, {
    mode: "dry-run",
    expectedProjectId: projectId,
    now,
    reportSalt: "fixed-test-salt",
  });
  assert.equal(report.totals.projection.incomplete, 0);
  for (const entitlement of ["owner", "manual", "none"] as const) {
    const record = report.records.find((entry) => entry.classification.entitlement === entitlement);
    assert.ok(record);
    assert.equal(record.classification.projection, "consistent");
    assert.equal(record.proposedAction, "none");
  }
  assert.equal(fixture.writes, 0);
});

test("effective Firestore project validation fails closed for ADC ambiguity and mismatches", () => {
  const defaultClient = { projectId: "motofix-emulator-test", _settings: {} };
  assert.equal(isApprovedFirestoreProject(defaultClient, projectId), true);
  assert.equal(isApprovedFirestoreProject({ projectId: "other-project", _settings: {} }, projectId), false);
  const unresolvedAdcFirestore = Object.defineProperties({}, {
    _settings: { value: {} },
    projectId: {
      get: () => { throw new Error("project not resolved"); },
    },
  });
  assert.equal(isApprovedFirestoreProject(unresolvedAdcFirestore, projectId), false);
  assert.equal(isApprovedFirestoreProject({ projectId }, projectId), false);
  assert.equal(isApprovedFirestoreEndpoint(defaultClient), true);
  assert.equal(isApprovedFirestoreEndpoint(defaultClient, { FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080" }), false);
  assert.equal(isApprovedFirestoreEndpoint(defaultClient, { FIRESTORE_HOST: "alternate.example" }), false);
  assert.equal(isApprovedFirestoreEndpoint(defaultClient, { FIRESTORE_API_ENDPOINT: "alternate.example" }), false);
  assert.equal(isApprovedFirestoreEndpoint(defaultClient, { GOOGLE_CLOUD_UNIVERSE_DOMAIN: "example.invalid" }), false);
  assert.equal(isApprovedFirestoreEndpoint(defaultClient, { HTTPS_PROXY: "http://proxy.invalid:8080" }), false);
  assert.equal(isApprovedFirestoreEndpoint(defaultClient, { grpc_proxy: "http://proxy.invalid:8080" }), false);
  assert.equal(isApprovedFirestoreEndpoint(defaultClient, { NODE_TLS_REJECT_UNAUTHORIZED: "0" }), false);
  assert.equal(isApprovedFirestoreEndpoint(defaultClient, { NODE_EXTRA_CA_CERTS: "custom-ca.pem" }), false);
  assert.equal(isApprovedFirestoreEndpoint({ projectId, _settings: { host: "127.0.0.1:8080" } }), false);
  assert.equal(isApprovedFirestoreEndpoint({ projectId, _settings: { servicePath: "alternate.example" } }), false);
  assert.equal(isApprovedFirestoreEndpoint({ projectId, _settings: { port: 8080 } }), false);
  assert.equal(isApprovedFirestoreEndpoint({ projectId, _settings: { ssl: false } }), false);
  assert.equal(isApprovedFirestoreEnvironment({ FIRESTORE_EMULATOR_HOST: "" }), true);
  assert.equal(isApprovedFirestoreEnvironment({ FIRESTORE_EMULATOR_HOST: "localhost:8080" }), false);
  assert.equal(isApprovedFirestoreEnvironment({ GOOGLE_CLOUD_UNIVERSE_DOMAIN: "example.invalid" }), false);
  assert.equal(isApprovedFirestoreEnvironment({ HTTPS_PROXY: "http://proxy.invalid:8080" }), false);
  const testEmulator = {
    projectId: "motofix-access-projection-emulator-test",
    _settings: { servicePath: "127.0.0.1", port: 8080, ssl: false },
  };
  assert.equal(isApprovedFirestoreEndpoint(
    testEmulator,
    { FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080" },
    "motofix-access-projection-emulator-test",
  ), true);
  assert.equal(isApprovedFirestoreEndpoint(
    testEmulator,
    { FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080" },
    "some-other-project",
  ), false);
  const missingSettings = Object.defineProperty({}, "projectId", {
    get: () => { throw new Error("project not resolved"); },
  });
  assert.equal(isApprovedFirestoreEndpoint(missingSettings), false);
});

test("operational Firestore adapter rejects missing authorization before constructing any document reference", () => {
  let collectionCalls = 0;
  const localClientStub = {
    projectId: "adapter-test-project",
    _settings: { host: "firestore.googleapis.com", port: 443, ssl: true },
    collection: () => {
      collectionCalls += 1;
      throw new Error("unexpected_collection_access");
    },
  } as unknown as Firestore;
  assert.throws(() => createAccessProjectionFirestoreAdapter(
    localClientStub,
    { getUser: async () => ({}) },
    "adapter-test-project",
    "dry-run",
    "test",
    null,
    undefined,
    {
      method: "explicit-service-account",
      principal: "unit-test@motofix.iam.gserviceaccount.com",
    },
    {},
  ), /operational_authorization_required/);
  assert.equal(collectionCalls, 0);
});

test("apply is idempotent and changes only accessProjection", async () => {
  const source = profile({ customUnknownField: { keep: true } });
  const fixture = adapterFor([{ uid: "active", profile: source }]);
  const first = await runAccessProjectionMigration(fixture.adapter, {
    mode: "apply",
    expectedProjectId: projectId,
    now,
    reportSalt: "fixed-test-salt",
    approvedReport: await approvedReportFor(fixture.adapter),
  });
  const approved = await approvedReportFor(fixture.adapter);
  const second = await runAccessProjectionMigration(fixture.adapter, {
    mode: "apply",
    expectedProjectId: projectId,
    now,
    reportSalt: "fixed-test-salt",
    approvedReport: approved,
  });
  assert.equal(first.totals.updated, 1);
  assert.equal(second.totals.proposedWrites, 0);
  assert.equal(second.totals.unchanged, 0);
  assert.equal(fixture.writes, 1);
  assert.deepEqual(fixture.store.get("active")?.customUnknownField, { keep: true });
  assert.equal(fixture.store.get("active")?.isActive, true);
});

test("apply accepts the same policy decision when only evaluatedAt differs", async () => {
  const fixture = adapterFor([{ uid: "active", profile: profile() }]);
  const approvedReport = await runAccessProjectionMigration(fixture.adapter, {
    mode: "dry-run",
    expectedProjectId: projectId,
    now,
    reportSalt: "fixed-test-salt",
  });
  const applyReport = await runAccessProjectionMigration(fixture.adapter, {
    mode: "apply",
    expectedProjectId: projectId,
    now: now + 10_000,
    reportSalt: "fixed-test-salt",
    approvedReport,
  });
  assert.equal(applyReport.totals.updated, 1);
  assert.equal(applyReport.totals.stale, 0);
  assert.equal(fixture.writes, 1);
});

test("projection evaluatedAt alone is excluded from approved state fingerprints", async () => {
  const staleProjection = {
    allowed: true,
    source: "manual",
    validUntil: future,
    evaluatedAt: past,
    policyVersion: "access-v1",
    reason: "manual_entitlement",
  };
  const fixture = adapterFor([{
    uid: "active",
    profile: profile({ accessProjection: staleProjection }),
  }]);
  const approvedReport = await runAccessProjectionMigration(fixture.adapter, {
    mode: "dry-run",
    expectedProjectId: projectId,
    now,
    reportSalt: "fixed-test-salt",
  });
  const existing = fixture.store.get("active")?.accessProjection as Record<string, unknown>;
  fixture.store.set("active", {
    ...fixture.store.get("active"),
    accessProjection: { ...existing, evaluatedAt: Timestamp.fromMillis(now + 10_000) },
  });
  const applyReport = await runAccessProjectionMigration(fixture.adapter, {
    mode: "apply",
    expectedProjectId: projectId,
    now: now + 10_000,
    reportSalt: "fixed-test-salt",
    approvedReport,
  });
  assert.equal(applyReport.totals.updated, 1);
  assert.equal(applyReport.totals.stale, 0);
  assert.equal(fixture.writes, 1);
});

test("apply marks relevant entitlement and account changes stale since dry-run", async () => {
  const fixture = adapterFor([{ uid: "active", profile: profile() }]);
  const approvedReport = await runAccessProjectionMigration(fixture.adapter, {
    mode: "dry-run",
    expectedProjectId: projectId,
    now,
    reportSalt: "fixed-test-salt",
  });
  fixture.store.set("active", profile({
    role: "admin",
    isActive: false,
    manualAccess: { enabled: true, expiresAt: future },
  }));
  const applyReport = await runAccessProjectionMigration(fixture.adapter, {
    mode: "apply",
    expectedProjectId: projectId,
    now: now + 10_000,
    reportSalt: "fixed-test-salt",
    approvedReport,
  });
  assert.equal(applyReport.totals.stale, 1);
  assert.equal(applyReport.totals.updated, 0);
  assert.equal(fixture.writes, 0);
});

test("role, active status, billing, subscription, and entitlement changes invalidate approval", async (context) => {
  const changedProfiles = [
    { role: "admin" },
    { isActive: false },
    { billing: { status: "active", currentPeriodEnd: future } },
    { subscription: { status: "active", currentPeriodEnd: future } },
    { manualAccess: { enabled: true, expiresAt: future } },
    { ownerAccess: { enabled: false, permanent: false } },
  ];
  for (const [index, change] of changedProfiles.entries()) {
    await context.test(`decision input ${index + 1}`, async () => {
      const fixture = adapterFor([{ uid: "candidate", profile: profile() }]);
      const approved = await approvedReportFor(fixture.adapter);
      fixture.store.set("candidate", profile(change));
      const applied = await runAccessProjectionMigration(fixture.adapter, {
        mode: "apply",
        expectedProjectId: projectId,
        now,
        reportSalt: "fixed-test-salt",
        approvedReport: approved,
      });
      assert.equal(applied.totals.stale, 1);
      assert.equal(fixture.writes, 0);
    });
  }
});

test("project validation failure occurs before the first profile read", async () => {
  const fixture = adapterFor([{ uid: "candidate", profile: profile() }]);
  let ownerReads = 0;
  let profileReads = 0;
  fixture.adapter.validateProject = async () => false;
  fixture.adapter.getOwnerUid = async () => {
    ownerReads += 1;
    return ownerUid;
  };
  const originalListProfiles = fixture.adapter.listProfiles;
  fixture.adapter.listProfiles = async function* () {
    profileReads += 1;
    yield* originalListProfiles();
  };
  await assert.rejects(runAccessProjectionMigration(fixture.adapter, {
    mode: "dry-run",
    expectedProjectId: projectId,
    now,
  }), /firebase_project_mismatch/);
  assert.equal(ownerReads, 0);
  assert.equal(profileReads, 0);
});

test("project mismatch immediately before a write fails closed", async () => {
  const fixture = adapterFor([{ uid: "candidate", profile: profile() }]);
  const approved = await approvedReportFor(fixture.adapter);
  let writeAttempts = 0;
  fixture.adapter.applyProjection = async () => {
    writeAttempts += 1;
    throw new Error("firebase_project_mismatch");
  };
  const report = await runAccessProjectionMigration(fixture.adapter, {
    mode: "apply",
    expectedProjectId: projectId,
    now,
    reportSalt: "fixed-test-salt",
    approvedReport: approved,
  });
  assert.equal(writeAttempts, 1);
  assert.equal(report.interrupted, true);
  assert.equal(fixture.writes, 0);
});

test("candidate claims lookup failure is skipped without applying a projection", async () => {
  const fixture = adapterFor([{ uid: "candidate", profile: profile() }]);
  const approved = await approvedReportFor(fixture.adapter);
  fixture.adapter.getClaims = async (uid) => {
    if (uid === "candidate") throw new Error("auth/timeout");
    return {
      admin: true,
      master_admin: true,
      isActive: true,
      motofix_owner: true,
    };
  };
  const report = await runAccessProjectionMigration(fixture.adapter, {
    mode: "apply",
    expectedProjectId: projectId,
    now,
    reportSalt: "fixed-test-salt",
    approvedReport: approved,
  });
  assert.equal(fixture.writes, 0);
  assert.equal(report.records.find((record) => record.ambiguities.includes("auth_claim_read_failed"))?.result, "skipped");
});

test("interrupted apply can be safely resumed by rerunning the idempotent scan", async () => {
  const fixture = adapterFor([
    { uid: "one", profile: profile() },
    { uid: "two", profile: profile() },
    { uid: "three", profile: profile() },
  ]);
  const preflight = await runAccessProjectionMigration(fixture.adapter, {
    mode: "dry-run",
    expectedProjectId: projectId,
    now,
    reportSalt: "fixed-test-salt",
  });
  assert.equal(preflight.totals.proposedWrites, 3);
  let shouldStop = false;
  const interrupted = await runAccessProjectionMigration(fixture.adapter, {
    mode: "apply",
    expectedProjectId: projectId,
    now,
    reportSalt: "fixed-test-salt",
    approvedReport: preflight,
    shouldStop: () => shouldStop,
    onRecord: (record) => {
      if (record.result === "updated") shouldStop = true;
    },
  });
  assert.equal(interrupted.interrupted, true);
  assert.equal(fixture.writes, 1);
  const resumed = await runAccessProjectionMigration(fixture.adapter, {
    mode: "apply",
    expectedProjectId: projectId,
    now,
    reportSalt: "fixed-test-salt",
    approvedReport: preflight,
  });
  assert.equal(resumed.totals.updated, 2);
  assert.equal(fixture.writes, 3);
});

test("ambiguous billing and owner identities are skipped rather than backfilled", async () => {
  const fixture = adapterFor([
    {
      uid: "billing-conflict",
      profile: profile({
        billing: { status: "active", currentPeriodEnd: future },
        subscription: { status: "canceled", currentPeriodEnd: future },
      }),
    },
    {
      uid: "wrong-owner",
      profile: profile({
        role: "master_admin",
        ownerAccess: { enabled: true, permanent: true },
      }),
    },
  ]);
  const report = await runAccessProjectionMigration(fixture.adapter, {
    mode: "dry-run",
    expectedProjectId: projectId,
    now,
  });
  assert.equal(fixture.writes, 0);
  assert.equal(report.totals.ambiguous, 3);
  assert.equal(report.totals.skipped, 3);
  assert.ok(report.records.some((record) => record.ambiguities.includes("billing_status_conflict")));
  assert.ok(report.records.some((record) => record.ambiguities.includes("owner_entitlement_uid_mismatch")));
});

test("missing owner config and multiple owner entitlements block all writes", async () => {
  const missingConfig = adapterFor([{ uid: "active", profile: profile() }], { owner: null });
  const missingReport = await runAccessProjectionMigration(missingConfig.adapter, {
    mode: "dry-run",
    expectedProjectId: projectId,
    now,
  });
  assert.equal(missingConfig.writes, 0);
  assert.equal(missingReport.totals.skipped, 1);

  const multipleOwners = adapterFor([
    { uid: ownerUid, profile: profile({ role: "master_admin", ownerAccess: { enabled: true, permanent: true } }) },
    { uid: "other-owner", profile: profile({ role: "master_admin", ownerAccess: { enabled: true, permanent: true } }) },
  ]);
  const multipleReport = await runAccessProjectionMigration(multipleOwners.adapter, {
    mode: "dry-run",
    expectedProjectId: projectId,
    now,
  });
  assert.equal(multipleOwners.writes, 0);
  assert.ok(multipleReport.records.some((record) => record.ambiguities.includes("multiple_permanent_owner_entitlements")));
});

test("owner preflight rejects missing, inactive, non-master, and non-permanent owner profiles", async () => {
  const invalidProfiles = [
    { uid: ownerUid, profile: { role: "master_admin", isActive: false, ownerAccess: { enabled: true, permanent: true } } },
    { uid: ownerUid, profile: { role: "user", isActive: true, ownerAccess: { enabled: true, permanent: true } } },
    { uid: ownerUid, profile: { role: "master_admin", isActive: true, ownerAccess: { enabled: true, permanent: false } } },
  ];
  for (const owner of invalidProfiles) {
    const fixture = adapterFor([{ uid: "candidate", profile: profile() }, owner]);
    const report = await runAccessProjectionMigration(fixture.adapter, {
      mode: "dry-run",
      expectedProjectId: projectId,
      now,
      reportSalt: "fixed-test-salt",
    });
    assert.equal(report.ownerPreflight, "blocked");
    assert.equal(report.ownerDiagnostics.length > 0, true);
  }
});

test("owner UID divergence or failed owner Auth verification blocks every write", async () => {
  const divergent = adapterFor([{ uid: "candidate", profile: profile() }], { owner: "rotated-owner" });
  const divergentReport = await runAccessProjectionMigration(divergent.adapter, {
    mode: "dry-run",
    expectedProjectId: projectId,
    now,
    reportSalt: "fixed-test-salt",
  });
  assert.equal(divergentReport.ownerPreflight, "blocked");

  const authFailure = adapterFor([{ uid: "candidate", profile: profile() }], { claimError: new Error("private auth message") });
  const authReport = await runAccessProjectionMigration(authFailure.adapter, {
    mode: "dry-run",
    expectedProjectId: projectId,
    now,
    reportSalt: "fixed-test-salt",
  });
  assert.ok(authReport.ownerDiagnostics.includes("owner_auth_claim_read_failed"));
  assert.equal(JSON.stringify(authReport).includes("private auth message"), false);
});

test("candidate Auth failures are ambiguous and block their write; a later retry recovers", async () => {
  const options: { failClaimsFor?: string[] } = { failClaimsFor: ["candidate"] };
  const fixture = adapterFor([{ uid: "candidate", profile: profile() }], options);
  const failedReport = await runAccessProjectionMigration(fixture.adapter, {
    mode: "dry-run",
    expectedProjectId: projectId,
    now,
    reportSalt: "fixed-test-salt",
  });

  test("Auth read timeout is an error, never interpreted as absent claims, and a retry can recover", async () => {
    let reads = 0;
    const auth = {
      getUser: async () => {
        reads += 1;
        if (reads === 1) return new Promise<{ customClaims?: Record<string, unknown> }>(() => {});
        return { customClaims: { isActive: true } };
      },
    };
    await assert.rejects(readAuthUserWithTimeout(auth, "candidate", 5), /auth\/timeout/);
    assert.deepEqual(await readAuthUserWithTimeout(auth, "candidate", 50), {
      customClaims: { isActive: true },
    });
  });
  const candidate = failedReport.records.find(({ profileRef }) => profileRef !== "global" && profileRef !== "");
  assert.ok(candidate?.ambiguities.includes("auth_claim_read_failed"));
  assert.equal(failedReport.ownerPreflight, "valid");
  options.failClaimsFor = [];
  const recoveredReport = await runAccessProjectionMigration(fixture.adapter, {
    mode: "dry-run",
    expectedProjectId: projectId,
    now,
    reportSalt: "fixed-test-salt",
  });
  assert.equal(recoveredReport.ownerPreflight, "valid");
  assert.equal(fixture.writes, 0);
});

test("expired and divergent projections are reported without trusting them", async () => {
  const fixture = adapterFor([
    { uid: "expired", profile: profile({
      manualAccess: { enabled: true, expiresAt: past },
      accessProjection: {
        allowed: true,
        source: "manual",
        validUntil: past,
        evaluatedAt: Timestamp.fromMillis(now - 120_000),
        policyVersion: "access-v1",
        reason: "manual_entitlement",
      },
    }) },
    { uid: "stripe-divergence", profile: profile({
      billing: { status: "active", currentPeriodEnd: new Date(future.toMillis()).toISOString() },
      accessProjection: {
        allowed: false,
        source: "none",
        validUntil: null,
        evaluatedAt: past,
        policyVersion: "access-v1",
        reason: "subscription_inactive",
      },
    }) },
  ]);
  const report = await runAccessProjectionMigration(fixture.adapter, {
    mode: "dry-run",
    expectedProjectId: projectId,
    now,
  });
  assert.equal(fixture.writes, 0);
  assert.equal(report.totals.projection.expired, 1);
  assert.equal(report.totals.projection.inconsistent, 1);
  assert.ok(report.records
    .filter((record) => record.classification.projection === "expired" || record.classification.projection === "inconsistent")
    .every((record) => record.divergences.includes("projection_policy_divergence")));
});

test("legacy expiry cannot grant access and unknown projection fields are never overwritten", async () => {
  const fixture = adapterFor([
    {
      uid: "legacy-only",
      profile: profile({ role: "master_admin", subscriptionExpiresAt: "2099-01-01T00:00:00.000Z" }),
    },
    {
      uid: "unknown-projection",
      profile: profile({
        accessProjection: {
          allowed: true,
          source: "manual",
          validUntil: future,
          policyVersion: "access-v1",
          reason: "manual_entitlement",
          futureUnknownField: "must-preserve",
        },
      }),
    },
  ]);
  const report = await runAccessProjectionMigration(fixture.adapter, {
    mode: "apply",
    expectedProjectId: projectId,
    now,
    reportSalt: "fixed-test-salt",
    approvedReport: await approvedReportFor(fixture.adapter),
  });
  assert.equal(
    (fixture.store.get("legacy-only")?.accessProjection as { allowed: boolean }).allowed,
    false,
  );
  assert.equal(report.records.find((record) => record.profileRef !== "global" && record.proposedAction === "write_projection")?.classification.allowedByPolicy, false);
  assert.equal(fixture.store.get("unknown-projection")?.accessProjection && (fixture.store.get("unknown-projection")?.accessProjection as Record<string, unknown>).futureUnknownField, "must-preserve");
  assert.ok(report.records.some((record) => record.ambiguities.includes("unknown_projection_fields")));
});

test("project mismatch is rejected before scanning or writing", async () => {
  const fixture = adapterFor([{ uid: "active", profile: profile() }]);
  await assert.rejects(runAccessProjectionMigration(fixture.adapter, {
    mode: "apply",
    expectedProjectId: "wrong-project",
  }), /firebase_project_mismatch/);
  assert.equal(fixture.writes, 0);
});

test("approved report is bound to completion, hash, project, and current policy", async () => {
  const fixture = adapterFor([{ uid: "candidate", profile: profile() }]);
  const report = await approvedReportFor(fixture.adapter);
  const serializedReport = JSON.parse(JSON.stringify(report)) as ProjectionMigrationReport;
  assert.equal(approvedReportValidationError(
    serializedReport,
    serializedReport.reportHash,
    projectId,
  ), null);
  assert.equal(verifyApprovedReport(report, report.reportHash, projectId), true);
  assert.equal(approvedReportValidationError(report, report.reportHash, projectId), null);
  assert.equal(verifyApprovedReport(report, report.reportHash, "different-project"), false);
  assert.equal(verifyApprovedReport(report, "incorrect-hash", projectId), false);
  assert.equal(verifyApprovedReport({ ...report, policyVersion: "access-v2" }, report.reportHash, projectId), false);
  assert.equal(verifyApprovedReport({ ...report, totals: { ...report.totals, analyzed: 999 } }, report.reportHash, projectId), false);
  const interruptedReport = { ...report, interrupted: true, reportHash: "" };
  interruptedReport.reportHash = canonicalReportHash(interruptedReport);
  assert.equal(verifyApprovedReport(interruptedReport, interruptedReport.reportHash, projectId), false);
  await assert.rejects(runAccessProjectionMigration(fixture.adapter, {
    mode: "apply",
    expectedProjectId: projectId,
    now,
    reportSalt: "fixed-test-salt",
    approvedReport: interruptedReport,
  }), /approved_dry_run_required/);
  assert.equal(fixture.writes, 0);
});

test("approval rejects malformed reports, duplicate records, inconsistent totals, and altered hashes", async () => {
  const fixture = adapterFor([{ uid: "candidate", profile: profile() }]);
  const valid = await approvedReportFor(fixture.adapter);
  const rehash = (report: ProjectionMigrationReport) => {
    report.reportHash = canonicalReportHash(report);
    return report;
  };
  const copy = () => JSON.parse(JSON.stringify(valid)) as ProjectionMigrationReport;

  const missingField = copy();
  delete (missingField.totals as unknown as Record<string, unknown>).failed;
  rehash(missingField);
  assert.equal(approvedReportValidationError(missingField, missingField.reportHash, projectId), "report_structure_invalid");

  const invalidType = copy();
  (invalidType.records[0] as unknown as Record<string, unknown>).projectionBeforeExisted = "false";
  rehash(invalidType);
  assert.equal(approvedReportValidationError(invalidType, invalidType.reportHash, projectId), "report_structure_invalid");

  const inconsistentTotals = copy();
  inconsistentTotals.totals.analyzed += 1;
  rehash(inconsistentTotals);
  assert.equal(approvedReportValidationError(inconsistentTotals, inconsistentTotals.reportHash, projectId), "report_totals_inconsistent");

  const duplicateRecord = copy();
  duplicateRecord.records.push({ ...duplicateRecord.records[0] });
  duplicateRecord.totals.analyzed += 1;
  rehash(duplicateRecord);
  assert.equal(approvedReportValidationError(duplicateRecord, duplicateRecord.reportHash, projectId), "report_structure_invalid");

  const badHash = copy();
  assert.equal(approvedReportValidationError(badHash, "0".repeat(64), projectId), "report_hash_mismatch");

  const wrongProject = copy();
  wrongProject.projectId = "other-project";
  rehash(wrongProject);
  assert.equal(approvedReportValidationError(wrongProject, wrongProject.reportHash, projectId), "report_project_mismatch");

  const wrongPolicy = copy();
  wrongPolicy.policyVersion = "access-v2";
  rehash(wrongPolicy);
  assert.equal(approvedReportValidationError(wrongPolicy, wrongPolicy.reportHash, projectId), "report_policy_mismatch");

  const interrupted = copy();
  interrupted.interrupted = true;
  rehash(interrupted);
  assert.equal(approvedReportValidationError(interrupted, interrupted.reportHash, projectId), "report_interrupted");

  const missingOwnerRecord = copy();
  missingOwnerRecord.records = missingOwnerRecord.records.filter((record) => (
    record.classification.entitlement !== "owner"
  ));
  rehash(missingOwnerRecord);
  assert.equal(approvedReportValidationError(
    missingOwnerRecord,
    missingOwnerRecord.reportHash,
    projectId,
  ), "report_owner_preflight_blocked");

  const inconsistentOwner = copy();
  const ownerRecord = inconsistentOwner.records.find((record) => record.classification.entitlement === "owner");
  assert.ok(ownerRecord);
  ownerRecord.classification.entitlementsPresent.ownerAccess = false;
  rehash(inconsistentOwner);
  assert.equal(approvedReportValidationError(
    inconsistentOwner,
    inconsistentOwner.reportHash,
    projectId,
  ), "report_owner_preflight_blocked");
  assert.equal(approvedReportValidationError(valid, valid.reportHash, projectId), null);
});

test("apply requires an approved dry-run and owner revalidation before any write", async () => {
  const fixture = adapterFor([{ uid: "candidate", profile: profile() }]);
  await assert.rejects(runAccessProjectionMigration(fixture.adapter, {
    mode: "apply",
    expectedProjectId: projectId,
    reportSalt: "fixed-test-salt",
  }), /approved_dry_run_required/);
  assert.equal(fixture.writes, 0);
});

test("write revalidation rejects changed profile and owner identity", () => {
  const validProfile = profile({
    billing: { status: "active", currentPeriodEnd: new Date(future.toMillis()).toISOString() },
  });
  const expected = calculateApplicationAccess(validProfile, now, "tenant-user", ownerUid);
  assert.equal(revalidateProjection(validProfile, "tenant-user", ownerUid, expected, now).result, "updated");
  assert.equal(ownerIdentityMatches(ownerUid, "rotated-owner"), false);
  assert.equal(revalidateProjection({
    ...validProfile,
    billing: { status: "canceled", currentPeriodEnd: new Date(future.toMillis()).toISOString() },
  }, "tenant-user", ownerUid, expected, now).result, "stale");
});

test("operational authorization verifies a scoped Ed25519 signature and fails closed without a trust anchor", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const now = Date.parse("2026-10-01T00:00:00.000Z");
  const payload = {
    schemaVersion: 1 as const,
    projectId,
    targetEnvironment: "isolated-test",
    operation: "apply" as const,
    credentialPrincipal: "test-operator@example.invalid",
    reportHash: "a".repeat(64),
    issuedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 10 * 60 * 1000).toISOString(),
    authorizationId: "authorization-id-0001",
  };
  const document = {
    ...payload,
    signature: sign(
      null,
      Buffer.from(canonicalizeOperationalAuthorizationPayload(payload)),
      privateKey,
    ).toString("base64"),
  };
  const expected = {
    projectId,
    targetEnvironment: "isolated-test",
    operation: "apply" as const,
    reportHash: payload.reportHash,
    credentialPrincipal: payload.credentialPrincipal,
  };
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  assert.equal(verifyOperationalAuthorizationSignature(document, publicKeyPem, expected, now), true);
  assert.equal(verifyOperationalAuthorizationSignature(document, publicKeyPem, {
    ...expected,
    credentialPrincipal: "different@project.iam.gserviceaccount.com",
  }, now), false);
  assert.equal(verifyOperationalAuthorizationSignature(document, publicKeyPem, {
    ...expected,
    targetEnvironment: "production",
  }, now), false);
  assert.equal(verifyOperationalAuthorizationSignature(document, publicKeyPem, {
    ...expected,
    operation: "dry-run",
  }, now), false);
  assert.equal(verifyOperationalAuthorizationSignature(document, publicKeyPem, expected, now + 11 * 60 * 1000), false);
  assert.equal(verifyOperationalAuthorizationSignature({
    ...document,
    credentialPrincipal: "substituted-principal@example.invalid",
  }, publicKeyPem, expected, now), false);
  assert.equal(verifyOperationalAuthorizationSignature({
    ...document,
    signature: `${document.signature.slice(0, -4)}AAAA`,
  }, publicKeyPem, expected, now), false);
  assert.throws(
    () => verifyTrustedOperationalAuthorization(document, expected, now),
    /operational_authorization_trust_anchor_not_configured/,
  );
});

test("only explicit service-account credentials expose a supported local principal", () => {
  const serviceAccount = {
    type: "service_account",
    client_email: "migration@motofix.iam.gserviceaccount.com",
    private_key: "test-only-nonsecret-placeholder",
  };
  const identity = explicitServiceAccountIdentity(serviceAccount);
  assert.deepEqual(identity, {
    method: "explicit-service-account",
    principal: serviceAccount.client_email,
  });
  assert.equal(explicitServiceAccountIdentity(null), null);
  assert.equal(explicitServiceAccountIdentity({ type: "authorized_user" }), null);
  assert.equal(explicitServiceAccountIdentity({
    ...serviceAccount,
    client_email: undefined,
  }), null);
  assert.throws(() => assertSupportedFirebaseCredentialIdentity(null), /firebase_credential_identity_unverified/);

  const authorizedPrincipal = identity?.principal;
  const changedCredential = explicitServiceAccountIdentity({
    ...serviceAccount,
    client_email: "other@motofix.iam.gserviceaccount.com",
  });
  assert.notEqual(changedCredential?.principal, authorizedPrincipal);
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const payload = {
    schemaVersion: 1 as const,
    projectId,
    targetEnvironment: "isolated-test",
    operation: "apply" as const,
    credentialPrincipal: authorizedPrincipal ?? "",
    reportHash: "a".repeat(64),
    issuedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 10 * 60 * 1000).toISOString(),
    authorizationId: "authorization-id-config-change-001",
  };
  const signed = {
    ...payload,
    signature: sign(
      null,
      Buffer.from(canonicalizeOperationalAuthorizationPayload(payload)),
      privateKey,
    ).toString("base64"),
  };
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  assert.equal(verifyOperationalAuthorizationSignature(
    signed,
    publicKeyPem,
    {
      projectId,
      targetEnvironment: "isolated-test",
      operation: "apply",
      reportHash: "a".repeat(64),
      credentialPrincipal: changedCredential?.principal ?? "",
    },
    now,
  ), false);
  assert.equal(verifyOperationalAuthorizationSignature(
    signed,
    publicKeyPem,
    {
      projectId,
      targetEnvironment: "isolated-test",
      operation: "apply",
      reportHash: "a".repeat(64),
      credentialPrincipal: identity?.principal ?? "",
    },
    now,
  ), true);
});

test("one-time replay reservation rejects concurrent reuse and retry after partial failure", async () => {
  const consumed = new Set<string>();
  const requestedScopes: AuthorizationReplayScope[] = [];
  const registry: OperationalAuthorizationReplayRegistry = {
    async reserve(scope) {
      requestedScopes.push(scope);
      const { authorizationId } = scope;
      if (consumed.has(authorizationId)) return "already_reserved";
      consumed.add(authorizationId);
      return "reserved";
    },
  };
  const authorizationId = "authorization-id-concurrent-001";
  const authorization = {
    schemaVersion: 1 as const,
    authorizationId,
    projectId,
    targetEnvironment: "isolated-test",
    operation: "apply" as const,
    credentialPrincipal: "migration@motofix.iam.gserviceaccount.com",
    reportHash: "a".repeat(64),
    issuedAt: new Date(Date.now() - 1_000).toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
  const concurrentResults = await Promise.allSettled([
    reserveOperationalAuthorizationOnce(registry, authorization),
    reserveOperationalAuthorizationOnce(registry, authorization),
  ]);
  assert.equal(concurrentResults.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(concurrentResults.filter((result) => result.status === "rejected").length, 1);
  assert.deepEqual(requestedScopes[0], {
    authorizationId,
    projectId,
    targetEnvironment: "isolated-test",
    operation: "apply",
    credentialPrincipal: "migration@motofix.iam.gserviceaccount.com",
    reportHash: "a".repeat(64),
    issuedAt: authorization.issuedAt,
    expiresAt: authorization.expiresAt,
  });
  const execution = concurrentResults.find(
    (result): result is PromiseFulfilledResult<object> => result.status === "fulfilled",
  )?.value;
  assert.ok(execution);
  const assertExecution = claimOperationalAuthorizationExecution(execution, authorization);
  assert.doesNotThrow(assertExecution);
  await assert.rejects(
    reserveOperationalAuthorizationOnce(registry, {
      ...authorization,
      credentialPrincipal: "different@motofix.iam.gserviceaccount.com",
    }),
    /operational_authorization_scope_mismatch/,
  );
  assert.throws(
    () => claimOperationalAuthorizationExecution(execution, authorization),
    /operational_authorization_replay_registry_not_configured/,
  );

  const partialFailureId = "authorization-id-partial-failure-001";
  const partialAuthorization = {
    ...authorization,
    authorizationId: partialFailureId,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
  const failAfterConsumption = async () => {
    await reserveOperationalAuthorizationOnce(registry, partialAuthorization);
    throw new Error("simulated_partial_apply_failure");
  };
  await assert.rejects(failAfterConsumption(), /simulated_partial_apply_failure/);
  await assert.rejects(
    failAfterConsumption(),
    /operational_authorization_replayed/,
  );
});

test("failed replay storage reservation is burned locally and cannot be retried", async () => {
  const authorization = {
    schemaVersion: 1 as const,
    authorizationId: "authorization-id-registry-error-01",
    projectId,
    targetEnvironment: "isolated-test",
    operation: "dry-run" as const,
    credentialPrincipal: "migration@motofix.iam.gserviceaccount.com",
    reportHash: null,
    issuedAt: new Date(Date.now() - 1_000).toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
  const unavailableRegistry: OperationalAuthorizationReplayRegistry = {
    async reserve() {
      throw new Error("simulated_registry_unavailable");
    },
  };
  await assert.rejects(
    reserveOperationalAuthorizationOnce(unavailableRegistry, authorization),
    /simulated_registry_unavailable/,
  );
  await assert.rejects(
    reserveOperationalAuthorizationOnce(unavailableRegistry, authorization),
    /operational_authorization_replayed/,
  );
});

test("authorization execution rejects a new operation after expiration", async () => {
  const authorization = {
    schemaVersion: 1 as const,
    authorizationId: "authorization-id-expiry-0001",
    projectId,
    targetEnvironment: "isolated-test",
    operation: "dry-run" as const,
    credentialPrincipal: "migration@motofix.iam.gserviceaccount.com",
    reportHash: null,
    issuedAt: new Date(Date.now() - 60_000).toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
  const registry: OperationalAuthorizationReplayRegistry = {
    async reserve() {
      return "reserved";
    },
  };
  const execution = await reserveOperationalAuthorizationOnce(registry, authorization);
  const assertExecution = claimOperationalAuthorizationExecution(execution, authorization);
  assert.throws(
    () => assertExecution(Date.parse(authorization.expiresAt) + 1),
    /operational_authorization_expired/,
  );
});

test("replay provider remains absent rather than falling back to process-local storage", async () => {
  const { getOperationalAuthorizationReplayRegistry } = await import("./access-projection-replay-registry");
  assert.equal(getOperationalAuthorizationReplayRegistry(), null);
});
