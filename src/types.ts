export type MaintenanceStatus = 'OK' | 'WARNING' | 'OVERDUE';

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

export interface Settings {
  userId: string;
  whatsappTemplate: string;
  oilTypes: string[];
  /** Tipos extras de serviço (além dos padrões do app); usados no cadastro e filtros. */
  serviceTypes?: string[];
  /** E-mail institucional da oficina (ex.: contato@moto.com) */
  businessEmail?: string;
  warrantyCategories: string[];
  businessName?: string;
  businessPhone?: string;
  businessWhatsapp?: string; // Número do WhatsApp para contato
  businessInstagram?: string;
  businessAddress?: string;
  isProfileComplete?: boolean;
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
