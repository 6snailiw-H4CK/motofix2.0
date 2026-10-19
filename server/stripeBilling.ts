import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import express from "express";
import Stripe from "stripe";
import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import type { Auth, DecodedIdToken } from "firebase-admin/auth";
import { calculateApplicationAccess } from "./accountAccess";
import { getOwnerUidInTransaction } from "./ownerIdentity";

export type PaymentRequest = Request & { paymentAuth?: DecodedIdToken };

const allowedStatuses = new Set(["active", "trialing"]);
export const STRIPE_PLAN_CATALOG = {
  basic: { priceEnv: "STRIPE_PRICE_PLAN_BASIC", legacyPriceEnv: null, legacyPlan: "monthly" },
  pro: { priceEnv: "STRIPE_PRICE_PLAN_PRO", legacyPriceEnv: null, legacyPlan: "annual" },
  monthly: { priceEnv: "STRIPE_PRICE_PLAN_MONTHLY", legacyPriceEnv: "STRIPE_PRICE_ID", legacyPlan: "monthly" },
} as const;
export const STRIPE_ACCESS_POLICY = {
  active: "period_required",
  trialing: "period_required",
  past_due: "deny",
  unpaid: "deny",
  canceled: "deny",
  incomplete: "deny",
  incomplete_expired: "deny",
  paused: "deny",
} as const;
const handledEventTypes = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
]);
const stripeStatus = (value: unknown) => typeof value === "string" && value.length > 0 ? value : null;
const iso = (seconds: unknown) => typeof seconds === "number" && Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString() : null;
const objectId = (value: unknown) => typeof value === "string" ? value : (value as { id?: string } | null)?.id ?? null;
const isValidIso = (value: unknown): value is string => typeof value === "string" && !Number.isNaN(Date.parse(value));

type UnknownRecord = Record<string, unknown>;
type SubscriptionPeriod = { start: number | null; end: number | null };
type CompleteSubscriptionPayload = UnknownRecord & { status: string };

const asRecord = (value: unknown): UnknownRecord | null => (
  typeof value === "object" && value !== null ? value as UnknownRecord : null
);

const unixTimestamp = (value: unknown) => (
  typeof value === "number" && Number.isFinite(value) ? value : null
);

const metadataValue = (value: unknown, key: string) => {
  const metadata = asRecord(asRecord(value)?.metadata);
  const metadataEntry = metadata?.[key];
  return typeof metadataEntry === "string" ? metadataEntry : null;
};
const stripeErrorCode = (error: unknown) => (
  typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : null
);

export const getSubscriptionPeriod = (subscription: unknown): SubscriptionPeriod => {
  const payload = asRecord(subscription);
  const items = asRecord(payload?.items);
  const firstItem = Array.isArray(items?.data) ? asRecord(items.data[0]) : null;
  const periodStart = firstItem && Object.prototype.hasOwnProperty.call(firstItem, "current_period_start")
    ? firstItem.current_period_start
    : payload?.current_period_start;
  const periodEnd = firstItem && Object.prototype.hasOwnProperty.call(firstItem, "current_period_end")
    ? firstItem.current_period_end
    : payload?.current_period_end;

  return {
    start: unixTimestamp(periodStart),
    end: unixTimestamp(periodEnd),
  };
};

const subscriptionCancelAtPeriodEnd = (subscription: unknown) => {
  const value = asRecord(subscription)?.cancel_at_period_end;
  return typeof value === "boolean" ? value : null;
};

export const isCompleteSubscriptionPayload = (subscription: unknown): subscription is CompleteSubscriptionPayload => {
  const value = asRecord(subscription);
  return !!value && stripeStatus(value.status) !== null && getSubscriptionPeriod(subscription).end !== null;
};

export const mergeBillingFields = (currentBilling: Record<string, unknown>, input: {
  customerId?: string | null; subscriptionId?: string | null; status?: string | null;
  planId?: string | null; start?: string | null; end?: string | null;
  cancelAtPeriodEnd?: boolean;
}) => ({
  ...currentBilling,
  ...(input.customerId !== null && input.customerId !== undefined ? { stripeCustomerId: input.customerId } : {}),
  ...(input.subscriptionId !== null && input.subscriptionId !== undefined ? { stripeSubscriptionId: input.subscriptionId } : {}),
  ...(input.status !== null && input.status !== undefined ? { status: input.status } : {}),
  ...(input.planId !== null && input.planId !== undefined ? { planId: input.planId } : {}),
  ...(isValidIso(input.start) ? { currentPeriodStart: input.start } : {}),
  ...(isValidIso(input.end) ? { currentPeriodEnd: input.end } : {}),
  ...(input.cancelAtPeriodEnd !== null && input.cancelAtPeriodEnd !== undefined ? { cancelAtPeriodEnd: input.cancelAtPeriodEnd } : {}),
});

