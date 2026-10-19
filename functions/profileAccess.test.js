const test = require('node:test');
const assert = require('node:assert/strict');
const { Timestamp } = require('firebase-admin/firestore');
const {
  MOTOFIX_OWNER_UID,
  calculateProfileAccess,
  isStaleOwnerEntitlement,
  sameProjectionDecision,
} = require('./profileAccess');

const now = Date.parse('2026-10-01T00:00:00.000Z');

test('owner projection requires the designated UID, permanent entitlement, active account and master_admin role', () => {
  const ownerProfile = {
    role: 'master_admin',
    isActive: true,
    ownerAccess: { enabled: true, permanent: true },
  };
  assert.equal(calculateProfileAccess(ownerProfile, MOTOFIX_OWNER_UID, null, now).source, 'owner');
  assert.equal(calculateProfileAccess(ownerProfile, 'other', MOTOFIX_OWNER_UID, now).allowed, false);
  assert.equal(calculateProfileAccess({ ...ownerProfile, isActive: false }, MOTOFIX_OWNER_UID, null, now).reason, 'account_inactive');
  assert.equal(calculateProfileAccess({ ...ownerProfile, role: 'user' }, MOTOFIX_OWNER_UID, null, now).allowed, false);
});

test('only a current manual grant permits access; Stripe billing is ignored', () => {
  const future = Timestamp.fromMillis(now + 60_000);
  const past = Timestamp.fromMillis(now - 60_000);
  assert.equal(calculateProfileAccess({
    isActive: true,
    manualAccess: { enabled: true, expiresAt: future },
  }, 'user', 'owner', now).source, 'manual');
  assert.equal(calculateProfileAccess({
    isActive: true,
    manualAccess: { enabled: true, expiresAt: past },
    billing: { status: 'active', currentPeriodEnd: future },
  }, 'user', 'owner', now).reason, 'manual_access_expired');
  assert.equal(calculateProfileAccess({
    isActive: true,
    billing: { status: 'active', currentPeriodEnd: future },
  }, 'user', 'owner', now).allowed, false);
  assert.equal(calculateProfileAccess({ isActive: true }, 'user', 'owner', now).allowed, false);
});

test('projection reconciliation ignores evaluation time but detects stale authorization decisions', () => {
  const current = calculateProfileAccess({ isActive: false }, 'user', 'owner', now);
  const sameDecision = calculateProfileAccess({ isActive: false }, 'user', 'owner', now + 1000);
  const changedDecision = calculateProfileAccess({
    isActive: true,
    billing: { status: 'active', currentPeriodEnd: Timestamp.fromMillis(now + 60_000) },
  }, 'user', 'owner', now);
  assert.equal(sameProjectionDecision(current, sameDecision), true);
  assert.equal(sameProjectionDecision(current, changedDecision), false);
});

test('stale owner entitlement is revoked after UID rotation or missing identity config', () => {
  const profile = { ownerAccess: { enabled: true, permanent: true } };
  assert.equal(isStaleOwnerEntitlement(profile, 'old-owner', MOTOFIX_OWNER_UID), true);
  assert.equal(isStaleOwnerEntitlement(profile, 'old-owner', null), true);
  assert.equal(isStaleOwnerEntitlement(profile, MOTOFIX_OWNER_UID, null), false);
  assert.equal(isStaleOwnerEntitlement({ ownerAccess: { enabled: true, permanent: false } }, 'old-owner', null), false);
});
