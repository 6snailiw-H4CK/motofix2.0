export type MaintenanceStatus = 'OK' | 'WARNING' | 'OVERDUE';

export type ColorMode = 'dark' | 'light';

export type AppView =
  | 'dashboard'
  | 'dashboard-recurring'
  | 'dashboard-revenue'
  | 'dashboard-services'
  | 'returns'
  | 'clients'
  | 'pendencies'
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
  | 'products'
  | 'whatsapp'
  | 'fiscal'
  | 'checkout'
  | 'subscription-expired'
  | 'expenses';

export interface Client {
  id: string;
  name: string;
  /** Nome completo/razao social para uso fiscal */
  fullName?: string;
  /** CPF/CNPJ do cliente para preparo fiscal */
  document?: string;
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
  variation?: string;
  variations?: ProductCatalogVariation[];
  ncm: string;
  salePrice: number;
  importedAt: string;
  userId: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProductCatalogVariation {
  id: string;
  name: string;
  salePrice: number;
}

export type ProductCatalogFormInput = Pick<ProductCatalogItem, 'sourceCode' | 'description' | 'variation' | 'variations' | 'ncm' | 'salePrice'>;

export interface CashRegisterItem {
  id: string;
  productId?: string;
  variationId?: string;
  sourceCode: string;
  description: string;
  variation?: string;
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

export type ManualFiscalDocumentStatus = 'Nao emitida' | 'Emitida' | 'Cancelada';

export interface ManualFiscalAttachment {
  name: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  dataUrl: string;
}

export interface ManualFiscalDocument {
  status: ManualFiscalDocumentStatus;
  number?: string;
  accessKey?: string;
  issuedAt?: string;
  xml?: ManualFiscalAttachment | null;
  pdf?: ManualFiscalAttachment | null;
}

export interface ManualFiscalInfo {
  nfce: ManualFiscalDocument;
  nfse: ManualFiscalDocument;
  preparedAt?: string;
}

export interface CashRegisterLaunch {
  id: string;
  orderNumber: string;
  clientId?: string;
  clientName: string;
  clientDocument?: string;
  clientEmail?: string;
  clientPhone?: string;
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
  orderDiscountValue?: number;
  orderDiscountPercent?: number;
  total: number;
  invoiced?: boolean;
  fiscalInvoiceId?: string;
  fiscalReference?: string;
  fiscalIssuedAt?: string;
  manualFiscal?: ManualFiscalInfo;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export type FiscalEnvironment = 'homologation' | 'production';
export type FiscalDocumentModel = 'nfse' | 'nfe' | 'nfce';
export type FiscalOperationSource = 'manual' | 'cash_register';
export type FiscalInvoiceStatus = 'draft' | 'queued' | 'processing' | 'authorized' | 'rejected' | 'cancelled' | 'error';
export type FiscalLogLevel = 'info' | 'warning' | 'error' | 'success';

export interface FiscalCompany {
  id: string;
  userId: string;
  legalName: string;
  tradeName?: string;
  document: string;
  municipalRegistration?: string;
  stateRegistration?: string;
  taxRegime?: string;
  cnae?: string;
  serviceCityCode?: string;
  serviceCityName?: string;
  address?: string;
  number?: string;
  complement?: string;
  district?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  email?: string;
  phone?: string;
  focusEnvironment: FiscalEnvironment;
  focusCompanyId?: string;
  nfseEnabled: boolean;
  nfeEnabled: boolean;
  nfceEnabled: boolean;
  autoIssueFromCashLaunch?: boolean;
  certificateUploadedAt?: string;
  certificateExpiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FiscalCompanyFormInput extends Partial<FiscalCompany> {
  focusApiToken?: string;
  certificateBase64?: string;
  certificatePassword?: string;
  focusOverrides?: Record<string, unknown>;
}

export interface FiscalCustomer {
  name: string;
  document?: string;
  email?: string;
  phone?: string;
  address?: string;
  number?: string;
  district?: string;
  cityCode?: string;
  city?: string;
  state?: string;
  zipCode?: string;
}

export interface FiscalServiceInput {
  description: string;
  serviceCode?: string;
  municipalTaxCode?: string;
  cnae?: string;
  cityCode?: string;
  amount: number;
  issRate?: number;
  deductions?: number;
  withheldIss?: boolean;
}

export interface FiscalInvoice {
  id: string;
  userId: string;
  companyId: string;
  companyDocument: string;
  model: FiscalDocumentModel;
  environment: FiscalEnvironment;
  reference: string;
  status: FiscalInvoiceStatus;
  source: FiscalOperationSource;
  cashLaunchId?: string;
  customer: FiscalCustomer;
  service: FiscalServiceInput;
  total: number;
  focusStatus?: string;
  focusMessage?: string;
  focusResponse?: Record<string, unknown>;
  xmlUrl?: string;
  pdfUrl?: string;
  xmlStored?: boolean;
  pdfStored?: boolean;
  createdAt: string;
  updatedAt: string;
  issuedAt?: string;
  authorizedAt?: string;
  cancelledAt?: string;
}

export interface FiscalLog {
  id: string;
  userId: string;
  companyId?: string;
  invoiceId?: string;
  reference?: string;
  model?: FiscalDocumentModel;
  level: FiscalLogLevel;
  event: string;
  message: string;
  details?: Record<string, unknown>;
  createdAt: string;
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
