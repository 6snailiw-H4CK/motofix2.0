import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as QRCode from "qrcode";
import type { Client as OpenWaClient } from "@open-wa/wa-automate";
import type { ChatId } from "@open-wa/wa-automate/dist/api/model/aliases";
import { whatsappStore } from "./whatsappStore";
import { whatsAppAiService } from "./WhatsAppAiService";
import type {
  WhatsAppMessageRecord,
  WhatsAppQrPayload,
  WhatsAppSendInput,
  WhatsAppSessionPublic,
  WhatsAppSessionStatus,
  WhatsAppStoreContext,
} from "./types";

type OpenWaModule = typeof import("@open-wa/wa-automate");

type RuntimeSession = {
  userId: string;
  sessionId: string;
  status: WhatsAppSessionStatus;
  connected: boolean;
  client?: OpenWaClient;
  connectingPromise?: Promise<void>;
  phoneNumber?: string;
  qrCode?: string;
  qrData?: string;
  qrUpdatedAt?: string;
  lastSeen?: string;
  error?: string | null;
  listenersAttached?: boolean;
};

const SESSION_PREFIX = process.env.WHATSAPP_SESSION_PREFIX || "motofix";
const DEFAULT_HEADLESS = process.env.WHATSAPP_HEADLESS !== "false";
const DEFAULT_QR_TIMEOUT = Number(process.env.WHATSAPP_QR_TIMEOUT || 0);
const DEFAULT_AUTH_TIMEOUT = Number(process.env.WHATSAPP_AUTH_TIMEOUT || 0);
const DEFAULT_QR_REFRESH_SECONDS = Number(process.env.WHATSAPP_QR_REFRESH_SECONDS || 15);
const DEFAULT_RIPE_SESSION_TIMEOUT = Number(process.env.WHATSAPP_WAIT_FOR_RIPE_SESSION_TIMEOUT || 0);
const DEFAULT_USE_CHROME = process.env.WHATSAPP_USE_CHROME !== "false";
const DEFAULT_LOG_CONSOLE_ERRORS = process.env.WHATSAPP_LOG_CONSOLE_ERRORS === "true";
const DEFAULT_SCREENSHOT_ON_ERROR = process.env.WHATSAPP_SCREENSHOT_ON_ERROR === "true";
const RESET_SESSION_ON_TIMEOUT = process.env.WHATSAPP_RESET_ON_TIMEOUT !== "false";
const DEFAULT_CHROME_PATH = process.env.WHATSAPP_CHROME_PATH || "";
const DEFAULT_CUSTOM_USER_AGENT =
  process.env.WHATSAPP_CUSTOM_USER_AGENT ||
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";
const SESSION_DATA_PATH = path.resolve(
  process.cwd(),
  process.env.WHATSAPP_SESSION_DATA_PATH || "./storage/whatsapp-sessions"
);

const nowIso = () => new Date().toISOString();

const safeSessionId = (userId: string) => {
  const safeUser = userId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
  return `${SESSION_PREFIX}_${safeUser}`;
};

const publicSession = (state: RuntimeSession): WhatsAppSessionPublic => ({
  sessionId: state.sessionId,
  provider: "open-wa",
  phoneNumber: state.phoneNumber,
  connected: state.connected,
  status: state.status,
  createdAt: state.lastSeen || nowIso(),
  updatedAt: state.lastSeen || nowIso(),
  lastSeen: state.lastSeen,
  qrUpdatedAt: state.qrUpdatedAt,
  error: state.error || null,
});

const normalizeText = (value: unknown, maxLength = 4000) => String(value || "").trim().slice(0, maxLength);

const normalizePhone = (value: string) => {
  const trimmed = String(value || "").trim();
  if (!trimmed) throw Object.assign(new Error("Telefone do destinatario e obrigatorio."), { status: 400 });
  if (trimmed.endsWith("@c.us") || trimmed.endsWith("@g.us")) return trimmed;

  let digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) {
    digits = `55${digits}`;
  }
  if (!/^55\d{10,11}$/.test(digits) && !/^\d{11,15}$/.test(digits)) {
    throw Object.assign(new Error("Telefone do destinatario invalido."), { status: 400 });
  }
  return `${digits}@c.us`;
};

