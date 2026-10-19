import assert from "node:assert/strict";
import test from "node:test";
import type { DecodedIdToken } from "firebase-admin/auth";
import { Timestamp } from "firebase-admin/firestore";
import { calculateApplicationAccess, canAccessApplication } from "./accountAccess";
import { MOTOFIX_OWNER_UID } from "./ownerIdentity";

const decoded = (claims: Record<string, unknown> = {}) => ({
  uid: "uid-1",
  ...claims,
} as DecodedIdToken);

const baseProfile = {
  role: "user",
  isActive: true,
};
const ownerUid = MOTOFIX_OWNER_UID;
const ownerTestNow = Date.parse("2026-10-01T00:00:00.000Z");
const manualGrant = (expiresAt: string) => ({
  manualAccess: { enabled: true, expiresAt },
  accessProjection: {
    allowed: true,
    source: "manual" as const,
    validUntil: Timestamp.fromDate(new Date(expiresAt)),
    evaluatedAt: Timestamp.fromDate(new Date("2026-10-01T00:00:00.000Z")),
    policyVersion: "access-v1",
    reason: "manual_entitlement" as const,
  },
});

test("an active Stripe subscription alone does not grant access", () => {
  const result = canAccessApplication(decoded(), {
    ...baseProfile,
    billing: { status: "active", currentPeriodEnd: "2026-11-01T00:00:00.000Z" },
  }, Date.parse("2026-10-01T00:00:00.000Z"));

  assert.equal(result.allowed, false);
  assert.equal(result.reason, "manual_access_required");
});

test("missing authentication or profile is denied", () => {
  assert.equal(canAccessApplication(null, baseProfile).allowed, false);
  assert.equal(canAccessApplication(decoded(), null).allowed, false);
});

test("an inactive account is denied even with an active subscription", () => {
  const result = canAccessApplication(decoded(), {
    ...baseProfile,
    isActive: false,
    billing: { status: "active", currentPeriodEnd: "2026-11-01T00:00:00.000Z" },
  });

  assert.equal(result.allowed, false);
  assert.equal(result.reason, "account_inactive");
});

test("Stripe status and period do not grant access", () => {
  const now = Date.parse("2026-10-01T00:00:00.000Z");
  assert.equal(canAccessApplication(decoded(), {
    ...baseProfile,
    billing: { status: "trialing" },
  }, now).allowed, false);
  assert.equal(canAccessApplication(decoded(), {
    ...baseProfile,
    billing: { status: "trialing", currentPeriodEnd: "2026-11-01T00:00:00.000Z" },
  }, now).allowed, false);
  assert.equal(canAccessApplication(decoded(), {
    ...baseProfile,
    billing: { status: "active", currentPeriodEnd: "2026-09-30T00:00:00.000Z" },
  }, now).allowed, false);
});

test("past_due, unpaid, canceled, incomplete, expired and paused states are denied", () => {
  const deniedStatuses = ["past_due", "unpaid", "canceled", "incomplete", "incomplete_expired", "paused"];
  for (const status of deniedStatuses) {
    const result = canAccessApplication(decoded(), {
      ...baseProfile,
      billing: { status, currentPeriodEnd: "2099-01-01T00:00:00.000Z" },
    });
    assert.equal(result.allowed, false, status);
  }
});

test("admin roles and Stripe billing do not grant operational access without manual entitlement", () => {
  assert.equal(canAccessApplication(decoded({ admin: true }), {
    role: "admin",
    isActive: true,
    billing: { status: "canceled" },
  }).allowed, false);
  assert.equal(canAccessApplication(decoded({ admin: true }), {
    role: "master_admin",
    isActive: true,
    billing: { status: "canceled" },
  }).allowed, false);
  assert.equal(canAccessApplication(decoded({ master_admin: true }), {
    role: "master_admin",
    isActive: true,
  }).allowed, false);
  assert.equal(canAccessApplication(decoded({ master_admin: true }), {
    role: "master_admin",
    isActive: false,
  }).allowed, false);
});

test("explicit owner entitlement permanently allows an active master_admin", () => {
  const profile = {
    role: "master_admin",
    isActive: true,
    ownerAccess: { enabled: true, permanent: true },
    subscriptionExpiresAt: "2026-10-08T00:00:00.000Z",
  };
  const projection = calculateApplicationAccess(profile, ownerTestNow, ownerUid, ownerUid);
  const decision = canAccessApplication(decoded({ uid: ownerUid }), profile, ownerTestNow, ownerUid);

  assert.equal(projection.allowed, true);
  assert.equal(projection.source, "owner");
  assert.equal(projection.validUntil, null);
  assert.equal(projection.reason, "owner_entitlement");
  assert.equal(decision.allowed, true);
  assert.equal(decision.entitlementSource, "owner");
  assert.equal(decision.expiresAt, null);
});

