import type admin from "firebase-admin";

export type FiscalEnvironment = "homologation" | "production";
export type FiscalDocumentModel = "nfse" | "nfe" | "nfce";
export type FiscalOperationSource = "manual" | "cash_register";
export type FiscalInvoiceStatus = "draft" | "queued" | "processing" | "authorized" | "rejected" | "cancelled" | "error";
export type FiscalLogLevel = "info" | "warning" | "error" | "success";

export type AuthenticatedFiscalRequest = {
  uid: string;
  email?: string;
};

export type FiscalCompanyPublic = {
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
};

export type FiscalCompanyPrivate = {
  companyId: string;
  userId: string;
  focusApiToken: string;
  certificatePasswordSet?: boolean;
  updatedAt: string;
};

export type FiscalCompanyInput = Partial<FiscalCompanyPublic> & {
  focusApiToken?: string;
  certificateBase64?: string;
  certificatePassword?: string;
  focusOverrides?: Record<string, unknown>;
};

export type FiscalCustomer = {
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
};

export type FiscalServiceInput = {
  description: string;
  serviceCode?: string;
  municipalTaxCode?: string;
  cnae?: string;
  cityCode?: string;
  amount: number;
  issRate?: number;
  deductions?: number;
  withheldIss?: boolean;
};

export type FiscalInvoiceRecord = {
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
};

export type FiscalLogRecord = {
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
};

export type FocusRequestContext = {
  company: FiscalCompanyPublic;
  privateConfig: FiscalCompanyPrivate;
};

export type FiscalStoreContext = {
  db: admin.firestore.Firestore;
};

