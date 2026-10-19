import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import express from "express";
import type Stripe from "stripe";
import type { Firestore } from "firebase-admin/firestore";
import { getAllowedOrigins, isOriginAllowed } from "./httpSecurity";
import { MOTOFIX_OWNER_UID } from "./ownerIdentity";
import { buildCheckoutIdempotencyKey, canRequestSubscriptionCancellation, clearCancellationRequestLock, getLegacySubscriptionPlan, getStripePlanPrices, getSubscriptionPeriod, isBillingEventNewer, isBillingStatusActive, isCompleteSubscriptionPayload, isUserAlreadySubscribedForCheckout, mergeBillingFields, registerStripeBillingRoutes, shouldPreserveBillingWithoutSubscription, STRIPE_ACCESS_POLICY, writeBilling } from "./stripeBilling";

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

test("active and trialing subscriptions require a valid future period to grant access", () => {
  const now = Date.parse("2026-01-01T00:00:00.000Z");
  assert.equal(isBillingStatusActive("active", "2026-02-01T00:00:00.000Z", now), true);
  assert.equal(isBillingStatusActive("active", "2025-12-31T23:59:59.000Z", now), false);
  assert.equal(isBillingStatusActive("trialing", "2026-02-01T00:00:00.000Z", now), true);
  assert.equal(isBillingStatusActive("trialing", null, now), false);
  assert.equal(isBillingStatusActive("trialing", "2025-12-31T23:59:59.000Z", now), false);
});

