import type { Express, NextFunction, Request, Response } from "express";
import type { Auth, DecodedIdToken } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import { whatsappStore } from "./whatsappStore";
import { whatsAppSessionService } from "./WhatsAppSessionService";
import type { AuthenticatedWhatsAppRequest, WhatsAppStoreContext } from "./types";

type WhatsAppRequest = Request & {
  whatsappAuth?: AuthenticatedWhatsAppRequest;
};

type RegisterWhatsAppRoutesOptions = {
  app: Express;
  auth: Auth | null;
  db: Firestore | null;
  firebaseInitialized: boolean;
};

const isProduction = process.env.NODE_ENV === "production";
const MAX_MESSAGE_LENGTH = Number(process.env.WHATSAPP_MAX_MESSAGE_LENGTH || 4000);

const httpError = (status: number, message: string) => Object.assign(new Error(message), { status });

const getErrorStatus = (error: unknown) => {
  const status = typeof error === "object" && error && "status" in error ? Number((error as any).status) : 500;
  return Number.isInteger(status) && status >= 400 && status < 600 ? status : 500;
};

const sanitizeDetails = (value: unknown, depth = 0): unknown => {
  if (depth > 4) return "[truncated]";
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => sanitizeDetails(item, depth + 1));

  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => {
    if (/token|secret|senha|password|authorization|cookie|session|qrcode|qr/i.test(key)) {
      return [key, "[redacted]"];
    }
    return [key, sanitizeDetails(item, depth + 1)];
  }));
};

const sendWhatsAppError = (res: Response, error: unknown) => {
  const status = getErrorStatus(error);
  const message = error instanceof Error ? error.message : "Erro inesperado no modulo WhatsApp.";
  const payload: { error: string; details?: unknown } = {
    error: status >= 500 && isProduction ? "Erro inesperado no modulo WhatsApp." : message,
  };

  if (!isProduction && typeof error === "object" && error && "details" in error) {
    payload.details = sanitizeDetails((error as any).details);
  }

  return res.status(status).json(payload);
};

const normalizeLimit = (value: unknown) => {
  const parsed = Number(value || 50);
  if (!Number.isFinite(parsed)) return 50;
  return Math.min(Math.max(Math.trunc(parsed), 1), 200);
};

const normalizeText = (value: unknown, label: string, maxLength = MAX_MESSAGE_LENGTH) => {
  const text = String(value || "").trim();
  if (!text) throw httpError(400, `${label} e obrigatorio.`);
  if (text.length > maxLength) throw httpError(413, `${label} excede o limite permitido.`);
  return text;
};

type ReminderClient = {
  id: string;
  userId?: string;
  name?: string;
  bikeModel?: string;
  contact?: string;
  phone?: string;
  whatsapp?: string;
  status?: string;
  nextMaintenanceDate?: string;
  lastAlertDate?: string;
  notificacaoStatus?: string;
  deletedAt?: string | null;
  automation?: {
    lastAlertDate?: string;
    lastSendAt?: string;
    lastSendStatus?: "pending" | "opened_whatsapp" | "sent" | "failed";
    lastSendChannel?: "whatsapp" | "email" | "manual";
    sendAttempts?: number;
    nextSendEligibleAt?: string;
    lastError?: string | null;
  };
};

type ReminderFailure = {
  clientId: string;
  clientName: string;
  error: string;
};

const DEFAULT_WHATSAPP_TEMPLATE = "Ola {client}, sua {bike} esta agendada para manutencao em {date}. Nos vemos la!";

const stripUndefined = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .map(([key, entryValue]) => [key, stripUndefined(entryValue)])
  );
};

const dateOnly = (date = new Date()) => date.toISOString().slice(0, 10);

const parseReminderDate = (value?: string | null) => {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const parsed = new Date(raw.length <= 10 ? `${raw}T00:00:00.000Z` : raw);
  if (!Number.isFinite(parsed.getTime())) return null;

  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
};

const isSameReminderDay = (value: string | undefined, day: string) => {
  const parsed = parseReminderDate(value);
  return parsed ? dateOnly(parsed) === day : false;
};

const formatReminderDate = (value?: string) => {
  const parsed = parseReminderDate(value);
  if (!parsed) return "em breve";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(parsed);
};