test("owner entitlement cannot override an inactive profile", () => {
  const projection = calculateApplicationAccess({
    role: "master_admin",
    isActive: false,
    ownerAccess: { enabled: true, permanent: true },
  }, ownerTestNow, ownerUid, ownerUid);
  assert.equal(projection.allowed, false);
  assert.equal(projection.source, "none");
  assert.equal(projection.reason, "account_inactive");
});

test("another master_admin without explicit owner entitlement remains denied", () => {
  const projection = calculateApplicationAccess({
    role: "master_admin",
    isActive: true,
  }, ownerTestNow);
  assert.equal(projection.allowed, false);
  assert.equal(projection.reason, "manual_access_required");
});

test("owner entitlement requires master_admin role and ignores billing and legacy expiry", () => {
  const regularUser = calculateApplicationAccess({
    role: "user",
    isActive: true,
    ownerAccess: { enabled: true, permanent: true },
    billing: { status: "canceled" },
    subscriptionExpiresAt: "2099-01-01T00:00:00.000Z",
  }, ownerTestNow);
  assert.equal(regularUser.allowed, false);
  assert.equal(regularUser.source, "none");

  const ownerWithoutStripe = calculateApplicationAccess({
    role: "master_admin",
    isActive: true,
    ownerAccess: { enabled: true, permanent: true },
    billing: null,
  }, ownerTestNow, ownerUid, ownerUid);
  assert.equal(ownerWithoutStripe.allowed, true);
  assert.equal(ownerWithoutStripe.source, "owner");
  assert.equal(ownerWithoutStripe.validUntil, null);
});

test("owner entitlement is denied when the authenticated UID differs from the designated owner", () => {
  const profile = {
    role: "master_admin",
    isActive: true,
    ownerAccess: { enabled: true, permanent: true },
  };
  const projection = calculateApplicationAccess(profile, ownerTestNow, "another-master", ownerUid);
  const decision = canAccessApplication(decoded({ uid: "another-master" }), profile, ownerTestNow, "configured-owner");
  assert.equal(projection.allowed, false);
  assert.equal(decision.allowed, false);
});

test("owner entitlement remains valid when no Firestore owner UID is configured", () => {
  const profile = {
    role: "master_admin",
    isActive: true,
    ownerAccess: { enabled: true, permanent: true },
  };
  assert.equal(calculateApplicationAccess(profile, ownerTestNow, ownerUid, null).allowed, true);
  assert.equal(canAccessApplication(decoded({ uid: ownerUid }), profile, ownerTestNow, null).allowed, true);
});

test("owner access enabled without explicit permanent marker does not grant access", () => {
  const projection = calculateApplicationAccess({
    role: "master_admin",
    isActive: true,
    ownerAccess: { enabled: true },
  }, ownerTestNow);
  assert.equal(projection.allowed, false);
  assert.equal(projection.source, "none");
});

test("admin roles can access operational resources with valid manual entitlement only", () => {
  const manual = canAccessApplication(decoded({ admin: true }), {
    role: "admin",
    isActive: true,
    ...manualGrant("2026-11-01T00:00:00.000Z"),
  }, Date.parse("2026-10-01T00:00:00.000Z"));
  assert.equal(manual.allowed, true);
  assert.equal(manual.entitlementSource, "manual");

  const stripe = canAccessApplication(decoded({ master_admin: true }), {
    role: "master_admin",
    isActive: true,
    billing: { status: "active", currentPeriodEnd: "2026-11-01T00:00:00.000Z" },
  }, Date.parse("2026-10-01T00:00:00.000Z"));
  assert.equal(stripe.allowed, false);
  assert.equal(stripe.entitlementSource, "none");
});

test("manual access grants access when the canonical field is still valid", () => {
  const result = canAccessApplication(decoded(), {
    ...baseProfile,
    ...manualGrant("2026-11-01T00:00:00.000Z"),
  }, Date.parse("2026-10-01T00:00:00.000Z"));

  assert.equal(result.allowed, true);
  assert.equal(result.reason, "manual_entitlement");
  assert.equal(result.entitlementSource, "manual");
});

test("a valid manual grant takes precedence over inactive Stripe billing", () => {
  const result = canAccessApplication(decoded(), {
    ...baseProfile,
    ...manualGrant("2026-11-01T00:00:00.000Z"),
    billing: { status: "canceled", currentPeriodEnd: "2026-09-01T00:00:00.000Z" },
  }, Date.parse("2026-10-01T00:00:00.000Z"));

  assert.equal(result.allowed, true);
  assert.equal(result.reason, "manual_entitlement");
  assert.equal(result.entitlementSource, "manual");
  assert.equal(result.status, "active");
});

test("an explicit manual grant can override Stripe without an active subscription period", () => {
  const result = canAccessApplication(decoded(), {
    ...baseProfile,
    ...manualGrant("2026-11-01T00:00:00.000Z"),
    billing: { status: "past_due" },
  }, Date.parse("2026-10-01T00:00:00.000Z"));

  assert.equal(result.allowed, true);
  assert.equal(result.entitlementSource, "manual");
});

