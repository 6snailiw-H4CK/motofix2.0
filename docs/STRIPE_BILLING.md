# Stripe Billing (test mode)

Configure `STRIPE_SECRET_KEY=sk_test_...`, `STRIPE_WEBHOOK_SECRET=whsec_...` and one real test-mode Price in `STRIPE_PRICE_PLAN_MONTHLY` (or `BASIC`/`PRO`). The browser never receives either secret.

`STRIPE_PRICE_ID` remains only as a legacy fallback for disabled `/api/payments/*` routes; new deployments should use the `STRIPE_PRICE_PLAN_*` variables. `STRIPE_PUBLISHABLE_KEY` is also legacy and is not used by the current Checkout flow.

Start the application and forward Stripe events. On Windows, use the same secret key as the backend so the CLI cannot connect to another Stripe account:

```powershell
$line = Get-Content .env | Where-Object { $_ -like 'STRIPE_SECRET_KEY=*' }
$key = $line -replace '^STRIPE_SECRET_KEY=', ''
stripe listen --api-key $key --forward-to localhost:3001/api/stripe/webhook
```

Copy the `whsec_...` printed by the CLI into `STRIPE_WEBHOOK_SECRET`. In the Stripe Dashboard (or CLI listener) select `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, and `invoice.payment_failed`.

For the complete Windows sandbox recovery procedure, see [GUIA_STRIPE_SANDBOX_RECUPERACAO.md](GUIA_STRIPE_SANDBOX_RECUPERACAO.md).

The Checkout success URL only returns the customer to the app; it does not grant access. The authenticated `GET /api/account/access` endpoint evaluates operational entitlement on the server from the user's account state and server-owned manual-access/billing data. Administrative role claims do not grant operational entitlement. The frontend consumes this decision; Firestore Rules remain an independent boundary and clients cannot update the root user profile.

Verify `users/{uid}.billing`, `users/{uid}/billing_events`, `stripe_events/{event.id}`, and `audit_events/{id}` after each test. Stripe event records include their first receipt time, latest processing time, source, attempt count, customer/subscription IDs, and a hash of the signed raw payload (not the payload itself). An unresolved event is recorded and answered with a retryable HTTP error instead of being acknowledged as successful.

Billing writes are ordered by Stripe's `event.created` value inside a Firestore transaction. An older event is recorded as ignored and cannot overwrite a newer billing state; equal timestamps use the event ID as a deterministic tie-breaker. Duplicate event IDs are idempotent. Subscription lifecycle events reconcile from Stripe's current Subscription object before projecting billing state.

The current policy is explicit: `active` and `trialing` grant access only with a future period end; `trialing` without `currentPeriodEnd` is denied until Stripe provides a valid future period end. `past_due`, `unpaid`, `canceled`, `incomplete`, `incomplete_expired`, and `paused` deny access. No grace period is applied. For `invoice.payment_failed`, the current Subscription status is authoritative: an invoice failure alone does not revoke an otherwise confirmed active subscription, but any confirmed non-active status revokes access.

Firestore Rules also deny an owner's direct subcollection access when the stored billing status is not `active` or `trialing`, even if the legacy `isActive` projection is stale. Legacy `subscriptionExpiresAt` values are ISO strings and are not a safe timestamp comparison in Rules, so direct database access can still remain available if a profile's stored status stays `active` after its period expires. No backfill has been run; resolving that case requires a compatible server-owned timestamp projection and a read-only impact report before migration.

The internal plan catalog maps `basic`, `pro`, and `monthly` to their environment variable names and legacy display plans. `STRIPE_PRICE_ID` remains an explicit fallback for `monthly` for compatibility; do not remove it until configuration usage has been inventoried. This code does not create or modify Stripe Products, Prices, or subscriptions.

For live mode, create Products/recurring Prices in live mode, replace every `sk_test`, `price_...`, endpoint secret and public URL with their live counterparts, configure HTTPS webhook delivery, then complete a low-value real subscription and verify the same documents. Test and live IDs must never be mixed.

Enable the Stripe Customer Portal in the Dashboard before exposing `POST /api/stripe/create-customer-portal-session` in the UI.