export const isBillingEventNewer = (current: { created?: unknown; eventId?: unknown } | null | undefined, incoming: { created: number; eventId: string }) => {
  if (!current || typeof current.created !== "number") return true;
  if (incoming.created !== current.created) return incoming.created > current.created;
  return incoming.eventId > (typeof current.eventId === "string" ? current.eventId : "");
};

export const isBillingStatusActive = (status: string, currentPeriodEnd: string | null, now = Date.now()) => {
  const policy = STRIPE_ACCESS_POLICY[status as keyof typeof STRIPE_ACCESS_POLICY];
  const periodEnd = currentPeriodEnd ? Date.parse(currentPeriodEnd) : Number.NaN;
  return policy === "period_required" && Number.isFinite(periodEnd) && periodEnd > now;
};

export const canRequestSubscriptionCancellation = (billing: { status?: string | null; cancelAtPeriodEnd?: boolean }) => (
  (billing.status === "active" || billing.status === "trialing") && billing.cancelAtPeriodEnd !== true
);

export const clearCancellationRequestLock = async (userRef: { set: (data: unknown, options: { merge: boolean }) => Promise<unknown> }) => {
  await userRef.set({ billing: { cancellationRequestLock: FieldValue.delete() } }, { merge: true });
};

export const buildCheckoutIdempotencyKey = (
  uid: string,
  planId: string,
  billing: {
    stripeCustomerId?: string | null;
    stripeSubscriptionId?: string | null;
    stripeCheckoutSessionId?: string | null;
    lastStripeEventCreated?: unknown;
  },
) => {
  const seed = [
    uid,
    planId,
    billing.stripeCustomerId ?? "new-customer",
    billing.stripeSubscriptionId ?? "no-subscription",
    billing.stripeCheckoutSessionId ?? "fresh-intent",
    typeof billing.lastStripeEventCreated === "number" ? String(billing.lastStripeEventCreated) : "no-event",
  ].join(":");

  return crypto.createHash("sha256").update(seed).digest("hex");
};

export const isUserAlreadySubscribedForCheckout = async (stripe: Stripe, billing: {
  status?: string | null;
  currentPeriodEnd?: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
}) => {
  const status = typeof billing.status === "string" ? billing.status : "inactive";
  const currentPeriodEnd = typeof billing.currentPeriodEnd === "string" ? billing.currentPeriodEnd : null;
  const existingSubscriptionId = typeof billing.stripeSubscriptionId === "string" ? billing.stripeSubscriptionId : null;
  const hasStripeIdentifier = !!(existingSubscriptionId || billing.stripeCustomerId);

  if (hasStripeIdentifier) {
    let subscription: { status?: string } | null = null;
    if (existingSubscriptionId) {
      try {
        subscription = await stripe.subscriptions.retrieve(existingSubscriptionId);
      } catch (error) {
        if (stripeErrorCode(error) !== "resource_missing") throw error;
      }
    }

    const terminalStatuses = new Set(["canceled", "unpaid", "incomplete_expired"]);
    if (subscription && (!subscription.status || !terminalStatuses.has(subscription.status))) return true;

    if (billing.stripeCustomerId) {
      const list = await stripe.subscriptions.list({ customer: billing.stripeCustomerId, status: "all", limit: 50 });
      return list.data.some((item) => !terminalStatuses.has(item.status));
    }

    return false;
  }

  if (!(status === "active" || status === "trialing")) return false;
  return !!(currentPeriodEnd && new Date(currentPeriodEnd).getTime() > Date.now());
};

export const shouldPreserveBillingWithoutSubscription = (eventType: string, subscription: unknown) => (
  eventType !== "customer.subscription.deleted"
  && (
    !asRecord(subscription)
    || !stripeStatus(asRecord(subscription)?.status)
    || (asRecord(subscription)?.status === "active" && getSubscriptionPeriod(subscription).end === null)
  )
);

