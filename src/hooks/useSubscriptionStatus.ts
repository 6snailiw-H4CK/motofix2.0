import { useEffect, useMemo, useState } from 'react';
import { isBefore, parseISO } from 'date-fns';
import type { UserProfile } from '../types';

type UseSubscriptionStatusParams = {
  userProfile?: UserProfile | null;
};

type UseSubscriptionStatusResult = {
  isExpired: boolean;
  shouldBlock: boolean;
  subscriptionActive: boolean;
};

export const getSubscriptionTimerDelay = (currentPeriodEnd: string | null | undefined, now = new Date()) => {
  if (!currentPeriodEnd) return null;
  const periodEnd = parseISO(currentPeriodEnd);
  if (Number.isNaN(periodEnd.getTime()) || !isBefore(now, periodEnd)) return null;
  return periodEnd.getTime() - now.getTime() + 10;
};

export const scheduleSubscriptionExpiry = (
  currentPeriodEnd: string | null | undefined,
  now: Date,
  onExpire: () => void,
  schedule: typeof setTimeout = setTimeout,
  cancel: typeof clearTimeout = clearTimeout,
) => {
  const delay = getSubscriptionTimerDelay(currentPeriodEnd, now);
  if (delay === null) return () => undefined;
  const timer = schedule(onExpire, delay);
  return () => cancel(timer);
};

export const getSubscriptionGateState = (userProfile: UserProfile | null, now = new Date()) => {
  if (!userProfile || userProfile.role === 'admin') {
    return { subscriptionActive: userProfile?.role === 'admin', isExpired: false, shouldBlock: false };
  }

  const billing = userProfile.billing;
  if (billing?.status) {
    const activeStatus = ['active', 'trialing'].includes(billing.status);
    const periodEnd = billing.currentPeriodEnd ? parseISO(billing.currentPeriodEnd) : null;
    const subscriptionActive = activeStatus && (billing.status === 'trialing' || (!!periodEnd && !isBefore(periodEnd, now)));
    return { subscriptionActive, isExpired: !subscriptionActive, shouldBlock: !subscriptionActive };
  }

  const fallbackExpiry = userProfile.subscriptionExpiresAt ? parseISO(userProfile.subscriptionExpiresAt) : null;
  const subscriptionActive = !!fallbackExpiry && !isBefore(fallbackExpiry, now);
  return { subscriptionActive, isExpired: !subscriptionActive, shouldBlock: !subscriptionActive };
};

export const useSubscriptionStatus = ({ userProfile }: UseSubscriptionStatusParams): UseSubscriptionStatusResult => {
  const [now, setNow] = useState(() => new Date());
  const userId = userProfile?.uid ?? null;
  const userRole = userProfile?.role ?? null;
  const currentPeriodEnd = userProfile?.billing?.currentPeriodEnd ?? null;

  useEffect(() => {
    setNow(new Date());
    return scheduleSubscriptionExpiry(currentPeriodEnd, new Date(), () => setNow(new Date()));
  }, [currentPeriodEnd, userId, userRole]);

  return useMemo(() => {
    return getSubscriptionGateState(userProfile, now);
  }, [now, userProfile]);
};
