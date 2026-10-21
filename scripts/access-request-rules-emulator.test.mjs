import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";

const projectId = "motofix-access-request-rules-test";
const adminUid = "authorized-master-admin";
const pendingUid = "pending-user";
const permanentOwnerUid = "o5XNtNFwKMQzZj28WfTEiGSFN0A3";
const rules = fs.readFileSync(path.resolve("firestore.rules"), "utf8");
let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: { rules },
  });
});

after(async () => {
  await testEnv?.cleanup();
});

const profile = (uid, overrides = {}) => ({
  uid,
  email: `${uid}@example.test`,
  displayName: uid,
  role: "user",
  isActive: false,
  subscription: {
    status: "inactive",
    plan: "free",
    autoRenew: false,
  },
  ...overrides,
});

const pendingRequest = (uid, overrides = {}) => ({
  uid,
  email: `${uid}@example.test`,
  displayName: uid,
  status: "pending",
  createdAt: Timestamp.fromMillis(Date.now()),
  ...overrides,
});

const seed = async (documents = []) => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "users", adminUid), profile(adminUid, {
      role: "master_admin",
      isActive: true,
    }));
    for (const [collectionName, id, data] of documents) {
      await setDoc(doc(db, collectionName, id), data);
    }
  });
};

const masterAdminDb = () => testEnv.authenticatedContext(adminUid, {
  master_admin: true,
}).firestore();

const expectPermissionDenied = async (operation) => {
  await assert.rejects(operation, (error) => error?.code === "permission-denied");
};

const signupAs = (uid) => testEnv.authenticatedContext(uid, {
  email: `${uid}@example.test`,
}).firestore();

const createSignupBatch = (db, uid, requestOverrides = {}, profileOverrides = {}) => {
  const account = profile(uid, profileOverrides);
  const request = {
    uid,
    email: account.email,
    displayName: account.displayName,
    status: "pending",
    createdAt: serverTimestamp(),
    ...requestOverrides,
  };
  const batch = writeBatch(db);
  batch.set(doc(db, "users", uid), account);
  batch.set(doc(db, "access_requests", uid), request);
  return batch;
};

const approvedProfileChanges = (expiresAt) => ({
  isActive: true,
  manualAccess: { enabled: true, expiresAt },
  accessProjection: {
    allowed: true,
    source: "manual",
    validUntil: expiresAt,
    evaluatedAt: serverTimestamp(),
    policyVersion: "access-v1",
    reason: "manual_entitlement",
  },
  updatedAt: serverTimestamp(),
});

const blockedProfileChanges = () => ({
  isActive: false,
  manualAccess: { enabled: false, expiresAt: null },
  accessProjection: {
    allowed: false,
    source: "none",
    validUntil: null,
    evaluatedAt: serverTimestamp(),
    policyVersion: "access-v1",
    reason: "account_inactive",
  },
  updatedAt: serverTimestamp(),
});

const createDecisionBatch = (db, {
  uid = pendingUid,
  fromStatus = "pending",
  toStatus,
  beforeProfile,
  afterProfile,
  action,
}) => {
  const auditId = randomUUID();
  const expiryOf = (value) => value?.manualAccess?.expiresAt ?? null;
  const afterExpiry = expiryOf(afterProfile);
  const plan = "manual";
  const amount = toStatus === "approved" ? 100 : 0;
  const paymentMethod = toStatus === "approved" ? "pix" : "none";
  const paymentConfirmed = toStatus === "approved";
  const reason = "Acesso administrado manualmente";
  const batch = writeBatch(db);
  batch.update(doc(db, "access_requests", uid), {
    status: toStatus,
    lastAuditId: auditId,
    manualAccessExpiresAt: afterExpiry,
    accessDetails: { plan, amount, paymentMethod, paymentConfirmed, reason },
  });
  batch.update(doc(db, "users", uid), afterProfile);
  batch.set(doc(db, "access_decisions", auditId), {
    actor: adminUid,
    targetUid: uid,
    action,
    fromStatus,
    toStatus,
    before: {
      isActive: beforeProfile.isActive,
      manualAccessEnabled: beforeProfile.manualAccess?.enabled === true,
      manualAccessExpiresAt: expiryOf(beforeProfile),
    },
    after: {
      isActive: afterProfile.isActive,
      manualAccessEnabled: afterProfile.manualAccess?.enabled === true,
      manualAccessExpiresAt: expiryOf(afterProfile),
    },
    details: { plan, amount, paymentMethod, paymentConfirmed, reason },
    manualAccessExpiresAt: afterExpiry,
    createdAt: serverTimestamp(),
  });
  return { auditId, batch };
};

