import type { Firestore, Transaction } from "firebase-admin/firestore";

export const OWNER_IDENTITY_COLLECTION = "system";
export const OWNER_IDENTITY_DOCUMENT = "access_config";
export const MOTOFIX_OWNER_UID = "o5XNtNFwKMQzZj28WfTEiGSFN0A3";

export const normalizeOwnerUid = (value: unknown) => (
  typeof value === "string"
    && value.length > 0
    && value.length <= 128
    && value.trim() === value
    ? value
    : null
);

export const getOwnerUidFromSnapshot = (snapshot: { exists: boolean; get: (field: string) => unknown }) => (
  snapshot.exists ? normalizeOwnerUid(snapshot.get("ownerUid")) : null
);

export const getOwnerUid = async (db: Firestore) => {
  const snapshot = await db.collection(OWNER_IDENTITY_COLLECTION).doc(OWNER_IDENTITY_DOCUMENT).get();
  return getOwnerUidFromSnapshot(snapshot);
};

export const getOwnerUidInTransaction = async (transaction: Transaction, db: Firestore) => {
  const ref = db.collection(OWNER_IDENTITY_COLLECTION).doc(OWNER_IDENTITY_DOCUMENT);
  return getOwnerUidFromSnapshot(await transaction.get(ref));
};

export const isDesignatedOwnerUid = (
  uid: string | null | undefined,
) => !!uid && uid === MOTOFIX_OWNER_UID;
