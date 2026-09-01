# Stripe Billing (test mode)

Configure `STRIPE_SECRET_KEY=sk_test_...`, `STRIPE_WEBHOOK_SECRET=whsec_...` and one real test-mode Price in `STRIPE_PRICE_PLAN_MONTHLY` (or `BASIC`/`PRO`). The browser never receives either secret.

`STRIPE_PRICE_ID` remains only as a legacy fallback for disabled `/api/payments/*` routes; new deployments should use the `STRIPE_PRICE_PLAN_*` variables. `STRIPE_PUBLISHABLE_KEY` is also legacy and is not used by the current Checkout flow.

Start the application and forward Stripe events:

```bash
stripe listen --forward-to localhost:3001/api/stripe/webhook
```

Copy the `whsec_...` printed by the CLI into `STRIPE_WEBHOOK_SECRET`. In the Stripe Dashboard (or CLI listener) select `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, and `invoice.payment_failed`.

The Checkout success URL only returns the customer to the app; it does not grant access. Verify `users/{uid}.billing`, `users/{uid}/billing_events`, and `stripe_events/{event.id}` after each test.

Billing writes are ordered by Stripe's `event.created` value inside a Firestore transaction. An older event is recorded but cannot overwrite a newer billing state; equal timestamps use the event ID as a deterministic tie-breaker. Duplicate event IDs are idempotent.

Access is granted only for a confirmed Subscription status of `active` with a future period end, or `trialing`. `past_due`, `unpaid`, `canceled`, `incomplete`, and `incomplete_expired` are inactive. For `invoice.payment_failed`, the current Subscription status is authoritative: an invoice failure alone does not revoke an otherwise confirmed active subscription, but any confirmed non-active status revokes access.

For live mode, create Products/recurring Prices in live mode, replace every `sk_test`, `price_...`, endpoint secret and public URL with their live counterparts, configure HTTPS webhook delivery, then complete a low-value real subscription and verify the same documents. Test and live IDs must never be mixed.

Enable the Stripe Customer Portal in the Dashboard before exposing `POST /api/stripe/create-customer-portal-session` in the UI.
