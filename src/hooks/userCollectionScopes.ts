import type { AppView } from '../types';

export type UserCollectionKey =
  | 'clients'
  | 'maintenances'
  | 'warranties'
  | 'settings'
  | 'message_logs'
  | 'appointments'
  | 'expenses'
  | 'products'
  | 'cash_launches'
  | 'fiscal_companies'
  | 'fiscal_invoices'
  | 'fiscal_logs'
  | 'operational_logs';

export const allUserCollectionKeys: readonly UserCollectionKey[] = [
  'clients',
  'maintenances',
  'warranties',
  'settings',
  'message_logs',
  'appointments',
  'expenses',
  'products',
  'cash_launches',
  'fiscal_companies',
  'fiscal_invoices',
  'fiscal_logs',
  'operational_logs',
];

const viewCollections: Partial<Record<AppView, readonly UserCollectionKey[]>> = {
  dashboard: ['clients', 'maintenances', 'warranties', 'appointments', 'cash_launches'],
  'dashboard-recurring': ['clients', 'maintenances', 'cash_launches'],
  'dashboard-revenue': ['clients', 'maintenances', 'cash_launches'],
  'dashboard-services': ['clients', 'maintenances', 'cash_launches'],
  returns: ['clients', 'maintenances', 'cash_launches'],
  clients: ['clients', 'maintenances', 'cash_launches'],
  pendencies: ['clients', 'maintenances', 'cash_launches'],
  appointments: ['appointments'],
  'clients-schedule': ['clients', 'maintenances', 'cash_launches'],
  'clients-schedule-add': ['clients', 'maintenances'],
  history: ['maintenances', 'cash_launches', 'message_logs'],
  settings: ['clients', 'products', 'operational_logs'],
  'new-client': ['clients', 'maintenances'],
  'new-service': ['clients', 'maintenances'],
  warranties: ['warranties', 'cash_launches'],
  'new-warranty': ['clients', 'cash_launches'],
  report: ['maintenances', 'cash_launches'],
  'general-report': ['clients', 'maintenances', 'cash_launches', 'expenses', 'warranties', 'appointments'],
  'cash-register': ['clients', 'products', 'cash_launches', 'fiscal_companies'],
  products: ['products'],
  fiscal: ['cash_launches', 'fiscal_companies', 'fiscal_invoices', 'fiscal_logs'],
  expenses: ['expenses'],
  'financial-health': ['clients', 'maintenances', 'cash_launches', 'expenses'],
};

export const getUserCollectionsForView = (view: AppView): ReadonlySet<UserCollectionKey> => {
  const collections = new Set(viewCollections[view] || []);
  if (view !== 'master-admin' && view !== 'admin' && view !== 'checkout') {
    collections.add('settings');
  }
  return collections;
};

export const viewUsesUserCollection = (view: AppView, collectionName: UserCollectionKey) => (
  getUserCollectionsForView(view).has(collectionName)
);
