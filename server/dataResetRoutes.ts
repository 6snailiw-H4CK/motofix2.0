import type { Express, NextFunction, Request, Response } from "express";
import type { Auth, DecodedIdToken } from "firebase-admin/auth";
import { FieldPath, type Firestore, type QueryDocumentSnapshot } from "firebase-admin/firestore";

type DataResetRequest = Request & {
  dataResetAuth?: {
    uid: string;
    email?: string;
  };
};

type RegisterDataResetRoutesOptions = {
  app: Express;
  auth: Auth | null;
  db: Firestore | null;
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

const isAdminDataResetUser = async (
  options: RegisterDataResetRoutesOptions,
  decoded: DecodedIdToken
) => {
  return decoded.admin === true;
};

const requireDataResetAuth = (options: RegisterDataResetRoutesOptions) => async (
  req: DataResetRequest,
  res: Response,
  next: NextFunction
) => {
  if (!options.firebaseInitialized || !options.auth || !options.db) {
    return res.status(503).json({ error: "Firebase Admin nao inicializado." });
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
  if (!token) {
    return res.status(401).json({ error: "Token Firebase ausente." });
  }

  try {
    const decoded = await options.auth.verifyIdToken(token);

    if (!(await isAdminDataResetUser(options, decoded))) {
      return res.status(403).json({ error: "Apenas administradores podem zerar dados operacionais." });
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

const buildResetArchiveMetadata = (
  resetId: string,
  resetAt: string,
  deletedBy: string
) => ({
  deletedAt: resetAt,
  deletedBy,
  deletedReason: "Arquivado por zeragem operacional",
  resetAt,
  resetId,
});

const archiveCollection = async (
  db: Firestore,
  userId: string,
  collectionName: string,
  metadata: ReturnType<typeof buildResetArchiveMetadata>
) => {
  const collectionRef = db.collection("users").doc(userId).collection(collectionName);
  let archivedCount = 0;
  let lastDocument: QueryDocumentSnapshot | null = null;

  while (true) {
    let query = collectionRef.orderBy(FieldPath.documentId()).limit(BATCH_SIZE);
    if (lastDocument) {
      query = query.startAfter(lastDocument);
    }

    const snapshot = await query.get();
    if (snapshot.empty) break;

    const batch = db.batch();
    let pendingWrites = 0;
    snapshot.docs.forEach((documentSnapshot) => {
      if (documentSnapshot.data()?.deletedAt) return;
      batch.update(documentSnapshot.ref, metadata);
      pendingWrites += 1;
    });
    if (pendingWrites > 0) {
      await batch.commit();
    }

    archivedCount += pendingWrites;
    lastDocument = snapshot.docs[snapshot.docs.length - 1];
    if (snapshot.size < BATCH_SIZE) break;
  }

  return archivedCount;
};

const resetClientOperationalFields = async (
  db: Firestore,
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

      if (req.body?.backupConfirmed !== true) {
        throw httpError(400, "Gere e confirme o backup operacional antes de zerar os dados.");
      }

      const userId = req.dataResetAuth.uid;
      const resetAt = new Date().toISOString();
      const resetId = `reset-${resetAt.replace(/[^0-9]/g, "")}-${userId.slice(0, 8)}`;
      const archiveMetadata = buildResetArchiveMetadata(
        resetId,
        resetAt,
        req.dataResetAuth.email || userId
      );
      const archivedByCollection: Record<string, number> = {};
      let archivedTotal = 0;

      for (const collectionName of operationalCollections) {
        const archived = await archiveCollection(options.db, userId, collectionName, archiveMetadata);
        archivedByCollection[collectionName] = archived;
        archivedTotal += archived;
      }

      const resetClients = await resetClientOperationalFields(options.db, userId);

      res.json({
        archivedByCollection,
        archivedTotal,
        preservedCollections: ["clients", "products", "settings", "fiscal_companies"],
        resetAt,
        resetClients,
        resetId,
      });
    } catch (error) {
      sendDataResetError(res, error);
    }
  });
};
