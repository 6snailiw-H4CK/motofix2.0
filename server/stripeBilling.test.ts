import assert from "node:assert/strict";
import test from "node:test";
import { getAllowedOrigins, isOriginAllowed } from "./httpSecurity";
import { buildCheckoutIdempotencyKey, canRequestSubscriptionCancellation, clearCancellationRequestLock, getSubscriptionPeriod, isBillingEventNewer, isBillingStatusActive, isCompleteSubscriptionPayload, isUserAlreadySubscribedForCheckout, mergeBillingFields, shouldPreserveBillingWithoutSubscription } from "./stripeBilling";

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
  assert.equal(shouldPreserveBillingWithoutSubscription("invoice.paid", { status: "active", current_period_end: 1790985600 }), false);
  assert.equal(shouldPreserveBillingWithoutSubscription("invoice.paid", { status: "active" }), true);
});

test("preserves billing when invoice.payment_failed has no resolvable subscription", () => {
  assert.equal(shouldPreserveBillingWithoutSubscription("invoice.payment_failed", null), true);
});

test("subscription events remain the source of truth around invoice events", () => {
  assert.equal(shouldPreserveBillingWithoutSubscription("customer.subscription.created", null), true);
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

test("allows a user without any active subscription to start checkout", async () => {
  const stripe = {
    subscriptions: {
      retrieve: async () => { throw new Error("missing"); },
      list: async () => ({ data: [] }),
    },
  } as any;

  const result = await isUserAlreadySubscribedForCheckout(stripe, {
    status: "inactive",
    currentPeriodEnd: "2025-01-01T00:00:00.000Z",
    stripeCustomerId: "cus_123",
    stripeSubscriptionId: "sub_123",
  });

  assert.equal(result, false);
});

test("blocks checkout for a user whose billing is active and Stripe subscription is valid", async () => {
  const stripe = {
    subscriptions: {
      retrieve: async () => ({ status: "active" }),
      list: async () => ({ data: [{ status: "active" }] }),
    },
  } as any;

  const result = await isUserAlreadySubscribedForCheckout(stripe, {
    status: "active",
    currentPeriodEnd: "2099-01-01T00:00:00.000Z",
    stripeCustomerId: "cus_123",
    stripeSubscriptionId: "sub_123",
  });

  assert.equal(result, true);
});

test("blocks checkout for a user whose billing is trialing and Stripe subscription is valid", async () => {
  const stripe = {
    subscriptions: {
      retrieve: async () => ({ status: "trialing" }),
      list: async () => ({ data: [{ status: "trialing" }] }),
    },
  } as any;

  const result = await isUserAlreadySubscribedForCheckout(stripe, {
    status: "trialing",
    currentPeriodEnd: null,
    stripeCustomerId: "cus_123",
    stripeSubscriptionId: "sub_123",
  });

  assert.equal(result, true);
});

test("does not block when billing is active but Stripe subscription is missing or invalid", async () => {
  const stripe = {
    subscriptions: {
      retrieve: async () => { throw new Error("not found"); },
      list: async () => ({ data: [] }),
    },
  } as any;

  const result = await isUserAlreadySubscribedForCheckout(stripe, {
    status: "active",
    currentPeriodEnd: "2099-01-01T00:00:00.000Z",
    stripeCustomerId: "cus_123",
    stripeSubscriptionId: "sub_missing",
  });

  assert.equal(result, false);
});

test("does not block when local billing is active but Stripe confirms the subscription is canceled or absent", async () => {
  const stripe = {
    subscriptions: {
      retrieve: async () => ({ status: "canceled" }),
      list: async () => ({ data: [{ status: "canceled" }] }),
    },
  } as any;

  const result = await isUserAlreadySubscribedForCheckout(stripe, {
    status: "active",
    currentPeriodEnd: "2099-01-01T00:00:00.000Z",
    stripeCustomerId: "cus_123",
    stripeSubscriptionId: "sub_canceled",
  });

  assert.equal(result, false);
});

test("reuses the same deterministic idempotency key for the same checkout intent", () => {
  const keyA = buildCheckoutIdempotencyKey("uid-123", "monthly", {
    stripeCustomerId: "cus_123",
    stripeSubscriptionId: "sub_123",
    stripeCheckoutSessionId: "cs_abc",
    lastStripeEventCreated: 1700000000,
  });

  const keyB = buildCheckoutIdempotencyKey("uid-123", "monthly", {
    stripeCustomerId: "cus_123",
    stripeSubscriptionId: "sub_123",
    stripeCheckoutSessionId: "cs_abc",
    lastStripeEventCreated: 1700000000,
  });

  const keyC = buildCheckoutIdempotencyKey("uid-123", "pro", {
    stripeCustomerId: "cus_123",
    stripeSubscriptionId: "sub_123",
    stripeCheckoutSessionId: "cs_abc",
    lastStripeEventCreated: 1700000000,
  });

  assert.equal(keyA, keyB);
  assert.notEqual(keyA, keyC);
});

test("allows an active user to request cancellation at period end", () => {
  assert.equal(canRequestSubscriptionCancellation({ status: "active", cancelAtPeriodEnd: false }), true);
});

test("does not repeat a cancellation already scheduled at period end", () => {
  assert.equal(canRequestSubscriptionCancellation({ status: "active", cancelAtPeriodEnd: true }), false);
  assert.equal(canRequestSubscriptionCancellation({ status: "canceled", cancelAtPeriodEnd: false }), false);
});

test("cancellation lock can be released after a missing Stripe subscription", async () => {
  let lockDeleted = false;
  await clearCancellationRequestLock({
    set: async (data: any) => {
      lockDeleted = data.billing.cancellationRequestLock !== undefined;
    },
  });
  assert.equal(lockDeleted, true);
});

test("cancellation decision does not accept an arbitrary subscription identifier", () => {
  assert.equal(canRequestSubscriptionCancellation({ status: "active", cancelAtPeriodEnd: false }), true);
});

test("concurrent checkout attempts are prevented by the guard logic", async () => {
  const stripe = {
    subscriptions: {
      retrieve: async () => ({ status: "active" }),
      list: async () => ({ data: [{ status: "active" }] }),
    },
  } as any;

  const first = await isUserAlreadySubscribedForCheckout(stripe, {
    status: "active",
    currentPeriodEnd: "2099-01-01T00:00:00.000Z",
    stripeCustomerId: "cus_123",
    stripeSubscriptionId: "sub_123",
  });
  const second = await isUserAlreadySubscribedForCheckout(stripe, {
    status: "active",
    currentPeriodEnd: "2099-01-01T00:00:00.000Z",
    stripeCustomerId: "cus_123",
    stripeSubscriptionId: "sub_123",
  });

  assert.equal(first, true);
  assert.equal(second, true);
});

test("preserves a valid period when a later event has no current_period_end", () => {
  const merged = mergeBillingFields({ status: "active", planId: "monthly", currentPeriodEnd: "2026-10-03T00:00:00.000Z", cancelAtPeriodEnd: true, stripeSubscriptionId: "sub_1" }, { status: "active", planId: null, end: null, cancelAtPeriodEnd: true });
  assert.equal(merged.currentPeriodEnd, "2026-10-03T00:00:00.000Z");
  assert.equal(merged.stripeSubscriptionId, "sub_1");
  assert.equal(merged.planId, "monthly");
});

test("preserves a valid period when current_period_end is undefined", () => {
  const merged = mergeBillingFields({ status: "active", currentPeriodEnd: "2026-10-03T00:00:00.000Z" }, { status: "active", end: undefined });
  assert.equal(merged.currentPeriodEnd, "2026-10-03T00:00:00.000Z");
});

test("does not fabricate inactive or erase valid billing for a partial subscription", () => {
  const currentBilling: Record<string, unknown> = {
    status: "active",
    currentPeriodEnd: "2026-10-03T00:00:00.000Z",
    stripeSubscriptionId: "sub_1",
    planId: "monthly",
    customField: "preserve-me",
  };
  const merged: Record<string, unknown> = mergeBillingFields(
    currentBilling,
    { status: undefined, end: null, subscriptionId: null, planId: null },
  );

  assert.equal(merged.status, "active");
  assert.equal(merged.currentPeriodEnd, "2026-10-03T00:00:00.000Z");
  assert.equal(merged.stripeSubscriptionId, "sub_1");
  assert.equal(merged.planId, "monthly");
  assert.equal(merged["customField"], "preserve-me");
});

test("updates currentPeriodEnd from a valid Stripe timestamp conversion", () => {
  const merged = mergeBillingFields({ currentPeriodEnd: "2026-09-01T00:00:00.000Z" }, { status: "active", end: "2026-10-03T00:00:00.000Z" });
  assert.equal(merged.currentPeriodEnd, "2026-10-03T00:00:00.000Z");
});

test("cancel_at_period_end does not change an active status", () => {
  const merged = mergeBillingFields({ status: "active", currentPeriodEnd: "2026-10-03T00:00:00.000Z" }, { status: "active", cancelAtPeriodEnd: true, end: "2026-10-03T00:00:00.000Z" });
  assert.equal(merged.status, "active");
  assert.equal(merged.cancelAtPeriodEnd, true);
});

test("deleted subscription can become canceled while preserving its period history", () => {
  const merged = mergeBillingFields({ status: "active", currentPeriodEnd: "2026-10-03T00:00:00.000Z" }, { status: "canceled", end: null });
  assert.equal(merged.status, "canceled");
  assert.equal(merged.currentPeriodEnd, "2026-10-03T00:00:00.000Z");
});

test("recognizes complete and incomplete Subscription payloads", () => {
  assert.equal(isCompleteSubscriptionPayload({ status: "active", current_period_end: 1790985600 }), true);
  assert.equal(isCompleteSubscriptionPayload({ status: "active", current_period_end: null }), false);
  assert.equal(isCompleteSubscriptionPayload({ status: "active" }), false);
});

test("reads the current period from the Stripe subscription item", () => {
  assert.deepEqual(getSubscriptionPeriod({
    status: "active",
    items: { data: [{ current_period_start: 1790899200, current_period_end: 1790985600 }] },
  }), { start: 1790899200, end: 1790985600 });
});