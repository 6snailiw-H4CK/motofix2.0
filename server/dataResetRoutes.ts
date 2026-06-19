import type { Express, NextFunction, Request, Response } from "express";
import type admin from "firebase-admin";

type FirebaseAdminModule = typeof admin;

type DataResetRequest = Request & {
  dataResetAuth?: {
    uid: string;
    email?: string;
  };
};

type RegisterDataResetRoutesOptions = {
  app: Express;
  admin: FirebaseAdminModule;
  db: admin.firestore.Firestore | null;
  firebaseInitialized: boolean;
};

const RESET_CONFIRMATION = "ZERAR";
const BATCH_SIZE = 400;

const operationalCollections = [
  "maintenances",
  "warranties",
  "appointments",
  "expenses",
  "cash_launches",
  "message_logs",
  "fiscal_invoices",
  "fiscal_logs",
  "fiscal_invoice_files",
  "whatsapp_messages",
  "whatsapp_contacts",
] as const;

const httpError = (status: number, message: string) => Object.assign(new Error(message), { status });

const getErrorStatus = (error: unknown) => {
  const status = typeof error === "object" && error && "status" in error ? Number((error as any).status) : 500;
  return Number.isInteger(status) && status >= 400 && status < 600 ? status : 500;
};

const isActiveDataResetUser = async (
  options: RegisterDataResetRoutesOptions,
  decoded: admin.auth.DecodedIdToken
) => {
  if (!options.db) return false;
  if (decoded.admin === true) return true;

  const userSnapshot = await options.db.collection("users").doc(decoded.uid).get();
  if (!userSnapshot.exists) return false;

  const userData = userSnapshot.data() as { isActive?: boolean } | undefined;
  return userData?.isActive === true;
};

const requireDataResetAuth = (options: RegisterDataResetRoutesOptions) => async (
  req: DataResetRequest,
  res: Response,
  next: NextFunction
) => {
  if (!options.firebaseInitialized || !options.db) {
    return res.status(503).json({ error: "Firebase Admin nao inicializado." });
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
  if (!token) {
    return res.status(401).json({ error: "Token Firebase ausente." });
  }

  try {
    const decoded = await options.admin.auth().verifyIdToken(token);

    if (!(await isActiveDataResetUser(options, decoded))) {
      return res.status(403).json({ error: "Usuario sem permissao ativa para zerar dados." });
    }

    req.dataResetAuth = {
      uid: decoded.uid,
      email: decoded.email,
    };
    return next();
  } catch {
    return res.status(401).json({ error: "Token Firebase invalido." });
  }
};

const deleteCollection = async (
  db: admin.firestore.Firestore,
  userId: string,
  collectionName: string
) => {
  const collectionRef = db.collection("users").doc(userId).collection(collectionName);
  let deletedCount = 0;

  while (true) {
    const snapshot = await collectionRef.limit(BATCH_SIZE).get();
    if (snapshot.empty) break;

    const batch = db.batch();
    snapshot.docs.forEach((documentSnapshot) => {
      batch.delete(documentSnapshot.ref);
    });
    await batch.commit();

    deletedCount += snapshot.size;
    if (snapshot.size < BATCH_SIZE) break;
  }

  return deletedCount;
};

const resetClientOperationalFields = async (
  db: admin.firestore.Firestore,
  userId: string
) => {
  const snapshot = await db.collection("users").doc(userId).collection("clients").get();
  if (snapshot.empty) return 0;

  let batch = db.batch();
  let pendingWrites = 0;
  let resetCount = 0;
  const nowIso = new Date().toISOString();

  for (const clientDocument of snapshot.docs) {
    const data = clientDocument.data() || {};
    const recurrenceDays = Number(data.recurrenceDays);

    batch.update(clientDocument.ref, {
      userId,
      name: typeof data.name === "string" ? data.name : "",
      bikeModel: typeof data.bikeModel === "string" ? data.bikeModel : "",
      contact: typeof data.contact === "string" ? data.contact : "",
      createdAt: typeof data.createdAt === "string" && data.createdAt ? data.createdAt : nowIso,
      recurrenceDays: Number.isFinite(recurrenceDays) && recurrenceDays >= 0 ? recurrenceDays : 30,
      lastMaintenanceDate: "",
      nextMaintenanceDate: "",
      status: "OK",
      notificacao_enviada: false,
      notificacaoStatus: "pendente",
      lastServiceType: "",
      lastServiceValue: 0,
      serviceValue: 0,
      lastServiceNotes: "",
      lastAlertDate: "",
      statusPagamento: "Pago",
      valorPago: 0,
      saldoDevedor: 0,
      automation: {},
    });

    pendingWrites += 1;
    resetCount += 1;

    if (pendingWrites >= BATCH_SIZE) {
      await batch.commit();
      batch = db.batch();
      pendingWrites = 0;
    }
  }

  if (pendingWrites > 0) {
    await batch.commit();
  }

  return resetCount;
};

const sendDataResetError = (res: Response, error: unknown) => {
  const status = getErrorStatus(error);
  const message = error instanceof Error ? error.message : "Erro ao zerar dados.";
  return res.status(status).json({
    error: status >= 500 && process.env.NODE_ENV === "production" ? "Erro ao zerar dados." : message,
  });
};

export const registerDataResetRoutes = (options: RegisterDataResetRoutesOptions) => {
  const auth = requireDataResetAuth(options);

  options.app.post("/api/data-reset/operational", auth, async (req: DataResetRequest, res: Response) => {
    try {
      if (!options.db || !req.dataResetAuth?.uid) {
        throw httpError(503, "Contexto de zeragem indisponivel.");
      }

      if (req.body?.confirmation !== RESET_CONFIRMATION) {
        throw httpError(400, "Confirmacao invalida para zerar os dados.");
      }

      const userId = req.dataResetAuth.uid;
      const deletedByCollection: Record<string, number> = {};
      let deletedTotal = 0;

      for (const collectionName of operationalCollections) {
        const deleted = await deleteCollection(options.db, userId, collectionName);
        deletedByCollection[collectionName] = deleted;
        deletedTotal += deleted;
      }

      const resetClients = await resetClientOperationalFields(options.db, userId);

      res.json({
        deletedByCollection,
        deletedTotal,
        preservedCollections: ["clients", "products", "settings", "fiscal_companies"],
        resetClients,
      });
    } catch (error) {
      sendDataResetError(res, error);
    }
  });
};
