import {
  cert,
  getApps,
  initializeApp,
  type ServiceAccount,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import {
  explicitServiceAccountIdentity,
  type FirebaseCredentialIdentity,
} from "./firebaseCredentialIdentity";

export const initializeFirebaseAdminForAccessProjectionMigration = (
  serviceAccount: ServiceAccount,
): {
  auth: ReturnType<typeof getAuth>;
  db: ReturnType<typeof getFirestore>;
  credentialIdentity: FirebaseCredentialIdentity;
} => {
  if (getApps().length > 0) throw new Error("firebase_admin_app_preexisting");
  const credentialIdentity = explicitServiceAccountIdentity(serviceAccount);
  if (!credentialIdentity) throw new Error("firebase_credential_identity_unverified");

  const app = initializeApp({ credential: cert(serviceAccount) });
  const db = getFirestore(app);
  db.settings({ ignoreUndefinedProperties: true });
  return { auth: getAuth(app), db, credentialIdentity };
};
