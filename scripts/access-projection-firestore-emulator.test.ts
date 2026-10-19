import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, before, test } from "node:test";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore";
import {
  createAccessProjectionFirestoreAdapter,
} from "./access-projection-firestore-adapter";
import { calculateApplicationAccess } from "../server/accountAccess";
import { projectionInputFingerprint } from "./access-projection-backfill";
import { MOTOFIX_OWNER_UID } from "../server/ownerIdentity";
import {
  OWNER_IDENTITY_COLLECTION,
  OWNER_IDENTITY_DOCUMENT,
} from "../server/ownerIdentity";

const projectId = "motofix-access-projection-emulator-test";
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
const isLocalEmulator = !!emulatorHost && /^(localhost|127\.0\.0\.1):\d+$/.test(emulatorHost);
let db: Firestore;
let app: ReturnType<typeof initializeApp>;
const createdProfiles: string[] = [];

before(() => {
  if (!isLocalEmulator) return;
  app = initializeApp({ projectId }, `access-projection-test-${randomBytes(6).toString("hex")}`);
  db = getFirestore(app);
});

after(async () => {
  if (db && app) {
    await Promise.all(createdProfiles.map((uid) => db.collection("users").doc(uid).delete()));
    await db.collection(OWNER_IDENTITY_COLLECTION).doc(OWNER_IDENTITY_DOCUMENT).delete();
    await deleteApp(app);
  }
});

const makeFixture = async () => {
  const suffix = randomBytes(8).toString("hex");
  const ownerUid = MOTOFIX_OWNER_UID;
  const candidateUid = `candidate-${suffix}`;
  let authReads = 0;
  createdProfiles.push(ownerUid, candidateUid);
  await db.collection(OWNER_IDENTITY_COLLECTION).doc(OWNER_IDENTITY_DOCUMENT).set({ ownerUid });
  await db.collection("users").doc(ownerUid).set({
    uid: ownerUid,
    role: "master_admin",
    isActive: true,
    ownerAccess: { enabled: true, permanent: true },
  });
  await db.collection("users").doc(candidateUid).set({
    uid: candidateUid,
    role: "user",
    isActive: true,
    updatedAt: Timestamp.fromMillis(1_790_000_000_000),
    migrationScopeMarker: "preserve",
  });

  const adapter = createAccessProjectionFirestoreAdapter(db, {
    getUser: async (uid) => {
      authReads += 1;
      const snapshot = await db.collection("users").doc(uid).get();
      if (!snapshot.exists) throw Object.assign(new Error("not found"), { code: "auth/user-not-found" });
      const profile = snapshot.data() ?? {};
      const ownerAccess = profile.ownerAccess as Record<string, unknown> | undefined;
      const isOwner = uid === ownerUid
        && profile.isActive === true
        && profile.role === "master_admin"
        && ownerAccess?.enabled === true
        && ownerAccess.permanent === true;
      return {
        customClaims: {
          admin: profile.isActive === true && (profile.role === "admin" || profile.role === "master_admin"),
          master_admin: profile.isActive === true && profile.role === "master_admin",
          isActive: profile.isActive === true,
          motofix_owner: isOwner,
        },
      };
    },
  }, projectId);
  return { adapter, ownerUid, candidateUid, get authReads() { return authReads; } };
};

test("Firestore Emulator transaction writes only a policy-revalidated projection", {
  skip: !isLocalEmulator,
}, async () => {
  const { adapter, ownerUid, candidateUid } = await makeFixture();
  const candidate = {
    uid: candidateUid,
    role: "user",
    isActive: true,
    updatedAt: Timestamp.fromMillis(1_790_000_000_000),
    migrationScopeMarker: "preserve",
  };
  const expected = calculateApplicationAccess(candidate, Date.now(), candidateUid, ownerUid);

  assert.equal(await adapter.validateOwner(ownerUid), true);
  assert.equal(await adapter.applyProjection(
    candidateUid,
    expected,
    ownerUid,
    projectionInputFingerprint(candidate),
  ), "updated");
  const saved = await db.collection("users").doc(candidateUid).get();
  assert.equal(saved.get("accessProjection.allowed"), false);
  assert.equal(saved.get("accessProjection.source"), "none");
  assert.equal(saved.get("accessProjection.validUntil"), null);
  assert.equal(saved.get("accessProjection.policyVersion"), expected.policyVersion);
  assert.equal(saved.get("accessProjection.reason"), expected.reason);
  assert.ok(saved.get("accessProjection.evaluatedAt"));
  assert.equal(saved.get("updatedAt").toMillis(), 1_790_000_000_000);
  assert.equal(saved.get("migrationScopeMarker"), "preserve");
  assert.deepEqual(Object.keys(saved.data() ?? {}).sort(), [
    "accessProjection",
    "isActive",
    "migrationScopeMarker",
    "role",
    "uid",
    "updatedAt",
  ]);
});

test("Firestore Emulator transaction skips a profile changed after analysis", {
  skip: !isLocalEmulator,
}, async () => {
  const { adapter, ownerUid, candidateUid } = await makeFixture();
  const candidate = {
    uid: candidateUid,
    role: "user",
    isActive: true,
    updatedAt: Timestamp.fromMillis(1_790_000_000_000),
    migrationScopeMarker: "preserve",
  };
  const expected = calculateApplicationAccess(candidate, Date.now(), candidateUid, ownerUid);
  await db.collection("users").doc(candidateUid).update({ isActive: false });

  assert.equal(await adapter.applyProjection(
    candidateUid,
    expected,
    ownerUid,
    projectionInputFingerprint(candidate),
  ), "stale");
  assert.equal((await db.collection("users").doc(candidateUid).get()).get("accessProjection"), undefined);
});

test("Firestore Emulator endpoint mismatch fails before Auth lookup or profile write", {
  skip: !isLocalEmulator,
}, async () => {
  const fixture = await makeFixture();
  const { adapter, ownerUid, candidateUid } = fixture;
  const candidate = {
    uid: candidateUid,
    role: "user",
    isActive: true,
    updatedAt: Timestamp.fromMillis(1_790_000_000_000),
    migrationScopeMarker: "preserve",
  };
  const expected = calculateApplicationAccess(candidate, Date.now(), candidateUid, ownerUid);
  const originalHost = process.env.FIRESTORE_EMULATOR_HOST;
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8081";
  try {
    await assert.rejects(adapter.applyProjection(
      candidateUid,
      expected,
      ownerUid,
      projectionInputFingerprint(candidate),
    ), /firestore_endpoint_not_approved/);
  } finally {
    if (originalHost === undefined) delete process.env.FIRESTORE_EMULATOR_HOST;
    else process.env.FIRESTORE_EMULATOR_HOST = originalHost;
  }
  assert.equal(fixture.authReads, 0);
  assert.equal((await db.collection("users").doc(candidateUid).get()).get("accessProjection"), undefined);
});

test("Firestore Emulator owner rotation blocks projection writes", {
  skip: !isLocalEmulator,
}, async () => {
  const { adapter, ownerUid, candidateUid } = await makeFixture();
  const candidate = { role: "user", isActive: true };
  const expected = calculateApplicationAccess(candidate, Date.now(), candidateUid, ownerUid);
  await db.collection(OWNER_IDENTITY_COLLECTION).doc(OWNER_IDENTITY_DOCUMENT).update({ ownerUid: "rotated-owner" });
  assert.equal(await adapter.applyProjection(
    candidateUid,
    expected,
    ownerUid,
    projectionInputFingerprint(candidate),
  ), "owner_identity_changed");
  assert.equal((await db.collection("users").doc(candidateUid).get()).get("accessProjection"), undefined);
});
