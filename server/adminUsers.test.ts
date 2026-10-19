import assert from "node:assert/strict";
import { createServer } from "node:http";
import express from "express";
import test from "node:test";
import type { Auth, DecodedIdToken } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import { registerAccountAccessRoutes } from "./accountAccessRoutes";
import { mapAdminUser } from "./adminUsers";

type QueryFilter = [field: string, operator: string, value: unknown];

const createHarness = async () => {
  const now = Date.now();
  const users = new Map<string, Record<string, unknown>>([
    ["admin", { uid: "admin", role: "master_admin", isActive: true, createdAt: new Date(now).toISOString() }],
    ["u1", {
      displayName: "Alpha One",
      email: "one@example.test",
      role: "user",
      isActive: true,
      createdAt: new Date(now).toISOString(),
      subscriptionExpiresAt: new Date(now - 3 * 86400000).toISOString(),
      manualAccess: { enabled: true, expiresAt: new Date(now + 3 * 86400000) },
      accessProjection: {
        allowed: true,
        source: "manual",
        validUntil: new Date(now + 3 * 86400000),
      },
      operationalSecret: "must-not-leak",
    }],
    ["u2", {
      displayName: "Alpha Two",
      email: "two@example.test",
      role: "admin",
      isActive: true,
      createdAt: new Date(now - 1000).toISOString(),
      subscription: { plan: "monthly" },
      subscriptionExpiresAt: new Date(now + 2 * 86400000).toISOString(),
      accessProjection: { allowed: false, source: "none", validUntil: new Date(now + 2 * 86400000) },
    }],
    ["u3", {
      displayName: "Beta",
      email: "beta@example.test",
      role: "user",
      isActive: false,
      createdAt: new Date(now - 86400000).toISOString(),
      subscriptionExpiresAt: new Date(now + 86400000).toISOString(),
      accessProjection: { allowed: true, source: "stripe", validUntil: new Date(now + 86400000) },
    }],
    ["inactive-master", { role: "master_admin", isActive: false, createdAt: new Date(now).toISOString() }],
    ["unclaimed-master", { role: "master_admin", isActive: true, createdAt: new Date(now).toISOString() }],
  ]);
  const auditEvents = new Map<string, Record<string, unknown>>([
    ["audit-1", {
      actor: "admin",
      action: "manual_access_changed",
      target: "u1",
      before: {
        role: "user",
        isActive: true,
        manualAccess: { enabled: false, expiresAt: null },
        accessProjection: { allowed: false, source: "none", validUntil: null },
        stripeSecret: "sk_live_must-not-leak",
      },
      after: {
        role: "user",
        isActive: true,
        manualAccess: { enabled: true, expiresAt: new Date(now + 86400000) },
        accessProjection: { allowed: true, source: "manual", validUntil: new Date(now + 86400000) },
      },
      source: "admin",
      reason: "Approved",
      timestamp: new Date(now),
      claimsSyncStatus: "synced",
      claimsSyncAttempts: 1,
      secret: "whsec_must-not-leak",
    }],
  ]);
  const pageReadSizes: number[] = [];

  const matches = (data: Record<string, unknown>, filters: QueryFilter[]) => filters.every(([field, operator, value]) => {
    const actual = field.split(".").reduce<unknown>((current, key) => (
      current && typeof current === "object" ? (current as Record<string, unknown>)[key] : undefined
    ), data);
    if (operator === "==") return actual === value;
    const millis = (input: unknown) => input instanceof Date
      ? input.getTime()
      : input && typeof input === "object" && "toMillis" in input && typeof input.toMillis === "function"
        ? (input.toMillis as () => number)()
        : typeof input === "string" ? Date.parse(input) : Number.NaN;
    if (operator === ">=") {
      return Number.isFinite(millis(actual)) && Number.isFinite(millis(value))
        ? millis(actual) >= millis(value)
        : actual === value;
    }
    if (operator === "<=") {
      return Number.isFinite(millis(actual)) && Number.isFinite(millis(value))
        ? millis(actual) <= millis(value)
        : actual === value;
    }
    if (operator === "<") {
      return Number.isFinite(millis(actual)) && Number.isFinite(millis(value))
        ? millis(actual) < millis(value)
        : actual === value;
    }
    return false;
  });

  const makeQuery = (collectionName: string, filters: QueryFilter[] = [], afterId: string | null = null, maxResults = Number.POSITIVE_INFINITY) => {
    const query = {
      where: (field: string, operator: string, value: unknown) => makeQuery(collectionName, [...filters, [field, operator, value]], afterId, maxResults),
      select: (..._fields: string[]) => query,
      orderBy: (_field: unknown) => query,
      startAfter: (id: string) => makeQuery(collectionName, filters, id, maxResults),
      limit: (limit: number) => makeQuery(collectionName, filters, afterId, limit),
      get: async () => {
        const records = collectionName === "users" ? users : auditEvents;
        const matching = Array.from(records, ([id, data]) => ({ id, data: () => data }))
          .filter((document) => matches(document.data(), filters))
          .filter((document) => afterId === null || document.id > afterId)
          .sort((left, right) => left.id.localeCompare(right.id))
          .slice(0, maxResults);
        if (collectionName === "users") pageReadSizes.push(matching.length);
        return { docs: matching };
      },
      count: () => ({
        get: async () => {
          const records = collectionName === "users" ? users : auditEvents;
          const count = Array.from(records.values()).filter((data) => matches(data, filters)).length;
          return { data: () => ({ count }) };
        },
      }),
    };
    return query;
  };

  const db = {
    collection: (name: string) => ({
      ...makeQuery(name),
      doc: (uid: string) => ({
        get: async () => {
          const data = name === "users" ? users.get(uid) : auditEvents.get(uid);
          return { id: uid, exists: Boolean(data), data: () => data };
        },
      }),
      where: (field: string, operator: string, value: unknown) => makeQuery(name, [[field, operator, value]]),
      select: (...fields: string[]) => makeQuery(name).select(...fields),
    }),
  } as unknown as Firestore;
  const tokenClaims: Record<string, Record<string, unknown>> = {
    master: { uid: "admin", master_admin: true },
    regular: { uid: "u2" },
    admin: { uid: "u2", admin: true },
    inactive: { uid: "inactive-master", master_admin: true },
    unclaimed: { uid: "unclaimed-master" },
  };
  const auth = {
    verifyIdToken: async (token: string) => {
      const claims = tokenClaims[token];
      if (!claims) throw Object.assign(new Error("invalid token"), { code: "auth/id-token-expired" });
      return claims as unknown as DecodedIdToken;
    },
    getUser: async (uid: string) => ({
      customClaims: uid === "admin" ? { master_admin: true } : {},
    }),
  } as unknown as Auth;
  const app = express();
  registerAccountAccessRoutes(app, { auth, db, firebaseInitialized: true });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
    pageReadSizes,
  };
};

