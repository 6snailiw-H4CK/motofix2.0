import { auth } from '../../../firebase';
import type { WhatsAppApiClient } from '../interfaces';
import type { WhatsAppContact, WhatsAppMessage, WhatsAppSendInput } from '../types';

type ApiResponse<T> = T & {
  error?: string;
  details?: unknown;
};

const whatsappBaseUrl = (import.meta.env.VITE_WHATSAPP_API_URL || '').replace(/\/+$/, '');

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
  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.toLowerCase().includes('application/json');
  if (!isJson) {
    const body = await response.text().catch(() => '');
    const looksLikeSpaFallback = response.ok && /<html|<!doctype/i.test(body);
    throw new Error(
      looksLikeSpaFallback
        ? 'Modulo WhatsApp nao esta apontando para o servidor da API. Configure VITE_WHATSAPP_API_URL ou uma rewrite /api/whatsapp para o backend.'
        : 'Modulo WhatsApp retornou uma resposta invalida.'
    );
  }

  const payload = await response.json().catch(() => ({})) as ApiResponse<T>;
  if (!response.ok) {
    throw new Error(payload.error || 'Erro ao comunicar com o modulo WhatsApp.');
  }
  return payload as T;
};

const normalizeMessagesResponse = (payload: { messages?: unknown }) => ({
  messages: Array.isArray(payload.messages) ? payload.messages as WhatsAppMessage[] : [],
});

const normalizeContactsResponse = (payload: { contacts?: unknown }) => ({
  contacts: Array.isArray(payload.contacts) ? payload.contacts as WhatsAppContact[] : [],
});

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
    return normalizeMessagesResponse(await parseResponse(response));
  },

  async contacts(limit?: number) {
    const response = await fetch(buildUrl(withLimit('/api/whatsapp/contacts', limit)), {
      headers: await getAuthHeaders(),
    });
    return normalizeContactsResponse(await parseResponse(response));
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

  async sendDueReminders(limit?: number) {
    const response = await fetch(buildUrl('/api/whatsapp/reminders/send-due'), {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({ limit }),
    });
    return parseResponse(response);
  },
};
