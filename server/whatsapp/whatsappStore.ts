import type admin from "firebase-admin";
import type {
  WhatsAppAutomationRecord,
  WhatsAppContactRecord,
  WhatsAppMessageRecord,
  WhatsAppSessionRecord,
  WhatsAppStoreContext,
} from "./types";

const DEFAULT_SESSION_DOC_ID = "primary";
const DEFAULT_AUTOMATION_DOC_ID = "config";

const nowIso = () => new Date().toISOString();

const usersCollection = (context: WhatsAppStoreContext) => context.db.collection("users");

const sessionDoc = (context: WhatsAppStoreContext, userId: string, docId = DEFAULT_SESSION_DOC_ID) =>
  usersCollection(context).doc(userId).collection("whatsapp_sessions").doc(docId);

const messagesCollection = (context: WhatsAppStoreContext, userId: string) =>
  usersCollection(context).doc(userId).collection("whatsapp_messages");

const contactsCollection = (context: WhatsAppStoreContext, userId: string) =>
  usersCollection(context).doc(userId).collection("whatsapp_contacts");

const automationDoc = (context: WhatsAppStoreContext, userId: string, docId = DEFAULT_AUTOMATION_DOC_ID) =>
  usersCollection(context).doc(userId).collection("whatsapp_automations").doc(docId);

const safeContactDocId = (phone: string) => {
  const normalized = phone.replace(/[^a-zA-Z0-9@._-]/g, "_").slice(0, 160);
  return normalized || `contact_${Date.now()}`;
};

const stripUndefined = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item)) as T;
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, stripUndefined(item)])
  ) as T;
};

const normalizeLimit = (limit?: number) => {
  const parsed = Number(limit || 50);
  if (!Number.isFinite(parsed)) return 50;
  return Math.min(Math.max(Math.trunc(parsed), 1), 200);
};

const buildDefaultAutomation = (userId: string): WhatsAppAutomationRecord => {
  const now = nowIso();
  return {
    id: DEFAULT_AUTOMATION_DOC_ID,
    userId,
    enabled: false,
    aiEnabled: false,
    autoReplyEnabled: false,
    appointmentEnabled: false,
    createdAt: now,
    updatedAt: now,
  };
};

export const whatsappStore = {
  defaultSessionDocId: DEFAULT_SESSION_DOC_ID,
  defaultAutomationDocId: DEFAULT_AUTOMATION_DOC_ID,

  async getSession(context: WhatsAppStoreContext, userId: string) {
    const snapshot = await sessionDoc(context, userId).get();
    if (!snapshot.exists) return null;
    return { id: snapshot.id, ...snapshot.data() } as WhatsAppSessionRecord;
  },

  async saveSession(
    context: WhatsAppStoreContext,
    userId: string,
    patch: Omit<Partial<WhatsAppSessionRecord>, "id" | "userId" | "createdAt"> & { sessionId: string }
  ) {
    const ref = sessionDoc(context, userId);
    const snapshot = await ref.get();
    const timestamp = nowIso();
    const payload = stripUndefined<Partial<WhatsAppSessionRecord>>({
      provider: "open-wa",
      connected: false,
      status: "disconnected",
      ...patch,
      userId,
      updatedAt: timestamp,
      ...(snapshot.exists ? {} : { createdAt: timestamp }),
    });

    await ref.set(payload, { merge: true });
    const updated = await ref.get();
    return { id: updated.id, ...updated.data() } as WhatsAppSessionRecord;
  },

  async saveMessage(context: WhatsAppStoreContext, userId: string, input: Omit<WhatsAppMessageRecord, "id" | "userId" | "createdAt" | "updatedAt">) {
    const timestamp = nowIso();
    const docRef = messagesCollection(context, userId).doc();
    const payload = stripUndefined<WhatsAppMessageRecord>({
      ...input,
      userId,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    await docRef.set(payload);
    return { id: docRef.id, ...payload };
  },

  async listMessages(context: WhatsAppStoreContext, userId: string, limit?: number) {
    const snapshot = await messagesCollection(context, userId)
      .orderBy("timestamp", "desc")
      .limit(normalizeLimit(limit))
      .get();

    return snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() } as WhatsAppMessageRecord))
      .reverse();
  },

  async upsertContact(
    context: WhatsAppStoreContext,
    userId: string,
    input: Omit<Partial<WhatsAppContactRecord>, "id" | "userId" | "createdAt" | "updatedAt"> & { phone: string }
  ) {
    const ref = contactsCollection(context, userId).doc(safeContactDocId(input.phone));
    const snapshot = await ref.get();
    const timestamp = nowIso();
    const payload = stripUndefined<Partial<WhatsAppContactRecord>>({
      tags: [],
      ...input,
      userId,
      updatedAt: timestamp,
      ...(snapshot.exists ? {} : { createdAt: timestamp }),
    });

    await ref.set(payload, { merge: true });
    const updated = await ref.get();
    return { id: updated.id, ...updated.data() } as WhatsAppContactRecord;
  },

  async listContacts(context: WhatsAppStoreContext, userId: string, limit?: number) {
    const snapshot = await contactsCollection(context, userId)
      .orderBy("lastInteraction", "desc")
      .limit(normalizeLimit(limit))
      .get();

    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as WhatsAppContactRecord));
  },

  async getAutomation(context: WhatsAppStoreContext, userId: string) {
    const ref = automationDoc(context, userId);
    const snapshot = await ref.get();
    if (snapshot.exists) {
      return { id: snapshot.id, ...snapshot.data() } as WhatsAppAutomationRecord;
    }

    const defaults = buildDefaultAutomation(userId);
    await ref.set(defaults);
    return defaults;
  },

  async updateAutomation(context: WhatsAppStoreContext, userId: string, patch: Partial<WhatsAppAutomationRecord>) {
    const ref = automationDoc(context, userId);
    const current = await this.getAutomation(context, userId);
    const payload = stripUndefined<WhatsAppAutomationRecord>({
      ...current,
      ...patch,
      id: DEFAULT_AUTOMATION_DOC_ID,
      userId,
      updatedAt: nowIso(),
      createdAt: current.createdAt || nowIso(),
    });
    await ref.set(payload, { merge: true });
    return payload;
  },
};
