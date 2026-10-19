import assert from "node:assert/strict";
import test from "node:test";
import type { Auth } from "firebase-admin/auth";
import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { setOwnerAccess } from "./ownerAccess";

const setup = (initialProfiles: Record<string, Record<string, unknown>>, ownerConfigPresent = true) => {
  const profiles = new Map(Object.entries(initialProfiles));
  const audits = new Map<string, Record<string, unknown>>();
  let nextAuditId = 0;
  const profileRef = (id: string) => ({ collection: "users", id });
  const auditRef = () => ({ collection: "audit_events", id: `audit-${++nextAuditId}` });
  const ownerConfigRef = () => ({ collection: "system", id: "access_config" });
  const read = (ref: { collection: string; id: string }) => {
    const data = ref.collection === "users"
      ? profiles.get(ref.id)
      : ref.collection === "audit_events"
        ? audits.get(ref.id)
        : ref.collection === "system"
        ? ownerConfigPresent ? { ownerUid: "owner" } : undefined
          : undefined;
    return {
      exists: !!data,
      data: () => data,
      get: (field: string) => (data as Record<string, unknown> | undefined)?.[field],
    };
  };
  const db = {
    collection: (collection: string) => ({
      doc: (id?: string) => collection === "users"
        ? profileRef(id ?? "")
        : collection === "system"
          ? ownerConfigRef()
          : auditRef(),
    }),
    runTransaction: async (callback: (transaction: {
      get: (ref: { collection: string; id: string }) => Promise<ReturnType<typeof read>>;
      update: (ref: { collection: string; id: string }, data: Record<string, unknown>) => void;
      create: (ref: { collection: string; id: string }, data: Record<string, unknown>) => void;
    }) => Promise<void>) => callback({
      get: async (ref) => read(ref),
      update: (ref, data) => {
        const current = profiles.get(ref.id);
        if (!current) throw new Error("missing target");
        profiles.set(ref.id, { ...current, ...data });
      },
      create: (ref, data) => { audits.set(ref.id, data); },
    }),
  } as unknown as Firestore;
  const auth = {
    getUser: async () => ({ customClaims: { master_admin: true } }),
  } as unknown as Auth;
  return { db, auth, profiles, audits };
};

test("owner access grant is permanent, materializes projection, and records the actor", async () => {
  const { auth, db, profiles, audits } = setup({
    owner: {
      role: "master_admin",
      isActive: true,
      ownerAccess: { enabled: false, permanent: false },
      manualAccess: { enabled: true, expiresAt: "2036-10-05T00:43:13.757Z" },
      subscriptionExpiresAt: "2036-10-05T00:43:13.757Z",
    },
  });
  const result = await setOwnerAccess({
    auth,
    db,
    actorUid: "owner",
    targetUid: "owner",
    enabled: true,
    reason: "Proprietário autorizado do SaaS",
    now: Date.parse("2026-10-01T00:00:00.000Z"),
  });

  test("owner access grant repairs an enabled but non-permanent owner entitlement", async () => {
    const { auth, db, profiles } = setup({
      owner: {
        role: "master_admin",
        isActive: true,
        ownerAccess: { enabled: true, permanent: false },
      },
    });

    const result = await setOwnerAccess({
      auth,
      db,
      actorUid: "owner",
      targetUid: "owner",
      enabled: true,
      reason: "Repair permanent owner entitlement",
      now: Date.parse("2026-10-01T00:00:00.000Z"),
    });

    assert.deepEqual(profiles.get("owner")?.ownerAccess, { enabled: true, permanent: true });
    assert.equal((profiles.get("owner")?.accessProjection as Record<string, unknown>).source, "owner");
    assert.equal(result.projection?.validUntil, null);
  });

  const profile = profiles.get("owner")!;
  const audit = audits.get(result.auditEventId)!;
  const projection = profile.accessProjection as Record<string, unknown>;
  assert.deepEqual(profile.ownerAccess, { enabled: true, permanent: true });
  assert.deepEqual(profile.manualAccess, { enabled: false, expiresAt: null });
  assert.equal(profile.subscriptionExpiresAt, null);
  assert.equal(projection.allowed, true);
  assert.equal(projection.source, "owner");
  assert.equal(projection.validUntil, null);
  assert.ok(projection.evaluatedAt instanceof Timestamp);
  assert.equal(audit.actor, "owner");
  assert.equal(audit.action, "owner_access_granted");
  assert.deepEqual((audit.before as Record<string, unknown>).ownerAccess, { enabled: false, permanent: false });
  assert.deepEqual((audit.after as Record<string, unknown>).ownerAccess, { enabled: true, permanent: true });
  assert.deepEqual((audit.before as Record<string, unknown>).manualAccess, {
    enabled: true,
    expiresAt: "2036-10-05T00:43:13.757Z",
  });
  assert.deepEqual((audit.after as Record<string, unknown>).manualAccess, { enabled: false, expiresAt: null });
  assert.equal(
    ((audit.after as Record<string, unknown>).accessProjection as Record<string, unknown>).source,
    "owner",
  );
  assert.equal(result.projection?.validUntil, null);
});

