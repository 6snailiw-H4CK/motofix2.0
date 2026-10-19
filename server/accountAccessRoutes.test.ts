import assert from "node:assert/strict";
import { createServer } from "node:http";
import express from "express";
import test from "node:test";
import type { Auth, DecodedIdToken } from "firebase-admin/auth";
import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { registerAccountAccessRoutes } from "./accountAccessRoutes";
import { MOTOFIX_OWNER_UID } from "./ownerIdentity";

test("administrative access changes are authorized, audited, and synchronized to claims", async () => {
  const users = new Map<string, Record<string, unknown>>([
    ["admin-1", { uid: "admin-1", role: "master_admin", isActive: true }],
    ["user-1", { uid: "user-1", role: "user", isActive: false, subscriptionExpiresAt: null }],
    ["user-2", { uid: "user-2", role: "user", isActive: true }],
    [MOTOFIX_OWNER_UID, { uid: MOTOFIX_OWNER_UID, role: "master_admin", isActive: true, ownerAccess: { enabled: true, permanent: true } }],
  ]);
  const audits = new Map<string, Record<string, unknown>>();
  let nextAuditId = 0;
  let savedClaims: Record<string, unknown> | null = null;

  type MemoryRef = { collection: string; id: string };
  const makeRef = (collection: string, id: string): MemoryRef & {
    get: () => Promise<ReturnType<typeof read>>;
    update: (data: Record<string, unknown>) => Promise<void>;
  } => ({
    collection,
    id,
    get: async () => read({ collection, id }),
    update: async (data: Record<string, unknown>) => { audits.set(id, { ...(audits.get(id) ?? {}), ...data }); },
  });
  const read = (ref: MemoryRef) => {
    const document = ref.collection === "users"
      ? users.get(ref.id)
      : audits.get(ref.id);
    return {
      exists: !!document,
      data: () => document,
      get: (field: string) => document?.[field],
    };
  };
  const db = {
    collection: (collection: string) => ({
      doc: (id?: string) => makeRef(collection, id ?? `audit-${++nextAuditId}`),
    }),
    runTransaction: async (callback: (transaction: {
      get: (ref: MemoryRef) => Promise<ReturnType<typeof read>>;
      update: (ref: MemoryRef, data: Record<string, unknown>) => void;
      create: (ref: MemoryRef, data: Record<string, unknown>) => void;
    }) => Promise<unknown>) => callback({
      get: async (ref) => read(ref),
      update: (ref, data) => {
        const target = users.get(ref.id);
        if (!target) throw new Error("missing target");
        users.set(ref.id, { ...target, ...data });
      },
      create: (ref, data) => { audits.set(ref.id, data); },
    }),
  } as unknown as Firestore;
  const auth = {
    verifyIdToken: async () => ({ uid: "admin-1", master_admin: true } as unknown as DecodedIdToken),
    getUser: async (uid: string) => ({
      customClaims: uid === "user-2"
        ? { existingClaim: true, motofix_owner: true }
        : { existingClaim: true },
    }),
    setCustomUserClaims: async (_uid: string, claims: Record<string, unknown>) => { savedClaims = claims; },
  } as unknown as Auth;

  const app = express();
  app.use(express.json());
  registerAccountAccessRoutes(app, { auth, db, firebaseInitialized: true });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/admin/users/user-1/access`, {
      method: "PATCH",
      headers: { authorization: "Bearer admin-token", "content-type": "application/json" },
      body: JSON.stringify({
        subscriptionExpiresAt: "2026-12-01T00:00:00.000Z",
        reason: "Pagamento manual autorizado",
      }),
    });
    assert.equal(response.status, 200);

    const updatedUser = users.get("user-1");
    assert.equal(updatedUser?.isActive, false);
    assert.equal(updatedUser?.subscriptionExpiresAt, "2026-12-01T00:00:00.000Z");
    assert.equal(updatedUser?.billing, undefined);
    assert.equal(savedClaims, null);

    const audit = audits.get("audit-1");
    assert.equal(audit?.actor, "admin-1");
    assert.equal(audit?.action, "manual_access_expiry_changed");
    assert.equal(audit?.target, "user-1");
    assert.equal(audit?.source, "admin");
    assert.equal(audit?.reason, "Pagamento manual autorizado");
    assert.equal((audit?.before as Record<string, unknown>).isActive, false);
    assert.equal((audit?.after as Record<string, unknown>).isActive, false);
    assert.deepEqual((audit?.before as Record<string, unknown>).manualAccess, { enabled: null, expiresAt: null });
    assert.deepEqual((audit?.after as Record<string, unknown>).manualAccess, {
      enabled: true,
      expiresAt: "2026-12-01T00:00:00.000Z",
    });
    assert.deepEqual((audit?.after as Record<string, unknown>).accessProjection, {
      allowed: false,
      source: "none",
      validUntil: null,
    });
    assert.equal(audit?.claimsSyncStatus, "not_required");
    assert.ok(audit?.timestamp);

    const roleResponse = await fetch(`http://127.0.0.1:${address.port}/api/admin/users/user-2/access`, {
      method: "PATCH",
      headers: { authorization: "Bearer admin-token", "content-type": "application/json" },
      body: JSON.stringify({ role: "admin", reason: "Promovido pela plataforma" }),
    });
    assert.equal(roleResponse.status, 200);
    assert.equal(users.get("user-2")?.role, "admin");
    assert.equal(savedClaims?.admin, true);
    assert.equal(savedClaims?.master_admin, undefined);
    assert.equal(savedClaims?.motofix_owner, undefined);

    const roleAudit = audits.get("audit-2");
    assert.equal(roleAudit?.action, "role_changed");
    assert.equal(roleAudit?.source, "admin");
    assert.equal(roleAudit?.reason, "Promovido pela plataforma");
    assert.equal((roleAudit?.before as Record<string, unknown>).role, "user");
    assert.equal((roleAudit?.after as Record<string, unknown>).role, "admin");

    const ownerStatus = await fetch(`http://127.0.0.1:${address.port}/api/admin/users/${MOTOFIX_OWNER_UID}/access`, {
      method: "PATCH",
      headers: { authorization: "Bearer test-token", "content-type": "application/json" },
      body: JSON.stringify({ isActive: false, reason: "must not block designated owner" }),
    });
    assert.equal(ownerStatus.status, 409);
    assert.equal(users.get(MOTOFIX_OWNER_UID)?.isActive, true);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("account access endpoint requires entitlement for admins and users alike", async () => {
  const profiles = new Map<string, Record<string, unknown>>([
    ["admin", { uid: "admin", role: "admin", isActive: true }],
    ["master-admin", { uid: "master-admin", role: "master_admin", isActive: true }],
    [MOTOFIX_OWNER_UID, {
      uid: MOTOFIX_OWNER_UID,
      role: "master_admin",
      isActive: true,
      ownerAccess: { enabled: true, permanent: true },
      accessProjection: { allowed: false, source: "none", validUntil: null, reason: "subscription_inactive" },
    }],
    ["inactive-owner", {
      uid: "inactive-owner",
      role: "master_admin",
      isActive: false,
      ownerAccess: { enabled: true, permanent: true },
    }],
    ["other-master", { uid: "other-master", role: "master_admin", isActive: true }],
    ["active-user", { uid: "active-user", role: "user", isActive: true, billing: { status: "active", currentPeriodEnd: "2099-01-01T00:00:00.000Z" } }],
    ["trialing-user", { uid: "trialing-user", role: "user", isActive: true, billing: { status: "trialing" } }],
    ["trialing-with-period-user", { uid: "trialing-with-period-user", role: "user", isActive: true, billing: { status: "trialing", currentPeriodEnd: "2099-01-01T00:00:00.000Z" } }],
    ["past-due-user", { uid: "past-due-user", role: "user", isActive: true, billing: { status: "past_due" } }],
    ["canceled-user", { uid: "canceled-user", role: "user", isActive: true, billing: { status: "canceled" } }],
    ["manual-override-user", {
      uid: "manual-override-user",
      role: "user",
      isActive: true,
      manualAccess: { enabled: true, expiresAt: "2099-01-01T00:00:00.000Z" },
      accessProjection: { allowed: true, source: "manual", validUntil: "2099-01-01T00:00:00.000Z" },
      billing: { status: "canceled" },
    }],
    ["blocked-manual-user", { uid: "blocked-manual-user", role: "user", isActive: false, manualAccess: { enabled: true, expiresAt: "2099-01-01T00:00:00.000Z" }, billing: { status: "canceled" } }],
    ["unsubscribed-user", { uid: "unsubscribed-user", role: "user", isActive: true }],
  ]);
  const tokenClaims: Record<string, Record<string, unknown>> = {
    admin: { uid: "admin", admin: true },
    "master-admin": { uid: "master-admin", master_admin: true },
    owner: { uid: MOTOFIX_OWNER_UID, master_admin: true },
    "inactive-owner": { uid: "inactive-owner", master_admin: true, motofix_owner: true },
    "other-master": { uid: "other-master", master_admin: true },
    "active-user": { uid: "active-user" },
    "trialing-user": { uid: "trialing-user" },
    "trialing-with-period-user": { uid: "trialing-with-period-user" },
    "past-due-user": { uid: "past-due-user" },
    "canceled-user": { uid: "canceled-user" },
    "manual-override-user": { uid: "manual-override-user" },
    "blocked-manual-user": { uid: "blocked-manual-user" },
    "unsubscribed-user": { uid: "unsubscribed-user" },
  };
  const db = {
    collection: (name: string) => ({
      doc: (uid: string) => ({
        get: async () => {
          const profile = name === "users"
            ? profiles.get(uid)
            : undefined;
          return {
            exists: !!profile,
            data: () => profile,
            get: (field: string) => profile?.[field],
          };
        },
      }),
    }),
  } as unknown as Firestore;
  const auth = {
    verifyIdToken: async (token: string) => {
      const claims = tokenClaims[token];
      if (!claims) throw Object.assign(new Error("invalid token"), { code: "auth/id-token-expired" });
      return claims as unknown as DecodedIdToken;
    },
  } as unknown as Auth;

  const app = express();
  registerAccountAccessRoutes(app, { auth, db, firebaseInitialized: true });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  try {
    const expected: Record<string, { allowed: boolean; status: string | null; reason: string }> = {
      admin: { allowed: false, status: "pending", reason: "manual_access_required" },
      "master-admin": { allowed: false, status: "pending", reason: "manual_access_required" },
      owner: { allowed: true, status: "active", reason: "owner_entitlement" },
      "inactive-owner": { allowed: false, status: "inactive", reason: "account_inactive" },
      "other-master": { allowed: false, status: "pending", reason: "manual_access_required" },
      "active-user": { allowed: false, status: "pending", reason: "manual_access_required" },
      "trialing-user": { allowed: false, status: "pending", reason: "manual_access_required" },
      "trialing-with-period-user": { allowed: false, status: "pending", reason: "manual_access_required" },
      "past-due-user": { allowed: false, status: "pending", reason: "manual_access_required" },
      "canceled-user": { allowed: false, status: "pending", reason: "manual_access_required" },
      "manual-override-user": { allowed: true, status: "active", reason: "manual_entitlement" },
      "blocked-manual-user": { allowed: false, status: "inactive", reason: "account_inactive" },
      "unsubscribed-user": { allowed: false, status: "pending", reason: "manual_access_required" },
    };

    for (const [token, decision] of Object.entries(expected)) {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/account/access`, {
        headers: { authorization: `Bearer ${token}` },
      });
      assert.equal(response.status, 200, token);
      const body = await response.json() as typeof decision & {
        accountState: string;
        entitlementSource: string;
        expiresAt: string | null;
        evaluatedAt: string;
      };
      assert.equal(body.allowed, decision.allowed, token);
      assert.equal(body.status, decision.status, token);
      assert.equal(body.reason, decision.reason, token);
      assert.ok(body.accountState, token);
      assert.ok(body.entitlementSource, token);
      assert.ok(body.evaluatedAt, token);
      if (token === "owner") {
        assert.equal(body.entitlementSource, "owner");
        assert.equal(body.expiresAt, null);
      }
      if (token === "manual-override-user") assert.equal(body.entitlementSource, "manual");
      if (token === "blocked-manual-user") assert.equal(body.entitlementSource, "none");
    }

    const unauthenticatedResponse = await fetch(`http://127.0.0.1:${address.port}/api/account/access`);
    assert.equal(unauthenticatedResponse.status, 401);
    const invalidTokenResponse = await fetch(`http://127.0.0.1:${address.port}/api/account/access`, {
      headers: { authorization: "Bearer invalid" },
    });
    assert.equal(invalidTokenResponse.status, 401);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("admin access PATCH enforces actor, target, and payload validation without audit side effects", async () => {
  const users = new Map<string, Record<string, unknown>>([
    ["regular-actor", { uid: "regular-actor", role: "user", isActive: true }],
    ["admin-actor", { uid: "admin-actor", role: "admin", isActive: true }],
    ["active-master", { uid: "active-master", role: "master_admin", isActive: true }],
    ["inactive-master", { uid: "inactive-master", role: "master_admin", isActive: false }],
    ["target", { uid: "target", role: "user", isActive: true }],
  ]);
  const audits = new Map<string, Record<string, unknown>>();
  const tokenClaims: Record<string, Record<string, unknown>> = {
    "regular-token": { uid: "regular-actor" },
    "admin-token": { uid: "admin-actor", admin: true },
    "active-master-token": { uid: "active-master", admin: true, master_admin: true },
    "inactive-master-token": { uid: "inactive-master", admin: true, master_admin: true },
  };
  let nextAuditId = 0;
  const makeRef = (collection: string, id?: string) => {
    const ref = { collection, id: id ?? `audit-${++nextAuditId}` };
    return {
      ...ref,
      get: async () => read(ref),
      update: async (data: Record<string, unknown>) => { audits.set(ref.id, { ...(audits.get(ref.id) ?? {}), ...data }); },
    };
  };
  const read = (ref: { collection: string; id: string }) => {
    const data = (ref.collection === "users" ? users : audits).get(ref.id);
    return { exists: !!data, data: () => data };
  };
  const db = {
    collection: (collection: string) => ({
      doc: (id?: string) => makeRef(collection, id),
    }),
    runTransaction: async (callback: (transaction: {
      get: (ref: { collection: string; id: string }) => Promise<ReturnType<typeof read>>;
      update: (ref: { collection: string; id: string }, data: Record<string, unknown>) => void;
      create: (ref: { collection: string; id: string }, data: Record<string, unknown>) => void;
    }) => Promise<unknown>) => callback({
      get: async (ref) => read(ref),
      update: (ref, data) => {
        const profile = users.get(ref.id);
        if (!profile) throw new Error("missing target");
        users.set(ref.id, { ...profile, ...data });
      },
      create: (ref, data) => { audits.set(ref.id, data); },
    }),
  } as unknown as Firestore;
  const auth = {
    verifyIdToken: async (token: string) => {
      const claims = tokenClaims[token];
      if (!claims) throw Object.assign(new Error("invalid token"), { code: "auth/id-token-expired" });
      return claims as unknown as DecodedIdToken;
    },
    getUser: async () => ({ customClaims: {} }),
    setCustomUserClaims: async () => undefined,
  } as unknown as Auth;
  const app = express();
  app.use(express.json());
  registerAccountAccessRoutes(app, { auth, db, firebaseInitialized: true });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  const patch = async (token: string, uid: string, body: Record<string, unknown>) => fetch(
    `http://127.0.0.1:${address.port}/api/admin/users/${encodeURIComponent(uid)}/access`,
    {
      method: "PATCH",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  try {
    assert.equal((await patch("regular-token", "target", { isActive: false })).status, 403);
    assert.equal((await patch("admin-token", "target", { isActive: false })).status, 403);
    assert.equal((await patch("inactive-master-token", "target", { isActive: false })).status, 403);
    assert.equal((await patch("active-master-token", "missing-target", { isActive: false })).status, 404);
    assert.equal((await patch("active-master-token", "active-master", { isActive: false })).status, 400);
    assert.equal((await patch("active-master-token", "target", { isActive: false, isSuperAdmin: true })).status, 400);
    assert.equal((await patch("active-master-token", "target", { role: "owner" })).status, 400);
    assert.equal((await patch("active-master-token", "target", { ownerAccess: { enabled: true, permanent: true } })).status, 400);
    assert.equal((await patch("active-master-token", "target", { subscriptionExpiresAt: "not-a-date" })).status, 400);
    assert.equal((await patch("active-master-token", "target", { days: 3651 })).status, 400);
    assert.equal((await patch("active-master-token", "target", { days: -3651 })).status, 400);
    assert.equal(audits.size, 0);
    assert.deepEqual(users.get("target"), { uid: "target", role: "user", isActive: true });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("manual access PATCH keeps canonical state, projection, and audit snapshots consistent", async () => {
  const initialExpiry = Timestamp.fromDate(new Date("2026-12-01T00:00:00.000Z"));
  const users = new Map<string, Record<string, unknown>>([
    ["master", { uid: "master", role: "master_admin", isActive: true }],
    ["target", {
      uid: "target",
      role: "user",
      isActive: true,
      manualAccess: { enabled: true, expiresAt: initialExpiry },
      subscriptionExpiresAt: initialExpiry.toDate().toISOString(),
      accessProjection: {
        allowed: true,
        source: "manual",
        validUntil: initialExpiry,
        evaluatedAt: Timestamp.fromDate(new Date("2026-10-01T00:00:00.000Z")),
        policyVersion: "access-v1",
        reason: "manual_entitlement",
      },
      billing: { stripeCustomerId: "cus_private", secretKey: "sk_live_do_not_log", webhookSecret: "whsec_do_not_log" },
    }],
  ]);
  const audits = new Map<string, Record<string, unknown>>();
  let nextAuditId = 0;
  const makeRef = (collection: string, id?: string) => {
    const ref = { collection, id: id ?? `audit-${++nextAuditId}` };
    return {
      ...ref,
      get: async () => read(ref),
      update: async (data: Record<string, unknown>) => audits.set(ref.id, { ...(audits.get(ref.id) ?? {}), ...data }),
    };
  };
  const read = (ref: { collection: string; id: string }) => {
    const data = (ref.collection === "users" ? users : audits).get(ref.id);
    return { exists: Boolean(data), data: () => data };
  };
  const db = {
    collection: (collection: string) => ({
      doc: (id?: string) => makeRef(collection, id),
    }),
    runTransaction: async (callback: (transaction: {
      get: (ref: { collection: string; id: string }) => Promise<ReturnType<typeof read>>;
      update: (ref: { collection: string; id: string }, data: Record<string, unknown>) => void;
      create: (ref: { collection: string; id: string }, data: Record<string, unknown>) => void;
    }) => Promise<unknown>) => callback({
      get: async (ref) => read(ref),
      update: (ref, data) => {
        const profile = users.get(ref.id);
        if (!profile) throw new Error("missing target");
        users.set(ref.id, { ...profile, ...data });
      },
      create: (ref, data) => { audits.set(ref.id, data); },
    }),
  } as unknown as Firestore;
  const auth = {
    verifyIdToken: async () => ({ uid: "master", master_admin: true } as unknown as DecodedIdToken),
    getUser: async () => ({ customClaims: {} }),
  } as unknown as Auth;
  const app = express();
  app.use(express.json());
  registerAccountAccessRoutes(app, { auth, db, firebaseInitialized: true });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  const patch = (body: Record<string, unknown>) => fetch(
    `http://127.0.0.1:${address.port}/api/admin/users/target/access`,
    {
      method: "PATCH",
      headers: { authorization: "Bearer master-token", "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const manualAccess = () => users.get("target")?.manualAccess as { enabled: boolean; expiresAt: Timestamp | null };
  const projection = () => users.get("target")?.accessProjection as {
    allowed: boolean;
    source: string;
    validUntil: Timestamp | null;
  };
  const auditFor = (id: number) => audits.get(`audit-${id}`)!;
  const auditTimestamp = (value: unknown) => value instanceof Timestamp
    ? value.toDate().toISOString()
    : value;

  try {
    const grantExpiry = "2026-12-25T12:00:00.000Z";
    assert.equal((await patch({ manualAccess: { enabled: true, expiresAt: grantExpiry }, reason: "manual grant" })).status, 200);
    assert.equal(manualAccess().enabled, true);
    assert.equal(manualAccess().expiresAt?.toDate().toISOString(), grantExpiry);
    assert.equal(users.get("target")?.subscriptionExpiresAt, grantExpiry);
    assert.equal(projection().allowed, true);
    assert.equal(projection().source, "manual");
    assert.equal(projection().validUntil?.toDate().toISOString(), grantExpiry);
    const grantAudit = auditFor(1);
    assert.equal(grantAudit.actor, "master");
    assert.equal(grantAudit.target, "target");
    assert.equal(grantAudit.action, "manual_access_changed");
    assert.equal(grantAudit.reason, "manual grant");
    assert.ok(grantAudit.timestamp);
    assert.deepEqual(grantAudit.before, {
      role: "user",
      isActive: true,
      subscriptionExpiresAt: initialExpiry.toDate().toISOString(),
      manualAccess: { enabled: true, expiresAt: initialExpiry.toDate().toISOString() },
      ownerAccess: { enabled: false, permanent: false },
      accessProjection: { allowed: true, source: "manual", validUntil: initialExpiry.toDate().toISOString() },
    });
    assert.deepEqual(grantAudit.after, {
      role: "user",
      isActive: true,
      subscriptionExpiresAt: grantExpiry,
      manualAccess: { enabled: true, expiresAt: grantExpiry },
      ownerAccess: { enabled: false, permanent: false },
      accessProjection: { allowed: true, source: "manual", validUntil: grantExpiry },
    });

    const requestStartedAt = Date.now();
    assert.equal((await patch({ days: 30, reason: "days grant" })).status, 200);
    const expectedDaysExpiry = requestStartedAt + 30 * 24 * 60 * 60 * 1000;
    assert.ok(Math.abs(manualAccess().expiresAt!.toMillis() - expectedDaysExpiry) < 5000);
    assert.equal(projection().allowed, true);
    assert.equal(projection().source, "manual");
    const daysAuditAfter = auditFor(2).after as Record<string, { enabled: boolean; expiresAt: unknown }>;
    assert.equal(daysAuditAfter.manualAccess.enabled, true);
    assert.equal(
      auditTimestamp(daysAuditAfter.manualAccess.expiresAt),
      manualAccess().expiresAt!.toDate().toISOString(),
    );

    const expiryBeforeRemoval = manualAccess().expiresAt!.toDate().toISOString();
    assert.equal((await patch({ days: 0, reason: "remove access" })).status, 200);
    assert.deepEqual(manualAccess(), { enabled: false, expiresAt: null });
    assert.equal(users.get("target")?.subscriptionExpiresAt, null);
    assert.equal(projection().allowed, false);
    assert.equal(projection().source, "none");
    assert.equal(projection().validUntil, null);
    assert.deepEqual((auditFor(3).before as Record<string, unknown>).manualAccess, {
      enabled: true,
      expiresAt: expiryBeforeRemoval,
    });
    assert.deepEqual((auditFor(3).after as Record<string, unknown>).manualAccess, { enabled: false, expiresAt: null });
    assert.deepEqual((auditFor(3).after as Record<string, unknown>).accessProjection, {
      allowed: false,
      source: "none",
      validUntil: null,
    });

    const stateBeforeAmbiguousRequests = users.get("target");
    const auditCountBeforeAmbiguousRequests = audits.size;
    assert.equal((await patch({ days: 30, manualAccess: { enabled: true, expiresAt: grantExpiry } })).status, 400);
    assert.equal((await patch({ manualAccess: { enabled: true, expiresAt: grantExpiry }, subscriptionExpiresAt: grantExpiry })).status, 400);
    assert.equal((await patch({ days: 30, subscriptionExpiresAt: grantExpiry })).status, 400);
    assert.deepEqual(users.get("target"), stateBeforeAmbiguousRequests);
    assert.equal(audits.size, auditCountBeforeAmbiguousRequests);

    assert.equal((await patch({ subscriptionExpiresAt: "2026-12-31T00:00:00.000Z" })).status, 200);
    assert.equal(manualAccess().enabled, true);
    assert.equal(manualAccess().expiresAt?.toDate().toISOString(), "2026-12-31T00:00:00.000Z");
    assert.equal(users.get("target")?.subscriptionExpiresAt, "2026-12-31T00:00:00.000Z");
    assert.equal(projection().allowed, true);
    assert.equal(projection().source, "manual");
    const serializedAudits = JSON.stringify(Array.from(audits.values()));
    assert.equal(serializedAudits.includes("sk_live_do_not_log"), false);
    assert.equal(serializedAudits.includes("whsec_do_not_log"), false);
    assert.equal(serializedAudits.includes("cus_private"), false);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("Master Admin role transition behavior is audited and reflected in managed custom claims", async () => {
  const users = new Map<string, Record<string, unknown>>([
    ["master", { uid: "master", role: "master_admin", isActive: true }],
    ["target", { uid: "target", role: "user", isActive: true, subscriptionExpiresAt: "2030-01-01T00:00:00.000Z" }],
  ]);
  const audits = new Map<string, Record<string, unknown>>();
  const customClaims = new Map<string, Record<string, unknown>>([
    ["target", { unrelatedClaim: "preserved" }],
  ]);
  let nextAuditId = 0;
  const makeRef = (collection: string, id?: string) => {
    const ref = { collection, id: id ?? `audit-${++nextAuditId}` };
    return {
      ...ref,
      get: async () => read(ref),
      update: async (data: Record<string, unknown>) => { audits.set(ref.id, { ...(audits.get(ref.id) ?? {}), ...data }); },
    };
  };
  const read = (ref: { collection: string; id: string }) => {
    const data = (ref.collection === "users" ? users : audits).get(ref.id);
    return { exists: !!data, data: () => data };
  };
  const db = {
    collection: (collection: string) => ({
      doc: (id?: string) => makeRef(collection, id),
    }),
    runTransaction: async (callback: (transaction: {
      get: (ref: { collection: string; id: string }) => Promise<ReturnType<typeof read>>;
      update: (ref: { collection: string; id: string }, data: Record<string, unknown>) => void;
      create: (ref: { collection: string; id: string }, data: Record<string, unknown>) => void;
    }) => Promise<unknown>) => callback({
      get: async (ref) => read(ref),
      update: (ref, data) => {
        const profile = users.get(ref.id);
        if (!profile) throw new Error("missing target");
        users.set(ref.id, { ...profile, ...data });
      },
      create: (ref, data) => { audits.set(ref.id, data); },
    }),
  } as unknown as Firestore;
  const auth = {
    verifyIdToken: async () => ({ uid: "master", master_admin: true } as unknown as DecodedIdToken),
    getUser: async (uid: string) => ({ customClaims: customClaims.get(uid) ?? {} }),
    setCustomUserClaims: async (uid: string, claims: Record<string, unknown>) => { customClaims.set(uid, claims); },
  } as unknown as Auth;
  const app = express();
  app.use(express.json());
  registerAccountAccessRoutes(app, { auth, db, firebaseInitialized: true });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  const transition = async (changes: Record<string, unknown>, expectedRole: string, expectedActive: boolean) => {
    const beforeCount = audits.size;
    const before = users.get("target");
    const response = await fetch(`http://127.0.0.1:${address.port}/api/admin/users/target/access`, {
      method: "PATCH",
      headers: { authorization: "Bearer master-token", "content-type": "application/json" },
      body: JSON.stringify(changes),
    });
    assert.equal(response.status, 200);
    assert.equal(audits.size, beforeCount + 1);
    const audit = audits.get(`audit-${audits.size}`);
    const after = users.get("target");
    assert.equal((audit?.before as Record<string, unknown>).role, before?.role);
    assert.equal((audit?.before as Record<string, unknown>).isActive, before?.isActive);
    assert.equal((audit?.after as Record<string, unknown>).role, expectedRole);
    assert.equal((audit?.after as Record<string, unknown>).isActive, expectedActive);
    assert.equal(after?.role, expectedRole);
    assert.equal(after?.isActive, expectedActive);
    assert.equal(customClaims.get("target")?.unrelatedClaim, "preserved");
    assert.equal(customClaims.get("target")?.admin, expectedActive && expectedRole !== "user" ? true : undefined);
    assert.equal(customClaims.get("target")?.master_admin, expectedActive && expectedRole === "master_admin" ? true : undefined);
    assert.equal(customClaims.get("target")?.isActive, expectedActive ? true : undefined);
    const claimsChanged = before?.role !== expectedRole || before?.isActive !== expectedActive;
    assert.equal(audit?.claimsSyncStatus, claimsChanged ? "synced" : "not_required");
  };

  try {
    await transition({ role: "admin", reason: "role transition" }, "admin", true);
    await transition({ role: "master_admin", reason: "role transition" }, "master_admin", true);
    await transition({ role: "user", reason: "role transition" }, "user", true);
    await transition({ role: "master_admin", reason: "role transition" }, "master_admin", true);
    await transition({ role: "admin", reason: "role transition" }, "admin", true);
    await transition({ isActive: false, reason: "account disabled" }, "admin", false);
    await transition({ isActive: true, reason: "account enabled" }, "admin", true);
    await transition({ days: 30, reason: "manual extension" }, "admin", true);
    assert.equal(audits.get("audit-8")?.action, "manual_access_days_added");
    await transition({ days: -7, reason: "manual reduction" }, "admin", true);
    assert.equal(audits.get("audit-9")?.action, "manual_access_days_removed");
    await transition({ subscriptionExpiresAt: "2031-01-01T00:00:00.000Z", reason: "manual expiry" }, "admin", true);
    assert.equal(audits.get("audit-10")?.action, "manual_access_expiry_changed");
    assert.equal(audits.size, 10);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("custom-claim synchronization retries and does not report success when it remains unavailable", async () => {
  const users = new Map<string, Record<string, unknown>>([
    ["master", { uid: "master", role: "master_admin", isActive: true }],
    ["target", { uid: "target", role: "user", isActive: true }],
  ]);
  const audits = new Map<string, Record<string, unknown>>();
  const makeRef = (collection: string, id: string) => ({
    collection,
    id,
    get: async () => {
      const data = (collection === "users" ? users : audits).get(id);
      return { exists: Boolean(data), data: () => data };
    },
    update: async (data: Record<string, unknown>) => { audits.set(id, { ...(audits.get(id) ?? {}), ...data }); },
  });
  const db = {
    collection: (collection: string) => ({ doc: (id?: string) => makeRef(collection, id ?? "audit-1") }),
    runTransaction: async (callback: (transaction: {
      get: (ref: ReturnType<typeof makeRef>) => Promise<{ exists: boolean; data: () => Record<string, unknown> | undefined }>;
      update: (ref: ReturnType<typeof makeRef>, data: Record<string, unknown>) => void;
      create: (ref: ReturnType<typeof makeRef>, data: Record<string, unknown>) => void;
    }) => Promise<unknown>) => callback({
      get: async (ref) => ref.get(),
      update: (ref, data) => { users.set(ref.id, { ...users.get(ref.id), ...data }); },
      create: (ref, data) => { audits.set(ref.id, data); },
    }),
  } as unknown as Firestore;
  let claimSyncAttempts = 0;
  const auth = {
    verifyIdToken: async () => ({ uid: "master", master_admin: true } as unknown as DecodedIdToken),
    getUser: async () => ({ customClaims: {} }),
    setCustomUserClaims: async () => {
      claimSyncAttempts += 1;
      throw new Error("claims service unavailable");
    },
  } as unknown as Auth;
  const app = express();
  app.use(express.json());
  registerAccountAccessRoutes(app, { auth, db, firebaseInitialized: true });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/admin/users/target/access`, {
      method: "PATCH",
      headers: { authorization: "Bearer valid-token", "content-type": "application/json" },
      body: JSON.stringify({ role: "admin" }),
    });
    const body = await response.json() as { error: string; claimsSyncStatus: string };
    assert.equal(response.status, 503);
    assert.equal(claimSyncAttempts, 2);
    assert.equal(users.get("target")?.role, "admin");
    assert.equal(audits.size, 1);
    assert.equal(audits.get("audit-1")?.claimsSyncStatus, "failed");
    assert.equal(audits.get("audit-1")?.claimsSyncAttempts, 2);
    assert.equal(audits.get("audit-1")?.claimsSyncError, "claims service unavailable");
    assert.equal(body.claimsSyncStatus, "failed");
    assert.match(body.error, /alteração foi salva/);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("Master Admin account detail returns persisted billing and entitlement read-only", async () => {
  const validUntil = new Date("2099-01-01T00:00:00.000Z");
  const users = new Map<string, Record<string, unknown>>([
    ["master", { uid: "master", role: "master_admin", isActive: true }],
    ["regular", { uid: "regular", role: "user", isActive: true }],
    ["admin", { uid: "admin", role: "admin", isActive: true }],
    ["target", {
      uid: "target",
      displayName: "Billing Target",
      email: "target@example.test",
      role: "user",
      isActive: true,
      createdAt: new Date("2025-01-01T00:00:00.000Z"),
      billing: {
        status: "trialing",
        stripeCustomerId: "cus_read_only",
        stripeSubscriptionId: "sub_read_only",
        planId: "pro",
        currentPeriodStart: new Date("2098-12-01T00:00:00.000Z"),
        currentPeriodEnd: validUntil,
        cancelAtPeriodEnd: true,
        secretKey: "sk_test_must_not_leak",
        webhookSecret: "whsec_must_not_leak",
      },
      manualAccess: {
        enabled: true,
        expiresAt: validUntil,
        updatedBy: "master",
        updatedAt: new Date("2026-10-01T12:00:00.000Z"),
      },
      accessProjection: {
        allowed: true,
        source: "manual",
        validUntil,
        reason: "manual_entitlement",
        evaluatedAt: new Date("2026-10-01T12:00:00.000Z"),
        policyVersion: "access-v1",
      },
    }],
    ["empty-target", { uid: "empty-target", role: "user", isActive: false }],
  ]);
  const claimsByToken: Record<string, { uid: string; master_admin?: boolean; admin?: boolean }> = {
    master: { uid: "master", master_admin: true },
    regular: { uid: "regular" },
    admin: { uid: "admin", admin: true },
  };
  let writes = 0;
  const db = {
    collection: (name: string) => ({
      doc: (uid: string) => ({
        get: async () => {
          const profile = name === "users" ? users.get(uid) : undefined;
          return { exists: profile !== undefined, data: () => profile };
        },
      }),
      where: () => ({
        get: async () => ({ docs: [] }),
      }),
    }),
    runTransaction: async () => { writes += 1; throw new Error("read-only endpoint attempted transaction"); },
    batch: () => { writes += 1; throw new Error("read-only endpoint attempted batch"); },
  } as unknown as Firestore;
  const auth = {
    verifyIdToken: async (token: string) => {
      const claims = claimsByToken[token];
      if (!claims) throw Object.assign(new Error("invalid token"), { code: "auth/id-token-expired" });
      return claims;
    },
    getUser: async () => ({ customClaims: {} }),
  } as unknown as Auth;
  const app = express();
  registerAccountAccessRoutes(app, { auth, db, firebaseInitialized: true });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  const getDetail = (token: string, uid: string) => fetch(
    `http://127.0.0.1:${address.port}/api/admin/users/${encodeURIComponent(uid)}`,
    { headers: { authorization: `Bearer ${token}` } },
  );

  try {
    assert.equal((await getDetail("regular", "target")).status, 403);
    assert.equal((await getDetail("admin", "target")).status, 403);
    assert.equal((await getDetail("master", "missing")).status, 404);

    const response = await getDetail("master", "target");
    assert.equal(response.status, 200);
    const body = await response.json() as {
      account: {
        uid: string;
        billing: Record<string, unknown>;
        accessProjection: Record<string, unknown>;
        manualAccess: Record<string, unknown>;
      };
      auditEvents: unknown[];
    };
    assert.equal(body.account.uid, "target");
    assert.deepEqual(body.account.billing, {
      status: "trialing",
      customerId: "cus_read_only",
      subscriptionId: "sub_read_only",
      priceId: null,
      planId: "pro",
      currentPeriodStart: "2098-12-01T00:00:00.000Z",
      currentPeriodEnd: "2099-01-01T00:00:00.000Z",
      cancelAtPeriodEnd: true,
      cancelAt: null,
      trialStart: null,
      trialEnd: null,
    });
    assert.deepEqual(body.account.accessProjection, {
      allowed: true,
      source: "manual",
      validUntil: "2099-01-01T00:00:00.000Z",
      reason: "manual_entitlement",
      evaluatedAt: "2026-10-01T12:00:00.000Z",
      policyVersion: "access-v1",
    });
    assert.deepEqual(body.account.manualAccess, {
      enabled: true,
      expiresAt: "2099-01-01T00:00:00.000Z",
      updatedBy: "master",
      updatedAt: "2026-10-01T12:00:00.000Z",
    });
    const serialized = JSON.stringify(body);
    assert.equal(serialized.includes("sk_test"), false);
    assert.equal(serialized.includes("whsec_"), false);
    assert.equal(writes, 0);

    const emptyResponse = await getDetail("master", "empty-target");
    assert.equal(emptyResponse.status, 200);
    const emptyBody = await emptyResponse.json() as {
      account: {
        billing: Record<string, unknown>;
        accessProjection: Record<string, unknown>;
        manualAccess: Record<string, unknown>;
      };
    };
    assert.deepEqual(emptyBody.account.billing, {
      status: null,
      customerId: null,
      subscriptionId: null,
      priceId: null,
      planId: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: null,
      cancelAt: null,
      trialStart: null,
      trialEnd: null,
    });
    assert.deepEqual(emptyBody.account.accessProjection, {
      allowed: null,
      source: null,
      validUntil: null,
      reason: null,
      evaluatedAt: null,
      policyVersion: null,
    });
    assert.deepEqual(emptyBody.account.manualAccess, {
      enabled: null,
      expiresAt: null,
      updatedBy: null,
      updatedAt: null,
    });
    assert.equal(writes, 0);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