test("account listing uses limited Firestore pages, exact search and aggregate metrics", async () => {
  const harness = await createHarness();
  const authHeaders = { authorization: "Bearer master" };

  try {
    const firstResponse = await fetch(`${harness.baseUrl}/api/admin/users?pageSize=2`, { headers: authHeaders });
    assert.equal(firstResponse.status, 200);
    const firstPage = await firstResponse.json() as {
      users: Array<Record<string, unknown>>;
      total: number;
      hasMore: boolean;
      nextCursor: string | null;
      metrics: { total: number; active: number; blocked: number; expiringSoon: number };
    };
    assert.equal(firstPage.total, 6);
    assert.deepEqual(firstPage.users.map((user) => user.uid), ["admin", "inactive-master"]);
    assert.equal(firstPage.users[1].operationalSecret, undefined);
    assert.equal(firstPage.hasMore, true);
    assert.equal(firstPage.metrics.total, 6);
    assert.equal(firstPage.metrics.active, 4);
    assert.equal(firstPage.metrics.blocked, 2);
    assert.equal(firstPage.metrics.expiringSoon, 1, "expiring metric uses active accessProjection, not the legacy expiry");
    assert.ok(firstPage.nextCursor);

    const secondResponse = await fetch(
      `${harness.baseUrl}/api/admin/users?pageSize=2&cursor=${encodeURIComponent(firstPage.nextCursor!)}`,
      { headers: authHeaders },
    );
    const secondPage = await secondResponse.json() as { users: Array<Record<string, unknown> & { uid: string }>; hasMore: boolean };
    assert.equal(secondResponse.status, 200);
    assert.deepEqual(secondPage.users.map((user) => user.uid), ["u1", "u2"]);
    assert.equal(secondPage.hasMore, true);
    assert.ok(harness.pageReadSizes.every((size) => size <= 3), "each page read is bounded by pageSize + 1");

    const exactEmail = await fetch(`${harness.baseUrl}/api/admin/users?search=one%40example.test`, { headers: authHeaders });
    assert.deepEqual((await exactEmail.json() as { users: Array<{ uid: string }> }).users.map((user) => user.uid), ["u1"]);
    const noSubstring = await fetch(`${harness.baseUrl}/api/admin/users?search=Alpha`, { headers: authHeaders });
    assert.deepEqual((await noSubstring.json() as { users: unknown[] }).users, []);

    const mismatchedCursor = await fetch(
      `${harness.baseUrl}/api/admin/users?search=beta%40example.test&pageSize=2&cursor=${encodeURIComponent(firstPage.nextCursor!)}`,
      { headers: authHeaders },
    );
    assert.equal(mismatchedCursor.status, 400);
    assert.equal((await fetch(`${harness.baseUrl}/api/admin/users`, { headers: { authorization: "Bearer regular" } })).status, 403);
    assert.equal((await fetch(`${harness.baseUrl}/api/admin/users`)).status, 401);

    const detailResponse = await fetch(`${harness.baseUrl}/api/admin/users/u1`, { headers: authHeaders });
    assert.equal(detailResponse.status, 200);
    const detail = await detailResponse.json() as {
      account: { accessDecision: { allowed: boolean; entitlementSource: string }; operationalSecret?: string };
      auditEvents: Array<{
        actor: string | null;
        action: string | null;
        reason: string | null;
        claimsSyncAttempts: number | null;
        before: Record<string, unknown> | null;
        after: Record<string, unknown> | null;
      }>;
    };
    assert.equal(detail.account.accessDecision.allowed, true);
    assert.equal(detail.account.accessDecision.entitlementSource, "manual");
    assert.equal(detail.account.operationalSecret, undefined);
    assert.equal(detail.auditEvents[0].claimsSyncAttempts, 1);
    const listUser = secondPage.users.find((user) => user.uid === "u1");
    assert.ok(Date.parse(String(listUser?.manualAccessExpiresAt)) > Date.now());
    assert.equal(listUser?.accessValidUntil, listUser?.manualAccessExpiresAt);
    assert.equal(listUser?.accessAllowed, true);
    assert.equal(listUser?.entitlementSource, "manual");
    assert.deepEqual(detail.auditEvents[0].before?.manualAccess, { enabled: false, expiresAt: null });
    const auditAfterManualAccess = detail.auditEvents[0].after?.manualAccess as { enabled: boolean; expiresAt: string };
    const auditAfterProjection = detail.auditEvents[0].after?.accessProjection as { allowed: boolean; source: string; validUntil: string };
    assert.equal(auditAfterManualAccess.enabled, true);
    assert.ok(Math.abs(Date.parse(auditAfterManualAccess.expiresAt) - (Date.now() + 86400000)) < 2000);
    assert.deepEqual(auditAfterProjection, {
      allowed: true,
      source: "manual",
      validUntil: auditAfterManualAccess.expiresAt,
    });
    assert.equal(JSON.stringify(detail.auditEvents).includes("sk_live"), false);
    assert.equal(JSON.stringify(detail.auditEvents).includes("whsec_"), false);
  } finally {
    await harness.close();
  }
});