const getErrorMessage = (error: unknown, fallback = "Falha ao enviar mensagem.") =>
  error instanceof Error ? error.message : fallback;

const getErrorStatus = (error: unknown, fallback = 502) => {
  const status = typeof error === "object" && error && "status" in error ? Number((error as any).status) : fallback;
  return Number.isInteger(status) && status >= 400 && status < 600 ? status : fallback;
};

const isOpenWaProviderError = (value: unknown) => {
  if (value === false || value === null || value === undefined) return true;
  if (typeof value !== "string") return false;
  return /^(error|erro)\b|not a contact|unlock this feature|license|get\.openwa/i.test(value.trim());
};

const toWhatsAppSendError = (providerResult: unknown) => {
  const raw = typeof providerResult === "string" ? providerResult.trim() : "";
  const isContactRestriction = /not a contact|unlock this feature|license|get\.openwa/i.test(raw);
  const message = isContactRestriction
    ? "O open-wa recusou o envio porque este numero nao e um contato ou conversa existente nesta sessao. Salve o numero no WhatsApp da oficina, peca para o cliente enviar uma mensagem primeiro, ou use uma licenca/API oficial para iniciar conversas."
    : "O WhatsApp nao confirmou o envio da mensagem.";

  return Object.assign(new Error(message), {
    status: isContactRestriction ? 422 : 502,
    providerResult: raw || providerResult,
  });
};

const assertOpenWaSendResult = (providerResult: unknown) => {
  if (isOpenWaProviderError(providerResult)) {
    throw toWhatsAppSendError(providerResult);
  }
};

const getMessageText = (message: any) => normalizeText(message?.body || message?.caption || message?.text || "", 4000);

const getMessageId = (message: any) => {
  const rawId = message?.id?._serialized || message?.id || message?.messageId;
  return normalizeText(rawId, 240) || randomUUID();
};

const asChatId = (value: string) => value as ChatId;

const sessionDataFilePath = (sessionId: string) => path.join(SESSION_DATA_PATH, `${sessionId}.data.json`);

const userDataDirPath = (sessionId: string) => path.join(SESSION_DATA_PATH, `_IGNORE_${sessionId}`);

const isInsideSessionDataPath = (targetPath: string) => {
  const root = path.resolve(SESSION_DATA_PATH).toLowerCase();
  const target = path.resolve(targetPath).toLowerCase();
  return target === root || target.startsWith(`${root}${path.sep}`);
};

const isOpenWaBootTimeout = (message?: string | null) =>
  Boolean(message && /Waiting failed:\s*30000ms exceeded|window\.Debug|TOS_BLOCK|delete the .*_IGNORE/i.test(message));

const getContactName = (message: any) =>
  normalizeText(message?.sender?.pushname || message?.notifyName || message?.sender?.formattedName || message?.from, 160);

const mapOpenWaState = (state: unknown): WhatsAppSessionStatus => {
  const value = String(state || "").toUpperCase();
  if (["CONNECTED", "SYNCING", "RESUMING"].includes(value)) return "connected";
  if (["UNPAIRED", "UNPAIRED_IDLE", "PAIRING", "QR"].includes(value)) return "qr";
  if (["CONFLICT", "TIMEOUT", "UNLAUNCHED", "OPENING"].includes(value)) return "reconnecting";
  return "connecting";
};

export class WhatsAppSessionService {
  private sessions = new Map<string, RuntimeSession>();

  private getRuntime(userId: string) {
    const existing = this.sessions.get(userId);
    if (existing) return existing;

    const state: RuntimeSession = {
      userId,
      sessionId: safeSessionId(userId),
      status: "disconnected",
      connected: false,
      error: null,
    };
    this.sessions.set(userId, state);
    return state;
  }

