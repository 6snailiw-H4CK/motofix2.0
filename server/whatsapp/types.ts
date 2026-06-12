import type admin from "firebase-admin";

export type WhatsAppSessionStatus =
  | "disconnected"
  | "connecting"
  | "qr"
  | "connected"
  | "reconnecting"
  | "error";

export type WhatsAppMessageDirection = "inbound" | "outbound";
export type WhatsAppMessageStatus = "received" | "queued" | "sent" | "failed";

export type AuthenticatedWhatsAppRequest = {
  uid: string;
  email?: string;
};

export type WhatsAppStoreContext = {
  db: admin.firestore.Firestore;
};

export type WhatsAppSessionRecord = {
  id?: string;
  userId: string;
  sessionId: string;
  provider: "open-wa";
  phoneNumber?: string;
  connected: boolean;
  status: WhatsAppSessionStatus;
  createdAt: string;
  updatedAt: string;
  lastSeen?: string;
  qrUpdatedAt?: string;
  error?: string | null;
};

export type WhatsAppSessionPublic = Pick<
  WhatsAppSessionRecord,
  "sessionId" | "provider" | "phoneNumber" | "connected" | "status" | "createdAt" | "updatedAt" | "lastSeen" | "qrUpdatedAt" | "error"
>;

export type WhatsAppQrPayload = {
  sessionId: string;
  status: WhatsAppSessionStatus;
  qrCode?: string;
  qrData?: string;
  updatedAt?: string;
};

export type WhatsAppMessageRecord = {
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

export type WhatsAppContactRecord = {
  id?: string;
  userId: string;
  phone: string;
  name?: string;
  lastInteraction: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

export type WhatsAppAutomationRecord = {
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

export type WhatsAppAiReplyContext = {
  userId: string;
  from: string;
  contactName?: string;
  inboundText: string;
};
