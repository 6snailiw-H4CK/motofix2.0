import type { DecodedIdToken } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { canAccessApplication } from './accountAccess';

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

export const hasApplicationAccess = async (db: Firestore, decoded: DecodedIdToken) => {
  const snapshot = await db.collection('users').doc(decoded.uid).get();
  if (!snapshot.exists) return false;
  return canAccessApplication(decoded, snapshot.data()).allowed;
};

export const hasActiveAdminAccess = async (db: Firestore, decoded: DecodedIdToken) => {
  const profile = await getActiveUserProfile(db, decoded.uid);
  if (profile?.role === 'admin') return decoded.admin === true;
  if (profile?.role === 'master_admin') return decoded.master_admin === true;
  return false;
};

export const hasActiveMasterAdminAccess = async (db: Firestore, decoded: DecodedIdToken) => {
  if (decoded.master_admin !== true) return false;
  const profile = await getActiveUserProfile(db, decoded.uid);
  return profile?.role === 'master_admin';
};