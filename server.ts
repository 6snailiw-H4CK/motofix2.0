import "dotenv/config";
import fs from "node:fs";
import express, { Request, Response } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Stripe from "stripe";
import admin from "firebase-admin";
import { registerFiscalRoutes } from "./server/fiscal/fiscalRoutes";
import {
  apiNotFound,
  bodyParser,
  cors,
  errorHandler,
  rateLimit,
  requestId,
  securityHeaders,
} from "./server/httpSecurity";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Inicializar Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-04-10",
});

// Inicializar Firebase Admin
let db: any = null;
let firebaseInitialized = false;

const serviceAccountFile = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || "./firebase-service-account.json";
const serviceAccountFilePath = path.resolve(process.cwd(), serviceAccountFile);
try {
  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountFilePath, "utf8"));
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  db = admin.firestore();
  firebaseInitialized = true;
} catch (error) {
  console.warn("⚠️ Firebase initialization failed. Webhook functionality may be limited.");
  console.warn(`Ensure FIREBASE_SERVICE_ACCOUNT_PATH is set and points to a valid JSON file: ${serviceAccountFilePath}`);
}

const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID || "price_monthly_49_90"; // Preço mensal R$ 49,90
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(requestId);
  app.use(securityHeaders);
  app.use(cors);
  app.use("/api", rateLimit({ windowMs: 60_000, maxRequests: 180 }));
  app.use(bodyParser);
  app.use(express.urlencoded({ extended: false, limit: "64kb", parameterLimit: 100 }));

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  registerFiscalRoutes({
    app,
    admin,
    db,
    firebaseInitialized,
  });

  /**
   * GET /api/payments/publishable-key
   * Retorna a chave pública do Stripe
   */
  app.get("/api/payments/publishable-key", (req: Request, res: Response) => {
    try {
      const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;
      if (!publishableKey) {
        return res.status(500).json({ error: "Chave pública Stripe não configurada" });
      }
      res.json({ publishableKey });
    } catch (error) {
      console.error("Erro ao retornar publishable key:", error);
      res.status(500).json({ error: "Erro ao obter chave Stripe" });
    }
  });

  /**
   * POST /api/payments/create-checkout
   * Cria uma sessão de checkout no Stripe
   */
  app.post("/api/payments/create-checkout", async (req: Request, res: Response) => {
    try {
      const { userId, userEmail, priceId } = req.body;

      if (!userId || !userEmail) {
        return res.status(400).json({ error: "userId e userEmail são obrigatórios" });
      }

      // Criar ou recuperar customer do Stripe
      const customers = await stripe.customers.list({ email: userEmail });
      let customerId: string;

      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
      } else {
        const customer = await stripe.customers.create({
          email: userEmail,
          metadata: {
            firebaseUid: userId,
          },
        });
        customerId = customer.id;
      }

      // Criar Payment Intent com confirmação automática
      const intent = await stripe.paymentIntents.create({
        amount: 4990, // R$ 49,90 em centavos
        currency: "brl",
        customer: customerId,
        payment_method_types: ["card", "boleto"],
        metadata: {
          firebaseUid: userId,
          userEmail,
          serviceType: "subscription_monthly",
        },
        receipt_email: userEmail,
      });

      res.json({
        clientSecret: intent.client_secret,
        sessionId: intent.id,
      });
    } catch (error) {
      console.error("Erro ao criar checkout:", error);
      res.status(500).json({ error: "Erro ao criar sessão de checkout" });
    }
  });

  /**
   * GET /api/payments/session/:sessionId
   * Verifica o status de um pagamento
   */
  app.get("/api/payments/session/:sessionId", async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;

      const intent = await stripe.paymentIntents.retrieve(sessionId);

      res.json({
        status: intent.status,
        paid: intent.status === "succeeded",
        amount: intent.amount,
        currency: intent.currency,
        clientEmail: intent.receipt_email,
      });
    } catch (error) {
      console.error("Erro ao verificar sessão:", error);
      res.status(500).json({ error: "Erro ao verificar status do pagamento" });
    }
  });

  /**
   * POST /api/payments/webhook
   * Webhook do Stripe para processar eventos
   */
  app.post("/api/payments/webhook", express.raw({ type: "application/json" }), async (req: Request, res: Response) => {
    try {
      const signature = req.headers["stripe-signature"] as string;
      const body = req.body;

      // Verificar assinatura do webhook
      let event;
      try {
        event = stripe.webhooks.constructEvent(body, signature, WEBHOOK_SECRET);
      } catch (error: any) {
        console.error("❌ Webhook signature verification failed:", error.message);
        return res.status(400).send(`Webhook Error: ${error.message}`);
      }

      console.log(`📨 Webhook recebido:`, event.type);

      // Processar eventos relevant
      switch (event.type) {
        case "payment_intent.succeeded": {
          const intent = event.data.object as Stripe.PaymentIntent;
          const firebaseUid = intent.metadata?.firebaseUid;

          if (firebaseUid) {
            // Atualizar Firestore com status de assinatura ativa
            const now = new Date();
            const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 dias

            console.log(`✅ Ativando assinatura para usuário:`, firebaseUid);

            await db.collection("users").doc(firebaseUid).update({
              "subscription.status": "active",
              "subscription.plan": "monthly",
              "subscription.stripeCustomerId": intent.customer,
              "subscription.stripeSubscriptionId": intent.id,
              "subscription.startsAt": now.toISOString(),
              "subscription.expiresAt": expiresAt.toISOString(),
              "subscription.currentPeriodEnd": expiresAt.toISOString(),
              "subscription.autoRenew": true,
              updatedAt: now.toISOString(),
            });

            console.log("Assinatura ativada com sucesso para usuário:", firebaseUid);
          }
          break;
        }

        case "payment_intent.payment_failed": {
          const intent = event.data.object as Stripe.PaymentIntent;
          const firebaseUid = intent.metadata?.firebaseUid;

          if (firebaseUid) {
            console.log(`❌ Pagamento falhou para usuário:`, firebaseUid);
            // Aqui você poderia logout do usuário ou mostrar mensagem
          }
          break;
        }

        case "customer.subscription.updated": {
          const subscription = event.data.object as any;
          const firebaseUid = subscription.metadata?.firebaseUid;

          if (firebaseUid && subscription.status === "active") {
            await db.collection("users").doc(firebaseUid).update({
              "subscription.status": subscription.status,
              "subscription.currentPeriodEnd": new Date(subscription.current_period_end * 1000).toISOString(),
            });
          }
          break;
        }

        case "customer.subscription.deleted": {
          const subscription = event.data.object as Stripe.Subscription;
          const firebaseUid = subscription.metadata?.firebaseUid;

          if (firebaseUid) {
            console.log(`🚫 Assinatura cancelada para usuário:`, firebaseUid);
            await db.collection("users").doc(firebaseUid).update({
              "subscription.status": "canceled",
              "subscription.canceledAt": new Date().toISOString(),
            });
          }
          break;
        }
      }

      res.json({ received: true });
    } catch (error) {
      console.error("Webhook processing error:", error);
      res.status(500).json({ error: "Webhook processing failed" });
    }
  });

  app.use("/api", apiNotFound);
  app.use(errorHandler);

  // Configuração do Vite para desenvolvimento ou produção
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
    console.log(`📝 Versão do Stripe: ${stripe.VERSION}`);
    console.log(`🔐 Firebase Admin inicializado`);
  });
}

process.on("uncaughtException", (err) => {
  console.error("💥 Uncaught Exception:", err);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("💥 Unhandled Rejection at:", promise, "reason:", reason);
});

startServer();