  private async captureQr(context: WhatsAppStoreContext, state: RuntimeSession, data: unknown) {
    const raw = String(data || "").trim();
    if (!raw) return;

    const qrCode = raw.startsWith("data:image/")
      ? raw
      : await QRCode.toDataURL(raw, { errorCorrectionLevel: "M", margin: 1, width: 320 }).catch(() => raw);

    const timestamp = nowIso();
    state.qrCode = qrCode;
    state.qrData = raw;
    state.qrUpdatedAt = timestamp;
    state.status = "qr";
    state.connected = false;
    state.error = null;

    await whatsappStore.saveSession(context, state.userId, {
      sessionId: state.sessionId,
      connected: false,
      status: "qr",
      qrUpdatedAt: timestamp,
      error: null,
    });
  }

  private attachQrListeners(openWa: OpenWaModule, context: WhatsAppStoreContext, state: RuntimeSession) {
    if (state.listenersAttached) return;

    const qrListener = (data: unknown, emittedSessionId: string) => {
      if (emittedSessionId !== state.sessionId) return;
      void this.captureQr(context, state, data);
    };

    const qrDataListener = (data: unknown, emittedSessionId: string) => {
      if (emittedSessionId !== state.sessionId) return;
      void this.captureQr(context, state, data);
    };

    openWa.ev.on(`qr.${state.sessionId}`, qrListener);
    openWa.ev.on(`qrData.${state.sessionId}`, qrDataListener);
    state.listenersAttached = true;
  }

  private async markState(context: WhatsAppStoreContext, state: RuntimeSession, status: WhatsAppSessionStatus, error?: string | null) {
    const timestamp = nowIso();
    state.status = status;
    state.connected = status === "connected";
    state.lastSeen = timestamp;
    state.error = error ?? null;

    await whatsappStore.saveSession(context, state.userId, {
      sessionId: state.sessionId,
      connected: state.connected,
      status,
      lastSeen: timestamp,
      error: state.error,
      ...(state.phoneNumber ? { phoneNumber: state.phoneNumber } : {}),
    });
  }

  private async clearLocalSession(state: RuntimeSession) {
    await fs.mkdir(SESSION_DATA_PATH, { recursive: true });

    const targets = [
      sessionDataFilePath(state.sessionId),
      userDataDirPath(state.sessionId),
    ];

    await Promise.all(targets.map(async (target) => {
      if (!isInsideSessionDataPath(target)) return;
      await fs.rm(target, { recursive: true, force: true }).catch(() => undefined);
    }));

    state.qrCode = undefined;
    state.qrData = undefined;
    state.qrUpdatedAt = undefined;
  }

  private async handleIncomingMessage(context: WhatsAppStoreContext, state: RuntimeSession, message: any) {
    if (message?.fromMe || message?.isGroupMsg) return;

    const text = getMessageText(message);
    const timestamp = message?.timestamp
      ? new Date(Number(message.timestamp) * 1000).toISOString()
      : nowIso();
    const from = normalizeText(message?.from, 120);
    const to = normalizeText(message?.to || state.phoneNumber || state.sessionId, 120);
    const contactName = getContactName(message);

    if (!from || !text) return;

    await whatsappStore.saveMessage(context, state.userId, {
      messageId: getMessageId(message),
      direction: "inbound",
      from,
      to,
      text,
      timestamp,
      status: "received",
      contactName,
      error: null,
    });

    await whatsappStore.upsertContact(context, state.userId, {
      phone: from,
      name: contactName || from,
      lastInteraction: timestamp,
    });

    const automation = await whatsappStore.getAutomation(context, state.userId);
    if (!automation.enabled || !automation.autoReplyEnabled || !automation.aiEnabled || !state.client) return;

    try {
      const reply = await whatsAppAiService.generateReply({
        userId: state.userId,
        from,
        contactName,
        inboundText: text,
      });
      if (!reply) return;

      await state.client.sendText(asChatId(from), reply);
      await whatsappStore.saveMessage(context, state.userId, {
        messageId: randomUUID(),
        direction: "outbound",
        from: state.phoneNumber || state.sessionId,
        to: from,
        text: reply,
        timestamp: nowIso(),
        status: "sent",
        contactName,
        error: null,
      });
    } catch (error) {
      await whatsappStore.saveMessage(context, state.userId, {
        messageId: randomUUID(),
        direction: "outbound",
        from: state.phoneNumber || state.sessionId,
        to: from,
        text: "",
        timestamp: nowIso(),
        status: "failed",
        contactName,
        error: error instanceof Error ? error.message : "Falha ao gerar resposta por IA.",
      });
    }
  }

