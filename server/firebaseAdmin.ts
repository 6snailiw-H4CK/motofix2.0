import fs from "node:fs";
import path from "node:path";
import { cert, getApps, initializeApp, type App, type ServiceAccount } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

type FirebaseAdminState = {
  app: App | null;
  auth: Auth | null;
  db: Firestore | null;
  initialized: boolean;
  serviceAccountFilePath: string;
  error: unknown;
};

const serviceAccountFile = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || "./firebase-service-account.json";
const serviceAccountFilePath = path.resolve(process.cwd(), serviceAccountFile);

const initializeFirebaseAdmin = (): FirebaseAdminState => {
  try {
    const app = getApps()[0] || initializeApp({
      credential: cert(JSON.parse(fs.readFileSync(serviceAccountFilePath, "utf8")) as ServiceAccount),
    });
    const db = getFirestore(app);
    db.settings({ ignoreUndefinedProperties: true });

    return {
      app,
      auth: getAuth(app),
      db,
      initialized: true,
      serviceAccountFilePath,
      error: null,
    };
  } catch (error) {
    return {
      app: null,
      auth: null,
      db: null,
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
export const firebaseAdminServiceAccountPath = firebaseAdmin.serviceAccountFilePath;
