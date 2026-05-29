export type MaintenanceStatus = 'OK' | 'WARNING' | 'OVERDUE';

export type ColorMode = 'dark' | 'light';

export type AppView =
  | 'dashboard'
  | 'dashboard-recurring'
  | 'dashboard-revenue'
  | 'dashboard-services'
  | 'clients'
  | 'appointments'
  | 'clients-schedule'
  | 'clients-schedule-add'
  | 'history'
  | 'settings'
  | 'new-client'
  | 'new-service'
  | 'warranties'
  | 'new-warranty'
  | 'admin'
  | 'report'
  | 'general-report'
  | 'cash-register'
  | 'checkout'
  | 'subscription-expired'
  | 'expenses';

export interface Client {
  id: string;
  name: string;
  bikeModel: string;
  oilType: string;
  oilPrice: number;
  contact: string; // Telefone do cliente
  /** E-mail do cliente (cadastro / relacionamento) */
  email?: string;
  /** Placa do veículo */
  vehiclePlate?: string;
  /** Quilometragem atual informada pelo cliente */
  mileageKm?: number;
  lastMaintenanceDate: string;
  nextMaintenanceDate: string;
  recurrenceDays: number;
  status: MaintenanceStatus;
  isRecurringRevenue?: boolean;
  notificacao_enviada?: boolean;
  notificacaoStatus?: 'pendente' | 'concluido';
  lastServiceType?: string;
  lastServiceValue?: number;
  lastServiceNotes?: string;
  userId: string;
  createdAt: string;
  lastAlertDate?: string; // Campo legado (YYYY-MM-DD)
  // Campos para novo serviço (tempo de edição)
  serviceValue?: number;
  statusPagamento?: 'Pago' | 'Pendente' | 'Parcial';
  valorPago?: number;
  saldoDevedor?: number;
  automation?: {
    lastAlertDate?: string; // YYYY-MM-DD
    lastSendAt?: string;    // ISO Timestamp
    lastSendStatus?: 'pending' | 'opened_whatsapp' | 'sent' | 'failed';
    lastSendChannel?: 'whatsapp' | 'email' | 'manual';
    sendAttempts?: number;
    nextSendEligibleAt?: string; // ISO Timestamp ou YYYY-MM-DD
    lastError?: string;
  };
}

export interface MessageLog {
  id?: string;
  clientId: string;
  clientName: string;
  bikeModel?: string;
  phone: string;
  channel: 'whatsapp' | 'email' | 'manual';
  status: 'pending' | 'opened_whatsapp' | 'sent' | 'failed';
  trigger: 'manual' | 'scheduled' | 'retry';
  message: string;
  createdAt: string;
  sentAt?: string;
  error?: string | null;
  userId: string;
}

export interface MaintenanceRecord {
  id: string;
  clientId: string;
  clientName: string;
  bikeModel: string;
  date: string;
  oilType: string;
  oilPrice?: number; // Valor legado para troca de óleo
  serviceType: string; // Tipo de serviço (ex: Troca de Óleo, Revisão)
  serviceValue: number; // Valor total do serviço
  isRecurringRevenue: boolean; // Identifica se é receita recorrente
  notes: string;
  userId: string;
  statusPagamento?: 'Pago' | 'Pendente' | 'Parcial'; // Status do pagamento
  valorPago?: number; // Valor já pago (para pagamentos parciais)
  saldoDevedor?: number; // Saldo devedor (calculado automaticamente)
}

export interface ExpenseRecord {
  id: string;
  description: string;
  supplier?: string;
  amount: number;
  paymentMethod: string;
  date: string;
  note?: string;
  userId: string;
  createdAt: string;
}

export interface ProductCatalogItem {
  id: string;
  sourceCode: string;
  description: string;
  ncm: string;
  salePrice: number;
  importedAt: string;
  userId: string;
}

export interface CashRegisterItem {
  id: string;
  productId?: string;
  sourceCode: string;
  description: string;
  ncm: string;
  quantity: number;
  unitPrice: number;
  discountValue: number;
  discountPercent: number;
  netUnitPrice: number;
  total: number;
  date: string;
  note?: string;
}

export interface CashRegisterLaunch {
  id: string;
  orderNumber: string;
  clientId?: string;
  clientName: string;
  bikeModel?: string;
  status: 'Em Lancamento' | 'Finalizado' | 'Pendente';
  openingDate: string;
  expectedDate: string;
  request?: string;
  servicesExecuted?: string;
  observation?: string;
  items: CashRegisterItem[];
  merchandiseTotal: number;
  servicesTotal: number;
  discountTotal: number;
  total: number;
  invoiced?: boolean;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Appointment {
  id: string;
  clientName: string;
  bikeModel: string;
  scheduledDate: string;
  address?: string;
  serviceRequested: string;
  value?: number;
  completed?: boolean;
}

export interface Settings {
  userId: string;
  whatsappTemplate: string;
  oilTypes: string[];
  /** Tipos extras de serviço (além dos padrões do app); usados no cadastro e filtros. */
  serviceTypes?: string[];
  /** Categorias padrao que o usuario decidiu ocultar/remover da configuracao. */
  disabledDefaultServiceTypes?: string[];
  /** E-mail institucional da oficina (ex.: contato@moto.com) */
  businessEmail?: string;
  warrantyCategories: string[];
  businessName?: string;
  businessPhone?: string;
  businessWhatsapp?: string; // Número do WhatsApp para contato
  businessInstagram?: string;
  businessAddress?: string;
  isProfileComplete?: boolean;
  expenses?: Array<{ value?: number; valor?: number; description?: string }>;
}

export interface Subscription {
  status: 'active' | 'inactive' | 'canceled' | 'trial' | 'past_due';
  plan: 'free' | 'monthly' | 'annual';
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  startsAt: string; // ISO timestamp
  expiresAt: string; // ISO timestamp
  currentPeriodEnd: string; // ISO timestamp
  canceledAt?: string; // ISO timestamp
  cancelReason?: string;
  paymentMethodId?: string;
  autoRenew: boolean;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: 'admin' | 'user';
  isActive: boolean;
  subscription: Subscription;
  subscriptionExpiresAt?: string; // ISO timestamp
  createdAt: string;
}

export interface Warranty {
  id: string;
  clientName: string;
  serviceType: string;
  serviceDescription: string;
  serviceValue: number;
  serviceDate: string;
  durationMonths: number;
  expiryDate: string;
  clientPhone: string;
  warrantyNumber: number;
  userId: string;
  createdAt: string;
}
