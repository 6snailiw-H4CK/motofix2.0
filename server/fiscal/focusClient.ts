import type {
  FiscalCompanyInput,
  FiscalCompanyPublic,
  FiscalEnvironment,
  FiscalInvoiceRecord,
  FocusRequestContext,
} from "./types";

type FocusRequestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  token: string;
  environment: FiscalEnvironment;
};

const DEFAULT_FOCUS_URLS: Record<FiscalEnvironment, string> = {
  homologation: "https://homologacao.focusnfe.com.br",
  production: "https://api.focusnfe.com.br",
};

const FOCUS_TIMEOUT_MS = Number(process.env.FOCUS_NFE_TIMEOUT_MS || 20_000);

const normalizeDocument = (value?: string) => String(value || "").replace(/\D/g, "");

const getBaseUrl = (environment: FiscalEnvironment) => {
  const envKey = environment === "production" ? "FOCUS_NFE_PRODUCTION_URL" : "FOCUS_NFE_HOMOLOGATION_URL";
  return (process.env[envKey] || DEFAULT_FOCUS_URLS[environment]).replace(/\/$/, "");
};

const buildAuthHeader = (token: string) => {
  const encoded = Buffer.from(`${token}:`).toString("base64");
  return `Basic ${encoded}`;
};

const asObject = (value: unknown): Record<string, unknown> => (
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
);

const resolveFocusUrl = (environment: FiscalEnvironment, rawUrl?: string) => {
  if (!rawUrl) return undefined;
  if (/^https?:\/\//i.test(rawUrl)) return rawUrl;
  const baseUrl = getBaseUrl(environment);
  return `${baseUrl}/${rawUrl.replace(/^\//, "")}`;
};

const parseFocusPayload = (text: string) => {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 1000) };
  }
};

export const extractFocusDocumentUrls = (environment: FiscalEnvironment, response: Record<string, unknown>) => {
  const xmlCandidate = response.caminho_xml_nota_fiscal
    || response.caminho_xml_nfse
    || response.caminho_xml
    || response.url_xml
    || response.xml;

  const pdfCandidate = response.caminho_danfe
    || response.caminho_pdf_nfse
    || response.caminho_pdf
    || response.url_danfse
    || response.url_pdf
    || response.pdf;

  return {
    xmlUrl: typeof xmlCandidate === "string" ? resolveFocusUrl(environment, xmlCandidate) : undefined,
    pdfUrl: typeof pdfCandidate === "string" ? resolveFocusUrl(environment, pdfCandidate) : undefined,
  };
};