test("new signup atomically creates an inactive profile and a minimal pending request", async () => {
  await seed();
  const db = signupAs("signup-user");
  await createSignupBatch(db, "signup-user").commit();

  const adminDb = masterAdminDb();
  const requestSnapshot = (await getDocs(query(
    collection(adminDb, "access_requests"),
    where("status", "==", "pending"),
  ))).docs[0];
  assert.equal(requestSnapshot.data().status, "pending");
  assert.equal(requestSnapshot.data().email, "signup-user@example.test");
  assert.deepEqual(Object.keys(requestSnapshot.data()).sort(), [
    "createdAt",
    "displayName",
    "email",
    "status",
    "uid",
  ]);
});

test("signup fails unless the profile and pending request are created in one operation", async () => {
  await seed();
  const db = signupAs("unpaired-user");
  await expectPermissionDenied(setDoc(doc(db, "users", "unpaired-user"), profile("unpaired-user")));
  await expectPermissionDenied(setDoc(doc(db, "access_requests", "unpaired-user"), {
    ...pendingRequest("unpaired-user"),
    createdAt: serverTimestamp(),
  }));
});

test("a requester cannot self-approve or create an audit record", async () => {
  await seed();
  const uid = "self-approver";
  const db = testEnv.authenticatedContext(uid, {
    email: `${uid}@example.test`,
    master_admin: true,
  }).firestore();

  await expectPermissionDenied(createSignupBatch(db, uid, { status: "approved" }).commit());
  await expectPermissionDenied(setDoc(doc(db, "access_decisions", "forged"), {
    actor: uid,
    targetUid: uid,
    action: "approved",
    fromStatus: "pending",
    toStatus: "approved",
    createdAt: serverTimestamp(),
  }));
});

test("an active Master Admin cannot approve or change their own access request", async () => {
  await seed([
    ["access_requests", adminUid, pendingRequest(adminUid)],
  ]);
  const db = masterAdminDb();
  const before = profile(adminUid, {
    role: "master_admin",
    isActive: true,
  });
  const expiresAt = Timestamp.fromMillis(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await expectPermissionDenied(createDecisionBatch(db, {
    uid: adminUid,
    toStatus: "approved",
    beforeProfile: before,
    afterProfile: { ...before, ...approvedProfileChanges(expiresAt) },
    action: "approved",
  }).batch.commit());
});

test("designated owner with a permanent profile entitlement can use own data without projection or owner claims", async () => {
  await seed([
    ["users", permanentOwnerUid, profile(permanentOwnerUid, {
      role: "master_admin",
      isActive: true,
      ownerAccess: { enabled: true, permanent: true },
      billing: { status: "canceled" },
    })],
    [`users/${permanentOwnerUid}/clients`, "private-client", { name: "owner data" }],
  ]);
  const ownerDb = testEnv.authenticatedContext(permanentOwnerUid).firestore();

  const client = await getDoc(doc(ownerDb, "users", permanentOwnerUid, "clients", "private-client"));
  assert.equal(client.exists(), true);
  await expectPermissionDenied(updateDoc(doc(ownerDb, "users", permanentOwnerUid), {
    isActive: false,
  }));
  await expectPermissionDenied(updateDoc(doc(ownerDb, "users", permanentOwnerUid), {
    role: "user",
  }));
  await expectPermissionDenied(updateDoc(doc(ownerDb, "users", permanentOwnerUid), {
    ownerAccess: { enabled: false, permanent: false },
  }));
});

test("another active Master Admin cannot use permanent owner entitlement fields as an access grant", async () => {
  const otherMasterUid = "different-master-admin";
  await seed([
    ["users", otherMasterUid, profile(otherMasterUid, {
      role: "master_admin",
      isActive: true,
      ownerAccess: { enabled: true, permanent: true },
    })],
    [`users/${otherMasterUid}/clients`, "private-client", { name: "private data" }],
  ]);
  const otherMasterDb = testEnv.authenticatedContext(otherMasterUid, {
    master_admin: true,
  }).firestore();

  await expectPermissionDenied(getDoc(doc(otherMasterDb, "users", otherMasterUid, "clients", "private-client")));
});

test("Master Admin can list requests and read one profile but cannot list user profiles", async () => {
  await seed([
    ["access_requests", "pending-user", pendingRequest("pending-user")],
    ["users", "pending-user", profile("pending-user")],
  ]);
  const db = masterAdminDb();

  const pending = await getDocs(query(
    collection(db, "access_requests"),
    where("status", "==", "pending"),
  ));
  assert.equal(pending.size, 1);
  assert.equal(pending.docs[0].id, "pending-user");
  assert.equal((await getDocs(collection(db, "access_requests"))).size, 1);
  const profileSnapshot = await getDoc(doc(db, "users", "pending-user"));
  assert.equal(profileSnapshot.exists(), true);
  assert.equal(profileSnapshot.data().role, "user");
  await expectPermissionDenied(getDocs(collection(db, "users")));
  await expectPermissionDenied(getDoc(doc(signupAs("regular-reader"), "users", "pending-user")));
  await expectPermissionDenied(getDoc(doc(db, "users", "pending-user", "clients", "private")));
});

test("Master Admin claim without an active matching profile cannot inspect requests", async () => {
  await seed([
    ["users", "inactive-admin", profile("inactive-admin", {
      role: "master_admin",
      isActive: false,
    })],
    ["access_requests", "pending-user", pendingRequest("pending-user")],
  ]);
  const db = testEnv.authenticatedContext("inactive-admin", {
    master_admin: true,
  }).firestore();
  await expectPermissionDenied(getDocs(query(
    collection(db, "access_requests"),
    where("status", "==", "pending"),
  )));

  const roleOnlyDb = testEnv.authenticatedContext("role-only-admin").firestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "users", "role-only-admin"), profile("role-only-admin", {
      role: "master_admin",
      isActive: true,
    }));
  });
  await expectPermissionDenied(getDocs(query(
    collection(roleOnlyDb, "access_requests"),
    where("status", "==", "pending"),
  )));
});

