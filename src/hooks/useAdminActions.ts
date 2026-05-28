import { addDays, format, isAfter, isBefore, parseISO } from 'date-fns';
import { useCallback } from 'react';
import { handleFirestoreError, OperationType } from '../services/firestoreError';
import { userRepository } from '../services/userRepository';
import type { UserProfile } from '../types';

type UseAdminActionsParams = {
  users: UserProfile[];
  userProfile: UserProfile | null;
};

const subscriptionDateFormat = "yyyy-MM-dd'T'HH:mm:ss'Z'";

export const useAdminActions = ({ users, userProfile }: UseAdminActionsParams) => {
  const isAdmin = userProfile?.role === 'admin';

  const toggleUserStatus = useCallback(async (targetUser: UserProfile) => {
    if (!isAdmin) return;

    try {
      const updates: Record<string, unknown> = { isActive: !targetUser.isActive };

      if (!targetUser.isActive && !targetUser.subscriptionExpiresAt) {
        updates.subscriptionExpiresAt = format(addDays(new Date(), 30), subscriptionDateFormat);
      }

      await userRepository.update(targetUser.uid, updates);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'users');
    }
  }, [isAdmin]);

  const updateSubscription = useCallback(async (uid: string, days: number) => {
    if (!isAdmin) return;

    try {
      const targetUser = users.find((appUser) => appUser.uid === uid);
      if (!targetUser) return;

      const currentExpiry = targetUser.subscriptionExpiresAt ? parseISO(targetUser.subscriptionExpiresAt) : new Date();
      let baseDate = currentExpiry;

      if (days > 0 && isBefore(currentExpiry, new Date())) {
        baseDate = new Date();
      }

      const newExpiry = format(addDays(baseDate, days), subscriptionDateFormat);

      await userRepository.update(uid, {
        subscriptionExpiresAt: newExpiry,
        isActive: isAfter(parseISO(newExpiry), new Date()),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'users');
    }
  }, [isAdmin, users]);

  const setSubscriptionDate = useCallback(async (uid: string, dateStr: string) => {
    if (!isAdmin) return;

    try {
      const newExpiry = `${dateStr}T23:59:59Z`;

      await userRepository.update(uid, {
        subscriptionExpiresAt: newExpiry,
        isActive: isAfter(parseISO(newExpiry), new Date()),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'users');
    }
  }, [isAdmin]);

  return {
    setSubscriptionDate,
    toggleUserStatus,
    updateSubscription,
  };
};
