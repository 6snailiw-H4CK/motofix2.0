import type { DecodedIdToken } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';

type UserAccessProfile = {
  email?: string;
  isActive?: boolean;
  role?: string;
};

export const getActiveUserProfile = async (db: Firestore, userId: string) => {
  const snapshot = await db.collection('users').doc(userId).get();
  if (!snapshot.exists) return null;

  const profile = snapshot.data() as UserAccessProfile | undefined;
  return profile?.isActive === true ? profile : null;
};

export const hasActiveUserAccess = async (db: Firestore, userId: string) => (
  (await getActiveUserProfile(db, userId)) !== null
);

export const hasActiveAdminAccess = async (db: Firestore, decoded: DecodedIdToken) => {
  if (decoded.admin !== true) return false;
  const profile = await getActiveUserProfile(db, decoded.uid);
  return profile?.role === 'admin';
};