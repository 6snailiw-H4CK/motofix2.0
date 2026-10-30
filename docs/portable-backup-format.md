# MotoFix portable backup format

## File and encryption

The complete backup is one UTF-8 JSON envelope saved with the `.motofix` extension. The envelope contains only encryption metadata and ciphertext; the workshop name, record counts, manifest, and operational data are inside the ciphertext.

- Envelope: `motofix-encrypted-backup`, version `1`.
- Encryption: AES-256-GCM with a fresh 96-bit IV for each file.
- Password derivation: PBKDF2-SHA-256, 600,000 iterations, 128-bit random salt.
- Integrity: SHA-256 for the ciphertext, GCM authentication for the encrypted contents, and SHA-256 over canonical JSON for the exported data.
- The application never writes the password into the file or its logs. It is not recoverable if forgotten.
- The browser performs encryption and decryption. Plaintext exists in memory while an export or restore is in progress; it is not written as a temporary file by this flow.

## Decrypted payload

The current plaintext payload format is `motofix-portable-backup`, version `1`. It contains:

- A manifest with generation time, app version, workshop UID and name, collection counts, serialization version, and data digest.
- Optional `manifest.sourceProjectId` records the Firebase project ID that produced the archive. It is absent in older archives, which remain readable.
- A safe profile snapshot (identity display fields and limited subscription status; no Stripe IDs or administrative claims).
- Settings and records from workshop subcollections. Firestore timestamps, dates, byte arrays, GeoPoints, and document references are represented by explicit `__motofixType` tags so another database adapter can interpret them without Firebase.
- A separately labelled `localRecovery` section with this browser's offline queue, drafts, and local cash/product records. This section is evidence for recovery; it is not automatically replayed during restore. The export marks this material as complete or partial and lists why.
- Export limitations and excluded collection names.

## Included Firestore collections

`clients`, `maintenances`, `warranties`, `appointments`, `expenses`, `products`, `stock_movements`, `cash_launches`, `settings/config`, `message_logs`, `operational_logs`, `fiscal_companies`, `fiscal_invoices`, `fiscal_logs`, `fiscal_invoice_files`, `whatsapp_sessions`, `whatsapp_messages`, `whatsapp_contacts`, and `whatsapp_automations`.

All documents in those collections are paged by document ID, including records with soft-delete, cancelled, archived, or historical status. Existing embedded attachment data is included as document data.

## Export coverage and local changes

Before generating a file, the app inspects the durable Firestore write queue after its IndexedDB hydration (and the localStorage mirror), draft entries in localStorage, and local-only cash and product records. Malformed/unreadable storage or records that cannot safely be attributed to the signed-in workshop block export. Records belonging to another workshop are never copied into this workshop's archive, but make the coverage explicitly partial.

If queued writes exist, the user is prompted to run a manual sync. The app waits for its queue reconciliation and refreshes all business collections, then inspects the queue and drafts again. A backup is labelled complete only when the queue has no pending or failed writes, drafts/local-only records are absent, and local storage is readable. If syncing fails or local-only records remain, the user may cancel or explicitly create a **partial** file. No queue or draft is cleared by backup. Partial queue/draft/local-only content is encrypted inside `localRecovery` as recovery material, but the cross-project restore plan deliberately excludes that section; it is not represented as restored business data and currently requires manual review/reconstruction.

The Firestore offline persistent cache is not exported directly as a private database file. The authoritative synchronized business documents are read from the authenticated source through the backup API. The browser queue and its IndexedDB/localStorage mirrors are inventoried separately so unsent mutations are not mistaken for confirmed server state.

Included business data covers the listed workshop collections, `settings/config`, their existing document IDs, status/history fields, embedded document values, and references that pass the import planner. Missing related records or external document references block import rather than being silently dropped. Values are preserved as stored; the backup does not infer missing history or repair old records.

## Exclusions and current limits

- `fiscal_private` is excluded because it contains private integration credentials. Reconfigure fiscal credentials, certificate passwords, and certificates through the normal secure setup after recovery.
- No Firebase Storage client or server integration was found in this repository. The present application attachments are embedded in Firestore documents; external Storage objects cannot be claimed as covered by this backup.
- Firebase Authentication users/passwords, custom claims, global platform collections, Master Admin state, Stripe billing identifiers, and integration secrets are not portable workshop data and are not restored. WhatsApp session metadata, contacts, messages, and automation documents are covered, but the provider's authenticated session files live outside Firestore and must be connected again (usually by scanning a new QR code). Reconfigure any external credentials/integration state after recovery.
- The same-project restore remains available for the original workshop UID. Cross-project restore uses a separate destination adapter and an explicitly authenticated destination account; the source Firebase project is not queried.
- Firestore does not provide a read transaction spanning every workshop collection. The export now reads a canonical server signature before and after all pages, compares the page-derived hash to both, and checks that the browser queue/draft/local-only evidence remained unchanged. An observable change rejects the export. This is a stability check, not a mathematically atomic cross-collection snapshot: a change that is not observable in those reads cannot be ruled out. Finish syncing and avoid editing during a backup for the cleanest view. The explicit full-backup operation performs three full document reads in the normal stable case (two signature scans plus the paginated export), so use it intentionally; routine navigation does not make those extra backup reads.
- The browser keeps the complete plaintext export in memory before encryption. Very large workshops may exceed available memory; the screen reports failure rather than claiming success. Resumable streaming to disk is not implemented.
- The legacy same-project restore API and service remain in source for compatibility, but its old restore controls are hidden and the Settings UI directs users to the cross-project workflow. Do not invoke the legacy route for recovery on a different project.
- Cross-project restore requires the destination workshop's business collections to be empty, while preserving its pre-provisioned profile. A matching import session may resume after interruption. The importer uses create-only writes, transactional chunk checkpoints, and a final server-side read-back hash and ownership check. Conflicting IDs or a different archive against a populated destination are blocked.