const buildReminderMessage = (template: string, client: ReminderClient) => (
  template
    .replace(/{client}/g, client.name || "cliente")
    .replace(/{bike}/g, client.bikeModel || "moto")
    .replace(/{date}/g, formatReminderDate(client.nextMaintenanceDate))
);

const getReminderPhone = (client: ReminderClient) => (
  client.contact || client.phone || client.whatsapp || ""
);

const getLastReminderDate = (client: ReminderClient) => (
  client.automation?.lastAlertDate || client.lastAlertDate
);

const isReminderEligible = (client: ReminderClient, today: string) => {
  if (client.deletedAt) return false;
  if (client.notificacaoStatus === "concluido" && isSameReminderDay(getLastReminderDate(client), today)) return false;
  if (client.status !== "WARNING" && client.status !== "OVERDUE") return false;
  if (isSameReminderDay(getLastReminderDate(client), today)) return false;

  const nextEligibleAt = parseReminderDate(client.automation?.nextSendEligibleAt);
  if (nextEligibleAt && dateOnly(nextEligibleAt) > today) return false;

  return true;
};

const loadReminderTemplate = async (context: WhatsAppStoreContext, userId: string) => {
  const snapshot = await context.db.collection("users").doc(userId).collection("settings").doc("config").get();
  const template = snapshot.data()?.whatsappTemplate;
  return typeof template === "string" && template.trim() ? template.trim() : DEFAULT_WHATSAPP_TEMPLATE;
};

const loadReminderClients = async (context: WhatsAppStoreContext, userId: string) => {
  const snapshot = await context.db.collection("users").doc(userId).collection("clients").get();
  return snapshot.docs.map((clientDoc) => ({
    id: clientDoc.id,
    ...clientDoc.data(),
  } as ReminderClient));
};

const saveReminderLog = async (
  context: WhatsAppStoreContext,
  userId: string,
  client: ReminderClient,
  message: string,
  status: "sent" | "failed",
  error?: string
) => {
  const now = new Date().toISOString();
  const payload = stripUndefined({
    clientId: client.id,
    clientName: client.name || "Cliente sem nome",
    bikeModel: client.bikeModel,
    phone: getReminderPhone(client),
    channel: "whatsapp",
    status,
    trigger: "scheduled",
    message,
    createdAt: now,
    sentAt: status === "sent" ? now : undefined,
    error: error || null,
    userId,
  }) as Record<string, unknown>;

  await context.db.collection("users").doc(userId).collection("message_logs").doc().set(payload);
};

const updateReminderSuccess = async (
  context: WhatsAppStoreContext,
  userId: string,
  client: ReminderClient,
  sentAt: string
) => {
  const sentDate = dateOnly(new Date(sentAt));
  const sendAttempts = Number(client.automation?.sendAttempts || 0) + 1;
  const payload = stripUndefined({
    lastAlertDate: sentDate,
    notificacao_enviada: true,
    notificacaoStatus: "concluido",
    automation: {
      ...client.automation,
      lastAlertDate: sentDate,
      lastSendAt: sentAt,
      lastSendStatus: "sent",
      lastSendChannel: "whatsapp",
      sendAttempts,
      lastError: null,
    },
  }) as Record<string, unknown>;

  await context.db.collection("users").doc(userId).collection("clients").doc(client.id).update(payload);
};

const updateReminderFailure = async (
  context: WhatsAppStoreContext,
  userId: string,
  client: ReminderClient,
  failedAt: string,
  error: string
) => {
  const sendAttempts = Number(client.automation?.sendAttempts || 0) + 1;
  const payload = stripUndefined({
    notificacao_enviada: false,
    notificacaoStatus: "pendente",
    automation: {
      ...client.automation,
      lastSendAt: failedAt,
      lastSendStatus: "failed",
      lastSendChannel: "whatsapp",
      sendAttempts,
      lastError: error,
    },
  }) as Record<string, unknown>;

  await context.db.collection("users").doc(userId).collection("clients").doc(client.id).update(payload);
};

