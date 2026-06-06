import type {
  FiscalCompanyInput,
  FiscalCompanyPrivate,
  FiscalCompanyPublic,
  FiscalDocumentModel,
  FiscalInvoiceRecord,
  FiscalInvoiceStatus,
  FiscalLogLevel,
  FiscalLogRecord,
  FiscalServiceInput,
  FiscalStoreContext,
} from "./types";

const nowIso = () => new Date().toISOString();
const onlyDigits = (value?: string) => String(value || "").replace(/\D/g, "");
const makeId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const fiscalCompaniesCollection = (context: FiscalStoreContext, userId: string) =>
  context.db.collection("users").doc(userId).collection("fiscal_companies");

const fiscalPrivateDoc = (context: FiscalStoreContext, userId: string, companyId: string) =>
  context.db.collection("users").doc(userId).collection("fiscal_private").doc(companyId);

const fiscalInvoicesCollection = (context: FiscalStoreContext, userId: string) =>
  context.db.collection("users").doc(userId).collection("fiscal_invoices");

const fiscalLogsCollection = (context: FiscalStoreContext, userId: string) =>
  context.db.collection("users").doc(userId).collection("fiscal_logs");

const fiscalFilesDoc = (context: FiscalStoreContext, userId: string, invoiceId: string, kind: "xml" | "pdf") =>
  context.db.collection("users").doc(userId).collection("fiscal_invoice_files").doc(`${invoiceId}_${kind}`);

const cashLaunchDoc = (context: FiscalStoreContext, userId: string, launchId: string) =>
  context.db.collection("users").doc(userId).collection("cash_launches").doc(launchId);

const toCompanyPublic = (userId: string, input: FiscalCompanyInput, existing?: FiscalCompanyPublic): FiscalCompanyPublic => {
  const id = existing?.id || input.id || `company-${onlyDigits(input.document).slice(-6) || makeId()}`;
  const timestamp = nowIso();

  return {
    id,
    userId,
    legalName: String(input.legalName || existing?.legalName || "").trim(),
    tradeName: String(input.tradeName || existing?.tradeName || "").trim(),
    document: onlyDigits(input.document || existing?.document),
    municipalRegistration: String(input.municipalRegistration || existing?.municipalRegistration || "").trim(),
    stateRegistration: String(input.stateRegistration || existing?.stateRegistration || "").trim(),
    taxRegime: String(input.taxRegime || existing?.taxRegime || "simples_nacional").trim(),
    cnae: String(input.cnae || existing?.cnae || "").trim(),
    serviceCityCode: String(input.serviceCityCode || existing?.serviceCityCode || "").trim(),
    serviceCityName: String(input.serviceCityName || existing?.serviceCityName || "").trim(),
    address: String(input.address || existing?.address || "").trim(),
    number: String(input.number || existing?.number || "").trim(),
    complement: String(input.complement || existing?.complement || "").trim(),
    district: String(input.district || existing?.district || "").trim(),
    city: String(input.city || existing?.city || "").trim(),
    state: String(input.state || existing?.state || "").trim().toUpperCase(),
    zipCode: onlyDigits(input.zipCode || existing?.zipCode),
    email: String(input.email || existing?.email || "").trim(),
    phone: String(input.phone || existing?.phone || "").trim(),
    focusEnvironment: input.focusEnvironment || existing?.focusEnvironment || "homologation",
    focusCompanyId: String(input.focusCompanyId || existing?.focusCompanyId || "").trim(),
    nfseEnabled: input.nfseEnabled ?? existing?.nfseEnabled ?? true,
    nfeEnabled: input.nfeEnabled ?? existing?.nfeEnabled ?? false,
    nfceEnabled: input.nfceEnabled ?? existing?.nfceEnabled ?? false,
    autoIssueFromCashLaunch: input.autoIssueFromCashLaunch ?? existing?.autoIssueFromCashLaunch ?? false,
    certificateUploadedAt: input.certificateBase64 ? timestamp : existing?.certificateUploadedAt,
    certificateExpiresAt: input.certificateExpiresAt || existing?.certificateExpiresAt,
    createdAt: existing?.createdAt || timestamp,
    updatedAt: timestamp,
  };
};

