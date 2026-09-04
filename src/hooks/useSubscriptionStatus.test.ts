import assert from 'node:assert/strict';
import test from 'node:test';
import { getSubscriptionGateState, getSubscriptionTimerDelay, scheduleSubscriptionExpiry } from './useSubscriptionStatus';

const profile = (billing: Record<string, unknown>, overrides: Record<string, unknown> = {}) => ({
  uid: 'uid-test',
  email: 'test@example.com',
  displayName: 'Test User',
  role: 'user',
  isActive: true,
  billing,
  subscription: {},
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
}) as any;

test('blocks a user without a subscription', () => {
  assert.deepEqual(getSubscriptionGateState(profile({ status: 'inactive' }), new Date('2026-09-03T00:00:00.000Z')), {
    subscriptionActive: false,
    isExpired: true,
    shouldBlock: true,
  });
});

test('allows an active subscription with a future period end', () => {
  assert.deepEqual(getSubscriptionGateState(profile({ status: 'active', currentPeriodEnd: '2026-10-03T00:00:00.000Z' }), new Date('2026-09-03T00:00:00.000Z')), {
    subscriptionActive: true,
    isExpired: false,
    shouldBlock: false,
  });
});

test('allows active subscriptions scheduled for cancellation until period end', () => {
  assert.equal(getSubscriptionGateState(profile({ status: 'active', currentPeriodEnd: '2026-10-03T00:00:00.000Z', cancelAtPeriodEnd: true }), new Date('2026-09-03T00:00:00.000Z')).subscriptionActive, true);
});

test('blocks an expired or canceled subscription', () => {
  assert.equal(getSubscriptionGateState(profile({ status: 'canceled', currentPeriodEnd: '2026-10-03T00:00:00.000Z' }), new Date('2026-09-03T00:00:00.000Z')).shouldBlock, true);
  assert.equal(getSubscriptionGateState(profile({ status: 'active', currentPeriodEnd: '2026-09-02T00:00:00.000Z' }), new Date('2026-09-03T00:00:00.000Z')).shouldBlock, true);
});

test('does not grant access while the profile is unresolved', () => {
  assert.deepEqual(getSubscriptionGateState(null), { subscriptionActive: false, isExpired: false, shouldBlock: false });
});

test('an authenticated user without a resolved profile must remain blocked by App', () => {
  const state = getSubscriptionGateState(null, new Date('2026-09-03T00:00:00.000Z'));
  assert.equal(state.subscriptionActive, false);
  assert.equal(state.shouldBlock, false);
});

test('admin bypasses the subscription gate', () => {
  assert.deepEqual(getSubscriptionGateState(profile({ status: 'inactive' }, { role: 'admin' }), new Date('2026-09-03T00:00:00.000Z')), {
    subscriptionActive: true,
    isExpired: false,
    shouldBlock: false,
  });
});

test('schedules only a future valid period end', () => {
  const now = new Date('2026-09-03T00:00:00.000Z');
  assert.equal(getSubscriptionTimerDelay('2026-10-03T00:00:00.000Z', now), 2592000010);
  assert.equal(getSubscriptionTimerDelay('2026-09-02T00:00:00.000Z', now), null);
  assert.equal(getSubscriptionTimerDelay('invalid', now), null);
  assert.equal(getSubscriptionTimerDelay(null, now), null);
});

test('recalculation after the scheduled time blocks active billing', () => {
  const user = profile({ status: 'active', currentPeriodEnd: '2026-09-03T00:00:00.000Z', cancelAtPeriodEnd: true });
  assert.deepEqual(getSubscriptionGateState(user, new Date('2026-09-02T23:59:59.999Z')), {
    subscriptionActive: true,
    isExpired: false,
    shouldBlock: false,
  });
  assert.deepEqual(getSubscriptionGateState(user, new Date('2026-09-03T00:00:00.001Z')), {
    subscriptionActive: false,
    isExpired: true,
    shouldBlock: true,
  });
});

test('trialing remains active without a period end', () => {
  assert.equal(getSubscriptionGateState(profile({ status: 'trialing' }), new Date('2026-09-03T00:00:00.000Z')).subscriptionActive, true);
});

test('schedules one expiry timer and cleanup cancels it', () => {
  let callback: (() => void) | null = null;
  let cleared = false;
  const timer = {} as ReturnType<typeof setTimeout>;
  const schedule: typeof setTimeout = ((scheduledCallback: Parameters<typeof setTimeout>[0]) => {
    callback = typeof scheduledCallback === 'function' ? scheduledCallback as () => void : null;
    return timer;
  }) as unknown as typeof setTimeout;
  const cleanup = scheduleSubscriptionExpiry(
    '2026-10-03T00:00:00.000Z',
    new Date('2026-09-03T00:00:00.000Z'),
    () => undefined,
    schedule,
    () => { cleared = true; },
  );

  assert.ok(callback);
  callback();
  assert.equal(getSubscriptionGateState(profile({ status: 'active', currentPeriodEnd: '2026-10-03T00:00:00.000Z' }), new Date('2026-10-03T00:00:00.001Z')).shouldBlock, true);
  cleanup();
  assert.equal(cleared, true);
});

test('replacing the period creates a new timer without scheduling past periods', () => {
  const delays: number[] = [];
  const schedule = ((scheduledCallback: TimerHandler, delay?: number) => {
    if (typeof delay === 'number') delays.push(delay);
    return {} as ReturnType<typeof setTimeout>;
  }) as unknown as typeof setTimeout;

  scheduleSubscriptionExpiry('2026-10-03T00:00:00.000Z', new Date('2026-09-03T00:00:00.000Z'), () => undefined, schedule);
  scheduleSubscriptionExpiry('2026-11-03T00:00:00.000Z', new Date('2026-09-03T00:00:00.000Z'), () => undefined, schedule);
  scheduleSubscriptionExpiry('2026-09-02T00:00:00.000Z', new Date('2026-09-03T00:00:00.000Z'), () => undefined, schedule);

  assert.equal(delays.length, 2);
  assert.ok(delays[1] > delays[0]);
});