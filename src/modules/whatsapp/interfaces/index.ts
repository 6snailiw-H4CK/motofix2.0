import type {
  WhatsAppAutomation,
  WhatsAppContact,
  WhatsAppMessage,
  WhatsAppQrPayload,
  WhatsAppSendInput,
  WhatsAppSession,
} from '../types';

export type WhatsAppStatusResponse = {
  session: WhatsAppSession;
  automation: WhatsAppAutomation;
};

export type WhatsAppQrCodeResponse = {
  qrCode: WhatsAppQrPayload;
};

export type WhatsAppSessionResponse = {
  session: WhatsAppSession;
};

export type WhatsAppMessageResponse = {
  message: WhatsAppMessage;
};

export type WhatsAppMessagesResponse = {
  messages: WhatsAppMessage[];
};

export type WhatsAppContactsResponse = {
  contacts: WhatsAppContact[];
};

export type WhatsAppAutomationResponse = {
  automation: WhatsAppAutomation;
};

export type WhatsAppApiClient = {
  connect: () => Promise<WhatsAppSessionResponse>;
  status: () => Promise<WhatsAppStatusResponse>;
  qrcode: () => Promise<WhatsAppQrCodeResponse>;
  disconnect: (preserveSessionData?: boolean) => Promise<WhatsAppSessionResponse>;
  reconnect: () => Promise<WhatsAppSessionResponse>;
  send: (input: WhatsAppSendInput) => Promise<WhatsAppMessageResponse>;
  messages: (limit?: number) => Promise<WhatsAppMessagesResponse>;
  contacts: (limit?: number) => Promise<WhatsAppContactsResponse>;
  automation: () => Promise<WhatsAppAutomationResponse>;
  updateAutomation: (input: Partial<Pick<WhatsAppAutomation, 'enabled' | 'aiEnabled' | 'autoReplyEnabled' | 'appointmentEnabled'>>) => Promise<WhatsAppAutomationResponse>;
};
