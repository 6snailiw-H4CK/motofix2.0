import { auth } from '../firebase';

type OperationalDataResetResponse = {
  deletedByCollection: Record<string, number>;
  deletedTotal: number;
  preservedCollections: string[];
  resetClients: number;
};

type ApiResponse<T> = T & {
  error?: string;
  details?: unknown;
};

const dataResetBaseUrl = (
  import.meta.env.VITE_DATA_RESET_API_URL
  || import.meta.env.VITE_FISCAL_API_URL
  || import.meta.env.VITE_WHATSAPP_API_URL
  || ''
);

const buildUrl = (path: string) => `${dataResetBaseUrl}${path}`;

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
  const payload = await response.json().catch(() => ({})) as ApiResponse<T>;
  if (!response.ok) {
    throw new Error(payload.error || 'Nao foi possivel zerar os dados.');
  }
  return payload as T;
};

export const operationalDataResetApi = {
  async resetOperationalData() {
    const response = await fetch(buildUrl('/api/data-reset/operational'), {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({ confirmation: 'ZERAR' }),
    });

    return parseResponse<OperationalDataResetResponse>(response);
  },
};