const sendDueReminders = async (
  context: WhatsAppStoreContext & { userId: string },
  limit: number
) => {
  const automation = await whatsappStore.getAutomation(context, context.userId);
  if (!automation.enabled || !automation.appointmentEnabled) {
    throw httpError(409, "Automacao de agenda e retornos precisa estar ativa para enviar lembretes.");
  }

  const runAt = new Date().toISOString();
  const today = dateOnly(new Date(runAt));
  const template = await loadReminderTemplate(context, context.userId);
  const clients = await loadReminderClients(context, context.userId);
  const eligibleClients = clients
    .filter((client) => isReminderEligible(client, today))
    .sort((a, b) => String(a.nextMaintenanceDate || "").localeCompare(String(b.nextMaintenanceDate || "")));
  const limitedClients = eligibleClients.slice(0, limit);
  const failures: ReminderFailure[] = [];
  let sent = 0;

  for (const client of limitedClients) {
    const clientName = client.name || "Cliente sem nome";
    const phone = getReminderPhone(client);
    const message = buildReminderMessage(template, client);

    if (!phone.trim()) {
      const error = "Telefone nao informado.";
      failures.push({ clientId: client.id, clientName, error });
      await saveReminderLog(context, context.userId, client, message, "failed", error);
      await updateReminderFailure(context, context.userId, client, runAt, error);
      continue;
    }

    try {
      await whatsAppSessionService.sendMessage(context, context.userId, { to: phone, text: message });
      await saveReminderLog(context, context.userId, client, message, "sent");
      await updateReminderSuccess(context, context.userId, client, runAt);
      sent += 1;
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "Falha ao enviar lembrete.";
      failures.push({ clientId: client.id, clientName, error: messageText });
      await saveReminderLog(context, context.userId, client, message, "failed", messageText);
      await updateReminderFailure(context, context.userId, client, runAt, messageText);
    }
  }

  const failed = failures.length;

  return {
    checked: clients.length,
    eligible: eligibleClients.length,
    sent,
    failed,
    skipped: Math.max(0, clients.length - sent - failed),
    failures,
    runAt,
  };
};

const isActiveWhatsAppUser = async (
  options: RegisterWhatsAppRoutesOptions,
  decoded: DecodedIdToken
) => {
  if (!options.db) return false;
  if (decoded.admin === true) return true;

  const userSnapshot = await options.db.collection("users").doc(decoded.uid).get();
  if (!userSnapshot.exists) return false;

  const userData = userSnapshot.data() as { isActive?: boolean } | undefined;
  return userData?.isActive === true;
};