test("owner access revocation is audited and falls back to another valid entitlement", async () => {
  const { auth, db, profiles, audits } = setup({
    master: { role: "master_admin", isActive: true },
    owner: {
      role: "master_admin",
      isActive: true,
      ownerAccess: { enabled: true, permanent: true },
      manualAccess: { enabled: true, expiresAt: "2026-11-01T00:00:00.000Z" },
    },
  });
  const result = await setOwnerAccess({
    auth,
    db,
    actorUid: "master",
    targetUid: "owner",
    enabled: false,
    reason: "Revogação autorizada",
    now: Date.parse("2026-10-01T00:00:00.000Z"),
  });

  const profile = profiles.get("owner")!;
  const audit = audits.get(result.auditEventId)!;
  assert.deepEqual(profile.ownerAccess, { enabled: false, permanent: false });
  assert.equal((profile.accessProjection as Record<string, unknown>).source, "manual");
  assert.equal(audit.actor, "master");
  assert.equal(audit.action, "owner_access_revoked");
  assert.deepEqual((audit.before as Record<string, unknown>).ownerAccess, { enabled: true, permanent: true });
  assert.deepEqual((audit.after as Record<string, unknown>).ownerAccess, { enabled: false, permanent: false });
});

test("replacing the emergency temporary grant leaves no hidden expiry after owner revocation", async () => {
  const { auth, db, profiles } = setup({
    owner: {
      role: "master_admin",
      isActive: true,
      manualAccess: { enabled: true, expiresAt: "2036-10-05T00:43:13.757Z" },
      subscriptionExpiresAt: "2036-10-05T00:43:13.757Z",
    },
  });
  await setOwnerAccess({
    auth,
    db,
    actorUid: "owner",
    targetUid: "owner",
    enabled: true,
    reason: "Replace temporary emergency access",
    now: Date.parse("2026-10-01T00:00:00.000Z"),
  });
  const revoked = await setOwnerAccess({
    auth,
    db,
    actorUid: "owner",
    targetUid: "owner",
    enabled: false,
    reason: "Test owner access revocation",
    now: Date.parse("2026-10-01T00:00:00.000Z"),
  });

  assert.deepEqual(profiles.get("owner")?.manualAccess, { enabled: false, expiresAt: null });
  assert.equal(profiles.get("owner")?.subscriptionExpiresAt, null);
  assert.equal(revoked.projection?.allowed, false);
  assert.equal(revoked.projection?.source, "none");
});

test("owner access cannot be granted to a regular or inactive account", async () => {
  for (const target of [
    { role: "user", isActive: true },
    { role: "master_admin", isActive: false },
  ]) {
    const { auth, db } = setup({
      master: { role: "master_admin", isActive: true },
      owner: target,
    });
    await assert.rejects(setOwnerAccess({
      auth,
      db,
      actorUid: "master",
      targetUid: "owner",
      enabled: true,
      reason: "owner grant test",
    }), /target_not_master_admin|inactive_target/);
  }
});

test("owner access mutation rejects actors without master_admin authority", async () => {
  const { db } = setup({
    actor: { role: "master_admin", isActive: true },
    owner: { role: "master_admin", isActive: true },
  });
  const auth = { getUser: async () => ({ customClaims: { master_admin: false } }) } as unknown as Auth;
  await assert.rejects(setOwnerAccess({
    auth,
    db,
    actorUid: "actor",
    targetUid: "owner",
    enabled: true,
    reason: "invalid actor",
  }), /actor_not_master_admin/);
});

test("owner access cannot be granted to a different master_admin", async () => {
  const { auth, db } = setup({
    master: { role: "master_admin", isActive: true },
    anotherMaster: { role: "master_admin", isActive: true },
  });
  await assert.rejects(setOwnerAccess({
    auth,
    db,
    actorUid: "master",
    targetUid: "anotherMaster",
    enabled: true,
    reason: "not the configured owner",
  }), /target_not_authorized_owner/);
});

test("owner access fails closed when no immutable owner UID is configured", async () => {
  const { auth, db } = setup({
    owner: { role: "master_admin", isActive: true },
  }, false);
  await assert.rejects(setOwnerAccess({
    auth,
    db,
    actorUid: "owner",
    targetUid: "owner",
    enabled: true,
    reason: "missing owner identity config",
  }), /owner_identity_not_configured/);
});