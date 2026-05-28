import { useEffect } from 'react';
import { isBefore, parseISO } from 'date-fns';
import { userRepository } from '../services/userRepository';
import type { UserProfile } from '../types';

type UseSubscriptionExpiryGuardParams = {
  userProfile?: UserProfile | null;
};

export const useSubscriptionExpiryGuard = ({
  userProfile,
}: UseSubscriptionExpiryGuardParams) => {
  useEffect(() => {
    if (
      !userProfile ||
      userProfile.role === 'admin' ||
      !userProfile.subscriptionExpiresAt ||
      !userProfile.isActive
    ) {
      return;
    }

    const expiryDate = parseISO(userProfile.subscriptionExpiresAt);
    const today = new Date();

    if (isBefore(expiryDate, today)) {
      userRepository.update(userProfile.uid, {
        isActive: false,
      }).catch((error) => console.error('Error auto-blocking expired user', error));
    }
  }, [userProfile]);
};
