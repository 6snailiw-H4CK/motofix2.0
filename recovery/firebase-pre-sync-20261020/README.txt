Recovery point created before incremental Firestore sync deployment.
Firebase project: appmotofix
Hosting: live version cloned to channel pre-sync-rollback-20261020.
Recovery URL: https://appmotofix--pre-sync-rollback-20261020-1t4yptns.web.app
Firestore: exact deployed release and source are saved here, including firestore.rules.

Restore Hosting:
  firebase hosting:clone appmotofix:pre-sync-rollback-20261020 appmotofix:live --project appmotofix

Restore Firestore Rules:
  Copy this folder's firestore.rules to the project root, then run:
  firebase deploy --only firestore:rules --project appmotofix

The app's Firestore data is not changed by the planned deployment.
