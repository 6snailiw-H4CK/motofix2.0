import "dotenv/config";
import { createServer as createHttpServer } from "node:http";
import express from "express";
import path from "node:path";
import Stripe from "stripe";
import { registerBackupRoutes } from "./server/backupRoutes";
import { registerDataResetRoutes } from "./server/dataResetRoutes";
import { adminAuth, adminDb, firebaseAdminInitialized, firebaseAdminServiceAccountPath } from "./server/firebaseAdmin";
import { registerFiscalRoutes } from "./server/fiscal/fiscalRoutes";
import { registerWhatsAppRoutes } from "./server/whatsapp/whatsappRoutes";
import { startWhatsAppScheduler } from "./server/whatsappRemindersService";
import { startAutomaticBackupScheduler } from "./server/automaticBackup";
import { registerStripeBillingRoutes } from "./server/stripeBilling";
import { apiNotFound, bodyParser, cors, errorHandler, rateLimit, requestId, securityHeaders, scopedRateLimit } from "./server/httpSecurity";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", { apiVersion: "2024-04-10" });
const db = adminDb;
const firebaseInitialized = firebaseAdminInitialized;
if (!firebaseInitialized) {
  console.warn("Firebase initialization failed. Webhook functionality may be limited.");
  console.warn(`Ensure FIREBASE_SERVICE_ACCOUNT_PATH is set and points to a valid JSON file: ${firebaseAdminServiceAccountPath}`);
}
const intEnv = (name: string, fallback: number) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : fallback;
};

async function startServer() {
  const app = express();
  const httpServer = createHttpServer(app);
  const port = Number(process.env.PORT || 3001);
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(requestId);
  app.use(securityHeaders);
  app.use(cors);
  app.use("/api", scopedRateLimit({ name: "api-global", windowMs: 60_000, maxRequests: intEnv("API_RATE_LIMIT_GLOBAL_PER_MINUTE", 300) }));
  app.use("/api", rateLimit({ windowMs: 60_000, maxRequests: intEnv("API_RATE_LIMIT_ROUTE_PER_MINUTE", 120) }));
  app.use("/api/whatsapp/connect", scopedRateLimit({ name: "whatsapp-connect", windowMs: 10 * 60_000, maxRequests: intEnv("WHATSAPP_CONNECT_RATE_LIMIT_PER_10_MINUTES", 5) }));
  app.use("/api/whatsapp/reconnect", scopedRateLimit({ name: "whatsapp-reconnect", windowMs: 10 * 60_000, maxRequests: intEnv("WHATSAPP_CONNECT_RATE_LIMIT_PER_10_MINUTES", 5) }));
  app.use("/api/whatsapp/reconnectentado", scopedRateLimit({ name: "whatsapp-reconnect-legacy", windowMs: 10 * 60_000, maxRequests: intEnv("WHATSAPP_CONNECT_RATE_LIMIT_PER_10_MINUTES", 5) }));
  app.use("/api/whatsapp/send", scopedRateLimit({ name: "whatsapp-send", windowMs: 60_000, maxRequests: intEnv("WHATSAPP_SEND_RATE_LIMIT_PER_MINUTE", 30) }));
  app.use("/api/whatsapp/reminders/send-due", scopedRateLimit({ name: "whatsapp-reminders-send-due", windowMs: 60_000, maxRequests: intEnv("WHATSAPP_REMINDERS_RATE_LIMIT_PER_MINUTE", 5) }));
  app.use("/api/fiscal/companies", scopedRateLimit({ name: "fiscal-company-write", windowMs: 10 * 60_000, maxRequests: intEnv("FISCAL_COMPANY_WRITE_RATE_LIMIT_PER_10_MINUTES", 20), skip: (req) => req.method === "GET" }));
  app.use("/api/fiscal/companies/:companyId/certificate", scopedRateLimit({ name: "fiscal-certificate", windowMs: 15 * 60_000, maxRequests: intEnv("FISCAL_CERTIFICATE_RATE_LIMIT_PER_15_MINUTES", 3) }));
  app.use("/api/fiscal/nfse", scopedRateLimit({ name: "fiscal-nfse", windowMs: 5 * 60_000, maxRequests: intEnv("FISCAL_NFSE_RATE_LIMIT_PER_5_MINUTES", 12) }));
  app.use("/api/stripe/create-checkout-session", scopedRateLimit({ name: "stripe-checkout", windowMs: 15 * 60_000, maxRequests: intEnv("PAYMENTS_CHECKOUT_RATE_LIMIT_PER_15_MINUTES", 10) }));
  app.use("/api/data-reset/operational", scopedRateLimit({ name: "data-reset-operational", windowMs: 60 * 60_000, maxRequests: intEnv("DATA_RESET_RATE_LIMIT_PER_HOUR", 3) }));
  app.use("/api/backup/full", scopedRateLimit({ name: "backup-full", windowMs: 60 * 60_000, maxRequests: intEnv("BACKUP_FULL_RATE_LIMIT_PER_HOUR", 12) }));
  // Register Stripe before JSON parsing so signature verification receives exact bytes.
  registerStripeBillingRoutes(app, { stripe, db, auth: adminAuth, firebaseInitialized });
  app.use(bodyParser);
  app.use(express.urlencoded({ extended: false, limit: "64kb", parameterLimit: 100 }));
  app.get("/api/health", (_req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));
  registerFiscalRoutes({ app, auth: adminAuth, db, firebaseInitialized });
  registerWhatsAppRoutes({ app, auth: adminAuth, db, firebaseInitialized });
  registerBackupRoutes({ app, auth: adminAuth, db, firebaseInitialized });
  registerDataResetRoutes({ app, auth: adminAuth, db, firebaseInitialized });
  startAutomaticBackupScheduler({ db, auth: adminAuth, firebaseInitialized, enabled: process.env.AUTOMATIC_BACKUP_ENABLED !== "false" });
  startWhatsAppScheduler({ db, enabled: process.env.WHATSAPP_SCHEDULER_ENABLED !== "false" });
  app.use("/api", apiNotFound);
  app.use(errorHandler);
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({ server: { middlewareMode: { server: httpServer }, hmr: { server: httpServer } }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => res.sendFile(path.join(distPath, "index.html")));
  }
  httpServer.listen(port, "0.0.0.0", () => console.log(`Server listening on port ${port}`));
}

process.on("uncaughtException", (error) => console.error("Uncaught Exception:", error));
process.on("unhandledRejection", (reason) => console.error("Unhandled Rejection:", reason));
startServer();
