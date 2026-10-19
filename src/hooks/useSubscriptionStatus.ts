import { useCallback, useEffect, useState } from 'react';
import { evaluateSessionAccountAccess, isDesignatedOwnerSession, mapAccountAccess, scheduleSubscriptionExpiry } from '../lib/subscriptionAccess';
import type { UserProfile } from '../types';

type UseSubscriptionStatusParams = {
  authenticatedUid?: string | null;
  userProfile?: UserProfile | null;
};

type UseSubscriptionStatusResult = {
  isExpired: boolean;
  shouldBlock: boolean;
  subscriptionActive: boolean;
  loading: boolean;
  error: string | null;
  reason: string | null;
  refresh: () => void;
};

export const useSubscriptionStatus = ({ authenticatedUid, userProfile }: UseSubscriptionStatusParams): UseSubscriptionStatusResult => {
  const [, setRefreshVersion] = useState(0);
  const sessionUid = authenticatedUid ?? null;
  const ownerSession = isDesignatedOwnerSession(sessionUid);
  const decision = evaluateSessionAccountAccess(sessionUid, userProfile);
  const accessValidUntil = decision?.expiresAt ?? null;
  const refresh = useCallback(() => setRefreshVersion((current) => current + 1), []);

  useEffect(() => {
    return scheduleSubscriptionExpiry(accessValidUntil, new Date(), refresh);
  }, [accessValidUntil, refresh]);

  if (!decision) {
    return {
      isExpired: false,
      shouldBlock: false,
      subscriptionActive: false,
      loading: false,
      error: null,
      reason: null,
      refresh,
    };
  }

  return {
    ...mapAccountAccess(decision),
    loading: false,
    error: null,
    reason: decision.reason,
    refresh,
  };
};
