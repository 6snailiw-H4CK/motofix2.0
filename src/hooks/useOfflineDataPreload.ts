import { useCallback, useEffect, useRef } from 'react';
import { User } from 'firebase/auth';
import {
  OFFLINE_DATA_PRELOAD_STALE_MS,
  preloadUserOfflineData,
  shouldPreloadOfflineData,
} from '../services/offlineDataPreload';
import { UserProfile } from '../types';
import { recordFirestorePreload } from '../debug/firestoreDebug';

type UseOfflineDataPreloadParams = {
  user: User | null;
  userProfile: UserProfile | null;
};

const CHECK_PRELOAD_STALENESS_MS = 60 * 60 * 1000;

export const useOfflineDataPreload = ({
  user,
  userProfile,
}: UseOfflineDataPreloadParams) => {
  const preloadPromiseRef = useRef<Promise<void> | null>(null);

  const runPreload = useCallback((force = false, reason = 'unknown') => {
    if (!user || !userProfile) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    if (preloadPromiseRef.current) return;
    if (!force && !shouldPreloadOfflineData(user.uid)) return;

    const startedAt = Date.now();
    preloadPromiseRef.current = preloadUserOfflineData({
      userId: user.uid,
      includeAdminUsers: userProfile.role === 'admin' && userProfile.isActive,
    })
      .then((result) => {
        recordFirestorePreload(reason, Date.now() - startedAt, {
          status: result.status,
          loadedDocuments: result.loadedDocuments,
          failedTargets: result.failedTargets,
        });
        if (result.status === 'partial') {
          console.warn('Dados offline preparados parcialmente:', result.failedTargets);
        }
      })
      .catch((error) => {
        console.warn('Falha ao preparar dados para uso offline:', error);
      })
      .finally(() => {
        preloadPromiseRef.current = null;
      });
  }, [user, userProfile]);

  useEffect(() => {
    runPreload(false, 'mount');
  }, [runPreload]);

  useEffect(() => {
    const handleOnline = () => {
      runPreload(true, 'online');
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        runPreload(false, 'visibilitychange');
      }
    };
    const intervalId = window.setInterval(
      () => {
        runPreload(false, 'interval');
      },
      Math.min(CHECK_PRELOAD_STALENESS_MS, OFFLINE_DATA_PRELOAD_STALE_MS)
    );

    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [runPreload]);
};