test("failed, incomplete and canceled subscription states never grant access", () => {
  const blockedStatuses = ["past_due", "unpaid", "canceled", "incomplete", "incomplete_expired", "paused"];
  for (const status of blockedStatuses) {
    assert.equal(isBillingStatusActive(status, "2099-01-01T00:00:00.000Z"), false, status);
  }
  assert.equal(STRIPE_ACCESS_POLICY.paused, "deny");
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

test("incomplete failed subscriptions can update access to the blocked state without a period end", () => {
  for (const status of ["past_due", "unpaid", "canceled", "incomplete", "incomplete_expired", "paused"]) {
    assert.equal(shouldPreserveBillingWithoutSubscription("customer.subscription.updated", { status }), false, status);
    assert.equal(isBillingStatusActive(status, null), false, status);
  }
});

test("subscription events remain the source of truth around invoice events", () => {
  assert.equal(shouldPreserveBillingWithoutSubscription("customer.subscription.created", null), true);
  assert.equal(isBillingStatusActive("active", "2099-01-01T00:00:00.000Z"), true);
});

test("legacy Stripe lifecycle events cannot alter the designated owner's manual projection", async () => {
  const ownerUid = MOTOFIX_OWNER_UID;
  const profile = {
    uid: ownerUid,
    role: "master_admin",
    isActive: true,
    ownerAccess: { enabled: true, permanent: true },
    billing: {},
  };
  let storedProfile: Record<string, unknown> = { ...profile };
  const billingEvents = new Map<string, Record<string, unknown>>();
  const userRef = {
    id: ownerUid,
    collection: () => ({
      doc: (id: string) => ({ id, path: `billing_events/${id}` }),
    }),
  };
  const ownerConfigRef = { collection: "system", id: "access_config" };
  type TestSnapshot = {
    exists: boolean;
    data: () => Record<string, unknown>;
    get: (key: string) => unknown;
  };
  type TestTransaction = {
    get: (ref: typeof userRef | typeof ownerConfigRef) => Promise<TestSnapshot>;
    set: (ref: typeof userRef | { path: string }, data: Record<string, unknown>) => void;
  };
  const db = {
    collection: (name: string) => ({
      doc: () => name === "users"
        ? userRef
        : name === "system"
          ? ownerConfigRef
          : { id: "event" },
    }),
    runTransaction: async (callback: (transaction: TestTransaction) => Promise<unknown>) => {
      return callback({
        get: async (ref) => ref === ownerConfigRef
          ? {
            exists: true,
            data: () => ({ ownerUid }),
            get: (key: string) => key === "ownerUid" ? ownerUid : undefined,
          }
          : {
            exists: true,
            data: () => storedProfile,
            get: (key: string) => storedProfile[key],
          },
        set: (ref, data) => {
          if ("path" in ref) billingEvents.set(ref.path, data);
          else storedProfile = { ...storedProfile, ...data };
        },
      });
    },
  } as unknown as Firestore;

  const lifecycle = [
    { eventType: "checkout.session.completed", status: "active" },
    { eventType: "customer.subscription.updated", status: "active" },
    { eventType: "invoice.payment_failed", status: "past_due" },
    { eventType: "customer.subscription.updated", status: "past_due" },
    { eventType: "customer.subscription.deleted", status: "canceled" },
    { eventType: "customer.subscription.updated", status: "active" },
  ];

  for (const [index, event] of lifecycle.entries()) {
      await writeBilling(db, ownerUid, {
        customerId: "cus_owner",
        subscriptionId: "sub_owner",
        status: event.status,
        planId: "monthly",
        end: new Date(Date.now() + 86_400_000 + index * 1000).toISOString(),
        eventId: `evt-owner-${index}`,
        eventType: event.eventType,
        eventCreated: 1_800_000_000 + index,
      });
      const projection = storedProfile.accessProjection as Record<string, unknown>;
      assert.deepEqual(storedProfile.ownerAccess, { enabled: true, permanent: true }, event.eventType);
      assert.equal(projection.allowed, true, event.eventType);
      assert.equal(projection.source, "owner", event.eventType);
      assert.equal(projection.validUntil, null, event.eventType);
  }

    storedProfile = { ...storedProfile, isActive: false };
    await writeBilling(db, ownerUid, {
      customerId: "cus_owner",
      subscriptionId: "sub_owner",
      status: "active",
      end: new Date(Date.now() + 86_400_000).toISOString(),
      eventId: "evt-owner-inactive",
      eventType: "customer.subscription.updated",
      eventCreated: 1_800_000_100,
    });
  const inactiveProjection = storedProfile.accessProjection as Record<string, unknown>;
  assert.equal(inactiveProjection.allowed, false);
  assert.equal(inactiveProjection.source, "none");
  assert.equal(storedProfile.isActive, false);
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
      retrieve: async () => { throw Object.assign(new Error("missing"), { code: "resource_missing" }); },
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

test("checks all customer subscriptions before allowing a new Checkout", async () => {
  const stripe = {
    subscriptions: {
      retrieve: async () => ({ status: "canceled" }),
      list: async () => ({ data: [{ status: "canceled" }, { status: "active" }] }),
    },
  } as any;

  assert.equal(await isUserAlreadySubscribedForCheckout(stripe, {
    stripeCustomerId: "cus_123",
    stripeSubscriptionId: "sub_canceled",
  }), true);
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

  test("blocks a second checkout while Stripe confirms a past_due subscription", async () => {
    const stripe = {
      subscriptions: {
        retrieve: async () => ({ status: "past_due" }),
        list: async () => ({ data: [{ status: "past_due" }] }),
      },
    } as any;

    assert.equal(await isUserAlreadySubscribedForCheckout(stripe, {
      status: "past_due",
      stripeCustomerId: "cus_123",
      stripeSubscriptionId: "sub_past_due",
    }), true);
  });

  test("paused and incomplete subscriptions prevent duplicate Checkout creation", async () => {
    for (const status of ["paused", "incomplete"]) {
      const stripe = {
        subscriptions: {
          retrieve: async () => ({ status }),
          list: async () => ({ data: [{ status }] }),
        },
      } as any;
      assert.equal(await isUserAlreadySubscribedForCheckout(stripe, {
        status,
        stripeCustomerId: "cus_123",
        stripeSubscriptionId: `sub_${status}`,
      }), true, status);
    }
  });

  test("Stripe API failures are surfaced instead of allowing a duplicate checkout", async () => {
    const stripe = {
      subscriptions: {
        retrieve: async () => { throw new Error("Stripe API unavailable"); },
        list: async () => ({ data: [] }),
      },
    } as any;
    await assert.rejects(
      isUserAlreadySubscribedForCheckout(stripe, { stripeCustomerId: "cus_123", stripeSubscriptionId: "sub_123" }),
      /Stripe API unavailable/,
    );
  });

  assert.equal(result, true);
});

test("does not block when billing is active but Stripe subscription is missing or invalid", async () => {
  const stripe = {
    subscriptions: {
      retrieve: async () => { throw Object.assign(new Error("not found"), { code: "resource_missing" }); },
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

  test("plan catalog uses explicit environment mapping while retaining the monthly legacy fallback", () => {
    const envNames = ["STRIPE_PRICE_PLAN_BASIC", "STRIPE_PRICE_PLAN_PRO", "STRIPE_PRICE_PLAN_MONTHLY", "STRIPE_PRICE_ID"];
    const previousValues = new Map(envNames.map((name) => [name, process.env[name]]));
    for (const name of envNames) delete process.env[name];
    process.env.STRIPE_PRICE_ID = "price_legacy";
    process.env.STRIPE_PRICE_PLAN_PRO = "price_pro";

    try {
      assert.deepEqual(getStripePlanPrices(), { pro: "price_pro", monthly: "price_legacy" });
      assert.equal(getLegacySubscriptionPlan("pro"), "annual");
      assert.equal(getLegacySubscriptionPlan("monthly"), "monthly");
    } finally {
      for (const [name, value] of previousValues) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
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

test("unresolved Stripe events are fully recorded and return a retryable response", async () => {
  const event = {
    id: "evt_unresolved_test",
    type: "checkout.session.completed",
    created: 1_800_000_000,
    data: { object: { id: "cs_unresolved", object: "checkout.session", customer: "cus_unknown", subscription: null, metadata: {} } },
  } as Stripe.Event;
  const records = new Map<string, Record<string, unknown>>();
  type MemorySnapshot = { exists: boolean; get: (key: string) => unknown };
  type MemoryRef = {
    id: string;
    get: () => Promise<MemorySnapshot>;
    set: (data: Record<string, unknown>, options?: { merge?: boolean }) => Promise<void>;
  };
  const eventRef = (id: string): MemoryRef => ({
    id,
    get: async (): Promise<MemorySnapshot> => {
      const data = records.get(id);
      return {
        exists: !!data,
        get: (key: string) => data?.[key],
      };
    },
    set: async (data, options) => {
      records.set(id, options?.merge ? { ...records.get(id), ...data } : data);
    },
  });
  const db = {
    collection: (name: string) => ({
      doc: (id: string) => eventRef(`${name}/${id}`),
    }),
    runTransaction: async (callback: (transaction: {
      get: (ref: MemoryRef) => Promise<MemorySnapshot>;
      set: (ref: MemoryRef, data: Record<string, unknown>, options?: { merge?: boolean }) => void;
    }) => Promise<unknown>) => callback({
      get: (ref) => ref.get(),
      set: (ref, data, options) => { void ref.set(data, options); },
    }),
  } as unknown as Firestore;
  const stripe = {
    webhooks: { constructEvent: () => event },
    subscriptions: { retrieve: async () => { throw new Error("Should not be reached for unresolved UID"); } },
  } as unknown as Stripe;
  const previousSecret = process.env.STRIPE_WEBHOOK_SECRET;
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";

  const app = express();
  registerStripeBillingRoutes(app, { stripe, db, auth: null, firebaseInitialized: true });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}/api/stripe/webhook`;

  try {
    const firstResponse = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": "sig" }, body: "{}" });
    assert.equal(firstResponse.status, 500);
    const firstRecord = records.get("stripe_events/evt_unresolved_test");
    assert.equal(firstRecord?.status, "unresolved");
    assert.equal(firstRecord?.source, "stripe_webhook");
    assert.equal(firstRecord?.customerId, "cus_unknown");
    assert.equal(firstRecord?.eventType, "checkout.session.completed");
    assert.equal(firstRecord?.attemptCount, 1);
    assert.ok(firstRecord?.receivedAt);
    assert.ok(firstRecord?.processedAt);
    assert.equal(typeof firstRecord?.payloadHash, "string");

    const retryResponse = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": "sig" }, body: "{}" });
    assert.equal(retryResponse.status, 500);
    assert.equal(records.get("stripe_events/evt_unresolved_test")?.attemptCount, 2);

    records.set("stripe_events/evt_unresolved_test", {
      ...records.get("stripe_events/evt_unresolved_test"),
      status: "processed",
    });
    const duplicateResponse = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": "sig" }, body: "{}" });
    assert.equal(duplicateResponse.status, 200);
    assert.equal(records.get("stripe_events/evt_unresolved_test")?.attemptCount, 2);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (previousSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = previousSecret;
  }
});

test("legacy Stripe webhook cannot grant access after manual expiry", async () => {
  const users = new Map<string, Record<string, unknown>>();
  const records = new Map<string, Record<string, unknown>>();
  const mergeData = (current: Record<string, unknown> = {}, incoming: Record<string, unknown>) => {
    const merged = { ...current };
    for (const [key, value] of Object.entries(incoming)) {
      const existingValue = merged[key];
      if (value && typeof value === "object" && !Array.isArray(value)
        && existingValue && typeof existingValue === "object" && !Array.isArray(existingValue)) {
        merged[key] = { ...existingValue, ...value };
      } else {
        merged[key] = value;
      }
    }
    return merged;
  };
  const makeSnapshot = (path: string) => {
    const data = path.startsWith("users/") ? users.get(path.slice("users/".length)) : records.get(path);
    return {
      exists: !!data,
      data: () => data,
      get: (field: string) => data?.[field],
    };
  };
  const makeRef = (path: string) => ({
    id: path.split("/").at(-1),
    get: async () => makeSnapshot(path),
    set: async (data: Record<string, unknown>, options?: { merge?: boolean }) => {
      const store = path.startsWith("users/") ? users : records;
      const key = path.startsWith("users/") ? path.slice("users/".length) : path;
      store.set(key, options?.merge ? mergeData(store.get(key), data) : data);
    },
    collection: (name: string) => ({
      doc: (id: string) => makeRef(`${path}/${name}/${id}`),
    }),
  });
  const db = {
    collection: (name: string) => ({
      doc: (id: string) => makeRef(`${name}/${id}`),
    }),
    runTransaction: async (callback: (transaction: {
      get: (ref: ReturnType<typeof makeRef>) => Promise<ReturnType<typeof makeSnapshot>>;
      set: (ref: ReturnType<typeof makeRef>, data: Record<string, unknown>, options?: { merge?: boolean }) => void;
    }) => Promise<unknown>) => callback({
      get: (ref) => ref.get(),
      set: (ref, data, options) => { void ref.set(data, options); },
    }),
  } as unknown as Firestore;

  const scenarios = [
    { name: "manual-canceled", status: "canceled", manualExpiresAt: Date.now() + 60_000, isActive: true, allowed: true, source: "manual" },
    { name: "manual-past-due", status: "past_due", manualExpiresAt: Date.now() + 60_000, isActive: true, allowed: true, source: "manual" },
    { name: "expired-manual-canceled", status: "canceled", manualExpiresAt: Date.now() - 60_000, isActive: true, allowed: false, source: "none" },
    { name: "expired-manual-active", status: "active", manualExpiresAt: Date.now() - 60_000, isActive: true, allowed: false, source: "none" },
    { name: "active-account-canceled", status: "canceled", manualExpiresAt: null, isActive: true, allowed: false, source: "none" },
    { name: "blocked-account-active", status: "active", manualExpiresAt: null, isActive: false, allowed: false, source: "none" },
  ] as const;
  const subscriptions = new Map<string, Record<string, unknown>>();
  for (const scenario of scenarios) {
    const uid = `webhook-${scenario.name}`;
    const customerId = `cus-${scenario.name}`;
    const subscriptionId = `sub-${scenario.name}`;
    const manualAccess = scenario.manualExpiresAt === null
      ? undefined
      : { enabled: true, expiresAt: new Date(scenario.manualExpiresAt).toISOString() };
    users.set(uid, {
      uid,
      role: "user",
      isActive: scenario.isActive,
      ...(manualAccess ? { manualAccess } : {}),
      billing: { status: "active", stripeCustomerId: customerId, stripeSubscriptionId: subscriptionId },
    });
    subscriptions.set(subscriptionId, {
      id: subscriptionId,
      object: "subscription",
      customer: customerId,
      status: scenario.status,
      metadata: { firebaseUid: uid },
      items: { data: [{ current_period_start: Math.floor(Date.now() / 1000), current_period_end: Math.floor(Date.now() / 1000) + 3600 }] },
    });
  }

  const currentEvent = { value: null as unknown };
  const stripe = {
    webhooks: { constructEvent: () => currentEvent.value },
    subscriptions: { retrieve: async (id: string) => subscriptions.get(id) },
  } as unknown as Stripe;
  const previousSecret = process.env.STRIPE_WEBHOOK_SECRET;
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  const app = express();
  registerStripeBillingRoutes(app, { stripe, db, auth: null, firebaseInitialized: true });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  try {
    for (const [index, scenario] of scenarios.entries()) {
      const uid = `webhook-${scenario.name}`;
      const customerId = `cus-${scenario.name}`;
      const subscriptionId = `sub-${scenario.name}`;
      const eventId = `evt-${scenario.name}`;
      currentEvent.value = {
        id: eventId,
        type: "customer.subscription.updated",
        created: Math.floor(Date.now() / 1000) + index + 1,
        data: { object: subscriptions.get(subscriptionId) },
      };
      const response = await fetch(`http://127.0.0.1:${address.port}/api/stripe/webhook`, {
        method: "POST",
        headers: { "content-type": "application/json", "stripe-signature": "sig" },
        body: "{}",
      });
      assert.equal(response.status, 200, scenario.name);

      const profile = users.get(uid)!;
      const projection = profile.accessProjection as Record<string, unknown>;
      assert.equal(profile.isActive, scenario.isActive, `${scenario.name}: isActive changed`);
      assert.equal(projection.allowed, scenario.allowed, `${scenario.name}: projection allowed`);
      assert.equal(projection.source, scenario.source, `${scenario.name}: projection source`);
      if (scenario.manualExpiresAt !== null) {
        assert.deepEqual(profile.manualAccess, {
          enabled: true,
          expiresAt: new Date(scenario.manualExpiresAt).toISOString(),
        }, `${scenario.name}: manualAccess changed`);
      }
    }
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (previousSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = previousSecret;
  }
});