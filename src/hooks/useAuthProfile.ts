import { useEffect, useState } from 'react';
import { addDays, format } from 'date-fns';
import { getRedirectResult, onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDocFromCache, getDocFromServer, onSnapshot, serverTimestamp, writeBatch } from 'firebase/firestore';
import { auth, authPersistenceReady, db } from '../firebase';
import { withFirestoreNetworkSession } from '../services/firestoreNetworkControl';
import { firestoreOfflineQueueReady, getPendingWriteCheckpoint } from '../services/firestoreOfflineQueue';
import {
  getFirestoreSnapshotReadDetails,
  recordFirestoreListenerCreate,
  recordFirestoreReadResult,
  recordFirestoreSnapshot,
} from '../debug/firestoreDebug';
import { createPendingAccessRequest, type AccessRequest } from '../types/accessRequest';
import { UserProfile } from '../types';

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
    currentProfile.billing?.status === nextProfile.billing?.status &&
    currentProfile.billing?.currentPeriodEnd === nextProfile.billing?.currentPeriodEnd &&
    currentProfile.subscription?.status === nextProfile.subscription?.status &&
    currentProfile.subscription?.plan === nextProfile.subscription?.plan &&
    currentProfile.subscription?.startsAt === nextProfile.subscription?.startsAt &&
    currentProfile.subscription?.expiresAt === nextProfile.subscription?.expiresAt &&
    currentProfile.subscription?.currentPeriodEnd === nextProfile.subscription?.currentPeriodEnd &&
    currentProfile.subscription?.autoRenew === nextProfile.subscription?.autoRenew &&
    currentProfile.subscription?.stripeCustomerId === nextProfile.subscription?.stripeCustomerId &&
    currentProfile.subscription?.stripeSubscriptionId === nextProfile.subscription?.stripeSubscriptionId &&
    currentProfile.subscription?.canceledAt === nextProfile.subscription?.canceledAt &&
    currentProfile.subscription?.cancelReason === nextProfile.subscription?.cancelReason &&
    currentProfile.subscription?.paymentMethodId === nextProfile.subscription?.paymentMethodId &&
    currentProfile.createdAt === nextProfile.createdAt &&
    currentProfile.ownerAccess?.enabled === nextProfile.ownerAccess?.enabled &&
    currentProfile.ownerAccess?.permanent === nextProfile.ownerAccess?.permanent &&
    currentProfile.manualAccess?.enabled === nextProfile.manualAccess?.enabled &&
    currentProfile.manualAccess?.expiresAt === nextProfile.manualAccess?.expiresAt &&
    currentProfile.accessProjection?.allowed === nextProfile.accessProjection?.allowed &&
    currentProfile.accessProjection?.source === nextProfile.accessProjection?.source &&
    currentProfile.accessProjection?.validUntil === nextProfile.accessProjection?.validUntil
  );
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
        // Custom admin claims may be added after a browser session was created.
        // Refresh the ID token before Firestore rules evaluate the profile and
        // operational listeners for this authenticated session.
        try {
          if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            await firebaseUser.getIdToken();
          } else {
            await firebaseUser.getIdToken(true);
          }
        } catch (tokenRefreshError) {
          // Keep an existing Auth session usable offline or during a transient
          // outage; Firestore Rules still make the final authorization decision.
          console.warn('Falha ao atualizar o token Firebase; usando o token local:', tokenRefreshError);
          await firebaseUser.getIdToken();
        }
        if (!isMounted || generation !== authGeneration || auth.currentUser?.uid !== firebaseUser.uid) return;
        const userDoc = doc(db, 'users', firebaseUser.uid);
        let userSnap;
        try {
          userSnap = await getDocFromCache(userDoc);
        } catch {
          // A fresh browser has no cached profile yet. Open one short bootstrap
          // session so Firebase can determine whether this account is allowed.
          await firestoreOfflineQueueReady;
          if (getPendingWriteCheckpoint().length > 0) {
            throw new Error('Há alterações locais aguardando sincronização. Abra o app no aparelho que as criou e sincronize antes de validar esta conta neste navegador.');
          }
          userSnap = await withFirestoreNetworkSession(firebaseUser.uid, () => Promise.race([
            getDocFromServer(userDoc),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout carregando perfil remoto')), 5000)),
          ]));
        }
        recordFirestoreReadResult('profile:getDoc', userSnap);

        if (!isMounted || generation !== authGeneration || auth.currentUser?.uid !== firebaseUser.uid) return;

        const userExists = userSnap.exists();
        setIsNewUser(!userExists);

        if (userExists) {
          const profileData = userSnap.data() as UserProfile;

          setUserProfile((currentProfile) => {
            if (areUserProfilesEqual(currentProfile, profileData)) {
              return currentProfile;
            }
            return profileData;
          });
        } else {
          const newProfile: UserProfile = {
            uid: firebaseUser.uid,
            email: firebaseUser.email || '',
            displayName: firebaseUser.displayName || 'Usuário',
            role: 'user',
            isActive: false,
            subscription: {
              status: 'inactive',
              plan: 'free',
              startsAt: format(new Date(), "yyyy-MM-dd'T'HH:mm:ss'Z'"),
              expiresAt: format(addDays(new Date(), 30), "yyyy-MM-dd'T'HH:mm:ss'Z'"),
              currentPeriodEnd: format(addDays(new Date(), 30), "yyyy-MM-dd'T'HH:mm:ss'Z'"),
              autoRenew: false
            },
            createdAt: format(new Date(), "yyyy-MM-dd'T'HH:mm:ss'Z'")
          };
          const accessRequest: AccessRequest<ReturnType<typeof serverTimestamp>> = createPendingAccessRequest({
            uid: firebaseUser.uid,
            email: firebaseUser.email || '',
            displayName: firebaseUser.displayName || 'Usuário',
          }, serverTimestamp());
          const batch = writeBatch(db);
          batch.set(userDoc, newProfile);
          batch.set(doc(db, 'access_requests', firebaseUser.uid), accessRequest);
          // First-time account provisioning is part of authentication setup;
          // operational edits remain queued until an explicit/4-hour sync.
          await withFirestoreNetworkSession(firebaseUser.uid, () => batch.commit());
          setUserProfile((currentProfile) => {
            if (areUserProfilesEqual(currentProfile, newProfile)) {
              return currentProfile;
            }
            return newProfile;
          });
        }
        unsubscribeProfile();
        const profileListenerId = recordFirestoreListenerCreate('profile');
        unsubscribeProfile = onSnapshot(userDoc, (snapshot) => {
          if (!isMounted || generation !== authGeneration || auth.currentUser?.uid !== firebaseUser.uid) return;
          recordFirestoreSnapshot('profile', getFirestoreSnapshotReadDetails(snapshot), profileListenerId);
          if (!snapshot.exists()) {
            setUserProfile(null);
            setIsNewUser(true);
            setSubscriptionResolved(true);
            return;
          }

          const latestProfile = snapshot.data() as UserProfile;
          setIsNewUser(false);
          setUserProfile((currentProfile) => (
            areUserProfilesEqual(currentProfile, latestProfile) ? currentProfile : latestProfile
          ));
        }, (error) => {
          console.error('Failed to subscribe to user profile:', error);
        });
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
      let unsubscribeProfile = () => undefined;
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
        unsubscribeProfile();
        unsubscribeProfile = () => undefined;
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
      unsubscribeProfile();
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