test("expired manual access never falls back to a valid Stripe subscription", () => {
  const now = Date.parse("2026-10-01T00:00:00.000Z");
  const expiredManualAccess = { enabled: true, expiresAt: "2026-09-30T00:00:00.000Z" };

  const canceled = calculateApplicationAccess({
    ...baseProfile,
    manualAccess: expiredManualAccess,
    billing: { status: "canceled" },
  }, now);
  assert.equal(canceled.allowed, false);
  assert.equal(canceled.source, "none");

  const activeStripe = calculateApplicationAccess({
    ...baseProfile,
    manualAccess: expiredManualAccess,
    billing: { status: "active", currentPeriodEnd: "2026-11-01T00:00:00.000Z" },
  }, now);
  assert.equal(activeStripe.allowed, false);
  assert.equal(activeStripe.source, "none");
});

test("manual entitlement without a matching Firestore projection is denied", () => {
  const result = canAccessApplication(decoded(), {
    ...baseProfile,
    manualAccess: { enabled: true, expiresAt: "2026-11-01T00:00:00.000Z" },
  }, Date.parse("2026-10-01T00:00:00.000Z"));
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "manual_access_required");
});

test("a manual grant never bypasses an administratively blocked account", () => {
  const result = canAccessApplication(decoded(), {
    ...baseProfile,
    isActive: false,
    ...manualGrant("2026-11-01T00:00:00.000Z"),
    billing: { status: "active", currentPeriodEnd: "2026-12-01T00:00:00.000Z" },
  });

  assert.equal(result.allowed, false);
  assert.equal(result.reason, "account_inactive");
  assert.equal(result.entitlementSource, "none");
});

test("legacy subscriptionExpiresAt is never treated as access authority", () => {
  const futureLegacyOnly = canAccessApplication(decoded(), {
    ...baseProfile,
    subscriptionExpiresAt: "2026-11-01T00:00:00.000Z",
  }, Date.parse("2026-10-01T00:00:00.000Z"));
  assert.equal(futureLegacyOnly.allowed, false);
  assert.equal(futureLegacyOnly.entitlementSource, "none");
  assert.equal(futureLegacyOnly.reason, "manual_access_required");

  const futureLegacyWithDeniedProjection = canAccessApplication(decoded(), {
    ...baseProfile,
    subscriptionExpiresAt: "2026-11-01T00:00:00.000Z",
    accessProjection: {
      allowed: false,
      source: "none",
      validUntil: null,
      evaluatedAt: Timestamp.fromDate(new Date("2026-10-01T00:00:00.000Z")),
      policyVersion: "access-v1",
      reason: "manual_access_required",
    },
  }, Date.parse("2026-10-01T00:00:00.000Z"));
  assert.equal(futureLegacyWithDeniedProjection.allowed, false);

  const legacyExpiredWithManualAndAllowedProjection = canAccessApplication(decoded(), {
    ...baseProfile,
    subscriptionExpiresAt: "2026-09-01T00:00:00.000Z",
    manualAccess: { enabled: true, expiresAt: "2026-11-01T00:00:00.000Z" },
    accessProjection: {
      allowed: true,
      source: "manual",
      validUntil: Timestamp.fromDate(new Date("2026-11-01T00:00:00.000Z")),
      evaluatedAt: Timestamp.fromDate(new Date("2026-10-01T00:00:00.000Z")),
      policyVersion: "access-v1",
      reason: "manual_entitlement",
    },
  }, Date.parse("2026-10-01T00:00:00.000Z"));
  assert.equal(legacyExpiredWithManualAndAllowedProjection.allowed, true);
  assert.equal(legacyExpiredWithManualAndAllowedProjection.entitlementSource, "manual");

  const legacyExpiredWithActiveStripe = canAccessApplication(decoded(), {
    ...baseProfile,
    subscriptionExpiresAt: "2026-09-01T00:00:00.000Z",
    billing: { status: "active", currentPeriodEnd: "2026-11-01T00:00:00.000Z" },
    accessProjection: {
      allowed: true,
      source: "stripe",
      validUntil: Timestamp.fromDate(new Date("2026-11-01T00:00:00.000Z")),
      evaluatedAt: Timestamp.fromDate(new Date("2026-10-01T00:00:00.000Z")),
      policyVersion: "access-v1",
      reason: "manual_access_required",
    },
  }, Date.parse("2026-10-01T00:00:00.000Z"));
  assert.equal(legacyExpiredWithActiveStripe.allowed, false);
  assert.equal(legacyExpiredWithActiveStripe.entitlementSource, "none");

  const blockedLegacyFuture = canAccessApplication(decoded(), {
    ...baseProfile,
    isActive: false,
    subscriptionExpiresAt: "2026-11-01T00:00:00.000Z",
  }, Date.parse("2026-10-01T00:00:00.000Z"));
  assert.equal(blockedLegacyFuture.allowed, false);
  assert.equal(blockedLegacyFuture.expiresAt, null);
});
