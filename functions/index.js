const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { calculateProfileAccess, isStaleOwnerEntitlement, sameProjectionDecision } = require('./profileAccess');

admin.initializeApp();

const normalizeOwnerUid = (value) => (
  typeof value === 'string'
    && value.length > 0
    && value.length <= 128
    && value.trim() === value
    ? value
    : null
);

const syncCurrentProfileClaims = async (uid) => {
  const userRef = admin.firestore().collection('users').doc(uid);
  const ownerIdentityRef = admin.firestore().collection('system').doc('access_config');
  const { profile, ownerUid } = await admin.firestore().runTransaction(async (transaction) => {
    const [profileSnapshot, ownerIdentitySnapshot] = await Promise.all([
      transaction.get(userRef),
      transaction.get(ownerIdentityRef),
    ]);
    const currentProfile = profileSnapshot.exists ? profileSnapshot.data() : null;
    const currentOwnerUid = ownerIdentitySnapshot.exists
      ? normalizeOwnerUid(ownerIdentitySnapshot.get('ownerUid'))
      : null;
    if (!currentProfile) return { profile: null, ownerUid: currentOwnerUid };

    const staleOwnerEntitlement = isStaleOwnerEntitlement(currentProfile, uid, currentOwnerUid);
    const nextProfile = staleOwnerEntitlement
      ? { ...currentProfile, ownerAccess: { enabled: false, permanent: false } }
      : currentProfile;
    const projection = calculateProfileAccess(nextProfile, uid, currentOwnerUid);
    const shouldWrite = staleOwnerEntitlement
      || !sameProjectionDecision(currentProfile.accessProjection, projection);

    if (shouldWrite) {
      transaction.update(userRef, {
        ...(staleOwnerEntitlement ? { ownerAccess: { enabled: false, permanent: false } } : {}),
        accessProjection: projection,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      if (staleOwnerEntitlement) {
        const auditRef = admin.firestore().collection('audit_events').doc();
        transaction.create(auditRef, {
          actor: 'system:owner-identity-reconciliation',
          action: 'owner_access_revoked',
          target: uid,
          before: {
            ownerAccess: { enabled: true, permanent: true },
            accessProjection: currentProfile.accessProjection || null,
          },
          after: {
            ownerAccess: { enabled: false, permanent: false },
            accessProjection: projection,
          },
          source: 'system',
          reason: 'Owner identity changed in system/access_config.',
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }
    return { profile: nextProfile, ownerUid: currentOwnerUid };
  });

  let userRecord;
  try {
    userRecord = await admin.auth().getUser(uid);
  } catch (error) {
    if (error && error.code === 'auth/user-not-found') return;
    throw error;
  }

  const existing = userRecord.customClaims || {};
  const claims = { ...existing };
  delete claims.admin;
  delete claims.master_admin;
  delete claims.isActive;
  delete claims.motofix_owner;
  if (profile && profile.role === 'admin' && profile.isActive === true) claims.admin = true;
  if (profile && profile.role === 'master_admin' && profile.isActive === true) {
    claims.admin = true;
    claims.master_admin = true;
  }
  if (profile && profile.isActive === true) claims.isActive = true;
  if (profile
    && ownerUid === uid
    && profile.role === 'master_admin'
    && profile.isActive === true
    && profile.ownerAccess?.enabled === true
    && profile.ownerAccess?.permanent === true) {
    claims.motofix_owner = true;
  }

  const same = Object.keys(claims).length === Object.keys(existing).length
    && Object.keys(claims).every(key => claims[key] === existing[key]);
  if (!same) await admin.auth().setCustomUserClaims(uid, claims);
};

const syncAuditEventClaims = async (auditDocument) => {
  const audit = auditDocument.data();
  const targetUid = typeof audit.target === 'string' ? audit.target : null;
  if (!targetUid) throw new Error('Claims audit event has no target UID');

  const attempts = (Number(audit.claimsSyncAttempts) || 0) + 1;
  await auditDocument.ref.update({
    claimsSyncStatus: 'pending',
    claimsSyncAttempts: attempts,
    claimsSyncUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    claimsSyncError: admin.firestore.FieldValue.delete(),
  });

  try {
    await syncCurrentProfileClaims(targetUid);
    await auditDocument.ref.update({
      claimsSyncStatus: 'synced',
      claimsSyncAttempts: attempts,
      claimsSyncUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      claimsSyncedAt: admin.firestore.FieldValue.serverTimestamp(),
      claimsSyncError: admin.firestore.FieldValue.delete(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500);
    await auditDocument.ref.update({
      claimsSyncStatus: 'failed',
      claimsSyncAttempts: attempts,
      claimsSyncUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      claimsSyncFailureAt: admin.firestore.FieldValue.serverTimestamp(),
      claimsSyncError: message,
    });
    throw error;
  }
};

exports.syncCustomClaimsOnUserWrite = functions.runWith({ failurePolicy: true })
  .firestore.document('users/{uid}')
  .onWrite(async (_change, context) => {
    const uid = context.params.uid;
    const pendingAudits = await admin.firestore().collection('audit_events')
      .where('target', '==', uid)
      .where('claimsSyncStatus', 'in', ['pending', 'failed'])
      .orderBy('timestamp', 'desc')
      .limit(1)
      .get();
    if (!pendingAudits.empty) {
      await syncAuditEventClaims(pendingAudits.docs[0]);
    } else {
      await syncCurrentProfileClaims(uid);
    }
    return null;
  });

exports.syncOwnerIdentityOnConfigWrite = functions.runWith({ failurePolicy: true })
  .firestore.document('system/access_config')
  .onWrite(async (change, context) => {
    const previousOwnerUid = change.before.exists
      ? normalizeOwnerUid(change.before.get('ownerUid'))
      : null;
    const nextOwnerUid = change.after.exists
      ? normalizeOwnerUid(change.after.get('ownerUid'))
      : null;
    if (previousOwnerUid === nextOwnerUid) return null;
    const auditRef = admin.firestore().collection('audit_events')
      .doc(`owner-identity-${context.eventId}`);
    const syncAttempt = await admin.firestore().runTransaction(async (transaction) => {
      const auditSnapshot = await transaction.get(auditRef);
      const attempts = (Number(auditSnapshot.get('ownerIdentitySyncAttempts')) || 0) + 1;
      transaction.set(auditRef, {
        actor: 'system:owner-identity-sync',
        action: 'owner_identity_changed',
        before: { ownerUid: previousOwnerUid },
        after: { ownerUid: nextOwnerUid },
        source: 'system',
        reason: 'Owner identity configuration changed; claims and projections are being reconciled.',
        timestamp: auditSnapshot.get('timestamp') || admin.firestore.FieldValue.serverTimestamp(),
        ownerIdentitySyncStatus: 'pending',
        ownerIdentitySyncAttempts: attempts,
        ownerIdentitySyncUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        ownerIdentitySyncError: admin.firestore.FieldValue.delete(),
      }, { merge: true });
      return attempts;
    });
    const affectedUids = new Set([previousOwnerUid, nextOwnerUid].filter(Boolean));
    try {
      for (const uid of affectedUids) {
        await syncCurrentProfileClaims(uid);
      }
      await auditRef.update({
        ownerIdentitySyncStatus: 'synced',
        ownerIdentitySyncAttempts: syncAttempt,
        ownerIdentitySyncUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        ownerIdentitySyncedAt: admin.firestore.FieldValue.serverTimestamp(),
        ownerIdentitySyncError: admin.firestore.FieldValue.delete(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500);
      await auditRef.update({
        ownerIdentitySyncStatus: 'failed',
        ownerIdentitySyncAttempts: syncAttempt,
        ownerIdentitySyncUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        ownerIdentitySyncFailureAt: admin.firestore.FieldValue.serverTimestamp(),
        ownerIdentitySyncError: message,
      });
      throw error;
    }
    return null;
  });

exports.reconcilePendingOwnerIdentitySync = functions.pubsub
  .schedule('every 5 minutes')
  .onRun(async () => {
    const pendingAudits = await admin.firestore().collection('audit_events')
      .where('ownerIdentitySyncStatus', 'in', ['pending', 'failed'])
      .limit(100)
      .get();

    for (const auditDocument of pendingAudits.docs) {
      const audit = auditDocument.data();
      if (audit.action !== 'owner_identity_changed') continue;

      const previousOwnerUid = normalizeOwnerUid(audit.before?.ownerUid);
      const nextOwnerUid = normalizeOwnerUid(audit.after?.ownerUid);
      const attempts = (Number(audit.ownerIdentitySyncAttempts) || 0) + 1;
      await auditDocument.ref.update({
        ownerIdentitySyncStatus: 'pending',
        ownerIdentitySyncAttempts: attempts,
        ownerIdentitySyncUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        ownerIdentitySyncError: admin.firestore.FieldValue.delete(),
      });

      try {
        for (const uid of new Set([previousOwnerUid, nextOwnerUid].filter(Boolean))) {
          await syncCurrentProfileClaims(uid);
        }
        await auditDocument.ref.update({
          ownerIdentitySyncStatus: 'synced',
          ownerIdentitySyncAttempts: attempts,
          ownerIdentitySyncUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
          ownerIdentitySyncedAt: admin.firestore.FieldValue.serverTimestamp(),
          ownerIdentitySyncError: admin.firestore.FieldValue.delete(),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500);
        await auditDocument.ref.update({
          ownerIdentitySyncStatus: 'failed',
          ownerIdentitySyncAttempts: attempts,
          ownerIdentitySyncUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
          ownerIdentitySyncFailureAt: admin.firestore.FieldValue.serverTimestamp(),
          ownerIdentitySyncError: message,
        });
        console.error('Owner identity reconciliation failed for audit event', auditDocument.id, error);
      }
    }
    return null;
  });

exports.reconcilePendingCustomClaims = functions.pubsub
  .schedule('every 5 minutes')
  .onRun(async () => {
    const pendingAudits = await admin.firestore().collection('audit_events')
      .where('claimsSyncStatus', 'in', ['pending', 'failed'])
      .limit(100)
      .get();

    for (const auditDocument of pendingAudits.docs) {
      try {
        await syncAuditEventClaims(auditDocument);
      } catch (error) {
        console.error('Claims reconciliation failed for audit event', auditDocument.id, error);
      }
    }
    return null;
  });
