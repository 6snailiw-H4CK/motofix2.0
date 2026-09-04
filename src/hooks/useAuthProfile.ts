import { useEffect, useState } from 'react';
import { addDays, format } from 'date-fns';
import { getIdTokenResult, getRedirectResult, onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, authPersistenceReady, db } from '../firebase';
import { queueFirestoreVoidWrite } from '../services/firestoreOfflineQueue';
import { UserProfile } from '../types';

const applyClaimRole = (profile: UserProfile, isAdminClaim: boolean): UserProfile => ({
  ...profile,
  role: isAdminClaim ? 'admin' : profile.role,
  isActive: isAdminClaim ? true : profile.isActive,
});

const areUserProfilesEqual = (currentProfile: UserProfile | null, nextProfile: UserProfile | null) => {
  if (!currentProfile || !nextProfile) {
    return currentProfile === nextProfile;
  }

  return (
    currentProfile.uid === nextProfile.uid &&
    currentProfile.email === nextProfile.email &&
    currentProfile.displayName === nextProfile.displayName &&
    currentProfile.role === nextProfile.role &&
    currentProfile.isActive === nextProfile.isActive &&
    currentProfile.subscription.status === nextProfile.subscription.status &&
    currentProfile.subscription.plan === nextProfile.subscription.plan &&
    currentProfile.subscription.startsAt === nextProfile.subscription.startsAt &&
    currentProfile.subscription.expiresAt === nextProfile.subscription.expiresAt &&
    currentProfile.subscription.currentPeriodEnd === nextProfile.subscription.currentPeriodEnd &&
    currentProfile.subscription.autoRenew === nextProfile.subscription.autoRenew &&
    currentProfile.subscription.stripeCustomerId === nextProfile.subscription.stripeCustomerId &&
    currentProfile.subscription.stripeSubscriptionId === nextProfile.subscription.stripeSubscriptionId &&
    currentProfile.subscription.canceledAt === nextProfile.subscription.canceledAt &&
    currentProfile.subscription.cancelReason === nextProfile.subscription.cancelReason &&
    currentProfile.subscription.paymentMethodId === nextProfile.subscription.paymentMethodId &&
    currentProfile.subscriptionExpiresAt === nextProfile.subscriptionExpiresAt &&
    currentProfile.createdAt === nextProfile.createdAt
  );
};

const getTokenResultWithOfflineFallback = async (firebaseUser: User) => {
  try {
    const forceRefresh = typeof navigator === 'undefined' ? true : navigator.onLine;
    return await Promise.race([
      getIdTokenResult(firebaseUser, forceRefresh),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Timeout refreshing auth token (>5s)')), 5000);
      }),
    ]);
  } catch (error) {
    console.warn('Falha ao atualizar token; usando token local quando disponivel:', error);
    try {
      return await Promise.race([
        getIdTokenResult(firebaseUser),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Timeout loading local auth token (>3s)')), 3000);
        }),
      ]);
    } catch (localTokenError) {
      console.warn('Falha ao carregar token local; seguindo com perfil em cache:', localTokenError);
      return null;
    }
  }
};

export function useAuthProfile() {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [subscriptionResolved, setSubscriptionResolved] = useState(false);
  const [isNewUser, setIsNewUser] = useState<boolean | null>(null);
  const [authInitializationError, setAuthInitializationError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    let authGeneration = 0;

    const loadUserProfile = async (firebaseUser: User, generation: number) => {
      try {
        const tokenResult = await getTokenResultWithOfflineFallback(firebaseUser);
        const isAdminClaim = tokenResult?.claims.admin === true;
        const userDoc = doc(db, 'users', firebaseUser.uid);
        const userSnap = await Promise.race([
          getDoc(userDoc),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout carregando perfil remoto')), 5000)),
        ]);

        if (!isMounted || generation !== authGeneration || auth.currentUser?.uid !== firebaseUser.uid) return;

        const userExists = userSnap.exists();
        setIsNewUser(!userExists);

        if (userExists) {
          const profileData = userSnap.data() as UserProfile;
          const claimProfile = applyClaimRole(profileData, isAdminClaim);

          setUserProfile((currentProfile) => {
            if (areUserProfilesEqual(currentProfile, claimProfile)) {
              return currentProfile;
            }
            return claimProfile;
          });
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
          await queueFirestoreVoidWrite(() => setDoc(userDoc, newProfile), 'Criar perfil de usuario');
          setUserProfile((currentProfile) => {
            if (areUserProfilesEqual(currentProfile, newProfile)) {
              return currentProfile;
            }
            return newProfile;
          });
        }
        setLoading(false);
        setProfileLoading(false);
        setSubscriptionResolved(true);
      } catch (error) {
        console.error('Failed to load user profile:', error);
        if (isMounted && generation === authGeneration && auth.currentUser?.uid === firebaseUser.uid) {
          setUserProfile(null);
          setIsNewUser(false);
          setLoading(false);
          setProfileLoading(false);
          setSubscriptionResolved(true);
        }
      }
    };

    let unsubscribeAuth = () => undefined;
    const initializeAuth = async () => {
      try {
        await authPersistenceReady;
        const redirectResult = await getRedirectResult(auth);
        sessionStorage.removeItem('motofix-auth-redirect-started');
        if (redirectResult?.user && isMounted) setAuthInitializationError(null);
      } catch (error) {
        if (isMounted) {
          const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: string }).code) : '';
          const message = typeof error === 'object' && error && 'message' in error ? String((error as { message?: string }).message) : '';
          setAuthInitializationError(code ? `${code}: ${message}` : message || 'Falha ao restaurar a sessão do Firebase Auth.');
        }
        sessionStorage.removeItem('motofix-auth-redirect-started');
      }

      if (!isMounted) return;
      unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
        authGeneration += 1;
        const generation = authGeneration;
        setUserProfile(null);
        setIsNewUser(null);
        setSubscriptionResolved(false);
        if (firebaseUser) {
          setUser(firebaseUser);
          setLoading(true);
          setProfileLoading(true);
          void loadUserProfile(firebaseUser, generation);
        } else if (isMounted) {
          setUser(null);
          setLoading(false);
          setProfileLoading(false);
        }
      });
    };

    void initializeAuth();

    return () => {
      isMounted = false;
      unsubscribeAuth();
    };
  }, []);

  return {
    user,
    userProfile,
    loading,
    authLoading: loading && !user,
    profileLoading,
    subscriptionResolved,
    isNewUser,
    authInitializationError,
  };
}
