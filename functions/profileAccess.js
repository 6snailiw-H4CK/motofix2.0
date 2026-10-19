const { Timestamp } = require('firebase-admin/firestore');
const MOTOFIX_OWNER_UID = 'o5XNtNFwKMQzZj28WfTEiGSFN0A3';

const timestampMillis = (value) => {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.getTime();
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && typeof value.toMillis === 'function') {
    const parsed = value.toMillis();
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value && typeof value.toDate === 'function') {
    const date = value.toDate();
    return date instanceof Date && Number.isFinite(date.getTime()) ? date.getTime() : null;
  }
  return null;
};

const calculateProfileAccess = (profile, uid, ownerUid, now = Date.now()) => {
  const evaluatedAt = Timestamp.fromMillis(now);
  const denied = (reason) => ({
    allowed: false,
    source: 'none',
    validUntil: null,
    evaluatedAt,
    policyVersion: 'access-v1',
    reason,
  });

  if (!profile) return denied('profile_missing');
  if (profile.isActive !== true) return denied('account_inactive');
  if (uid === MOTOFIX_OWNER_UID
    && profile.role === 'master_admin'
    && profile.ownerAccess?.enabled === true
    && profile.ownerAccess?.permanent === true) {
    return {
      allowed: true,
      source: 'owner',
      validUntil: null,
      evaluatedAt,
      policyVersion: 'access-v1',
      reason: 'owner_entitlement',
    };
  }

  const manualExpiresAt = profile.manualAccess?.enabled === true
    ? timestampMillis(profile.manualAccess.expiresAt)
    : null;
  if (manualExpiresAt !== null && manualExpiresAt > now) {
    return {
      allowed: true,
      source: 'manual',
      validUntil: Timestamp.fromMillis(manualExpiresAt),
      evaluatedAt,
      policyVersion: 'access-v1',
      reason: 'manual_entitlement',
    };
  }

  const expired = manualExpiresAt !== null && manualExpiresAt <= now;
  return denied(expired ? 'manual_access_expired' : 'manual_access_required');
};

const sameProjectionDecision = (current, expected) => {
  if (!current || typeof current !== 'object') return false;
  const currentUntil = timestampMillis(current.validUntil);
  const expectedUntil = timestampMillis(expected.validUntil);
  return current.allowed === expected.allowed
    && current.source === expected.source
    && currentUntil === expectedUntil
    && current.policyVersion === expected.policyVersion
    && current.reason === expected.reason;
};

const hasPermanentOwnerEntitlement = (profile) => profile?.ownerAccess?.enabled === true
  && profile.ownerAccess.permanent === true;

const isStaleOwnerEntitlement = (profile, uid, ownerUid) => (
  uid !== MOTOFIX_OWNER_UID && hasPermanentOwnerEntitlement(profile)
);

module.exports = {
  MOTOFIX_OWNER_UID,
  calculateProfileAccess,
  hasPermanentOwnerEntitlement,
  isStaleOwnerEntitlement,
  sameProjectionDecision,
};
