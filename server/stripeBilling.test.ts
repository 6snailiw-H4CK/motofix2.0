import assert from "node:assert/strict";
import test from "node:test";
import { getAllowedOrigins, isOriginAllowed } from "./httpSecurity";
import { isBillingEventNewer, isBillingStatusActive, shouldPreserveBillingWithoutSubscription } from "./stripeBilling";

test("applies a newer Stripe event after an older event", () => {
  assert.equal(isBillingEventNewer({ created: 100, eventId: "evt_old" }, { created: 101, eventId: "evt_new" }), true);
});

test("rejects an older event after a newer event", () => {
  assert.equal(isBillingEventNewer({ created: 101, eventId: "evt_new" }, { created: 100, eventId: "evt_old" }), false);
});

test("deduplicates the same event and deterministically orders equal timestamps", () => {
  assert.equal(isBillingEventNewer({ created: 100, eventId: "evt_same" }, { created: 100, eventId: "evt_same" }), false);
  assert.equal(isBillingEventNewer({ created: 100, eventId: "evt_z" }, { created: 100, eventId: "evt_a" }), false);
  assert.equal(isBillingEventNewer({ created: 100, eventId: "evt_a" }, { created: 100, eventId: "evt_z" }), true);
});

test("simultaneous events have one deterministic winner", async () => {
  const current = { created: 100, eventId: "evt_a" };
  const candidates = await Promise.all([
    Promise.resolve(isBillingEventNewer(current, { created: 101, eventId: "evt_b" })),
    Promise.resolve(isBillingEventNewer(current, { created: 102, eventId: "evt_c" })),
  ]);
  assert.deepEqual(candidates, [true, true]);
  assert.equal(isBillingEventNewer({ created: 102, eventId: "evt_c" }, { created: 101, eventId: "evt_b" }), false);
});

test("only active subscriptions with a valid period grant access", () => {
  const now = Date.parse("2026-01-01T00:00:00.000Z");
  assert.equal(isBillingStatusActive("active", "2026-02-01T00:00:00.000Z", now), true);
  assert.equal(isBillingStatusActive("active", "2025-12-31T23:59:59.000Z", now), false);
  assert.equal(isBillingStatusActive("trialing", null, now), true);
});

test("failed, incomplete and canceled subscription states never grant access", () => {
  const blockedStatuses = ["past_due", "unpaid", "canceled", "incomplete", "incomplete_expired"];
  for (const status of blockedStatuses) {
    assert.equal(isBillingStatusActive(status, "2099-01-01T00:00:00.000Z"), false, status);
  }
});

test("invoice.payment_failed follows the confirmed subscription state", () => {
  assert.equal(isBillingStatusActive("active", "2099-01-01T00:00:00.000Z"), true);
  assert.equal(isBillingStatusActive("past_due", "2099-01-01T00:00:00.000Z"), false);
  assert.equal(isBillingStatusActive("unpaid", "2099-01-01T00:00:00.000Z"), false);
});

test("preserves active billing when invoice.paid has no resolvable subscription", () => {
  assert.equal(shouldPreserveBillingWithoutSubscription("invoice.paid", null), true);
  assert.equal(shouldPreserveBillingWithoutSubscription("invoice.paid", undefined), true);
  assert.equal(shouldPreserveBillingWithoutSubscription("invoice.paid", { id: "sub_active" }), false);
});

test("preserves billing when invoice.payment_failed has no resolvable subscription", () => {
  assert.equal(shouldPreserveBillingWithoutSubscription("invoice.payment_failed", null), true);
});

test("subscription events remain the source of truth around invoice events", () => {
  assert.equal(shouldPreserveBillingWithoutSubscription("customer.subscription.created", null), false);
  assert.equal(isBillingStatusActive("active", "2099-01-01T00:00:00.000Z"), true);
});

test("localhost is allowed only in development environments", () => {
  const devAllowed = getAllowedOrigins("development");
  const prodAllowed = getAllowedOrigins("production");

  assert.equal(devAllowed.has("http://localhost:3001"), true);
  assert.equal(prodAllowed.has("http://localhost:3001"), false);
  assert.equal(prodAllowed.has("http://127.0.0.1:3001"), false);
});

test("production rejects unconfigured origins and accepts only explicit configuration", () => {
  const originalEnv = process.env.APP_URL;
  process.env.APP_URL = "https://app.motofix.com";
  process.env.FRONTEND_URL = "https://app.motofix.com";
  process.env.CORS_ORIGINS = "https://admin.motofix.com";

  try {
    const prodAllowed = getAllowedOrigins("production");
    assert.equal(prodAllowed.has("https://app.motofix.com"), true);
    assert.equal(prodAllowed.has("https://admin.motofix.com"), true);
    assert.equal(prodAllowed.has("http://localhost:3001"), false);
    assert.equal(isOriginAllowed({ headers: {}, path: "/api/test", method: "GET" } as any, "https://admin.motofix.com", "production"), true);
    assert.equal(isOriginAllowed({ headers: {}, path: "/api/test", method: "GET" } as any, "http://localhost:3001", "production"), false);
  } finally {
    if (originalEnv === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = originalEnv;
  }
});