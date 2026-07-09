import { useCallback, useEffect, useRef } from 'react';
import { User } from 'firebase/auth';
import {
  OFFLINE_DATA_PRELOAD_STALE_MS,
  preloadUserOfflineData,
  shouldPreloadOfflineData,
} from '../services/offlineDataPreload';
import { UserProfile } from '../types';

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

  const runPreload = useCallback((force = false) => {
    if (!user || !userProfile) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    if (preloadPromiseRef.current) return;
    if (!force && !shouldPreloadOfflineData(user.uid)) return;

    preloadPromiseRef.current = preloadUserOfflineData({
      userId: user.uid,
      includeAdminUsers: userProfile.role === 'admin' && userProfile.isActive,
    })
      .then((result) => {
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
    runPreload(false);
  }, [runPreload]);

  useEffect(() => {
    const handleOnline = () => runPreload(true);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        runPreload(false);
      }
    };
    const intervalId = window.setInterval(
      () => runPreload(false),
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
