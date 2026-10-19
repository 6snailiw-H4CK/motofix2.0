import fs from "node:fs";
import path from "node:path";
import { applicationDefault, cert, getApps, initializeApp, type App, type ServiceAccount } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getEffectiveFirestoreProjectId } from "./firestoreProjectIdentity";
import {
  explicitServiceAccountIdentity,
  type FirebaseCredentialIdentity,
} from "./firebaseCredentialIdentity";

type FirebaseAdminState = {
  app: App | null;
  auth: Auth | null;
  db: Firestore | null;
  effectiveProjectId: string | null;
  credentialIdentity: FirebaseCredentialIdentity | null;
  initialized: boolean;
  serviceAccountFilePath: string;
  error: unknown;
};

const configuredServiceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim() || null;
const serviceAccountFilePath = configuredServiceAccountPath
  ? path.resolve(process.cwd(), configuredServiceAccountPath)
  : "Application Default Credentials";

const initializeFirebaseAdmin = (): FirebaseAdminState => {
  try {
    const existingApp = getApps()[0];
    const serviceAccount = configuredServiceAccountPath
      ? JSON.parse(fs.readFileSync(serviceAccountFilePath, "utf8")) as ServiceAccount
      : null;
    const credentialIdentity = !existingApp && serviceAccount
      ? explicitServiceAccountIdentity(serviceAccount)
      : null;
    const app = existingApp || initializeApp({
      credential: serviceAccount ? cert(serviceAccount) : applicationDefault(),
    });
    const db = getFirestore(app);
    db.settings({ ignoreUndefinedProperties: true });

    return {
      app,
      auth: getAuth(app),
      db,
      effectiveProjectId: getEffectiveFirestoreProjectId(db),
      credentialIdentity,
      initialized: true,
      serviceAccountFilePath,
      error: null,
    };
  } catch (error) {
    return {
      app: null,
      auth: null,
      db: null,
      effectiveProjectId: null,
      credentialIdentity: null,
      initialized: false,
      serviceAccountFilePath,
      error,
    };
  }
};

export const firebaseAdmin = initializeFirebaseAdmin();
export const adminApp = firebaseAdmin.app;
export const adminAuth = firebaseAdmin.auth;
export const adminDb = firebaseAdmin.db;
export const firebaseAdminInitialized = firebaseAdmin.initialized;
export const firebaseAdminEffectiveProjectId = firebaseAdmin.effectiveProjectId;
export const firebaseAdminCredentialIdentity = firebaseAdmin.credentialIdentity;
export const firebaseAdminServiceAccountPath = firebaseAdmin.serviceAccountFilePath;
