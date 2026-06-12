export type WhatsAppSessionStatus =
  | 'disconnected'
  | 'connecting'
  | 'qr'
  | 'connected'
  | 'reconnecting'
  | 'error';

export type WhatsAppMessageDirection = 'inbound' | 'outbound';
export type WhatsAppMessageStatus = 'received' | 'queued' | 'sent' | 'failed';

export type WhatsAppSession = {
  sessionId: string;
  provider: 'open-wa';
  phoneNumber?: string;
  connected: boolean;
  status: WhatsAppSessionStatus;
  createdAt: string;
  updatedAt: string;
  lastSeen?: string;
  qrUpdatedAt?: string;
  error?: string | null;
};

export type WhatsAppQrPayload = {
  sessionId: string;
  status: WhatsAppSessionStatus;
  qrCode?: string;
  qrData?: string;
  updatedAt?: string;
};

export type WhatsAppMessage = {
  id?: string;
  userId: string;
  messageId: string;
  direction: WhatsAppMessageDirection;
  from: string;
  to: string;
  text: string;
  timestamp: string;
  status: WhatsAppMessageStatus;
  contactName?: string;
  error?: string | null;
  createdAt: string;
  updatedAt?: string;
};

export type WhatsAppContact = {
  id?: string;
  userId: string;
  phone: string;
  name?: string;
  lastInteraction: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

export type WhatsAppAutomation = {
  id?: string;
  userId: string;
  enabled: boolean;
  aiEnabled: boolean;
  autoReplyEnabled: boolean;
  appointmentEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type WhatsAppSendInput = {
  to: string;
  text: string;
};
