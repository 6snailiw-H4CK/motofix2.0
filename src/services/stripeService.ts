import axios from 'axios';
import { auth } from '../firebase';

const configuredStripeApiUrl = import.meta.env.VITE_STRIPE_API_URL?.trim();
const isProductionLocalhostUrl = import.meta.env.PROD && configuredStripeApiUrl?.includes('localhost');
const STRIPE_API_URL = configuredStripeApiUrl && !isProductionLocalhostUrl
  ? configuredStripeApiUrl
  : window.location.origin;
const authHeaders = async () => {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Usuario precisa estar autenticado para acessar pagamentos.');
  return { Authorization: `Bearer ${token}` };
};

// The UID is deliberately not a client parameter: the server derives it from Firebase.
export const createCheckoutSession = async (planId = 'monthly'): Promise<{ url: string }> => {
  const { data } = await axios.post(`${STRIPE_API_URL}/api/stripe/create-checkout-session`, { planId }, { headers: await authHeaders() });
  return data;
};

export type BillingStatus = { status?: string; currentPeriodEnd?: string | null; hasActiveSubscription: boolean };
export const getSubscriptionStatus = async (): Promise<BillingStatus> => {
  const { data } = await axios.get(`${STRIPE_API_URL}/api/stripe/subscription`, { headers: await authHeaders() });
  return data;
};

export const createCustomerPortalSession = async (): Promise<{ url: string }> => {
  const { data } = await axios.post(`${STRIPE_API_URL}/api/stripe/create-customer-portal-session`, {}, { headers: await authHeaders() });
  return data;
};
