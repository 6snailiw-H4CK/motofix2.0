import { useEffect, useState } from 'react';
import { addDays, format } from 'date-fns';
import { getIdTokenResult, onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { UserProfile } from '../types';

const applyClaimRole = (profile: UserProfile, isAdminClaim: boolean): UserProfile => ({
  ...profile,
  role: isAdminClaim ? 'admin' : 'user',
  isActive: isAdminClaim ? true : profile.isActive,
});

export function useAuthProfile() {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isNewUser, setIsNewUser] = useState<boolean | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadUserProfile = async (firebaseUser: User) => {
      try {
        const tokenResult = await getIdTokenResult(firebaseUser, true);
        const isAdminClaim = tokenResult.claims.admin === true;
        const userDoc = doc(db, 'users', firebaseUser.uid);
        const userSnap = await Promise.race([
          getDoc(userDoc),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout loading user profile (>20s)')), 20000)
          )
        ]) as Awaited<ReturnType<typeof getDoc>>;

        if (!isMounted) return;

        const userExists = userSnap.exists();
        setIsNewUser(!userExists);

        if (userExists) {
          const profileData = userSnap.data() as UserProfile;
          const claimProfile = applyClaimRole(profileData, isAdminClaim);

          if (isAdminClaim && (profileData.role !== 'admin' || profileData.isActive !== true)) {
            await setDoc(userDoc, {
              role: 'admin',
              isActive: true,
              updatedAt: format(new Date(), "yyyy-MM-dd'T'HH:mm:ss'Z'"),
            }, { merge: true });
          }

          setUserProfile(claimProfile);
        } else {
          const newProfile: UserProfile = {
            uid: firebaseUser.uid,
            email: firebaseUser.email || '',
            displayName: firebaseUser.displayName || 'Usuário',
            role: isAdminClaim ? 'admin' : 'user',
            isActive: isAdminClaim,
            subscription: {
              status: isAdminClaim ? 'active' : 'inactive',
              plan: 'free',
              startsAt: format(new Date(), "yyyy-MM-dd'T'HH:mm:ss'Z'"),
              expiresAt: format(addDays(new Date(), 30), "yyyy-MM-dd'T'HH:mm:ss'Z'"),
              currentPeriodEnd: format(addDays(new Date(), 30), "yyyy-MM-dd'T'HH:mm:ss'Z'"),
              autoRenew: false
            },
            subscriptionExpiresAt: format(addDays(new Date(), 30), "yyyy-MM-dd'T'HH:mm:ss'Z'"),
            createdAt: format(new Date(), "yyyy-MM-dd'T'HH:mm:ss'Z'")
          };
          await setDoc(userDoc, newProfile);
          setUserProfile(newProfile);
        }
        setLoading(false);
      } catch (error) {
        console.error('Failed to load user profile:', error);
        if (isMounted) {
          setUserProfile(null);
          setIsNewUser(false);
          setLoading(false);
        }
      }
    };

    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        setLoading(true);
        loadUserProfile(firebaseUser);
      } else if (isMounted) {
        setUser(null);
        setUserProfile(null);
        setIsNewUser(null);
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      unsubscribeAuth();
    };
  }, []);

  return { user, userProfile, loading, isNewUser };
}
