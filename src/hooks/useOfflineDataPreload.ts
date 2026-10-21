import { useCallback, useEffect, useRef } from 'react';
import { User } from 'firebase/auth';
import {
  OFFLINE_DATA_PRELOAD_STALE_MS,
  preloadUserOfflineData,
  shouldPreloadOfflineData,
} from '../services/offlineDataPreload';
import { type UserProfile } from '../types';
import { recordFirestorePreload } from '../debug/firestoreDebug';

type UseOfflineDataPreloadParams = {
  user: User | null;
  userProfile: UserProfile | null;
  hasAccountAccess: boolean;
};

const CHECK_PRELOAD_STALENESS_MS = 60 * 60 * 1000;

export const useOfflineDataPreload = ({
  user,
  userProfile,
  hasAccountAccess,
}: UseOfflineDataPreloadParams) => {
  const preloadPromiseRef = useRef<Promise<void> | null>(null);

  const runPreload = useCallback((reason = 'unknown') => {
    if (!user || !userProfile || !hasAccountAccess) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    if (preloadPromiseRef.current) return;
    if (!shouldPreloadOfflineData(user.uid)) return;

    const startedAt = Date.now();
    preloadPromiseRef.current = preloadUserOfflineData({ userId: user.uid })
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
  }, [hasAccountAccess, user, userProfile]);

  useEffect(() => {
    runPreload('mount');
  }, [runPreload]);

  useEffect(() => {
    const handleOnline = () => {
      runPreload('online');
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        runPreload('visibilitychange');
      }
    };
    const intervalId = window.setInterval(
      () => {
        runPreload('interval');
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
