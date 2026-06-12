import type { Express, NextFunction, Request, Response } from "express";
import type admin from "firebase-admin";
import { whatsappStore } from "./whatsappStore";
import { whatsAppSessionService } from "./WhatsAppSessionService";
import type { AuthenticatedWhatsAppRequest, WhatsAppStoreContext } from "./types";

type FirebaseAdminModule = typeof admin;

type WhatsAppRequest = Request & {
  whatsappAuth?: AuthenticatedWhatsAppRequest;
};

type RegisterWhatsAppRoutesOptions = {
  app: Express;
  admin: FirebaseAdminModule;
  db: admin.firestore.Firestore | null;
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

const isActiveWhatsAppUser = async (
  options: RegisterWhatsAppRoutesOptions,
  decoded: admin.auth.DecodedIdToken
) => {
  if (!options.db) return false;
  if (decoded.admin === true) return true;

  const userSnapshot = await options.db.collection("users").doc(decoded.uid).get();
  if (!userSnapshot.exists) return false;

  const userData = userSnapshot.data() as { isActive?: boolean } | undefined;
  return userData?.isActive === true;
};

const requireWhatsAppAuth = (options: RegisterWhatsAppRoutesOptions) => async (req: WhatsAppRequest, res: Response, next: NextFunction) => {
  if (!options.firebaseInitialized || !options.db) {
    return res.status(503).json({ error: "Firebase Admin nao inicializado. Configure FIREBASE_SERVICE_ACCOUNT_PATH." });
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";

  if (!token) {
    return res.status(401).json({ error: "Token Firebase ausente." });
  }

  try {
    const decoded = await options.admin.auth().verifyIdToken(token);

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
      provider: "open-wa",
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