export const requireFirebaseAuth = (auth: Auth | null, initialized: boolean) => async (req: PaymentRequest, res: Response, next: NextFunction) => {
  if (!initialized || !auth) return res.status(503).json({ error: "Firebase Admin nao inicializado." });
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return res.status(401).json({ error: "Token Firebase ausente." });
  try {
    req.paymentAuth = await auth.verifyIdToken(token);
    return next();
  } catch {
    return res.status(401).json({ error: "Token Firebase invalido." });
  }
};

export const getStripePlanPrices = () => {
  const plans: Record<string, string> = {};
  for (const [planId, entry] of Object.entries(STRIPE_PLAN_CATALOG)) {
    const priceId = process.env[entry.priceEnv] || (entry.legacyPriceEnv ? process.env[entry.legacyPriceEnv] : undefined);
    if (priceId) plans[planId] = priceId;
  }
  return plans;
};

export const getLegacySubscriptionPlan = (planId: string | null | undefined) => (
  planId && planId in STRIPE_PLAN_CATALOG
    ? STRIPE_PLAN_CATALOG[planId as keyof typeof STRIPE_PLAN_CATALOG].legacyPlan
    : "monthly"
);

const resolveUserId = async (db: Firestore, stripe: Stripe, object: any): Promise<string | null> => {
  const metadataUid = object.metadata?.firebaseUid;
  const customerId = objectId(object.customer);
  const subscriptionId = objectId(object.subscription) || objectId(object.parent?.subscription_details?.subscription);
  let subscription: any = object.object === "subscription" ? object : null;
  if (!subscription && subscriptionId) subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const subscriptionUid = subscription?.metadata?.firebaseUid;
  const candidate = metadataUid || subscriptionUid || null;
  if (!candidate) return null;
  const user = await db.collection("users").doc(candidate).get();
  if (!user.exists) return null;
  const billing = user.get("billing") || {};
  // A customer previously bound to a different UID is a hard stop.
  if (billing.stripeCustomerId && customerId && billing.stripeCustomerId !== customerId) return null;
  if (billing.stripeSubscriptionId && subscriptionId && billing.stripeSubscriptionId !== subscriptionId) return null;
  return candidate;
};