  private async startSession(context: WhatsAppStoreContext, state: RuntimeSession) {
    try {
      await fs.mkdir(SESSION_DATA_PATH, { recursive: true });

      const openWa = await import("@open-wa/wa-automate");
      this.attachQrListeners(openWa, context, state);

      await this.markState(context, state, "connecting");

      const client = await openWa.create({
        sessionId: state.sessionId,
        sessionDataPath: SESSION_DATA_PATH,
        userDataDir: userDataDirPath(state.sessionId),
        multiDevice: true,
        headless: DEFAULT_HEADLESS,
        useChrome: DEFAULT_USE_CHROME,
        ...(DEFAULT_CHROME_PATH ? { executablePath: DEFAULT_CHROME_PATH } : {}),
        customUserAgent: DEFAULT_CUSTOM_USER_AGENT,
        authTimeout: DEFAULT_AUTH_TIMEOUT,
        qrTimeout: DEFAULT_QR_TIMEOUT,
        qrRefreshS: DEFAULT_QR_REFRESH_SECONDS,
        waitForRipeSessionTimeout: DEFAULT_RIPE_SESSION_TIMEOUT,
        qrLogSkip: true,
        disableSpins: true,
        logConsoleErrors: DEFAULT_LOG_CONSOLE_ERRORS,
        screenshotOnInitializationBrowserError: DEFAULT_SCREENSHOT_ON_ERROR,
        killProcessOnBrowserClose: false,
        restartOnCrash: () => {
          state.connected = false;
          state.status = "reconnecting";
          return this.connect(context, state.userId);
        },
      } as any);

      state.client = client;
      state.phoneNumber = await client.getHostNumber().catch(() => undefined);
      state.qrCode = undefined;
      state.qrData = undefined;
      await this.markState(context, state, "connected");

      await client.onStateChanged((waState) => {
        const nextStatus = mapOpenWaState(waState);
        void this.markState(context, state, nextStatus);
      });

      await client.onLogout(() => {
        state.client = undefined;
        void this.markState(context, state, "disconnected");
      });

      await client.onMessage((message) => {
        void this.handleIncomingMessage(context, state, message);
      }, { concurrency: 1 });
    } catch (error) {
      const originalMessage = error instanceof Error ? error.message : "Falha ao iniciar sessao WhatsApp.";
      const shouldReset = RESET_SESSION_ON_TIMEOUT && isOpenWaBootTimeout(originalMessage);
      if (shouldReset) {
        await this.clearLocalSession(state);
      }

      const message = shouldReset
        ? "WhatsApp Web nao carregou a tempo para gerar o QR Code. Os dados locais da sessao foram limpos; clique em Conectar novamente. Se repetir, configure WHATSAPP_CHROME_PATH no .env."
        : originalMessage;
      state.client = undefined;
      state.connected = false;
      state.status = "error";
      state.error = message;
      await whatsappStore.saveSession(context, state.userId, {
        sessionId: state.sessionId,
        connected: false,
        status: "error",
        error: message,
      });
    }
  }

  async connect(context: WhatsAppStoreContext, userId: string) {
    const state = this.getRuntime(userId);

    if (state.connected || state.connectingPromise) {
      return publicSession(state);
    }

    if (state.status === "error" && isOpenWaBootTimeout(state.error)) {
      await this.clearLocalSession(state);
    }

    state.connectingPromise = this.startSession(context, state).finally(() => {
      state.connectingPromise = undefined;
    });

    void state.connectingPromise;
    return publicSession(state);
  }

