import {
  FieldPath,
  type Firestore,
  type Query,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";
import {
  ownerIdentityMatches,
  projectionInputFingerprint,
  revalidateProjection,
  type ProjectionMigrationAdapter,
  type ProjectionMigrationProfile,
} from "./access-projection-backfill";
import { getOwnerUidFromSnapshot, OWNER_IDENTITY_COLLECTION, OWNER_IDENTITY_DOCUMENT } from "../server/ownerIdentity";
import {
  assertVerifiedOperationalAuthorization,
  type OperationalAuthorizationOperation,
  type VerifiedOperationalAuthorization,
} from "./access-projection-operational-authorization";
import {
  getEffectiveFirestoreProjectId,
  isDedicatedLocalAccessProjectionEmulator,
  isApprovedFirestoreEndpoint,
  isApprovedFirestoreProject,
} from "../server/firestoreProjectIdentity";
import type { FirebaseCredentialIdentity } from "../server/firebaseCredentialIdentity";
import {
  claimOperationalAuthorizationExecution,
  type OperationalAuthorizationExecution,
} from "./access-projection-replay-registry";

type AuthUserReader = {
  getUser: (uid: string) => Promise<{ customClaims?: Record<string, unknown> }>;
};

export const readAuthUserWithTimeout = async (
  auth: AuthUserReader,
  uid: string,
  timeoutMs = 10_000,
) => {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      auth.getUser(uid),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(Object.assign(new Error("auth/timeout"), { code: "auth/timeout" })), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
};

const ownerProfileIsValid = (profile: Record<string, unknown>, uid: string) => {
  const ownerAccess = profile.ownerAccess && typeof profile.ownerAccess === "object"
    ? profile.ownerAccess as Record<string, unknown>
    : {};
  return profile.uid === undefined || profile.uid === uid
    ? profile.isActive === true
      && profile.role === "master_admin"
      && ownerAccess.enabled === true
      && ownerAccess.permanent === true
    : false;
};

const claimsMatchProfile = (claims: Record<string, unknown> | null, profile: Record<string, unknown>, uid: string, ownerUid: string) => {
  if (!claims) return false;
  const isOwner = uid === ownerUid
    && profile.isActive === true
    && profile.role === "master_admin"
    && typeof profile.ownerAccess === "object"
    && profile.ownerAccess !== null
    && (profile.ownerAccess as Record<string, unknown>).enabled === true
    && (profile.ownerAccess as Record<string, unknown>).permanent === true;
  const expected = {
    admin: profile.isActive === true && (profile.role === "admin" || profile.role === "master_admin"),
    master_admin: profile.isActive === true && profile.role === "master_admin",
    isActive: profile.isActive === true,
    motofix_owner: isOwner,
  };
  return Object.entries(expected).every(([key, value]) => (claims[key] === true) === value);
};

export const createAccessProjectionFirestoreAdapter = (
  db: Firestore,
  auth: AuthUserReader,
  expectedProjectId: string,
  operation: OperationalAuthorizationOperation = "dry-run",
  targetEnvironment?: string,
  reportHash: string | null = null,
  operationalAuthorization?: VerifiedOperationalAuthorization,
  credentialIdentity?: FirebaseCredentialIdentity | null,
  environment: Record<string, string | undefined> = process.env,
  authorizationExecution?: OperationalAuthorizationExecution,
): ProjectionMigrationAdapter => {
  let assertAuthorizationExecution: (() => void) | null = null;
  const assertOperationalBoundary = () => {
    if (!isApprovedFirestoreEndpoint(db, environment, expectedProjectId)) {
      throw new Error("firestore_endpoint_not_approved");
    }
    const currentProjectId = getEffectiveFirestoreProjectId(db);
    if (!currentProjectId || currentProjectId !== expectedProjectId) {
      throw new Error("firebase_project_mismatch");
    }
    if (!isDedicatedLocalAccessProjectionEmulator(db, expectedProjectId)) {
      if (!credentialIdentity || credentialIdentity.method !== "explicit-service-account") {
        throw new Error("firebase_credential_identity_unverified");
      }
      assertVerifiedOperationalAuthorization(operationalAuthorization, {
        projectId: expectedProjectId,
        targetEnvironment: targetEnvironment ?? "",
        operation,
        reportHash,
        credentialPrincipal: credentialIdentity.principal,
      });
      if (!assertAuthorizationExecution) {
        assertAuthorizationExecution = claimOperationalAuthorizationExecution(
          authorizationExecution,
          operationalAuthorization,
        );
      }
      assertAuthorizationExecution();
    }
    return currentProjectId;
  };
  const projectId = assertOperationalBoundary();
  const ownerRef = db.collection(OWNER_IDENTITY_COLLECTION).doc(OWNER_IDENTITY_DOCUMENT);
  const ownerProfileRef = (uid: string) => db.collection("users").doc(uid);

  const validateOwner = async (uid: string) => {
    assertOperationalBoundary();
    const [identity, profileSnapshot, userRecord] = await Promise.all([
      ownerRef.get(),
      ownerProfileRef(uid).get(),
      readAuthUserWithTimeout(auth, uid),
    ]);
    if (!ownerIdentityMatches(uid, getOwnerUidFromSnapshot(identity)) || !profileSnapshot.exists) return false;
    const profile = profileSnapshot.data() as Record<string, unknown>;
    return ownerProfileIsValid(profile, uid)
      && claimsMatchProfile(userRecord.customClaims ?? {}, profile, uid, uid);
  };

  return {
    projectId,
    validateProject: async () => {
      assertOperationalBoundary();
      return isApprovedFirestoreProject(db, expectedProjectId);
    },
    getOwnerUid: async () => {
      assertOperationalBoundary();
      return getOwnerUidFromSnapshot(await ownerRef.get());
    },
    validateOwner,
    async *listProfiles(): AsyncIterable<ProjectionMigrationProfile> {
      assertOperationalBoundary();
      const users = db.collection("users");
      const pageSize = 250;
      let cursor: QueryDocumentSnapshot | null = null;
      while (true) {
        assertOperationalBoundary();
        let query: Query = users.orderBy(FieldPath.documentId()).limit(pageSize);
        if (cursor) query = query.startAfter(cursor);
        const page = await query.get();
        for (const document of page.docs) {
          yield { uid: document.id, profile: document.data() as Record<string, unknown> };
        }
        if (page.size < pageSize) return;
        cursor = page.docs[page.docs.length - 1];
      }
    },
    getClaims: async (uid) => {
      assertOperationalBoundary();
      try {
        const user = await readAuthUserWithTimeout(auth, uid);
        return user.customClaims ?? {};
      } catch (error) {
        const code = typeof error === "object" && error !== null && "code" in error
          ? (error as { code?: unknown }).code
          : null;
        if (code === "auth/user-not-found") return null;
        throw error;
      }
    },
    applyProjection: async (uid, expected, ownerUid, expectedInputFingerprint) => {
      assertOperationalBoundary();
      try {
        if (!(await validateOwner(ownerUid))) return "owner_identity_changed";
      } catch {
        return "owner_identity_changed";
      }

      let userRecord;
      try {
        userRecord = await readAuthUserWithTimeout(auth, uid);
      } catch (error) {
        const code = typeof error === "object" && error !== null && "code" in error
          ? (error as { code?: unknown }).code
          : null;
        if (code === "auth/user-not-found" || uid === ownerUid) return "owner_identity_changed";
        return "auth_unavailable";
      }

      const userRef = ownerProfileRef(uid);
      return db.runTransaction(async (transaction) => {
        assertOperationalBoundary();
        const [userSnapshot, ownerSnapshot, ownerProfileSnapshot] = await Promise.all([
          transaction.get(userRef),
          transaction.get(ownerRef),
          transaction.get(ownerProfileRef(ownerUid)),
        ]);
        const latestOwnerUid = getOwnerUidFromSnapshot(ownerSnapshot);
        if (!ownerIdentityMatches(ownerUid, latestOwnerUid)) return "owner_identity_changed";
        if (!ownerProfileSnapshot.exists) return "owner_identity_changed";
        const ownerProfile = ownerProfileSnapshot.data() as Record<string, unknown>;
        if (!ownerProfileIsValid(ownerProfile, ownerUid)) return "owner_identity_changed";
        if (!userSnapshot.exists) return "stale";

        const profile = userSnapshot.data() as Record<string, unknown>;
        if (projectionInputFingerprint(profile) !== expectedInputFingerprint) return "stale";
        if (!claimsMatchProfile(userRecord.customClaims ?? {}, profile, uid, ownerUid)) {
          return uid === ownerUid ? "owner_identity_changed" : "auth_unavailable";
        }
        const revalidation = revalidateProjection(profile, uid, latestOwnerUid, expected);
        if (revalidation.result !== "updated" || !revalidation.projection) return revalidation.result;

        assertOperationalBoundary();
        transaction.update(userRef, {
          accessProjection: revalidation.projection,
        });
        return "updated";
      });
    },
  };
};