const requireWhatsAppAuth = (options: RegisterWhatsAppRoutesOptions) => async (req: WhatsAppRequest, res: Response, next: NextFunction) => {
  if (!options.firebaseInitialized || !options.auth || !options.db) {
    return res.status(503).json({ error: "Firebase Admin nao inicializado. Configure FIREBASE_SERVICE_ACCOUNT_PATH." });
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";

  if (!token) {
    return res.status(401).json({ error: "Token Firebase ausente." });
  }

  try {
    const decoded = await options.auth.verifyIdToken(token);

    if (!(await isActiveWhatsAppUser(options, decoded))) {
      return res.status(403).json({ error: "Usuario sem permissao ativa para acessar o modulo WhatsApp." });
    }

    req.whatsappAuth = {
      uid: decoded.uid,
      email: decoded.email,
    };
    return next();
  } catch {
    return res.status(401).json({ error: "Token Firebase invalido." });
  }
};

const getWhatsAppContext = (req: WhatsAppRequest, options: RegisterWhatsAppRoutesOptions): WhatsAppStoreContext & { userId: string } => {
  if (!options.db || !req.whatsappAuth?.uid) {
    throw httpError(503, "Contexto WhatsApp indisponivel.");
  }
  return {
    db: options.db,
    userId: req.whatsappAuth.uid,
  };
};

export const registerWhatsAppRoutes = (options: RegisterWhatsAppRoutesOptions) => {
  const auth = requireWhatsAppAuth(options);

  options.app.get("/api/whatsapp/health", (_req, res) => {
    res.json({
      status: "ok",
      provider: "manual",
      aiConfigured: Boolean(process.env.WHATSAPP_AI_API_KEY || process.env.OPENAI_API_KEY),
      timestamp: new Date().toISOString(),
    });
  });

  options.app.post("/api/whatsapp/connect", auth, async (req: WhatsAppRequest, res: Response) => {
    try {
      const context = getWhatsAppContext(req, options);
      const session = await whatsAppSessionService.connect(context, context.userId);
      return res.json({ session });
    } catch (error) {
      return sendWhatsAppError(res, error);
    }
  });

  options.app.get("/api/whatsapp/status", auth, async (req: WhatsAppRequest, res: Response) => {
    try {
      const context = getWhatsAppContext(req, options);
      const session = await whatsAppSessionService.getStatus(context, context.userId);
      const automation = await whatsappStore.getAutomation(context, context.userId);
      return res.json({ session, automation });
    } catch (error) {
      return sendWhatsAppError(res, error);
    }
  });

  options.app.get("/api/whatsapp/qrcode", auth, async (req: WhatsAppRequest, res: Response) => {
    try {
      const context = getWhatsAppContext(req, options);
      const qrCode = whatsAppSessionService.getQrCode(context.userId);
      return res.json({ qrCode });
    } catch (error) {
      return sendWhatsAppError(res, error);
    }
  });

  options.app.post("/api/whatsapp/disconnect", auth, async (req: WhatsAppRequest, res: Response) => {
    try {
      const context = getWhatsAppContext(req, options);
      const preserveSessionData = req.body?.preserveSessionData === true;
      const session = await whatsAppSessionService.disconnect(context, context.userId, preserveSessionData);
      return res.json({ session });
    } catch (error) {
      return sendWhatsAppError(res, error);
    }
  });

  options.app.post("/api/whatsapp/reconnect", auth, async (req: WhatsAppRequest, res: Response) => {
    try {
      const context = getWhatsAppContext(req, options);
      const session = await whatsAppSessionService.reconnect(context, context.userId);
      return res.json({ session });
    } catch (error) {
      return sendWhatsAppError(res, error);
    }
  });

  options.app.post("/api/whatsapp/reconnectentado", auth, async (req: WhatsAppRequest, res: Response) => {
    try {
      const context = getWhatsAppContext(req, options);
      const session = await whatsAppSessionService.reconnect(context, context.userId);
      return res.json({ session });
    } catch (error) {
      return sendWhatsAppError(res, error);
    }
  });

  options.app.post("/api/whatsapp/send", auth, async (req: WhatsAppRequest, res: Response) => {
    try {
      const context = getWhatsAppContext(req, options);
      const to = normalizeText(req.body?.to, "Destinatario", 80);
      const text = normalizeText(req.body?.text, "Mensagem");
      const message = await whatsAppSessionService.sendMessage(context, context.userId, { to, text });
      return res.json({ message });
    } catch (error) {
      return sendWhatsAppError(res, error);
    }
  });

  options.app.post("/api/whatsapp/reminders/send-due", auth, async (req: WhatsAppRequest, res: Response) => {
    try {
      const context = getWhatsAppContext(req, options);
      const result = await sendDueReminders(context, normalizeLimit(req.body?.limit));
      return res.json({ result });
    } catch (error) {
      return sendWhatsAppError(res, error);
    }
  });

  options.app.get("/api/whatsapp/messages", auth, async (req: WhatsAppRequest, res: Response) => {
    try {
      const context = getWhatsAppContext(req, options);
      const messages = await whatsappStore.listMessages(context, context.userId, normalizeLimit(req.query.limit));
      return res.json({ messages });
    } catch (error) {
      return sendWhatsAppError(res, error);
    }
  });

  options.app.get("/api/whatsapp/contacts", auth, async (req: WhatsAppRequest, res: Response) => {
    try {
      const context = getWhatsAppContext(req, options);
      const contacts = await whatsappStore.listContacts(context, context.userId, normalizeLimit(req.query.limit));
      return res.json({ contacts });
    } catch (error) {
      return sendWhatsAppError(res, error);
    }
  });

  options.app.get("/api/whatsapp/automations", auth, async (req: WhatsAppRequest, res: Response) => {
    try {
      const context = getWhatsAppContext(req, options);
      const automation = await whatsappStore.getAutomation(context, context.userId);
      return res.json({ automation });
    } catch (error) {
      return sendWhatsAppError(res, error);
    }
  });

  options.app.put("/api/whatsapp/automations", auth, async (req: WhatsAppRequest, res: Response) => {
    try {
      const context = getWhatsAppContext(req, options);
      const patch = {
        enabled: req.body?.enabled === true,
        aiEnabled: req.body?.aiEnabled === true,
        autoReplyEnabled: req.body?.autoReplyEnabled === true,
        appointmentEnabled: req.body?.appointmentEnabled === true,
      };
      const automation = await whatsappStore.updateAutomation(context, context.userId, patch);
      return res.json({ automation });
    } catch (error) {
      return sendWhatsAppError(res, error);
    }
  });
};
