import type { Settings } from '../types';

export const APP_VERSION = '2.1.0';

export const DEFAULT_SERVICE_TYPES = ['Troca de \u00d3leo', 'Revis\u00e3o', 'Pneus', 'Freios', 'Outros'] as const;

export const DEFAULT_SETTINGS: Settings = {
  userId: '',
  whatsappTemplate: 'Ol\u00e1 {client}, sua {bike} est\u00e1 agendada para manuten\u00e7\u00e3o em {date}. Nos vemos l\u00e1!',
  oilTypes: ['10W30', '10W40', '20W50', 'Motul 3000', 'Motul 5000', 'Yamalube'],
  serviceTypes: [],
  warrantyCategories: ['Motor', 'C\u00e2mbio', 'El\u00e9trica', 'Suspens\u00e3o', 'Freios', 'Pintura', 'Geral'],
  businessName: 'Minha Oficina',
  businessPhone: '',
  businessEmail: '',
  businessInstagram: '',
  businessAddress: '',
  isProfileComplete: false
};