test("approval atomically updates the request, finite manual entitlement, projection, and immutable audit", async () => {
  const uid = "approve-target";
  const before = profile(uid);
  await seed([
    ["access_requests", uid, pendingRequest(uid)],
    ["users", uid, before],
  ]);
  const db = masterAdminDb();
  const expiresAt = Timestamp.fromMillis(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const decision = createDecisionBatch(db, {
    uid,
    toStatus: "approved",
    beforeProfile: before,
    afterProfile: { ...before, ...approvedProfileChanges(expiresAt) },
    action: "approved",
  });
  await decision.batch.commit();

  let savedProfile;
  await testEnv.withSecurityRulesDisabled(async (context) => {
    savedProfile = (await getDoc(doc(context.firestore(), "users", uid))).data();
    assert.equal((await getDoc(doc(context.firestore(), "access_decisions", decision.auditId))).exists(), true);
  });
  assert.equal(savedProfile.role, "user");
  assert.equal(savedProfile.isActive, true);
  assert.equal(savedProfile.manualAccess.enabled, true);
  assert.equal(savedProfile.accessProjection.source, "manual");
  assert.equal(savedProfile.subscription.status, "inactive");
  assert.equal((await getDoc(doc(db, "access_decisions", decision.auditId))).exists(), true);
});

test("blocking and releasing are audited and require profile updates in the same atomic batch", async () => {
  const uid = "block-release-target";
  const expiry = Timestamp.fromMillis(Date.now() + 5 * 24 * 60 * 60 * 1000);
  const approved = {
    ...profile(uid),
    ...approvedProfileChanges(expiry),
  };
  await seed([
    ["access_requests", uid, pendingRequest(uid, { status: "approved", lastAuditId: "prior" })],
    ["users", uid, approved],
  ]);
  const db = masterAdminDb();

  const blockingDecision = createDecisionBatch(db, {
    uid,
    fromStatus: "approved",
    toStatus: "blocked",
    beforeProfile: approved,
    afterProfile: { ...approved, ...blockedProfileChanges() },
    action: "blocked",
  });
  await blockingDecision.batch.commit();

  let blocked;
  await testEnv.withSecurityRulesDisabled(async (context) => {
    blocked = (await getDoc(doc(context.firestore(), "users", uid))).data();
    assert.equal((await getDoc(doc(context.firestore(), "access_decisions", blockingDecision.auditId))).exists(), true);
  });
  assert.equal(blocked.isActive, false);
  assert.equal(blocked.manualAccess.enabled, false);
  await expectPermissionDenied(updateDoc(doc(db, "access_requests", uid), {
    status: "approved",
    lastAuditId: "without-profile-and-audit",
  }));

  const releaseExpiry = Timestamp.fromMillis(Date.now() + 12 * 24 * 60 * 60 * 1000);
  const released = {
    ...blocked,
    ...approvedProfileChanges(releaseExpiry),
  };
  const releaseDecision = createDecisionBatch(db, {
    uid,
    fromStatus: "blocked",
    toStatus: "approved",
    beforeProfile: blocked,
    afterProfile: released,
    action: "released",
  });
  await releaseDecision.batch.commit();

  await testEnv.withSecurityRulesDisabled(async (context) => {
    assert.equal((await getDoc(doc(context.firestore(), "users", uid))).data().isActive, true);
    assert.equal((await getDoc(doc(context.firestore(), "access_requests", uid))).data().status, "approved");
    assert.equal((await getDoc(doc(context.firestore(), "access_decisions", releaseDecision.auditId))).exists(), true);
  });
});

test("profile, request, and audit writes cannot be split across operations", async () => {
  const uid = pendingUid;
  const before = profile(uid);
  await seed([
    ["access_requests", uid, pendingRequest(uid)],
    ["users", uid, before],
  ]);
  const db = masterAdminDb();

  await expectPermissionDenied(updateDoc(doc(db, "users", uid), approvedProfileChanges(
    Timestamp.fromMillis(Date.now() + 60_000),
  )));
  await expectPermissionDenied(updateDoc(doc(db, "access_requests", uid), {
    status: "approved",
    lastAuditId: randomUUID(),
  }));
  await expectPermissionDenied(setDoc(doc(db, "access_decisions", "orphan"), {
    actor: adminUid,
    targetUid: uid,
    action: "approved",
    fromStatus: "pending",
    toStatus: "approved",
    before: { isActive: false, manualAccessEnabled: false, manualAccessExpiresAt: null },
    after: { isActive: true, manualAccessEnabled: true, manualAccessExpiresAt: null },
    createdAt: serverTimestamp(),
  }));
});

test("approval cannot change roles, owner entitlement, Stripe fields, or fabricate projection facts", async () => {
  const uid = pendingUid;
  const before = profile(uid);
  await seed([
    ["access_requests", uid, pendingRequest(uid)],
    ["users", uid, before],
  ]);
  const db = masterAdminDb();
  const expiresAt = Timestamp.fromMillis(Date.now() + 60_000);
  const maliciousProfile = {
    ...before,
    ...approvedProfileChanges(expiresAt),
    role: "master_admin",
    ownerAccess: { enabled: true, permanent: true },
    billing: { status: "active", stripeSubscriptionId: "forged" },
  };
  await expectPermissionDenied(createDecisionBatch(db, {
    uid,
    toStatus: "approved",
    beforeProfile: before,
    afterProfile: maliciousProfile,
    action: "approved",
  }).batch.commit());

  const falseProjection = {
    ...before,
    ...approvedProfileChanges(expiresAt),
    accessProjection: {
      ...approvedProfileChanges(expiresAt).accessProjection,
      source: "stripe",
    },
  };
  await expectPermissionDenied(createDecisionBatch(db, {
    uid,
    toStatus: "approved",
    beforeProfile: before,
    afterProfile: falseProjection,
    action: "approved",
  }).batch.commit());
});

test("audit events are readable only by Master Admin and cannot be forged, changed, or deleted", async () => {
  const uid = pendingUid;
  const before = profile(uid);
  await seed([
    ["access_requests", uid, pendingRequest(uid)],
    ["users", uid, before],
  ]);
  const db = masterAdminDb();
  const decision = createDecisionBatch(db, {
    uid,
    toStatus: "approved",
    beforeProfile: before,
    afterProfile: { ...before, ...approvedProfileChanges(Timestamp.fromMillis(Date.now() + 60_000)) },
    action: "approved",
  });
  await decision.batch.commit();
  assert.equal((await getDoc(doc(db, "access_decisions", decision.auditId))).exists(), true);
  await expectPermissionDenied(getDoc(doc(signupAs("ordinary-user"), "access_decisions", decision.auditId)));
  await expectPermissionDenied(updateDoc(doc(db, "access_decisions", decision.auditId), { action: "forged" }));
  await expectPermissionDenied(deleteDoc(doc(db, "access_decisions", decision.auditId)));
  await expectPermissionDenied(updateDoc(doc(db, "access_requests", uid), {
    status: "approved",
    lastAuditId: "another-audit",
  }));
});
