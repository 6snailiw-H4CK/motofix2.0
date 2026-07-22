const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

// Syncs `role` and `isActive` from the user document into custom claims.
// This lets security rules rely on `request.auth.token` instead of calling
// `get()`/`exists()` which incur additional billed reads.
exports.syncCustomClaimsOnUserWrite = functions.firestore
  .document('users/{uid}')
  .onWrite(async (change, context) => {
    const uid = context.params.uid;
    const after = change.after.exists ? change.after.data() : null;

    try {
      if (!after) {
        // user deleted - clear claims
        await admin.auth().setCustomUserClaims(uid, {});
        return null;
      }

      const desiredClaims = {};
      if (after.role === 'admin') desiredClaims.admin = true;
      if (after.isActive === true) desiredClaims.isActive = true;

      // Preserve unrelated existing claims where sensible.
      const userRecord = await admin.auth().getUser(uid).catch(() => null);
      const existing = (userRecord && userRecord.customClaims) ? userRecord.customClaims : {};

      const merged = { ...existing, ...desiredClaims };

      // Avoid unnecessary writes by comparing
      const same = Object.keys(merged).length === Object.keys(existing).length
        && Object.keys(merged).every(k => merged[k] === existing[k]);

      if (!same) {
        await admin.auth().setCustomUserClaims(uid, merged);
      }
    } catch (error) {
      console.error('Error syncing custom claims for user', uid, error);
    }

    return null;
  });
