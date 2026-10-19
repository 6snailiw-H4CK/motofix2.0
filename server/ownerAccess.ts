import type { Auth } from "firebase-admin/auth";
import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import { calculateApplicationAccess, type AccountAccessProfile, type AccessProjection } from "./accountAccess";
import { getOwnerUidInTransaction } from "./ownerIdentity";

type OwnerProfile = AccountAccessProfile & {
  role?: string;
  isActive?: boolean;
  ownerAccess?: { enabled?: boolean; permanent?: boolean };
};

const auditProjection = (projection: AccessProjection | undefined) => ({
  allowed: projection?.allowed ?? null,
  source: projection?.source ?? null,
  validUntil: projection?.validUntil?.toDate().toISOString() ?? null,
  reason: projection?.reason ?? null,
});

const persistedProjection = (projection: AccessProjection) => ({
  ...projection,
  validUntil: projection.validUntil,
  evaluatedAt: Timestamp.fromMillis(projection.evaluatedAt.toMillis()),
});

export const setOwnerAccess = async (options: {
  auth: Auth;
  db: Firestore;
  actorUid: string;
  targetUid: string;
  enabled: boolean;
  reason: string;
  now?: number;
}) => {
  const reason = options.reason.trim().slice(0, 500);
  if (!options.actorUid || !options.targetUid || !reason) {
    throw new Error("actor_target_and_reason_required");
  }

  const actorAuth = await options.auth.getUser(options.actorUid);
  if (actorAuth.customClaims?.master_admin !== true) throw new Error("actor_not_master_admin");

  const actorRef = options.db.collection("users").doc(options.actorUid);
  const targetRef = options.db.collection("users").doc(options.targetUid);
  const auditRef = options.db.collection("audit_events").doc();
  const now = options.now ?? Date.now();
  let nextProjection: AccessProjection | null = null;
  let previousOwnerAccess = { enabled: false, permanent: false };

  await options.db.runTransaction(async (transaction) => {
    const ownerUid = await getOwnerUidInTransaction(transaction, options.db);
    if (!ownerUid) throw new Error("owner_identity_not_configured");
    if (options.targetUid !== ownerUid) throw new Error("target_not_authorized_owner");
    const actorSnapshot = await transaction.get(actorRef);
    const targetSnapshot = options.actorUid === options.targetUid
      ? actorSnapshot
      : await transaction.get(targetRef);
    if (!actorSnapshot.exists) throw new Error("actor_profile_not_found");
    if (!targetSnapshot.exists) throw new Error("target_profile_not_found");

    const actorProfile = actorSnapshot.data() as OwnerProfile;
    const targetProfile = targetSnapshot.data() as OwnerProfile;
    if (actorProfile.role !== "master_admin" || actorProfile.isActive !== true) {
      throw new Error("actor_not_active_master_admin");
    }
    if (targetProfile.role !== "master_admin") throw new Error("target_not_master_admin");
    if (options.enabled && targetProfile.isActive !== true) throw new Error("inactive_target_cannot_receive_owner_access");

    previousOwnerAccess = {
      enabled: targetProfile.ownerAccess?.enabled === true,
      permanent: targetProfile.ownerAccess?.permanent === true,
    };
    if (previousOwnerAccess.enabled === options.enabled && previousOwnerAccess.permanent === options.enabled) {
      throw new Error("owner_access_unchanged");
    }

    const nextProfile: OwnerProfile = {
      ...targetProfile,
      ownerAccess: { enabled: options.enabled, permanent: options.enabled },
      ...(options.enabled ? { manualAccess: { enabled: false, expiresAt: null } } : {}),
    };
    nextProjection = calculateApplicationAccess(nextProfile, now, options.targetUid, ownerUid);
    transaction.update(targetRef, {
      ownerAccess: { enabled: options.enabled, permanent: options.enabled },
      accessProjection: persistedProjection(nextProjection),
      ...(options.enabled ? {
        manualAccess: { enabled: false, expiresAt: null },
        subscriptionExpiresAt: null,
      } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.create(auditRef, {
      actor: options.actorUid,
      action: options.enabled ? "owner_access_granted" : "owner_access_revoked",
      target: options.targetUid,
      before: {
        role: targetProfile.role ?? null,
        isActive: targetProfile.isActive === true,
        ownerAccess: previousOwnerAccess,
        manualAccess: {
          enabled: targetProfile.manualAccess?.enabled === true,
          expiresAt: targetProfile.manualAccess?.expiresAt ?? null,
        },
        subscriptionExpiresAt: targetProfile.subscriptionExpiresAt ?? null,
        accessProjection: auditProjection(targetProfile.accessProjection),
      },
      after: {
        role: targetProfile.role ?? null,
        isActive: targetProfile.isActive === true,
        ownerAccess: { enabled: options.enabled, permanent: options.enabled },
        manualAccess: {
          enabled: options.enabled ? false : targetProfile.manualAccess?.enabled === true,
          expiresAt: options.enabled ? null : targetProfile.manualAccess?.expiresAt ?? null,
        },
        subscriptionExpiresAt: options.enabled ? null : targetProfile.subscriptionExpiresAt ?? null,
        accessProjection: auditProjection(nextProjection),
      },
      source: "admin",
      reason,
      timestamp: FieldValue.serverTimestamp(),
    });
  });

  return {
    enabled: options.enabled,
    projection: nextProjection,
    auditEventId: auditRef.id,
  };
};