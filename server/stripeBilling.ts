import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import express from "express";
import Stripe from "stripe";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import type { Auth, DecodedIdToken } from "firebase-admin/auth";

export type PaymentRequest = Request & { paymentAuth?: DecodedIdToken };

const allowedStatuses = new Set(["active", "trialing"]);
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

export const isBillingStatusActive = (status: string, currentPeriodEnd: string | null, now = Date.now()) => (
  status === "trialing" || (status === "active" && !!currentPeriodEnd && new Date(currentPeriodEnd).getTime() > now)
);

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
      } catch {
        subscription = null;
      }
    }

    if (!subscription && billing.stripeCustomerId) {
      try {
        const list = await stripe.subscriptions.list({ customer: billing.stripeCustomerId, status: "all", limit: 50 });
        subscription = list.data.find((item) => ["active", "trialing", "canceled", "unpaid", "incomplete", "incomplete_expired", "past_due"].includes(item.status)) ?? null;
      } catch {
        subscription = null;
      }
    }

    const stripeStatus = subscription?.status ?? "inactive";
    if (stripeStatus === "active" || stripeStatus === "trialing") return true;
    if (["canceled", "unpaid", "incomplete", "incomplete_expired", "past_due"].includes(stripeStatus)) return false;
    if (stripeStatus === "inactive" && !(status === "active" || status === "trialing")) return false;
    return false;
  }

  if (!(status === "active" || status === "trialing")) return false;
  return !!(currentPeriodEnd && new Date(currentPeriodEnd).getTime() > Date.now());
};

export const shouldPreserveBillingWithoutSubscription = (eventType: string, subscription: unknown) => (
  eventType !== "customer.subscription.deleted" && !isCompleteSubscriptionPayload(subscription)
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
  const plans: Record<string, string | undefined> = {
    basic: process.env.STRIPE_PRICE_PLAN_BASIC,
    pro: process.env.STRIPE_PRICE_PLAN_PRO,
    // Compatibilidade temporaria com o unico plano existente.
    monthly: process.env.STRIPE_PRICE_PLAN_MONTHLY || process.env.STRIPE_PRICE_ID,
  };
  return Object.fromEntries(Object.entries(plans).filter(([, price]) => Boolean(price))) as Record<string, string>;
};

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