export const mapFocusStatus = (response: Record<string, unknown>): FiscalInvoiceStatus => {
  const status = String(response.status || response.codigo_status || response.situacao || "").toLowerCase();
  if (status.includes("autoriz") || status.includes("emitid") || status === "100") return "authorized";
  if (status.includes("cancel")) return "cancelled";
  if (status.includes("erro") || status.includes("rejeit") || status.includes("negad")) return "rejected";
  if (status.includes("process") || status.includes("fila") || status.includes("enviado")) return "processing";
  return "queued";
};

export const extractFocusMessage = (response: Record<string, unknown>) => {
  const candidates = [
    response.mensagem,
    response.motivo,
    response.erros,
    response.message,
  ].filter(Boolean);
  return candidates.length ? JSON.stringify(candidates[0]).replace(/^"|"$/g, "") : undefined;
};

export const fiscalStore = {
  async listCompanies(context: FiscalStoreContext, userId: string) {
    const snapshot = await fiscalCompaniesCollection(context, userId).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as FiscalCompanyPublic));
  },

  async getCompany(context: FiscalStoreContext, userId: string, companyId: string) {
    const snapshot = await fiscalCompaniesCollection(context, userId).doc(companyId).get();
    return snapshot.exists ? ({ id: snapshot.id, ...snapshot.data() } as FiscalCompanyPublic) : null;
  },

  async getPrivateConfig(context: FiscalStoreContext, userId: string, companyId: string) {
    const snapshot = await fiscalPrivateDoc(context, userId, companyId).get();
    return snapshot.exists ? (snapshot.data() as FiscalCompanyPrivate) : null;
  },

  async saveCompany(context: FiscalStoreContext, userId: string, input: FiscalCompanyInput) {
    const existing = input.id ? await this.getCompany(context, userId, input.id) : null;
    const company = toCompanyPublic(userId, input, existing || undefined);

    if (!company.legalName || !company.document) {
      throw new Error("Razao social e CNPJ/CPF da empresa fiscal sao obrigatorios.");
    }

    await fiscalCompaniesCollection(context, userId).doc(company.id).set(company, { merge: true });

    if (input.focusApiToken) {
      const privateConfig: FiscalCompanyPrivate = {
        companyId: company.id,
        userId,
        focusApiToken: input.focusApiToken,
        certificatePasswordSet: Boolean(input.certificatePassword),
        updatedAt: nowIso(),
      };
      await fiscalPrivateDoc(context, userId, company.id).set(privateConfig, { merge: true });
    }

    return company;
  },

  async createInvoice(context: FiscalStoreContext, invoice: Omit<FiscalInvoiceRecord, "id" | "createdAt" | "updatedAt">) {
    const docRef = fiscalInvoicesCollection(context, invoice.userId).doc();
    const timestamp = nowIso();
    const record: FiscalInvoiceRecord = {
      ...invoice,
      id: docRef.id,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await docRef.set(record);
    return record;
  },

  async updateInvoice(context: FiscalStoreContext, userId: string, invoiceId: string, patch: Partial<FiscalInvoiceRecord>) {
    const updatedAt = nowIso();
    await fiscalInvoicesCollection(context, userId).doc(invoiceId).set({ ...patch, updatedAt }, { merge: true });
    const snapshot = await fiscalInvoicesCollection(context, userId).doc(invoiceId).get();
    return { id: snapshot.id, ...snapshot.data() } as FiscalInvoiceRecord;
  },

  async getInvoice(context: FiscalStoreContext, userId: string, invoiceId: string) {
    const snapshot = await fiscalInvoicesCollection(context, userId).doc(invoiceId).get();
    return snapshot.exists ? ({ id: snapshot.id, ...snapshot.data() } as FiscalInvoiceRecord) : null;
  },

  async saveLog(context: FiscalStoreContext, log: Omit<FiscalLogRecord, "id" | "createdAt">) {
    const docRef = fiscalLogsCollection(context, log.userId).doc();
    const record: FiscalLogRecord = {
      ...log,
      id: docRef.id,
      createdAt: nowIso(),
    };
    await docRef.set(record);
    return record;
  },

  async saveFocusResult(context: FiscalStoreContext, invoice: FiscalInvoiceRecord, response: Record<string, unknown>, urls: { xmlUrl?: string; pdfUrl?: string }) {
    const status = mapFocusStatus(response);
    return this.updateInvoice(context, invoice.userId, invoice.id, {
      status,
      focusStatus: String(response.status || response.codigo_status || response.situacao || status),
      focusMessage: extractFocusMessage(response),
      focusResponse: response,
      xmlUrl: urls.xmlUrl || invoice.xmlUrl,
      pdfUrl: urls.pdfUrl || invoice.pdfUrl,
      issuedAt: invoice.issuedAt || nowIso(),
      authorizedAt: status === "authorized" ? nowIso() : invoice.authorizedAt,
    });
  },

  async saveFiscalFile(context: FiscalStoreContext, userId: string, invoiceId: string, kind: "xml" | "pdf", data: { bytes: Buffer; contentType: string; sourceUrl?: string }) {
    if (data.bytes.byteLength > 850_000) {
      await this.saveLog(context, {
        userId,
        invoiceId,
        level: "warning",
        event: "fiscal_document_too_large",
        message: `Documento ${kind.toUpperCase()} nao foi salvo no Firestore por exceder o limite seguro.`,
        details: { size: data.bytes.byteLength, sourceUrl: data.sourceUrl },
      });
      return false;
    }

    await fiscalFilesDoc(context, userId, invoiceId, kind).set({
      invoiceId,
      kind,
      contentType: data.contentType,
      base64: data.bytes.toString("base64"),
      sourceUrl: data.sourceUrl,
      size: data.bytes.byteLength,
      savedAt: nowIso(),
    });

    await this.updateInvoice(context, userId, invoiceId, {
      [kind === "xml" ? "xmlStored" : "pdfStored"]: true,
    } as Partial<FiscalInvoiceRecord>);

    return true;
  },

  async getFiscalFile(context: FiscalStoreContext, userId: string, invoiceId: string, kind: "xml" | "pdf") {
    const snapshot = await fiscalFilesDoc(context, userId, invoiceId, kind).get();
    return snapshot.exists ? snapshot.data() as { base64: string; contentType: string; sourceUrl?: string } : null;
  },

  async getCashLaunch(context: FiscalStoreContext, userId: string, launchId: string) {
    const snapshot = await cashLaunchDoc(context, userId, launchId).get();
    return snapshot.exists ? ({ id: snapshot.id, ...snapshot.data() } as any) : null;
  },

  async markCashLaunchFiscal(context: FiscalStoreContext, userId: string, launchId: string, invoiceId: string, reference: string) {
    await cashLaunchDoc(context, userId, launchId).set({
      fiscalInvoiceId: invoiceId,
      fiscalReference: reference,
      fiscalIssuedAt: nowIso(),
    }, { merge: true });
  },
};

export const buildInvoiceReference = (prefix: string, source: string) => {
  const safeSource = source.replace(/[^a-zA-Z0-9-]/g, "").slice(-32);
  return `${prefix}-${safeSource}-${Date.now()}`;
};

export const defaultServiceFromCashLaunch = (launch: any): FiscalServiceInput => ({
  description: launch.servicesExecuted || launch.request || launch.observation || `Ordem de servico ${launch.orderNumber}`,
  amount: Number(launch.total || launch.merchandiseTotal || 0),
  cityCode: "",
  serviceCode: "",
  municipalTaxCode: "",
  deductions: 0,
  issRate: 0,
  withheldIss: false,
});

export const logFiscalError = async (
  context: FiscalStoreContext,
  params: {
    userId: string;
    companyId?: string;
    invoiceId?: string;
    reference?: string;
    model?: FiscalDocumentModel;
    event: string;
    message: string;
    details?: Record<string, unknown>;
    level?: FiscalLogLevel;
  }
) => fiscalStore.saveLog(context, {
  userId: params.userId,
  companyId: params.companyId,
  invoiceId: params.invoiceId,
  reference: params.reference,
  model: params.model,
  level: params.level || "error",
  event: params.event,
  message: params.message,
  details: params.details,
});

