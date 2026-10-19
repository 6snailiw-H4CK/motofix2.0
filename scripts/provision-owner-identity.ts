import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { cert, deleteApp, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import {
  readExplicitServiceAccountCredential,
} from "../server/firebaseCredentialIdentity";
import {
  OWNER_IDENTITY_PROVISION_CONFIRMATION,
  OWNER_IDENTITY_REFERENCES_CONFIRMATION,
  provisionOwnerIdentity,
  type OwnerIdentityProvisionAuth,
  type OwnerIdentityProvisionDatabase,
  validateOwnerIdentityProvisioning,
} from "../server/provisionOwnerIdentity";

const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};
const safeFailureCode = (error: unknown) => (
  error instanceof Error && /^[a-z0-9_]+$/.test(error.message)
    ? error.message
    : "firebase_transaction_failed"
);

const emulatorDetected = [
  "FIRESTORE_EMULATOR_HOST",
  "FIREBASE_AUTH_EMULATOR_HOST",
  "FIREBASE_STORAGE_EMULATOR_HOST",
].some((name) => !!process.env[name]?.trim());
const configuredProjectMismatch = ["GCLOUD_PROJECT", "GOOGLE_CLOUD_PROJECT"]
  .some((name) => !!process.env[name]?.trim() && process.env[name]?.trim() !== process.env.MOTOFIX_FIREBASE_PROJECT_ID?.trim());
const ambiguousCredentialConfiguration = [
  "GOOGLE_APPLICATION_CREDENTIALS",
  "FIREBASE_CONFIG",
  "FIREBASE_SERVICE_ACCOUNT_PATH",
].some((name) => !!process.env[name]?.trim());

if (emulatorDetected) fail("Firebase Emulator detected; owner identity provisioning is disabled.");
if (configuredProjectMismatch || ambiguousCredentialConfiguration) {
  fail("Conflicting Firebase project or credential configuration detected; refusing initialization.");
}
if (getApps().length > 0) fail("An existing Firebase Admin app is present; refusing ambiguous initialization.");

const expectedProjectId = process.env.MOTOFIX_FIREBASE_PROJECT_ID?.trim();
const expectedExecutionPrincipal = process.env.MOTOFIX_FIREBASE_EXECUTION_PRINCIPAL?.trim();
const configuredCredentialPath = process.env.MOTOFIX_FIREBASE_SERVICE_ACCOUNT_PATH?.trim();
if (!expectedProjectId || !expectedExecutionPrincipal || !configuredCredentialPath) {
  fail("Set MOTOFIX_FIREBASE_PROJECT_ID, MOTOFIX_FIREBASE_EXECUTION_PRINCIPAL, and MOTOFIX_FIREBASE_SERVICE_ACCOUNT_PATH explicitly.");
}

let credential;
try {
  credential = await readExplicitServiceAccountCredential(configuredCredentialPath, process.cwd());
} catch {
  fail("The explicit Firebase service-account credential could not be validated.");
}

if (credential.projectId !== expectedProjectId) {
  fail("Expected Firebase project does not match the explicit service-account project.");
}
if (credential.identity.principal !== expectedExecutionPrincipal) {
  fail("Expected execution principal does not match the explicit service-account principal.");
}
if (!stdin.isTTY || !stdout.isTTY) {
  fail("Interactive terminal required; no Firebase writes were made.");
}

const terminal = createInterface({ input: stdin, output: stdout });
let ownerUid: string;
let independentlyConfirmedOwnerUid: string;
let externalReferencesConfirmation: string;
let operationConfirmation: string;
let identityValidationReference: string;
let approvalReference: string;
let reason: string;
try {
  console.log("This tool never writes custom claims. motofix_owner must already be true; otherwise it aborts before Firestore access. Firebase Admin has no safe compare-and-set for replacing custom claims.");
  console.log("Validate the owner UID against an independent, institutionally approved source before continuing.");
  ownerUid = await terminal.question("Owner UID: ");
  independentlyConfirmedOwnerUid = await terminal.question("Re-enter the independently validated owner UID: ");
  console.log("Enter references supplied by you only after verifying the identity record and approval externally; this tool does not validate those records.");
  identityValidationReference = await terminal.question("Independent identity-validation record/reference: ");
  approvalReference = await terminal.question("Approval/ticket reference: ");
  reason = await terminal.question("Provisioning reason: ");
  externalReferencesConfirmation = await terminal.question(
    `After verifying both references outside this tool, type exactly "${OWNER_IDENTITY_REFERENCES_CONFIRMATION}": `,
  );
  operationConfirmation = await terminal.question(
    `Type exactly "${OWNER_IDENTITY_PROVISION_CONFIRMATION}" to authorize the write: `,
  );
} finally {
  terminal.close();
}

const provisioningRequest = {
  expectedProjectId,
  credentialProjectId: credential.projectId,
  expectedExecutionPrincipal,
  credentialPrincipal: credential.identity.principal,
  ownerUid,
  independentlyConfirmedOwnerUid,
  externalReferencesConfirmation,
  operationConfirmation,
  identityValidationReference,
  approvalReference,
  reason,
  emulatorDetected,
};
try {
  validateOwnerIdentityProvisioning(provisioningRequest);
} catch (error) {
  fail(`Owner identity provisioning preflight failed (${safeFailureCode(error)}); no Firebase write was made.`);
}

const app = initializeApp({
  credential: cert(credential.serviceAccount),
  projectId: expectedProjectId,
});
const firestore = getFirestore(app);
const authClient = getAuth(app);
const auth: OwnerIdentityProvisionAuth = {
  getUser: async (uid) => {
    const user = await authClient.getUser(uid);
    return { uid: user.uid, customClaims: user.customClaims ?? {} };
  },
};
const db: OwnerIdentityProvisionDatabase = {
  runTransaction: (operation) => firestore.runTransaction((transaction) => operation({
    get: async (reference) => {
      const snapshot = await transaction.get(firestore.doc(reference.path));
      return {
        exists: snapshot.exists,
        get: (field) => snapshot.get(field),
        data: () => snapshot.exists ? snapshot.data() : undefined,
      };
    },
    create: (reference, value) => {
      transaction.create(firestore.doc(reference.path), value);
    },
    update: (reference, value) => {
      transaction.update(firestore.doc(reference.path), value);
    },
    set: (reference, value, merge) => {
      transaction.set(firestore.doc(reference.path), value, { merge });
    },
  })),
};

try {
  const result = await provisionOwnerIdentity({
    ...provisioningRequest,
    db,
    auth,
    serverTimestamp: FieldValue.serverTimestamp(),
  });
  console.log(JSON.stringify({
    dataSynchronizationStatus: result.syncStatus,
    operationalAccessVerified: result.operationalAccessVerified,
    projectId: result.projectId,
    auditEventId: result.auditEventId,
    note: "Provisioning data was synchronized; this does not confirm operational access. Refresh the owner's ID token, validate /api/account/access, and verify real Firestore Rules access separately.",
  }));
} catch (error) {
  console.error(`Owner identity provisioning/synchronization failed (${safeFailureCode(error)}); no UID, credential, or token was logged.`);
  process.exitCode = 1;
} finally {
  await deleteApp(app);
}