const writeBilling = async (db: Firestore, uid: string, input: {
  customerId: string | null; subscriptionId: string | null; sessionId?: string | null;
  status: string; planId?: string | null; start?: string | null; end?: string | null;
  cancelAtPeriodEnd?: boolean; eventId: string; eventType: string; eventCreated: number; amount?: number | null;
}) => {
  const userRef = db.collection("users").doc(uid);
  const applied = await db.runTransaction(async transaction => {
    const user = await transaction.get(userRef);
    const currentBilling = user.get("billing") || {};
    if (!isBillingEventNewer(currentBilling, { created: input.eventCreated, eventId: input.eventId })) return false;

    const mergedBilling = mergeBillingFields(currentBilling, input);
    const active = isBillingStatusActive(mergedBilling.status, mergedBilling.currentPeriodEnd);
    const billing: Record<string, unknown> = {
      ...mergedBilling,
      activationSource: "stripe",
      lastStripeEventId: input.eventId,
      lastStripeEventCreated: input.eventCreated,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (input.sessionId) billing.stripeCheckoutSessionId = input.sessionId;
    if (active) billing.activatedAt = FieldValue.serverTimestamp();

    transaction.set(userRef, {
      billing,
      subscription: {
        status: mergedBilling.status,
        plan: mergedBilling.planId === "pro" ? "annual" : "monthly",
        stripeCustomerId: mergedBilling.stripeCustomerId,
        stripeSubscriptionId: mergedBilling.stripeSubscriptionId,
        currentPeriodEnd: mergedBilling.currentPeriodEnd,
      },
      subscriptionExpiresAt: mergedBilling.currentPeriodEnd,
      isActive: active,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    transaction.set(userRef.collection("billing_events").doc(input.eventId), {
      eventId: input.eventId, type: input.eventType, created: input.eventCreated,
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
      await userRef.set({ billing: {
        cancelAtPeriodEnd: true,
        currentPeriodEnd,
        cancellationRequestLock: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      } }, { merge: true });
      return res.json({ cancelAtPeriodEnd: true, currentPeriodEnd });
    } catch (error) {
      if (lockAcquiredByRequest) {
        await clearCancellationRequestLock(userRef).catch(() => undefined);
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
    const eventRef = db.collection("stripe_events").doc(event.id);
    try {
      const claimed = await db.runTransaction(async tx => {
        const existing = await tx.get(eventRef);
        if (existing.exists && existing.get("status") === "processed") return false;
        if (existing.exists && existing.get("status") === "processing") {
          const startedAt = existing.get("processingStartedAt");
          if (typeof startedAt === "number" && startedAt > Date.now() - 5 * 60_000) return false;
        }
        tx.set(eventRef, {
          eventId: event.id,
          type: event.type,
          created: event.created,
          status: "processing",
          processingStartedAt: Date.now(),
        }, { merge: true });
        return true;
      });
      if (!claimed) return res.json({ received: true, duplicate: true });
      const object: any = event.data.object;
      const uid = await resolveUserId(db, stripe, object);
      const customerId = objectId(object.customer);
      const subscriptionId = objectId(object.subscription) || (object.object === "subscription" ? object.id : null);
      if (!uid) {
        await eventRef.set({ status: "unresolved", error: "No verified firebase UID mapping", processedAt: FieldValue.serverTimestamp() }, { merge: true });
        console.error("[STRIPE][ERROR] UID unresolved", { eventId: event.id, type: event.type });
        return res.json({ received: true });
      }
      const currentUser = await db.collection("users").doc(uid).get();
      const currentBilling = currentUser.get("billing") || {};
      let subscription: unknown = object.object === "subscription" ? object : null;
      const knownSubscriptionId = subscriptionId || objectId(currentBilling.stripeSubscriptionId);
      if (!subscription && knownSubscriptionId) {
        subscription = await stripe.subscriptions.retrieve(knownSubscriptionId).catch(() => null);
      }
      const effectiveSubscriptionId = objectId(subscription) || knownSubscriptionId;
      if (shouldPreserveBillingWithoutSubscription(event.type, subscription)) {
        await eventRef.set({
          status: "processed",
          firebaseUid: uid,
          stripeCustomerId: customerId,
          stripeSubscriptionId: effectiveSubscriptionId,
          billingPreserved: true,
          preservationReason: "Event without a complete Stripe Subscription",
          processedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        console.info("[STRIPE] Billing preserved", { eventId: event.id, type: event.type, uid });
        return res.json({ received: true, billingPreserved: true });
      }
      const status = event.type === "customer.subscription.deleted"
        ? "canceled"
        : stripeStatus(asRecord(subscription)?.status);
      if (status === null) {
        await eventRef.set({
          status: "processed",
          firebaseUid: uid,
          stripeCustomerId: customerId,
          stripeSubscriptionId: effectiveSubscriptionId,
          billingPreserved: true,
          preservationReason: "Stripe Subscription status unavailable",
          processedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        return res.json({ received: true, billingPreserved: true });
      }
      const subscriptionPeriod = getSubscriptionPeriod(subscription);
      const planId = metadataValue(subscription, "planId") ?? metadataValue(object, "planId");
      const start = iso(subscriptionPeriod.start);
      const end = iso(subscriptionPeriod.end);
      if (handledEventTypes.has(event.type)) {
        await writeBilling(db, uid, { customerId, subscriptionId: effectiveSubscriptionId, sessionId: object.id?.startsWith("cs_") ? object.id : null, status, planId, start, end, cancelAtPeriodEnd: subscriptionCancelAtPeriodEnd(subscription), eventId: event.id, eventType: event.type, eventCreated: event.created, amount: object.amount_paid ?? null });
      }
      await eventRef.set({ status: "processed", firebaseUid: uid, stripeCustomerId: customerId, stripeSubscriptionId: effectiveSubscriptionId, processedAt: FieldValue.serverTimestamp() }, { merge: true });
      console.info("[STRIPE] Billing updated", { eventId: event.id, type: event.type, uid, status });
      return res.json({ received: true });
    } catch (error: any) {
      console.error("[STRIPE][ERROR] Webhook processing failed", { eventId: event.id, error: error.message });
      await eventRef.set({ status: "error", error: error.message, processedAt: FieldValue.serverTimestamp() }, { merge: true }).catch(() => undefined);
      return res.status(500).json({ error: "Webhook processing failed" });
    }
  });
};