  async reconnect(context: WhatsAppStoreContext, userId: string) {
    const state = this.getRuntime(userId);
    if (state.client) {
      await state.client.kill("MotoFix reconnect").catch(() => false);
      state.client = undefined;
    }
    state.connected = false;
    state.status = "reconnecting";
    await this.clearLocalSession(state);
    await whatsappStore.saveSession(context, userId, {
      sessionId: state.sessionId,
      connected: false,
      status: "reconnecting",
      error: null,
    });
    return this.connect(context, userId);
  }

  async disconnect(context: WhatsAppStoreContext, userId: string, preserveSessionData = false) {
    const state = this.getRuntime(userId);
    if (state.client) {
      await state.client.logout(preserveSessionData).catch(() => false);
      await state.client.kill("MotoFix disconnect").catch(() => false);
    }

    state.client = undefined;
    state.connected = false;
    state.status = "disconnected";
    state.qrCode = undefined;
    state.qrData = undefined;
    if (!preserveSessionData) {
      await this.clearLocalSession(state);
    }
    await whatsappStore.saveSession(context, userId, {
      sessionId: state.sessionId,
      connected: false,
      status: "disconnected",
      error: null,
      lastSeen: nowIso(),
    });
    return publicSession(state);
  }

  async getStatus(context: WhatsAppStoreContext, userId: string) {
    const state = this.sessions.get(userId);
    if (state) return publicSession(state);

    const stored = await whatsappStore.getSession(context, userId);
    if (stored) {
      return {
        sessionId: stored.sessionId,
        provider: stored.provider,
        phoneNumber: stored.phoneNumber,
        connected: stored.connected,
        status: stored.status,
        createdAt: stored.createdAt,
        updatedAt: stored.updatedAt,
        lastSeen: stored.lastSeen,
        qrUpdatedAt: stored.qrUpdatedAt,
        error: stored.error,
      } satisfies WhatsAppSessionPublic;
    }

    const newState = this.getRuntime(userId);
    await whatsappStore.saveSession(context, userId, {
      sessionId: newState.sessionId,
      connected: false,
      status: "disconnected",
      error: null,
    });
    return publicSession(newState);
  }

  getQrCode(userId: string): WhatsAppQrPayload {
    const state = this.getRuntime(userId);
    return {
      sessionId: state.sessionId,
      status: state.status,
      qrCode: state.qrCode,
      qrData: state.qrData,
      updatedAt: state.qrUpdatedAt,
    };
  }

  async sendMessage(context: WhatsAppStoreContext, userId: string, input: WhatsAppSendInput) {
    const state = this.getRuntime(userId);
    const text = normalizeText(input.text, 4000);
    const to = normalizePhone(input.to);

    if (!text) {
      throw Object.assign(new Error("Mensagem obrigatoria."), { status: 400 });
    }
    if (!state.client || !state.connected) {
      throw Object.assign(new Error("WhatsApp nao conectado para esta oficina."), { status: 409 });
    }

    const timestamp = nowIso();
    const baseMessage: Omit<WhatsAppMessageRecord, "id" | "userId" | "createdAt" | "updatedAt"> = {
      messageId: randomUUID(),
      direction: "outbound",
      from: state.phoneNumber || state.sessionId,
      to,
      text,
      timestamp,
      status: "queued",
      error: null,
    };

    try {
      const sentId = await state.client.sendText(asChatId(to), text);
      assertOpenWaSendResult(sentId);

      const message = await whatsappStore.saveMessage(context, userId, {
        ...baseMessage,
        messageId: typeof sentId === "string" ? normalizeText(sentId, 240) || baseMessage.messageId : baseMessage.messageId,
        status: "sent",
      });
      await whatsappStore.upsertContact(context, userId, {
        phone: to,
        lastInteraction: timestamp,
      });
      return message;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      const message = await whatsappStore.saveMessage(context, userId, {
        ...baseMessage,
        status: "failed",
        error: errorMessage,
      });
      throw Object.assign(new Error(errorMessage || "Nao foi possivel enviar a mensagem pelo WhatsApp."), {
        status: getErrorStatus(error),
        details: message,
      });
    }
  }
}

export const whatsAppSessionService = new WhatsAppSessionService();
