import type { Express, NextFunction, Request, Response } from "express";
import type admin from "firebase-admin";
import {
  extractFocusDocumentUrls,
  focusClient,
} from "./focusClient";
import {
  buildInvoiceReference,
  defaultServiceFromCashLaunch,
  fiscalStore,
  logFiscalError,
} from "./fiscalStore";
import type {
  AuthenticatedFiscalRequest,
  FiscalCompanyInput,
  FiscalCompanyPublic,
  FiscalCustomer,
  FiscalInvoiceRecord,
  FiscalServiceInput,
  FiscalStoreContext,
  FocusRequestContext,
} from "./types";

type FirebaseAdminModule = typeof admin;

type FiscalRequest = Request & {
  fiscalAuth?: AuthenticatedFiscalRequest;
};

type RegisterFiscalRoutesOptions = {
  app: Express;
  admin: FirebaseAdminModule;
  db: admin.firestore.Firestore | null;
  firebaseInitialized: boolean;
};

const isProduction = process.env.NODE_ENV === "production";
const MAX_CERTIFICATE_BASE64_LENGTH = Number(process.env.FISCAL_CERTIFICATE_MAX_BASE64_LENGTH || 6_500_000);
const MAX_FOCUS_OVERRIDES_LENGTH = Number(process.env.FISCAL_OVERRIDES_MAX_LENGTH || 80_000);
const BASE64_PATTERN = /^[A-Za-z0-9+/=\s]+$/;

const httpError = (status: number, message: string) => Object.assign(new Error(message), { status });

const getErrorStatus = (error: unknown) => {
  const status = typeof error === "object" && error && "status" in error ? Number((error as any).status) : 500;
  return Number.isInteger(status) && status >= 400 && status < 600 ? status : 500;
};

const sanitizeDetails = (value: unknown, depth = 0): unknown => {
  if (depth > 4) return "[truncated]";
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => sanitizeDetails(item, depth + 1));

  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => {
    if (/token|secret|senha|password|certificado|certificate|authorization|base64/i.test(key)) {
      return [key, "[redacted]"];
    }
    return [key, sanitizeDetails(item, depth + 1)];
  }));
};

const toErrorPayload = (error: unknown) => {
  const status = getErrorStatus(error);
  const message = error instanceof Error ? error.message : "Erro fiscal inesperado";
  const payload: { error: string; details?: unknown } = {
    error: status >= 500 && isProduction ? "Erro fiscal inesperado." : message,
  };

  if (!isProduction && typeof error === "object" && error && "details" in error) {
    payload.details = sanitizeDetails((error as any).details);
  }

  return { status, payload };
};

const sendFiscalError = (res: Response, error: unknown) => {
  const { status, payload } = toErrorPayload(error);
  return res.status(status).json(payload);
};

const safeDocumentId = (value: unknown, label: string) => {
  const id = String(value || "").trim();
  if (!id || id.length > 160 || id.includes("/")) {
    throw httpError(400, `${label} invalido.`);
  }
  return id;
};

const validateFocusOverrides = (overrides?: Record<string, unknown>) => {
  if (!overrides) return;
  const serialized = JSON.stringify(overrides);
  if (serialized.length > MAX_FOCUS_OVERRIDES_LENGTH) {
    throw httpError(413, "Campos extras da Focus NFe excedem o limite permitido.");
  }
};

const normalizeCertificateBase64 = (value?: string) => {
  if (!value) return undefined;
  const normalized = String(value).replace(/^data:[^;]+;base64,/i, "").replace(/\s/g, "");
  if (!normalized || normalized.length > MAX_CERTIFICATE_BASE64_LENGTH) {
    throw httpError(413, "Certificado A1 excede o limite permitido.");
  }
  if (!BASE64_PATTERN.test(normalized)) {
    throw httpError(400, "Certificado A1 precisa estar em base64 valido.");
  }
  return normalized;
};

const validateCompanyInput = (input: FiscalCompanyInput) => {
  if (input.id) {
    input.id = safeDocumentId(input.id, "Empresa fiscal");
  }
  if (input.focusApiToken && String(input.focusApiToken).length > 512) {
    throw httpError(400, "Token Focus NFe excede o limite permitido.");
  }
  if (input.certificatePassword && String(input.certificatePassword).length > 256) {
    throw httpError(400, "Senha do certificado excede o limite permitido.");
  }
  if (input.certificateBase64) {
    input.certificateBase64 = normalizeCertificateBase64(input.certificateBase64);
  }
  validateFocusOverrides(input.focusOverrides);
};

