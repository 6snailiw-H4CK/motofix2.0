import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluateSessionAccountAccess,
  isDesignatedOwnerSession,
  mapAccountAccess,
  getSubscriptionTimerDelay,
  scheduleSubscriptionExpiry,
} from '../lib/subscriptionAccess';
import type { UserProfile } from '../types';

const designatedOwnerUid = 'o5XNtNFwKMQzZj28WfTEiGSFN0A3';
const now = Date.parse('2026-10-10T00:00:00.000Z');
const profile = (uid: string, fields: Partial<UserProfile> = {}) => ({
  uid,
  email: '',
  displayName: '',
  role: 'user',
  isActive: true,
  subscription: { status: 'inactive', plan: 'free', startsAt: '', expiresAt: '', currentPeriodEnd: '', autoRenew: false },
  createdAt: '',
  ...fields,
} satisfies UserProfile);
const manualAccessProjection = (expiresAt: string) => ({
allowed: true,
source: 'manual' as const,
validUntil: expiresAt,
});

test('authenticated designated owner bypasses the API based only on the authenticated UID', () => {
  const decision = evaluateSessionAccountAccess(designatedOwnerUid, null, now);
  assert.equal(isDesignatedOwnerSession(designatedOwnerUid), true);
  assert.equal(decision?.allowed, true);
  assert.equal(decision?.reason, 'designated_owner_session');
});

test('another authenticated user is allowed only by current manual access', () => {
  const allowed = evaluateSessionAccountAccess('other-uid', profile('other-uid', {
    manualAccess: { enabled: true, expiresAt: '2026-11-01T00:00:00.000Z' },
    accessProjection: manualAccessProjection('2026-11-01T00:00:00.000Z'),
    billing: { status: 'active', currentPeriodEnd: '2026-12-01T00:00:00.000Z' },
  }), now);
  const denied = evaluateSessionAccountAccess('other-uid', profile('other-uid', {
    billing: { status: 'active', currentPeriodEnd: '2026-12-01T00:00:00.000Z' },
  }), now);
  assert.equal(allowed?.allowed, true);
  assert.equal(allowed?.entitlementSource, 'manual');
  assert.equal(denied?.allowed, false);
  assert.equal(denied?.reason, 'manual_access_required');
});

test('logged-out and mismatched sessions receive no owner exception', () => {
  assert.equal(evaluateSessionAccountAccess(null, profile(designatedOwnerUid), now), null);
  const mismatched = evaluateSessionAccountAccess('other-uid', profile(designatedOwnerUid), now);
  assert.equal(mismatched?.allowed, false);
  assert.equal(mismatched?.reason, 'profile_missing');
});

test('switching away from the designated owner immediately removes the exception', () => {
  const ownerDecision = evaluateSessionAccountAccess(designatedOwnerUid, null, now);
  const otherDecision = evaluateSessionAccountAccess('other-uid', profile('other-uid'), now);
  assert.equal(ownerDecision?.allowed, true);
  assert.equal(isDesignatedOwnerSession('other-uid'), false);
  assert.equal(otherDecision?.allowed, false);
});

test('manual expiry and suspension are enforced without consulting billing fields', () => {
  const expired = evaluateSessionAccountAccess('uid-1', profile('uid-1', {
    manualAccess: { enabled: true, expiresAt: '2026-10-09T00:00:00.000Z' },
  }), now);
  const suspended = evaluateSessionAccountAccess('uid-1', profile('uid-1', {
    isActive: false,
    manualAccess: { enabled: true, expiresAt: '2026-11-01T00:00:00.000Z' },
    accessProjection: manualAccessProjection('2026-11-01T00:00:00.000Z'),
  }), now);
  assert.equal(expired?.allowed, false);
  assert.equal(expired?.reason, 'manual_access_expired');
  assert.equal(suspended?.allowed, false);
  assert.equal(suspended?.reason, 'account_inactive');
});

test('frontend gate maps the local manual decision', () => {
  const decision = evaluateSessionAccountAccess('uid-1', profile('uid-1', {
    manualAccess: { enabled: true, expiresAt: '2026-11-01T00:00:00.000Z' },
    accessProjection: manualAccessProjection('2026-11-01T00:00:00.000Z'),
  }), now);
  assert.ok(decision);
  assert.deepEqual(mapAccountAccess(decision), {
    subscriptionActive: true,
    isExpired: false,
    shouldBlock: false,
    reason: 'manual_entitlement',
  });
});

test('schedules a recheck only for a future manual access expiry', () => {
  const nowDate = new Date('2026-09-03T00:00:00.000Z');
  assert.equal(getSubscriptionTimerDelay('2026-10-03T00:00:00.000Z', nowDate), 2592000010);
  assert.equal(getSubscriptionTimerDelay('2026-09-02T00:00:00.000Z', nowDate), null);
  assert.equal(getSubscriptionTimerDelay('invalid', nowDate), null);
  assert.equal(getSubscriptionTimerDelay(null, nowDate), null);
});

test('accepts Firestore Timestamp values for manual access expiry', () => {
  const nowDate = new Date('2026-09-03T00:00:00.000Z');
  const expiry = new Date('2026-10-03T00:00:00.000Z');
  assert.equal(getSubscriptionTimerDelay({ toDate: () => expiry }, nowDate), 2592000010);
  assert.equal(getSubscriptionTimerDelay(expiry, nowDate), 2592000010);
  assert.equal(getSubscriptionTimerDelay({ toDate: () => new Date(Number.NaN) }, nowDate), null);
});

test('expiry timer invokes refresh and cleanup cancels its timer', () => {
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
  cleanup();
  assert.equal(cleared, true);
});
