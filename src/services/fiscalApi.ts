import { auth } from '../firebase';
import type {
  FiscalCompany,
  FiscalCompanyFormInput,
  FiscalCustomer,
  FiscalInvoice,
  FiscalServiceInput,
} from '../types';

type FiscalApiResponse<T> = T & {
  error?: string;
  details?: unknown;
};

const fiscalBaseUrl = import.meta.env.VITE_FISCAL_API_URL || '';

const buildUrl = (path: string) => `${fiscalBaseUrl}${path}`;

const getAuthHeaders = async () => {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Usuario nao autenticado.');
  }

  const token = await user.getIdToken();
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
};

const parseResponse = async <T>(response: Response): Promise<T> => {
  const payload = await response.json().catch(() => ({})) as FiscalApiResponse<T>;
  if (!response.ok) {
    throw new Error(payload.error || 'Erro ao comunicar com o modulo fiscal.');
  }
  return payload as T;
};

export const fileToBase64 = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    const result = String(reader.result || '');
    resolve(result.includes(',') ? result.split(',')[1] : result);
  };
  reader.onerror = () => reject(reader.error || new Error('Nao foi possivel ler o arquivo.'));
  reader.readAsDataURL(file);
});

export const fiscalApi = {
  async saveCompany(input: FiscalCompanyFormInput) {
    const response = await fetch(buildUrl('/api/fiscal/companies'), {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify(input),
    });
    return parseResponse<{ company: FiscalCompany }>(response);
  },

  async uploadCertificate(companyId: string, input: Pick<FiscalCompanyFormInput, 'certificateBase64' | 'certificatePassword' | 'focusApiToken'>) {
    const response = await fetch(buildUrl(`/api/fiscal/companies/${companyId}/certificate`), {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify(input),
    });
    return parseResponse<{ company: FiscalCompany; focusResponse: Record<string, unknown> }>(response);
  },

  async issueManualNfse(payload: {
    companyId: string;
    customer: FiscalCustomer;
    service: FiscalServiceInput;
    focusOverrides?: Record<string, unknown>;
  }) {
    const response = await fetch(buildUrl('/api/fiscal/nfse/manual'), {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    return parseResponse<{ invoice: FiscalInvoice }>(response);
  },

  async issueFromCashLaunch(payload: {
    companyId: string;
    cashLaunchId: string;
    service?: Partial<FiscalServiceInput>;
    focusOverrides?: Record<string, unknown>;
  }) {
    const response = await fetch(buildUrl('/api/fiscal/nfse/from-cash-launch'), {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    return parseResponse<{ invoice: FiscalInvoice }>(response);
  },

  async syncNfse(invoiceId: string) {
    const response = await fetch(buildUrl(`/api/fiscal/nfse/${invoiceId}/sync`), {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({}),
    });
    return parseResponse<{ invoice: FiscalInvoice }>(response);
  },

  async cancelNfse(invoiceId: string, reason: string) {
    const response = await fetch(buildUrl(`/api/fiscal/nfse/${invoiceId}/cancel`), {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({ reason }),
    });
    return parseResponse<{ invoice: FiscalInvoice }>(response);
  },

  async downloadFiscalDocument(invoiceId: string, kind: 'xml' | 'pdf') {
    const response = await fetch(buildUrl(`/api/fiscal/invoices/${invoiceId}/documents/${kind}`), {
      headers: await getAuthHeaders(),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(payload.error || `Documento ${kind.toUpperCase()} indisponivel.`);
    }

    return response.blob();
  },
};