export const writeBilling = async (db: Firestore, uid: string, input: {
  customerId: string | null; subscriptionId: string | null; sessionId?: string | null;
  status: string; planId?: string | null; start?: string | null; end?: string | null;
  cancelAtPeriodEnd?: boolean; eventId: string; eventType: string; eventCreated: number; amount?: number | null;
}) => {
  const userRef = db.collection("users").doc(uid);
  const applied = await db.runTransaction(async transaction => {
    const user = await transaction.get(userRef);
    const ownerUid = await getOwnerUidInTransaction(transaction, db);
    const currentProfile = (user.data() ?? {}) as Record<string, unknown>;
    const currentBilling = user.get("billing") || {};
    if (!isBillingEventNewer(currentBilling, { created: input.eventCreated, eventId: input.eventId })) return false;

    const mergedBilling = mergeBillingFields(currentBilling, input);
    const currentSubscription = currentProfile.subscription && typeof currentProfile.subscription === "object"
      ? currentProfile.subscription as Record<string, unknown>
      : {};
    const nextProfile = {
      ...currentProfile,
      role: typeof currentProfile.role === "string" ? currentProfile.role : undefined,
      isActive: currentProfile.isActive,
      billing: mergedBilling,
      subscription: {
        ...currentSubscription,
        status: mergedBilling.status,
        plan: getLegacySubscriptionPlan(mergedBilling.planId),
        stripeCustomerId: mergedBilling.stripeCustomerId,
        stripeSubscriptionId: mergedBilling.stripeSubscriptionId,
        currentPeriodEnd: mergedBilling.currentPeriodEnd,
      },
      manualAccess: currentProfile.manualAccess,
      ownerAccess: currentProfile.ownerAccess,
    } as Record<string, unknown>;
    const accessProjection = calculateApplicationAccess(nextProfile as any, Date.now(), uid, ownerUid);

    const billing: Record<string, unknown> = {
      ...mergedBilling,
      activationSource: "stripe",
      lastStripeEventId: input.eventId,
      lastStripeEventCreated: input.eventCreated,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (input.sessionId) billing.stripeCheckoutSessionId = input.sessionId;
    if (accessProjection.allowed && accessProjection.source === "stripe") billing.activatedAt = FieldValue.serverTimestamp();

    transaction.set(userRef, {
      billing,
      subscription: {
        status: mergedBilling.status,
        plan: getLegacySubscriptionPlan(mergedBilling.planId),
        stripeCustomerId: mergedBilling.stripeCustomerId,
        stripeSubscriptionId: mergedBilling.stripeSubscriptionId,
        currentPeriodEnd: mergedBilling.currentPeriodEnd,
      },
      subscriptionExpiresAt: mergedBilling.currentPeriodEnd,
      manualAccess: currentProfile.manualAccess ?? null,
      accessProjection: {
        allowed: accessProjection.allowed,
        source: accessProjection.source,
        validUntil: accessProjection.validUntil,
        evaluatedAt: accessProjection.evaluatedAt,
        policyVersion: accessProjection.policyVersion,
        reason: accessProjection.reason,
      },
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    transaction.set(userRef.collection("billing_events").doc(input.eventId), {
      eventId: input.eventId, type: input.eventType, eventType: input.eventType, created: input.eventCreated,
      source: "stripe_webhook",
      customerId: input.customerId, subscriptionId: input.subscriptionId,
      stripeCustomerId: input.customerId, stripeSubscriptionId: input.subscriptionId,
      planId: input.planId ?? null, amount: input.amount ?? null,
      status: input.status, processedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return true;
  });
  return applied;
};

export const registerStripeBillingRoutes = (app: any, options: { stripe: Stripe; db: Firestore; auth: Auth | null; firebaseInitialized: boolean }) => {
  const { stripe, db } = options;
  const auth = requireFirebaseAuth(options.auth, options.firebaseInitialized);
  const successUrl = process.env.STRIPE_SUCCESS_URL;
  const cancelUrl = process.env.STRIPE_CANCEL_URL;

  app.post("/api/stripe/create-checkout-session", auth, async (req: PaymentRequest, res: Response) => {
    const uid = req.paymentAuth?.uid;
    const email = req.paymentAuth?.email;
    const planId = typeof req.body?.planId === "string" ? req.body.planId : "monthly";
    const priceId = getStripePlanPrices()[planId];
    if (!uid || !email || !priceId) return res.status(400).json({ error: "Plano ou identidade do cliente invalidos." });
    if (!successUrl || !cancelUrl) return res.status(503).json({ error: "URLs do Stripe Checkout nao configuradas." });
    try {
      const userRef = db.collection("users").doc(uid);
      const userSnapshot = await userRef.get();
      const billing = userSnapshot.get("billing") || {};
      const alreadySubscribed = await isUserAlreadySubscribedForCheckout(stripe, billing);
      if (alreadySubscribed) {
        return res.status(409).json({
          error: "subscription_already_active",
          message: "Usuário já possui uma assinatura ativa.",
        });
      }

      const lockAcquired = await db.runTransaction(async transaction => {
        const current = await transaction.get(userRef);
        const latestBilling = current.get("billing") || {};
        const now = Date.now();
        const end = latestBilling.currentPeriodEnd ? new Date(latestBilling.currentPeriodEnd).getTime() : 0;
        if (allowedStatuses.has(latestBilling.status) && (latestBilling.status === "trialing" || end > now)) return false;
        if (typeof latestBilling.checkoutSessionLock === "number" && latestBilling.checkoutSessionLock > now - 5 * 60_000) return false;
        transaction.set(userRef, { billing: { checkoutSessionLock: now } }, { merge: true });
        return true;
      });
      if (!lockAcquired) return res.status(409).json({
        error: "subscription_already_active",
        message: "Usuário já possui uma assinatura ativa.",
      });
      const user = await userRef.get();
      const refreshedBilling = user.get("billing") || {};
      const knownCustomer = refreshedBilling.stripeCustomerId;
      const existingSessionId = refreshedBilling.stripeCheckoutSessionId;
      if (typeof existingSessionId === "string") {
        const existingSession = await stripe.checkout.sessions.retrieve(existingSessionId);
        if (existingSession.status === "open" && existingSession.url) {
          await userRef.set({ billing: { checkoutSessionLock: FieldValue.delete() } }, { merge: true });
          return res.json({ url: existingSession.url, reused: true });
        }
      }
      let customerId = typeof knownCustomer === "string" ? knownCustomer : null;
      if (customerId) {
        const customer = await stripe.customers.retrieve(customerId);
        if ("deleted" in customer && customer.deleted) {
          customerId = null;
        } else if (!("metadata" in customer) || customer.metadata?.firebaseUid !== uid) {
          customerId = null;
        }
      }
      if (!customerId) {
        const customer = await stripe.customers.create({ email, metadata: { firebaseUid: uid, internalUserId: uid } });
        customerId = customer.id;
        await userRef.set({ billing: { stripeCustomerId: customerId, updatedAt: FieldValue.serverTimestamp() } }, { merge: true });
      }
      const metadata = { firebaseUid: uid, internalUserId: uid, planId };
      const checkoutIntentKey = buildCheckoutIdempotencyKey(uid, planId, {
        stripeCustomerId: customerId,
        stripeSubscriptionId: refreshedBilling.stripeSubscriptionId ?? null,
        stripeCheckoutSessionId: existingSessionId ?? null,
        lastStripeEventCreated: refreshedBilling.lastStripeEventCreated ?? null,
      });
      const session = await stripe.checkout.sessions.create({
        mode: "subscription", customer: customerId, client_reference_id: uid, metadata,
        subscription_data: { metadata }, line_items: [{ price: priceId, quantity: 1 }],
        success_url: successUrl, cancel_url: cancelUrl,
      }, { idempotencyKey: checkoutIntentKey });
      await userRef.set({
        billing: {
          stripeCheckoutSessionId: session.id,
          checkoutSessionLock: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        },
      }, { merge: true });
      console.info("[STRIPE] Checkout session created", { uid, customerId, sessionId: session.id, planId });
      return res.json({ url: session.url });
    } catch (error) {
      if (uid) await db.collection("users").doc(uid).set({ billing: { checkoutSessionLock: FieldValue.delete() } }, { merge: true }).catch(() => undefined);
      console.error("[STRIPE][ERROR] Checkout session creation failed", { uid, error });
      return res.status(500).json({ error: "Nao foi possivel iniciar o checkout." });
    }
  });

  app.get("/api/stripe/subscription", auth, async (req: PaymentRequest, res: Response) => {
    const user = await db.collection("users").doc(req.paymentAuth!.uid).get();
    const billing = user.get("billing") || {};
    let stripeAmount: number | null = null;
    let stripeCurrency: string | null = null;
    let stripeInterval: string | null = null;
    if (typeof billing.stripeSubscriptionId === "string") {
      const subscription = await stripe.subscriptions.retrieve(billing.stripeSubscriptionId).catch(() => null) as any;
      const price = subscription?.items?.data?.[0]?.price;
      stripeAmount = typeof price?.unit_amount === "number" ? price.unit_amount : null;
      stripeCurrency = typeof price?.currency === "string" ? price.currency : null;
      stripeInterval = typeof price?.recurring?.interval === "string" ? price.recurring.interval : null;
    }
    return res.json({
      ...billing,
      email: req.paymentAuth!.email || null,
      displayName: req.paymentAuth!.name || null,
      amount: stripeAmount,
      currency: stripeCurrency,
      interval: stripeInterval,
      hasActiveSubscription: isBillingStatusActive(billing.status, billing.currentPeriodEnd),
    });
  });

  app.post("/api/stripe/cancel-subscription", auth, async (req: PaymentRequest, res: Response) => {
    const uid = req.paymentAuth!.uid;
    const userRef = db.collection("users").doc(uid);
    let lockAcquiredByRequest = false;
    try {
      const lockAcquired = await db.runTransaction(async transaction => {
        const user = await transaction.get(userRef);
        const billing = user.get("billing") || {};
        if (!canRequestSubscriptionCancellation(billing)) return false;
        const now = Date.now();
        if (typeof billing.cancellationRequestLock === "number" && billing.cancellationRequestLock > now - 30_000) return false;
        transaction.set(userRef, { billing: { cancellationRequestLock: now } }, { merge: true });
        return true;
      });
      if (!lockAcquired) return res.status(409).json({ error: "cancellation_already_requested" });
      lockAcquiredByRequest = true;

      const billing = (await userRef.get()).get("billing") || {};
      const subscriptionId = typeof billing.stripeSubscriptionId === "string" ? billing.stripeSubscriptionId : null;
      if (!subscriptionId) {
        await clearCancellationRequestLock(userRef);
        lockAcquiredByRequest = false;
        return res.status(404).json({ error: "Stripe subscription not found." });
      }
      const subscription = await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
      const subscriptionPeriod = getSubscriptionPeriod(subscription);
      const currentPeriodEnd = iso(subscriptionPeriod.end) ?? billing.currentPeriodEnd ?? null;
      const auditRef = db.collection("audit_events").doc();
      await db.runTransaction(async (transaction) => {
        const latestUser = await transaction.get(userRef);
        const latestBilling = latestUser.get("billing") || {};
        transaction.set(userRef, { billing: {
          cancelAtPeriodEnd: true,
          currentPeriodEnd,
          cancellationRequestLock: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        } }, { merge: true });
        transaction.create(auditRef, {
          actor: uid,
          action: "subscription_cancel_scheduled",
          target: uid,
          before: {
            status: latestBilling.status ?? null,
            cancelAtPeriodEnd: latestBilling.cancelAtPeriodEnd ?? false,
            currentPeriodEnd: latestBilling.currentPeriodEnd ?? null,
          },
          after: {
            status: latestBilling.status ?? subscription.status,
            cancelAtPeriodEnd: true,
            currentPeriodEnd,
          },
          source: "user",
          reason: null,
          timestamp: FieldValue.serverTimestamp(),
        });
      });
      return res.json({ cancelAtPeriodEnd: true, currentPeriodEnd });
    } catch (error) {
      if (lockAcquiredByRequest) {
        try {
          await clearCancellationRequestLock(userRef);
        } catch (cleanupError) {
          console.error("[STRIPE][ERROR] Cancellation lock cleanup failed", { uid, error: cleanupError });
        }
      }
      console.error("[STRIPE][ERROR] Subscription cancellation failed", { uid, error });
      return res.status(500).json({ error: "Nao foi possivel agendar o cancelamento." });
    }
  });

  app.post("/api/stripe/create-customer-portal-session", auth, async (req: PaymentRequest, res: Response) => {
    const billing = (await db.collection("users").doc(req.paymentAuth!.uid).get()).get("billing") || {};
    if (!billing.stripeCustomerId) return res.status(404).json({ error: "Cliente Stripe nao encontrado." });
    const session = await stripe.billingPortal.sessions.create({ customer: billing.stripeCustomerId, return_url: process.env.STRIPE_PORTAL_RETURN_URL || successUrl || cancelUrl! });
    return res.json({ url: session.url });
  });

  // Must be registered before any JSON parser. Stripe signature verification requires exact bytes.
  app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), async (req: Request, res: Response) => {
    const signature = req.headers["stripe-signature"];
    if (typeof signature !== "string" || !process.env.STRIPE_WEBHOOK_SECRET) return res.status(400).send("Webhook signature unavailable.");
    let event: Stripe.Event;
    console.info("[STRIPE] Webhook received");
    try {
      event = stripe.webhooks.constructEvent(req.body, signature, process.env.STRIPE_WEBHOOK_SECRET);
      console.info("[STRIPE] Webhook signature verified", { eventId: event.id, type: event.type });
    }
    catch (error: any) { console.error("[STRIPE][ERROR] Webhook signature invalid", error.message); return res.status(400).send("Webhook Error"); }
    const object: any = event.data.object;
    const customerId = objectId(object.customer);
    const subscriptionId = objectId(object.subscription)
      || objectId(object.parent?.subscription_details?.subscription)
      || (object.object === "subscription" ? object.id : null);
    const payloadHash = Buffer.isBuffer(req.body)
      ? crypto.createHash("sha256").update(req.body).digest("hex")
      : null;
    const eventRef = db.collection("stripe_events").doc(event.id);
    try {
      const claimResult = await db.runTransaction(async tx => {
        const existing = await tx.get(eventRef);
        if (existing.exists && existing.get("status") === "processed") return "processed" as const;
        if (existing.exists && existing.get("status") === "processing") {
          const startedAt = existing.get("processingStartedAt");
          if (typeof startedAt === "number" && startedAt > Date.now() - 5 * 60_000) return "busy" as const;
        }
        tx.set(eventRef, {
          eventId: event.id,
          eventType: event.type,
          type: event.type,
          created: event.created,
          status: "processing",
          source: "stripe_webhook",
          customerId,
          subscriptionId,
          receivedAt: existing.get("receivedAt") || FieldValue.serverTimestamp(),
          processedAt: null,
          error: null,
          payloadHash,
          attemptCount: Number(existing.get("attemptCount") || 0) + 1,
          processingStartedAt: Date.now(),
        }, { merge: true });
        return "claimed" as const;
      });
      if (claimResult === "processed") return res.json({ received: true, duplicate: true });
      if (claimResult === "busy") return res.status(500).json({ error: "Stripe event is still being processed; retry later." });
      if (!handledEventTypes.has(event.type)) {
        await eventRef.set({
          status: "processed",
          outcome: "ignored_unsupported_event",
          processedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        return res.json({ received: true, ignored: true });
      }
      const uid = await resolveUserId(db, stripe, object);
      if (!uid) {
        const error = "No verified Firebase UID mapping; retry required.";
        await eventRef.set({
          status: "unresolved",
          error,
          unresolvedAt: FieldValue.serverTimestamp(),
          processedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        console.error("[STRIPE][ERROR] UID unresolved", { eventId: event.id, type: event.type });
        return res.status(500).json({ error: "Stripe event could not be linked to an account." });
      }
      const currentUser = await db.collection("users").doc(uid).get();
      const currentBilling = currentUser.get("billing") || {};
      const knownSubscriptionId = subscriptionId || objectId(currentBilling.stripeSubscriptionId);
      let subscription: unknown = null;
      if (knownSubscriptionId) {
        try {
          subscription = await stripe.subscriptions.retrieve(knownSubscriptionId);
        } catch (error) {
          if (event.type !== "customer.subscription.deleted" || object.object !== "subscription") throw error;
          subscription = object;
        }
      }
      const effectiveSubscriptionId = objectId(subscription) || knownSubscriptionId;
      if (shouldPreserveBillingWithoutSubscription(event.type, subscription)) {
        const error = "Subscription status or period is unavailable; retry required.";
        await eventRef.set({
          status: "unresolved",
          firebaseUid: uid,
          customerId,
          subscriptionId: effectiveSubscriptionId,
          billingPreserved: true,
          error,
          unresolvedAt: FieldValue.serverTimestamp(),
          processedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        console.error("[STRIPE][ERROR] Subscription state unresolved", { eventId: event.id, type: event.type, uid });
        return res.status(500).json({ error: "Stripe subscription state unavailable." });
      }
      const status = event.type === "customer.subscription.deleted"
        ? "canceled"
        : stripeStatus(asRecord(subscription)?.status);
      if (status === null) {
        await eventRef.set({
          status: "unresolved",
          firebaseUid: uid,
          customerId,
          subscriptionId: effectiveSubscriptionId,
          billingPreserved: true,
          error: "Stripe subscription status unavailable; retry required.",
          unresolvedAt: FieldValue.serverTimestamp(),
          processedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        return res.status(500).json({ error: "Stripe subscription status unavailable." });
      }
      const subscriptionPeriod = getSubscriptionPeriod(subscription);
      const planId = metadataValue(subscription, "planId") ?? metadataValue(object, "planId");
      const start = iso(subscriptionPeriod.start);
      const end = iso(subscriptionPeriod.end);
      const billingApplied = await writeBilling(db, uid, { customerId, subscriptionId: effectiveSubscriptionId, sessionId: object.id?.startsWith("cs_") ? object.id : null, status, planId, start, end, cancelAtPeriodEnd: subscriptionCancelAtPeriodEnd(subscription), eventId: event.id, eventType: event.type, eventCreated: event.created, amount: object.amount_paid ?? null });
      await eventRef.set({
        status: "processed",
        outcome: billingApplied ? "applied" : "ignored_stale_event",
        firebaseUid: uid,
        customerId,
        subscriptionId: effectiveSubscriptionId,
        error: null,
        processedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      console.info("[STRIPE] Webhook processed", { eventId: event.id, type: event.type, uid, status, billingApplied });
      return res.json({ received: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[STRIPE][ERROR] Webhook processing failed", { eventId: event.id, error: message });
      try {
        await eventRef.set({
          status: "error",
          error: message,
          source: "stripe_webhook",
          customerId,
          subscriptionId,
          processedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      } catch (recordError) {
        console.error("[STRIPE][ERROR] Could not record webhook failure", { eventId: event.id, error: recordError });
      }
      return res.status(500).json({ error: "Webhook processing failed" });
    }
  });
};
