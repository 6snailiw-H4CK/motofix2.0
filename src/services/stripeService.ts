import axios from 'axios';
import { API_BASE_URL, authHeaders } from './apiClient';

// The UID is deliberately not a client parameter: the server derives it from Firebase.
export const createCheckoutSession = async (planId = 'monthly'): Promise<{ url: string }> => {
  const { data } = await axios.post(`${API_BASE_URL}/api/stripe/create-checkout-session`, { planId }, { headers: await authHeaders() });
  return data;
};

export type BillingStatus = {
  email?: string | null;
  displayName?: string | null;
  status?: string;
  planId?: string | null;
  amount?: number | null;
  currency?: string | null;
  interval?: string | null;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
  hasActiveSubscription: boolean;
};
export const getSubscriptionStatus = async (): Promise<BillingStatus> => {
  const { data } = await axios.get(`${API_BASE_URL}/api/stripe/subscription`, { headers: await authHeaders() });
  return data;
};

export const createCustomerPortalSession = async (): Promise<{ url: string }> => {
  const { data } = await axios.post(`${API_BASE_URL}/api/stripe/create-customer-portal-session`, {}, { headers: await authHeaders() });
  return data;
};

export const cancelSubscription = async (): Promise<{ cancelAtPeriodEnd: boolean; currentPeriodEnd: string | null }> => {
  const { data } = await axios.post(`${API_BASE_URL}/api/stripe/cancel-subscription`, {}, { headers: await authHeaders() });
  return data;
};
