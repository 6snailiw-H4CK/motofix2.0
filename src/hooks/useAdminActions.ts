import { useCallback } from 'react';
import { updateUserAccess } from '../services/adminAccessService';
import { isMasterAdminRole, type UserProfile } from '../types';

type UseAdminActionsParams = {
  users: UserProfile[];
  userProfile: UserProfile | null;
};

export const useAdminActions = ({ users, userProfile }: UseAdminActionsParams) => {
  const isAdmin = isMasterAdminRole(userProfile?.role);

  const toggleUserStatus = useCallback(async (targetUser: UserProfile) => {
    if (!isAdmin) return;

    try {
      await updateUserAccess(targetUser.uid, { isActive: !targetUser.isActive });
    } catch (error) {
      console.error('Falha ao alterar o acesso do usuário:', error);
    }
  }, [isAdmin]);

  const updateSubscription = useCallback(async (uid: string, days: number) => {
    if (!isAdmin) return;

    try {
      if (!users.some((appUser) => appUser.uid === uid)) return;
      await updateUserAccess(uid, { days });
    } catch (error) {
      console.error('Falha ao alterar o período de acesso:', error);
    }
  }, [isAdmin, users]);

  const setSubscriptionDate = useCallback(async (uid: string, dateStr: string) => {
    if (!isAdmin) return;

    try {
      if (!users.some((appUser) => appUser.uid === uid)) return;
      await updateUserAccess(uid, {
        subscriptionExpiresAt: `${dateStr}T23:59:59Z`,
      });
    } catch (error) {
      console.error('Falha ao definir a data de acesso:', error);
    }
  }, [isAdmin, users]);

  return {
    setSubscriptionDate,
    toggleUserStatus,
    updateSubscription,
  };
};