test("account detail GET enforces Master Admin authorization and missing-target handling", async () => {
  const harness = await createHarness();
  const getDetail = (token: string, uid: string) => fetch(
    `${harness.baseUrl}/api/admin/users/${uid}`,
    { headers: { authorization: `Bearer ${token}` } },
  );

  try {
    assert.equal((await getDetail("regular", "u1")).status, 403);
    assert.equal((await getDetail("admin", "u1")).status, 403);
    assert.equal((await getDetail("inactive", "u1")).status, 403);
    assert.equal((await getDetail("unclaimed", "u1")).status, 403);
    assert.equal((await getDetail("master", "u1")).status, 200);
    assert.equal((await getDetail("master", "missing")).status, 404);
  } finally {
    await harness.close();
  }
});

test("admin list maps manual expiry and access projection without consulting the legacy expiry", () => {
  const expiry = "2026-11-01T00:00:00.000Z";
  const legacyOnly = mapAdminUser("legacy", {
    isActive: true,
    subscriptionExpiresAt: expiry,
    billing: { status: "canceled", stripeSubscriptionId: "sub_test" },
  });
  assert.equal(legacyOnly.manualAccessExpiresAt, null);
  assert.equal(legacyOnly.manualAccessState, "none");
  assert.equal(legacyOnly.accessAllowed, null);

  const manualAndStripe = mapAdminUser("manual", {
    isActive: true,
    subscriptionExpiresAt: "2026-09-01T00:00:00.000Z",
    manualAccess: { enabled: true, expiresAt: expiry },
    accessProjection: { allowed: true, source: "manual", validUntil: expiry },
    billing: { status: "canceled", stripeSubscriptionId: "sub_test" },
  });
  assert.equal(manualAndStripe.manualAccessExpiresAt, expiry);
  assert.equal(manualAndStripe.accessAllowed, true);
  assert.equal(manualAndStripe.entitlementSource, "manual");
  assert.equal(manualAndStripe.accessValidUntil, expiry);

  const disabledManual = mapAdminUser("disabled", {
    isActive: true,
    subscriptionExpiresAt: expiry,
    manualAccess: { enabled: false, expiresAt: expiry },
  });
  assert.equal(disabledManual.manualAccessExpiresAt, null);

  const owner = mapAdminUser("owner", {
    role: "master_admin",
    isActive: true,
    ownerAccess: { enabled: true, permanent: true },
    accessProjection: { allowed: true, source: "owner", validUntil: null },
  });
  assert.deepEqual(owner.ownerAccess, { enabled: true, permanent: true });
  assert.equal(owner.accessAllowed, true);
  assert.equal(owner.entitlementSource, "owner");
  assert.equal(owner.accessValidUntil, null);
});
