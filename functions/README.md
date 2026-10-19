Deploy instructions for the Cloud Function that syncs custom claims

1) From `functions/` install dependencies:

```bash
cd functions
npm install
```

2) Deploy using Firebase CLI (project must be selected / authenticated):

```bash
firebase deploy --only functions:syncCustomClaimsOnUserWrite,functions:syncOwnerIdentityOnConfigWrite,functions:reconcilePendingOwnerIdentitySync,functions:reconcilePendingCustomClaims
```

3) After deploying functions, deploy Firestore rules update (if you changed `firestore.rules`):

```bash
firebase deploy --only firestore:rules
```

Notes:
- Ensure the account used to deploy has permission to set custom claims.
- `system/access_config.ownerUid` is the authoritative owner identity. It is read by Admin SDK; do not mirror it in a runtime environment variable or frontend configuration.
- The user-write trigger derives claims and `accessProjection` from the current profile and owner identity without granting `ownerAccess`. The config-write trigger synchronizes the previous and new owner identities and writes an idempotent audit event; a stale permanent entitlement is disabled and audited, including when the identity document is deleted or invalid.
- The scheduled owner-identity reconciler retries pending/failed config-sync audit events every five minutes. It is separate from custom-claim audit retries.
- Before publishing Rules that require an owner claim, verify the identity document, profile, projection, Auth claims, and both triggers. Deploying Functions does not itself provision the identity document or grant `ownerAccess`.
- The scheduled reconciler retries audit events with pending/failed claim synchronization every five minutes. Deploying it requires Cloud Scheduler to be enabled for the project.
- Monitor the Firebase console for function execution errors on first runs.
