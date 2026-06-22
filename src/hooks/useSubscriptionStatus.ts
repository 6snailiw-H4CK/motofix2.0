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
    if (!userProfile?.subscriptionExpiresAt) return false;
    return isBefore(parseISO(userProfile.subscriptionExpiresAt), new Date());
  }, [userProfile]);

  const shouldBlock = useMemo(() => {
    if (!userProfile) return false;
    return !userProfile.isActive && !isExpired;
  }, [userProfile, isExpired]);

  return { isExpired, shouldBlock };
};
