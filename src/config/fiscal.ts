import type { UserProfile } from '../types';

const truthyEnv = (value: unknown) => ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());

const fiscalBetaEmails = String(import.meta.env.VITE_FISCAL_BETA_EMAILS || '')
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

export const fiscalModuleEnabled = truthyEnv(import.meta.env.VITE_FISCAL_MODULE_ENABLED);

export const canAccessFiscalModule = (userProfile: UserProfile | null, fallbackEmail?: string | null) => {
  if (!fiscalModuleEnabled) return false;
  const email = String(userProfile?.email || fallbackEmail || '').trim().toLowerCase();
  return userProfile?.role === 'admin' || (email ? fiscalBetaEmails.includes(email) : false);
};

