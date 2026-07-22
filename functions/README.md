Deploy instructions for the Cloud Function that syncs custom claims

1) From `functions/` install dependencies:

```bash
cd functions
npm install
```

2) Deploy using Firebase CLI (project must be selected / authenticated):

```bash
firebase deploy --only functions:syncCustomClaimsOnUserWrite
```

3) After deploying functions, deploy Firestore rules update (if you changed `firestore.rules`):

```bash
firebase deploy --only firestore:rules
```

Notes:
- Ensure the account used to deploy has permission to set custom claims.
- Monitor the Firebase console for function execution errors on first runs.
