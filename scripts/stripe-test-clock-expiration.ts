import "dotenv/config";
import Stripe from "stripe";

const requiredEnv = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required and cannot be empty.`);
  return value;
};

const getPeriodEnd = (subscription: Stripe.Subscription) => {
  const itemPeriodEnd = subscription.items.data[0]?.current_period_end;
  const periodEnd = itemPeriodEnd;
  if (typeof periodEnd !== "number" || !Number.isFinite(periodEnd)) {
    throw new Error("The test subscription did not return a valid current period end.");
  }
  return periodEnd;
};

const main = async () => {
  const secretKey = requiredEnv("STRIPE_SECRET_KEY");
  if (!secretKey.startsWith("sk_test_")) {
    throw new Error("STRIPE_SECRET_KEY must be a Stripe TEST MODE key (sk_test_). LIVE mode is refused.");
  }

  const priceId = requiredEnv("STRIPE_PRICE_PLAN_MONTHLY");
  const firebaseUid = requiredEnv("STRIPE_TEST_FIREBASE_UID");
  if (!/^test[-_]/i.test(firebaseUid)) {
    throw new Error("STRIPE_TEST_FIREBASE_UID must start with test- or test_ and belong to a newly created test user.");
  }

  const stripe = new Stripe(secretKey, { apiVersion: "2024-04-10" });
  const price = await stripe.prices.retrieve(priceId);
  if (price.livemode) throw new Error("STRIPE_PRICE_PLAN_MONTHLY points to a LIVE Price. TEST mode is required.");
  if (!price.active || !price.recurring) {
    throw new Error("STRIPE_PRICE_PLAN_MONTHLY must identify an active recurring TEST Price.");
  }

  const metadata = {
    firebaseUid,
    internalUserId: firebaseUid,
    planId: "monthly",
    testPurpose: "stripe-test-clock-expiration",
  };
  const clock = await stripe.testHelpers.testClocks.create({
    frozen_time: Math.floor(Date.now() / 1000),
    name: `motofix-expiration-${firebaseUid}`,
  });

  const customer = await stripe.customers.create({
    email: `${firebaseUid}@example.invalid`,
    metadata: { ...metadata, testClockId: clock.id },
    test_clock: clock.id,
  });

  const paymentMethod = await stripe.paymentMethods.create({
    type: "card",
    card: { token: "tok_visa" },
  });
  await stripe.paymentMethods.attach(paymentMethod.id, { customer: customer.id });
  await stripe.customers.update(customer.id, {
    invoice_settings: { default_payment_method: paymentMethod.id },
  });

  const subscription = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: price.id, quantity: 1 }],
    metadata,
    payment_behavior: "error_if_incomplete",
  });
  const currentPeriodEnd = getPeriodEnd(subscription);
  const expiringSubscription = await stripe.subscriptions.update(subscription.id, {
    cancel_at_period_end: true,
  });
  const scheduledPeriodEnd = getPeriodEnd(expiringSubscription);

  console.log("Stripe TEST Clock expiration test created:");
  console.log(`test clock ID: ${clock.id}`);
  console.log(`customer ID: ${customer.id}`);
  console.log(`subscription ID: ${expiringSubscription.id}`);
  console.log(`current period end: ${new Date(scheduledPeriodEnd * 1000).toISOString()}`);
  if (scheduledPeriodEnd !== currentPeriodEnd) {
    throw new Error("The period end changed while scheduling test expiration.");
  }

  const advancedClock = await stripe.testHelpers.testClocks.advance(clock.id, {
    frozen_time: scheduledPeriodEnd + 60,
  });
  const finalSubscription = await stripe.subscriptions.retrieve(expiringSubscription.id);
  console.log("Final Stripe TEST state:");
  console.log(`test clock status: ${advancedClock.status}`);
  console.log(`subscription status: ${finalSubscription.status}`);
  console.log(`cancel at period end: ${finalSubscription.cancel_at_period_end}`);
  console.log(`subscription current period end: ${new Date(getPeriodEnd(finalSubscription) * 1000).toISOString()}`);
  console.log("Webhook events are delivered separately by the configured Stripe listener/endpoint.");
};

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});