export const focusRequest = async <T = Record<string, unknown>>(path: string, options: FocusRequestOptions): Promise<T> => {
  const baseUrl = getBaseUrl(options.environment);
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method || "GET",
    signal: AbortSignal.timeout(FOCUS_TIMEOUT_MS),
    headers: {
      Authorization: buildAuthHeader(options.token),
      "Content-Type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  const payload = parseFocusPayload(text) as Record<string, unknown>;

  if (!response.ok) {
    const message = typeof payload?.mensagem === "string"
      ? payload.mensagem
      : typeof payload?.message === "string"
        ? payload.message
        : `Focus NFe retornou HTTP ${response.status}`;
    const error = new Error(message) as Error & { status?: number; details?: unknown };
    error.status = response.status;
    error.details = payload;
    throw error;
  }

  return payload as T;
};

export const buildFocusCompanyPayload = (company: FiscalCompanyPublic, input: FiscalCompanyInput) => {
  const overrides = asObject(input.focusOverrides);
  return {
    cnpj: normalizeDocument(company.document),
    razao_social: company.legalName,
    nome_fantasia: company.tradeName || company.legalName,
    inscricao_municipal: company.municipalRegistration || "",
    inscricao_estadual: company.stateRegistration || "",
    regime_tributario: company.taxRegime || "simples_nacional",
    cnae: company.cnae || "",
    email: company.email || "",
    telefone: company.phone || "",
    logradouro: company.address || "",
    numero: company.number || "",
    complemento: company.complement || "",
    bairro: company.district || "",
    municipio: company.city || company.serviceCityName || "",
    uf: company.state || "",
    cep: normalizeDocument(company.zipCode),
    habilita_nfse: company.nfseEnabled,
    habilita_nfe: company.nfeEnabled,
    habilita_nfce: company.nfceEnabled,
    codigo_municipio: company.serviceCityCode || "",
    ...(input.certificateBase64 ? { arquivo_certificado_base64: input.certificateBase64 } : {}),
    ...(input.certificatePassword ? { senha_certificado: input.certificatePassword } : {}),
    ...overrides,
  };
};

export const buildFocusNfsePayload = (
  invoice: FiscalInvoiceRecord,
  company: FiscalCompanyPublic,
  overrides?: Record<string, unknown>
) => {
  const customerDocument = normalizeDocument(invoice.customer.document);
  const isCompanyCustomer = customerDocument.length === 14;

  return {
    data_emissao: new Date().toISOString(),
    prestador: {
      cnpj: normalizeDocument(company.document),
      inscricao_municipal: company.municipalRegistration || "",
      codigo_municipio: company.serviceCityCode || "",
    },
    tomador: {
      razao_social: invoice.customer.name,
      email: invoice.customer.email || "",
      telefone: invoice.customer.phone || "",
      endereco: invoice.customer.address || "",
      numero: invoice.customer.number || "",
      bairro: invoice.customer.district || "",
      codigo_municipio: invoice.customer.cityCode || company.serviceCityCode || "",
      municipio: invoice.customer.city || company.serviceCityName || company.city || "",
      uf: invoice.customer.state || company.state || "",
      cep: normalizeDocument(invoice.customer.zipCode),
      ...(customerDocument ? { [isCompanyCustomer ? "cnpj" : "cpf"]: customerDocument } : {}),
    },
    servico: {
      discriminacao: invoice.service.description,
      item_lista_servico: invoice.service.serviceCode || "",
      codigo_tributario_municipio: invoice.service.municipalTaxCode || "",
      codigo_municipio: invoice.service.cityCode || company.serviceCityCode || "",
      cnae: invoice.service.cnae || company.cnae || "",
      valor_servicos: invoice.service.amount,
      valor_deducoes: invoice.service.deductions || 0,
      aliquota: invoice.service.issRate || 0,
      iss_retido: Boolean(invoice.service.withheldIss),
    },
    ...asObject(overrides),
  };
};

export const focusClient = {
  async upsertCompany(context: FocusRequestContext, input: FiscalCompanyInput) {
    const cnpj = normalizeDocument(context.company.document);
    const body = buildFocusCompanyPayload(context.company, input);
    return focusRequest<Record<string, unknown>>(`/v2/empresas/${cnpj}`, {
      method: "PUT",
      body,
      token: context.privateConfig.focusApiToken,
      environment: context.company.focusEnvironment,
    });
  },

  async issueNfse(context: FocusRequestContext, invoice: FiscalInvoiceRecord, overrides?: Record<string, unknown>) {
    const body = buildFocusNfsePayload(invoice, context.company, overrides);
    return focusRequest<Record<string, unknown>>(`/v2/nfse?ref=${encodeURIComponent(invoice.reference)}`, {
      method: "POST",
      body,
      token: context.privateConfig.focusApiToken,
      environment: context.company.focusEnvironment,
    });
  },

  async consultNfse(context: FocusRequestContext, reference: string) {
    return focusRequest<Record<string, unknown>>(`/v2/nfse/${encodeURIComponent(reference)}`, {
      token: context.privateConfig.focusApiToken,
      environment: context.company.focusEnvironment,
    });
  },

  async cancelNfse(context: FocusRequestContext, reference: string, reason: string) {
    return focusRequest<Record<string, unknown>>(`/v2/nfse/${encodeURIComponent(reference)}`, {
      method: "DELETE",
      body: { justificativa: reason },
      token: context.privateConfig.focusApiToken,
      environment: context.company.focusEnvironment,
    });
  },

  async downloadDocument(context: FocusRequestContext, url: string) {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(FOCUS_TIMEOUT_MS),
      headers: {
        Authorization: buildAuthHeader(context.privateConfig.focusApiToken),
      },
    });

    if (!response.ok) {
      throw new Error(`Nao foi possivel baixar documento fiscal: HTTP ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return {
      bytes: Buffer.from(arrayBuffer),
      contentType: response.headers.get("content-type") || "application/octet-stream",
    };
  },
};