## Interpreting portable data elsewhere

The decrypted payload uses ordinary JSON and keeps original document IDs. A future database adapter should:

1. Preserve `manifest.workshop.id` as the source identity, but map it explicitly to a destination workshop identity.
2. Convert `__motofixType: "timestamp"` to the destination's timestamp/date type, `date` to an ISO date-time, `bytes` from Base64, `geopoint` to a latitude/longitude value, and `document-reference` to the corresponding path/key.
3. Import parent entities and settings before dependent records, then validate relationships such as client/O.S., O.S./stock movement, and invoice/O.S. references.
4. Keep deleted, cancelled, and archived status fields; do not infer deletion from absence in a backup.
5. Rebuild Authentication, permissions, secrets, and external integrations through an explicit secure setup process.

## Cross-project Firebase restore

1. The browser decrypts and validates the archive, builds an import plan, remaps userId values and tagged Firestore references from users/{sourceUid} to users/{destinationUid}, and checks internal references. The plan is shown before any destination write. **Use “Recuperar em outro projeto Firebase” in Settings for recovery on a new computer/project.**
2. The destination must be configured first: Firebase Authentication with Google sign-in, the MotoFix app domain in Authorized domains, this code's backupApi Cloud Function and Firestore rules, and an existing active workshop admin profile with a valid manual access projection and the Firebase admin custom claim. The import never creates an Auth user or sets a claim.
3. The destination Web SDK config is held in memory for the active Settings screen. The destination is authenticated in a separate Firebase app with in-memory auth persistence. Firebase Web API keys are public identifiers; service-account/private-key JSON is never accepted.
   The backup API permits https://appmotofix.web.app and local Vite development origins by default. Other hosted app domains must be explicitly added to BACKUP_ALLOWED_ORIGINS.
4. Read-only preflight checks destination admin authorization and counts business documents. The endpoint only returns importable for an authorized empty destination or a matching resumable import session.
5. Each server transaction creates documents in the destination workshop namespace and saves an audit checkpoint. The profile snapshot, local browser recovery data, roles, owner access, billing, and private fiscal credentials are excluded. IDs, status/history fields, dates, money, and tagged values are preserved; owner IDs and document references are remapped.
6. Finalization verifies every checkpoint, collection counts, each imported document's canonical hash, and its userId. A completed import is idempotent. The audit session stores source/destination project and workshop identifiers, counts, and status, but no customer field values or credentials.

The import Function uses the Admin SDK, so Firestore rules do not authorize its writes. The API independently verifies the destination token/project, admin claim, active profile/access, allowed collections, owner remapping, blocked privilege fields, IDs, and checkpoints. After import, the destination user's normal client SDK must read its own data under destination rules and must not read or write another workshop's records.

### Current cross-project limits

- The destination must already have an authorized admin identity, active profile, admin claim, and a deployed backup API/rules package. This feature does not provision or elevate that identity.
- The feature rejects a destination with business data to avoid silent merge or overwrite. It preserves the destination's own profile and authentication.
- Firebase Storage objects, Firebase Auth users/passwords, fiscal_private, global Master Admin data, billing identifiers, and secrets are not imported.
- Archives remain limited to 300 MB and are decrypted in browser memory; streaming large archives is not implemented.
- Emulator integration tests use independent source and destination project IDs and distinct Firestore/Auth namespaces. The end-to-end test writes a synthetic archive to disk, records its SHA-256, shuts down the source emulator, starts the destination emulator, and blocks the restore adapter to destination-only requests. These tests do not deploy or mutate real Cloud projects; remote-project recovery still requires a separate disposable remote validation.

## Future non-Firebase adapter mapping

The archive's tagged values are independent of Firebase SDK objects. A PostgreSQL adapter should use workshop-scoped tables and preserve document IDs as stable primary keys, with a separate mapping from the source workshop UID to a local workshop key. Suggested conversions are:

| Firestore value | PostgreSQL representation |
| --- | --- |
| timestamp | timestamptz using seconds and nanoseconds |
| date | timestamptz for instants or date only when the field is a calendar date |
| bytes | bytea decoded from Base64 |
| geopoint | two numeric columns or a geography point |
| document-reference | foreign key to the mapped table and stable document ID |
| money fields | numeric(14,2) rather than binary floating point |
| soft delete/cancel/archive status | explicit columns retained as history |

The proposed adapter boundary is the BackupDestinationAdapter interface. Only the Firebase Functions adapter exists today. There is no PostgreSQL adapter, schema, or test against PostgreSQL, so migration to PostgreSQL is not implemented or claimed.
