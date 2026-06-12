import { auth } from '../../../firebase';
import type { WhatsAppApiClient } from '../interfaces';
import type { WhatsAppSendInput } from '../types';

type ApiResponse<T> = T & {
  error?: string;
  details?: unknown;
};

const whatsappBaseUrl = import.meta.env.VITE_WHATSAPP_API_URL || '';

const buildUrl = (path: string) => `${whatsappBaseUrl}${path}`;

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
    throw new Error(payload.error || 'Erro ao comunicar com o modulo WhatsApp.');
  }
  return payload as T;
};

const withLimit = (path: string, limit?: number) => {
  if (!limit) return path;
  const params = new URLSearchParams({ limit: String(limit) });
  return `${path}?${params.toString()}`;
};

export const whatsappApi: WhatsAppApiClient = {
  async connect() {
    const response = await fetch(buildUrl('/api/whatsapp/connect'), {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({}),
    });
    return parseResponse(response);
  },

  async status() {
    const response = await fetch(buildUrl('/api/whatsapp/status'), {
      headers: await getAuthHeaders(),
    });
    return parseResponse(response);
  },

  async qrcode() {
    const response = await fetch(buildUrl('/api/whatsapp/qrcode'), {
      headers: await getAuthHeaders(),
    });
    return parseResponse(response);
  },

  async disconnect(preserveSessionData = false) {
    const response = await fetch(buildUrl('/api/whatsapp/disconnect'), {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({ preserveSessionData }),
    });
    return parseResponse(response);
  },

  async reconnect() {
    const response = await fetch(buildUrl('/api/whatsapp/reconnect'), {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({}),
    });
    return parseResponse(response);
  },

  async send(input: WhatsAppSendInput) {
    const response = await fetch(buildUrl('/api/whatsapp/send'), {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify(input),
    });
    return parseResponse(response);
  },

  async messages(limit?: number) {
    const response = await fetch(buildUrl(withLimit('/api/whatsapp/messages', limit)), {
      headers: await getAuthHeaders(),
    });
    return parseResponse(response);
  },

  async contacts(limit?: number) {
    const response = await fetch(buildUrl(withLimit('/api/whatsapp/contacts', limit)), {
      headers: await getAuthHeaders(),
    });
    return parseResponse(response);
  },

  async automation() {
    const response = await fetch(buildUrl('/api/whatsapp/automations'), {
      headers: await getAuthHeaders(),
    });
    return parseResponse(response);
  },

  async updateAutomation(input) {
    const response = await fetch(buildUrl('/api/whatsapp/automations'), {
      method: 'PUT',
      headers: await getAuthHeaders(),
      body: JSON.stringify(input),
    });
    return parseResponse(response);
  },
};