const validateFiscalAmount = (value: unknown, label: string) => {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000_000) {
    throw httpError(400, `${label} invalido.`);
  }
  return amount;
};

const isActiveFiscalUser = async (
  options: RegisterFiscalRoutesOptions,
  decoded: admin.auth.DecodedIdToken
) => {
  if (!options.db) return false;
  if (decoded.admin === true) return true;

  const userSnapshot = await options.db.collection("users").doc(decoded.uid).get();
  if (!userSnapshot.exists) return false;

  const userData = userSnapshot.data() as { isActive?: boolean } | undefined;
  return userData?.isActive === true;
};

const requireFiscalAuth = (options: RegisterFiscalRoutesOptions) => async (req: FiscalRequest, res: Response, next: NextFunction) => {
  if (!options.firebaseInitialized || !options.db) {
    return res.status(503).json({ error: "Firebase Admin nao inicializado. Configure FIREBASE_SERVICE_ACCOUNT_PATH." });
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";

  if (!token) {
    return res.status(401).json({ error: "Token Firebase ausente." });
  }

  try {
    const decoded = await options.admin.auth().verifyIdToken(token);

    if (!(await isActiveFiscalUser(options, decoded))) {
      return res.status(403).json({ error: "Usuario sem permissao ativa para acessar o modulo fiscal." });
    }

    req.fiscalAuth = {
      uid: decoded.uid,
      email: decoded.email,
    };
    return next();
  } catch (error) {
    return res.status(401).json({ error: "Token Firebase invalido." });
  }
};

const getFiscalContext = (req: FiscalRequest, options: RegisterFiscalRoutesOptions): FiscalStoreContext & { userId: string } => {
  if (!options.db || !req.fiscalAuth?.uid) {
    throw httpError(503, "Contexto fiscal indisponivel.");
  }
  return {
    db: options.db,
    userId: req.fiscalAuth.uid,
  };
};

const getFocusContext = async (context: FiscalStoreContext & { userId: string }, companyId: string): Promise<FocusRequestContext> => {
  const safeCompanyId = safeDocumentId(companyId, "Empresa fiscal");
  const company = await fiscalStore.getCompany(context, context.userId, safeCompanyId);
  const privateConfig = await fiscalStore.getPrivateConfig(context, context.userId, safeCompanyId);

  if (!company) {
    throw httpError(404, "Empresa fiscal nao encontrada.");
  }

  if (!privateConfig?.focusApiToken) {
    throw httpError(400, "Token Focus NFe nao configurado para esta empresa.");
  }

  return { company, privateConfig };
};

const buildManualInvoice = (
  userId: string,
  company: FiscalCompanyPublic,
  body: {
    customer: FiscalCustomer;
    service: FiscalServiceInput;
    focusOverrides?: Record<string, unknown>;
  }
): Omit<FiscalInvoiceRecord, "id" | "createdAt" | "updatedAt"> => {
  const total = validateFiscalAmount(body.service?.amount, "Valor do servico");
  if (!body.customer?.name || !body.service?.description) {
    throw httpError(400, "Cliente, descricao do servico e valor sao obrigatorios para emitir NFS-e.");
  }
  validateFocusOverrides(body.focusOverrides);

  return {
    userId,
    companyId: company.id,
    companyDocument: company.document,
    model: "nfse",
    environment: company.focusEnvironment,
    reference: buildInvoiceReference("MF-NFSE", "manual"),
    status: "draft",
    source: "manual",
    customer: body.customer,
    service: {
      ...body.service,
      amount: total,
    },
    total,
  };
};

const persistFiscalDocuments = async (
  context: FiscalStoreContext,
  focusContext: FocusRequestContext,
  invoice: FiscalInvoiceRecord,
  urls: { xmlUrl?: string; pdfUrl?: string }
) => {
  for (const kind of ["xml", "pdf"] as const) {
    const url = kind === "xml" ? urls.xmlUrl : urls.pdfUrl;
    if (!url) continue;

    try {
      const document = await focusClient.downloadDocument(focusContext, url);
      await fiscalStore.saveFiscalFile(context, invoice.userId, invoice.id, kind, {
        ...document,
        sourceUrl: url,
      });
    } catch (error) {
      await logFiscalError(context, {
        userId: invoice.userId,
        companyId: invoice.companyId,
        invoiceId: invoice.id,
        reference: invoice.reference,
        model: invoice.model,
        event: `download_${kind}_failed`,
        message: error instanceof Error ? error.message : `Falha ao salvar ${kind.toUpperCase()}.`,
      });
    }
  }
};

const issueNfse = async (
  context: FiscalStoreContext,
  focusContext: FocusRequestContext,
  invoice: FiscalInvoiceRecord,
  overrides?: Record<string, unknown>
) => {
  const focusResponse = await focusClient.issueNfse(focusContext, invoice, overrides);
  const urls = extractFocusDocumentUrls(invoice.environment, focusResponse);
  const updatedInvoice = await fiscalStore.saveFocusResult(context, invoice, focusResponse, urls);

  await fiscalStore.saveLog(context, {
    userId: invoice.userId,
    companyId: invoice.companyId,
    invoiceId: invoice.id,
    reference: invoice.reference,
    model: invoice.model,
    level: updatedInvoice.status === "authorized" ? "success" : "info",
    event: "nfse_issue_requested",
    message: "Solicitacao de emissao enviada para a Focus NFe.",
    details: { status: updatedInvoice.status },
  });

  await persistFiscalDocuments(context, focusContext, updatedInvoice, urls);
  return updatedInvoice;
};

export const registerFiscalRoutes = (options: RegisterFiscalRoutesOptions) => {
  const auth = requireFiscalAuth(options);

  options.app.get("/api/fiscal/health", (_req, res) => {
    res.json({
      status: "ok",
      provider: "focus-nfe",
      models: ["nfse", "nfe", "nfce"],
      firebaseInitialized: options.firebaseInitialized,
      timestamp: new Date().toISOString(),
    });
  });

  options.app.get("/api/fiscal/companies", auth, async (req: FiscalRequest, res: Response) => {
    try {
      const context = getFiscalContext(req, options);
      const companies = await fiscalStore.listCompanies(context, context.userId);
      res.json({ companies });
    } catch (error) {
      sendFiscalError(res, error);
    }
  });

  options.app.post("/api/fiscal/companies", auth, async (req: FiscalRequest, res: Response) => {
    try {
      const context = getFiscalContext(req, options);
      const input = req.body as FiscalCompanyInput;
      validateCompanyInput(input);
      const company = await fiscalStore.saveCompany(context, context.userId, input);

      await fiscalStore.saveLog(context, {
        userId: context.userId,
        companyId: company.id,
        level: "info",
        event: "fiscal_company_saved",
        message: "Configuracao fiscal da empresa salva.",
      });

      if (input.focusApiToken || input.certificateBase64 || input.focusOverrides) {
        const privateConfig = await fiscalStore.getPrivateConfig(context, context.userId, company.id);
        if (privateConfig?.focusApiToken) {
          const focusResponse = await focusClient.upsertCompany({ company, privateConfig }, input);
          await fiscalStore.saveLog(context, {
            userId: context.userId,
            companyId: company.id,
            level: "success",
            event: "focus_company_upserted",
            message: "Empresa enviada/atualizada na Focus NFe.",
            details: focusResponse,
          });
        }
      }

      res.json({ company });
    } catch (error) {
      sendFiscalError(res, error);
    }
  });

  options.app.post("/api/fiscal/companies/:companyId/certificate", auth, async (req: FiscalRequest, res: Response) => {
    try {
      const context = getFiscalContext(req, options);
      const companyId = safeDocumentId(req.params.companyId, "Empresa fiscal");
      const company = await fiscalStore.getCompany(context, context.userId, companyId);
      if (!company) throw httpError(404, "Empresa fiscal nao encontrada.");

      const input = req.body as FiscalCompanyInput;
      validateCompanyInput(input);
      if (!input.certificateBase64 || !input.certificatePassword) {
        return res.status(400).json({ error: "Certificado A1 em base64 e senha sao obrigatorios." });
      }

      const saved = await fiscalStore.saveCompany(context, context.userId, {
        ...company,
        certificateBase64: input.certificateBase64,
        certificatePassword: input.certificatePassword,
        focusApiToken: input.focusApiToken,
      });
      const focusContext = await getFocusContext(context, saved.id);
      const focusResponse = await focusClient.upsertCompany(focusContext, input);

      await fiscalStore.saveLog(context, {
        userId: context.userId,
        companyId: saved.id,
        level: "success",
        event: "certificate_uploaded",
        message: "Certificado A1 enviado para a Focus NFe.",
        details: focusResponse,
      });

      res.json({ company: saved, focusResponse });
    } catch (error) {
      sendFiscalError(res, error);
    }
  });

  options.app.post("/api/fiscal/nfse/manual", auth, async (req: FiscalRequest, res: Response) => {
    try {
      const context = getFiscalContext(req, options);
      const { companyId, customer, service, focusOverrides } = req.body;
      const safeCompanyId = safeDocumentId(companyId, "Empresa fiscal");
      validateFocusOverrides(focusOverrides);
      const focusContext = await getFocusContext(context, safeCompanyId);
      const invoice = await fiscalStore.createInvoice(
        context,
        buildManualInvoice(context.userId, focusContext.company, { customer, service, focusOverrides })
      );
      const updatedInvoice = await issueNfse(context, focusContext, invoice, focusOverrides);
      res.json({ invoice: updatedInvoice });
    } catch (error) {
      const context = options.db && req.fiscalAuth?.uid ? { db: options.db, userId: req.fiscalAuth.uid } : null;
      if (context) {
        await logFiscalError(context, {
          userId: context.userId,
          event: "manual_nfse_failed",
          message: error instanceof Error ? error.message : "Falha na emissao manual de NFS-e.",
        });
      }
      sendFiscalError(res, error);
    }
  });

  options.app.post("/api/fiscal/nfse/from-cash-launch", auth, async (req: FiscalRequest, res: Response) => {
    try {
      const context = getFiscalContext(req, options);
      const { companyId, cashLaunchId, focusOverrides } = req.body;
      const safeCompanyId = safeDocumentId(companyId, "Empresa fiscal");
      const safeCashLaunchId = safeDocumentId(cashLaunchId, "O.S.");
      validateFocusOverrides(focusOverrides);
      const focusContext = await getFocusContext(context, safeCompanyId);
      const launch = await fiscalStore.getCashLaunch(context, context.userId, safeCashLaunchId);
      if (!launch) throw httpError(404, "Ordem de servico nao encontrada.");
      if (launch.status !== "Finalizado") throw httpError(400, "Finalize a O.S. antes de emitir NFS-e.");

      const service = {
        ...defaultServiceFromCashLaunch(launch),
        ...(req.body.service || {}),
      };
      service.amount = validateFiscalAmount(service.amount, "Valor da O.S.");
      const invoice = await fiscalStore.createInvoice(context, {
        userId: context.userId,
        companyId: focusContext.company.id,
        companyDocument: focusContext.company.document,
        model: "nfse",
        environment: focusContext.company.focusEnvironment,
        reference: buildInvoiceReference("MF-NFSE-OS", launch.orderNumber || safeCashLaunchId),
        status: "draft",
        source: "cash_register",
        cashLaunchId: safeCashLaunchId,
        customer: {
          name: launch.clientName || "Consumidor final",
          phone: launch.clientPhone || "",
        },
        service,
        total: Number(service.amount || 0),
      });

      const updatedInvoice = await issueNfse(context, focusContext, invoice, focusOverrides);
      await fiscalStore.markCashLaunchFiscal(context, context.userId, safeCashLaunchId, updatedInvoice.id, updatedInvoice.reference);
      res.json({ invoice: updatedInvoice });
    } catch (error) {
      const context = options.db && req.fiscalAuth?.uid ? { db: options.db, userId: req.fiscalAuth.uid } : null;
      if (context) {
        await logFiscalError(context, {
          userId: context.userId,
          event: "cash_launch_nfse_failed",
          message: error instanceof Error ? error.message : "Falha ao emitir NFS-e por O.S.",
        });
      }
      sendFiscalError(res, error);
    }
  });

  options.app.post("/api/fiscal/nfse/:invoiceId/sync", auth, async (req: FiscalRequest, res: Response) => {
    try {
      const context = getFiscalContext(req, options);
      const invoiceId = safeDocumentId(req.params.invoiceId, "Nota fiscal");
      const invoice = await fiscalStore.getInvoice(context, context.userId, invoiceId);
      if (!invoice) throw httpError(404, "Nota fiscal nao encontrada.");
      const focusContext = await getFocusContext(context, invoice.companyId);
      const focusResponse = await focusClient.consultNfse(focusContext, invoice.reference);
      const urls = extractFocusDocumentUrls(invoice.environment, focusResponse);
      const updatedInvoice = await fiscalStore.saveFocusResult(context, invoice, focusResponse, urls);
      await persistFiscalDocuments(context, focusContext, updatedInvoice, urls);
      await fiscalStore.saveLog(context, {
        userId: context.userId,
        companyId: invoice.companyId,
        invoiceId: invoice.id,
        reference: invoice.reference,
        model: invoice.model,
        level: "info",
        event: "nfse_synced",
        message: "Status da NFS-e sincronizado com a Focus NFe.",
      });
      res.json({ invoice: updatedInvoice });
    } catch (error) {
      sendFiscalError(res, error);
    }
  });

  options.app.post("/api/fiscal/nfse/:invoiceId/cancel", auth, async (req: FiscalRequest, res: Response) => {
    try {
      const context = getFiscalContext(req, options);
      const invoiceId = safeDocumentId(req.params.invoiceId, "Nota fiscal");
      const invoice = await fiscalStore.getInvoice(context, context.userId, invoiceId);
      if (!invoice) throw httpError(404, "Nota fiscal nao encontrada.");
      const focusContext = await getFocusContext(context, invoice.companyId);
      const focusResponse = await focusClient.cancelNfse(focusContext, invoice.reference, req.body.reason || "Cancelamento solicitado pelo usuario.");
      const updatedInvoice = await fiscalStore.updateInvoice(context, context.userId, invoice.id, {
        status: "cancelled",
        cancelledAt: new Date().toISOString(),
        focusResponse,
      });
      await fiscalStore.saveLog(context, {
        userId: context.userId,
        companyId: invoice.companyId,
        invoiceId: invoice.id,
        reference: invoice.reference,
        model: invoice.model,
        level: "warning",
        event: "nfse_cancelled",
        message: "Cancelamento de NFS-e enviado para a Focus NFe.",
        details: focusResponse,
      });
      res.json({ invoice: updatedInvoice });
    } catch (error) {
      sendFiscalError(res, error);
    }
  });

  options.app.get("/api/fiscal/invoices/:invoiceId/documents/:kind", auth, async (req: FiscalRequest, res: Response) => {
    try {
      const context = getFiscalContext(req, options);
      if (req.params.kind !== "pdf" && req.params.kind !== "xml") {
        throw httpError(400, "Tipo de documento fiscal invalido.");
      }
      const kind = req.params.kind;
      const invoiceId = safeDocumentId(req.params.invoiceId, "Nota fiscal");
      const invoice = await fiscalStore.getInvoice(context, context.userId, invoiceId);
      if (!invoice) throw httpError(404, "Nota fiscal nao encontrada.");

      const stored = await fiscalStore.getFiscalFile(context, context.userId, invoice.id, kind);
      if (stored?.base64) {
        res.setHeader("Content-Type", stored.contentType || (kind === "pdf" ? "application/pdf" : "application/xml"));
        res.setHeader("Content-Disposition", `attachment; filename=\"${invoice.reference}.${kind}\"`);
        return res.send(Buffer.from(stored.base64, "base64"));
      }

      const remoteUrl = kind === "pdf" ? invoice.pdfUrl : invoice.xmlUrl;
      if (!remoteUrl) {
        return res.status(404).json({ error: `Documento ${kind.toUpperCase()} ainda nao disponivel.` });
      }

      const focusContext = await getFocusContext(context, invoice.companyId);
      const document = await focusClient.downloadDocument(focusContext, remoteUrl);
      res.setHeader("Content-Type", document.contentType);
      res.setHeader("Content-Disposition", `attachment; filename=\"${invoice.reference}.${kind}\"`);
      return res.send(document.bytes);
    } catch (error) {
      sendFiscalError(res, error);
    }
  });
};
