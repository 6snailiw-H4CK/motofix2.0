import { useMemo } from 'react';
import { isBefore, parseISO } from 'date-fns';
import type { UserProfile } from '../types';

type UseSubscriptionStatusParams = {
  userProfile?: UserProfile | null;
};

type UseSubscriptionStatusResult = {
  isExpired: boolean;
  shouldBlock: boolean;
};

export const useSubscriptionStatus = ({ userProfile }: UseSubscriptionStatusParams): UseSubscriptionStatusResult => {
  const isExpired = useMemo(() => {
    const billing = userProfile?.billing;
    if (billing?.status) {
      if (!['active', 'trialing'].includes(billing.status)) return true;
      return !billing.currentPeriodEnd || isBefore(parseISO(billing.currentPeriodEnd), new Date());
    }
    if (!userProfile?.subscriptionExpiresAt) return false; // compatibility for manually migrated accounts
    return isBefore(parseISO(userProfile.subscriptionExpiresAt), new Date());
  }, [userProfile]);

  const shouldBlock = useMemo(() => {
    if (!userProfile) return false;
    return !userProfile.isActive && !isExpired;
  }, [userProfile, isExpired]);

  return { isExpired, shouldBlock };
};
