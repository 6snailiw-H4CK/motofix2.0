import type { Express, NextFunction, Request, Response } from "express";
import type { Auth } from "firebase-admin/auth";
import type { Firestore, WriteBatch } from "firebase-admin/firestore";

type BackupRequest = Request & {
  backupAuth?: {
    uid: string;
    email?: string;
  };
};

type RegisterBackupRoutesOptions = {
  app: Express;
  auth: Auth | null;
  db: Firestore | null;
  firebaseInitialized: boolean;
};

type BackupCollectionName = typeof backupCollections[number];

const FULL_BACKUP_FORMAT = "motofix-full-backup";
const LEGACY_OPERATIONAL_BACKUP_FORMAT = "motofix-operational-backup";
const RESTORE_CONFIRMATION = "RESTAURAR";
const BATCH_SIZE = 400;

const backupCollections = [
  "clients",
  "maintenances",
  "warranties",
  "appointments",
  "expenses",
  "products",
  "stock_movements",
  "cash_launches",
  "settings",
  "message_logs",
  "operational_logs",
  "fiscal_companies",
  "fiscal_invoices",
  "fiscal_logs",
  "fiscal_invoice_files",
  "whatsapp_sessions",
  "whatsapp_messages",
  "whatsapp_contacts",
  "whatsapp_automations",
] as const;

const collectionAliases: Record<string, BackupCollectionName> = {
  appointments: "appointments",
  cashLaunches: "cash_launches",
  cash_launches: "cash_launches",
  clients: "clients",
  expenseEntries: "expenses",
  expenses: "expenses",
  fiscalCompanies: "fiscal_companies",
  fiscal_companies: "fiscal_companies",
  fiscalInvoiceFiles: "fiscal_invoice_files",
  fiscal_invoice_files: "fiscal_invoice_files",
  fiscalInvoices: "fiscal_invoices",
  fiscal_invoices: "fiscal_invoices",
  fiscalLogs: "fiscal_logs",
  fiscal_logs: "fiscal_logs",
  maintenances: "maintenances",
  messageLogs: "message_logs",
  message_logs: "message_logs",
  operationalLogs: "operational_logs",
  operational_logs: "operational_logs",
  productCatalog: "products",
  products: "products",
  settings: "settings",
  stockMovements: "stock_movements",
  stock_movements: "stock_movements",
  warranties: "warranties",
  whatsappAutomations: "whatsapp_automations",
  whatsapp_automations: "whatsapp_automations",
  whatsappContacts: "whatsapp_contacts",
  whatsapp_contacts: "whatsapp_contacts",
  whatsappMessages: "whatsapp_messages",
  whatsapp_messages: "whatsapp_messages",
  whatsappSessions: "whatsapp_sessions",
  whatsapp_sessions: "whatsapp_sessions",
};

const collectionsWithUserId = new Set<BackupCollectionName>([
  "clients",
  "maintenances",
  "warranties",
  "expenses",
  "products",
  "stock_movements",
  "cash_launches",
  "message_logs",
  "operational_logs",
  "fiscal_companies",
  "fiscal_invoices",
  "fiscal_logs",
  "whatsapp_sessions",
  "whatsapp_messages",
  "whatsapp_contacts",
  "whatsapp_automations",
]);

const excludedCollections = [
  "fiscal_private",
] as const;

const httpError = (status: number, message: string) => Object.assign(new Error(message), { status });

const getErrorStatus = (error: unknown) => {
  const status = typeof error === "object" && error && "status" in error ? Number((error as any).status) : 500;
  return Number.isInteger(status) && status >= 400 && status < 600 ? status : 500;
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === "object" && !Array.isArray(value)
);

const toJsonSafe = (value: unknown): Record<string, unknown> => (
  JSON.parse(JSON.stringify(value || {})) as Record<string, unknown>
);

const normalizeDocId = (value: unknown) => {
  const id = String(value || "").trim();
  if (!id || id.includes("/") || id === "." || id === ".." || id.length > 1500) return null;
  return id;
};

const downloadDate = () => new Date().toISOString().slice(0, 10);

const requireBackupAuth = (options: RegisterBackupRoutesOptions) => async (
  req: BackupRequest,
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
    req.backupAuth = {
      uid: decoded.uid,
      email: decoded.email,
    };
    return next();
  } catch {
    return res.status(401).json({ error: "Token Firebase invalido." });
  }
};

const readCollection = async (db: Firestore, userId: string, collectionName: BackupCollectionName) => {
  const snapshot = await db.collection("users").doc(userId).collection(collectionName).get();
  return snapshot.docs.map((documentSnapshot) => ({
    ...toJsonSafe(documentSnapshot.data()),
    id: documentSnapshot.id,
  }));
};

const normalizeBackupCollections = (backup: Record<string, unknown>) => {
  const normalized: Partial<Record<BackupCollectionName, Record<string, unknown>[]>> = {};
  const source = isRecord(backup.collections) ? backup.collections : backup;

  Object.entries(collectionAliases).forEach(([sourceKey, collectionName]) => {
    const value = source[sourceKey];
    if (Array.isArray(value)) {
      normalized[collectionName] = value.filter(isRecord).map(toJsonSafe);
    }
  });

  if (isRecord(backup.settings)) {
    normalized.settings = [{ ...toJsonSafe(backup.settings), id: "config" }];
  }

  return normalized;
};

const sanitizeRestoreData = (
  userId: string,
  collectionName: BackupCollectionName,
  rawDocument: Record<string, unknown>
) => {
  const id = normalizeDocId(rawDocument.id);
  if (!id) return null;

  const data = toJsonSafe(rawDocument);
  data.id = id;

  if (collectionName === "settings") {
    delete data.id;
    data.userId = userId;
    return { id, data };
  }

  if (collectionsWithUserId.has(collectionName)) {
    data.userId = userId;
  }

  return { id, data };
};

const commitRestoreBatch = async (batch: WriteBatch, operations: number) => {
  if (operations === 0) return 0;
  await batch.commit();
  return operations;
};

export const registerBackupRoutes = (options: RegisterBackupRoutesOptions) => {
  const auth = requireBackupAuth(options);

  options.app.get("/api/backup/full", auth, async (req: BackupRequest, res: Response) => {
    try {
      if (!options.db || !req.backupAuth?.uid) {
        throw httpError(503, "Backup indisponivel.");
      }

      const userId = req.backupAuth.uid;
      const userRef = options.db.collection("users").doc(userId);
      const [profileSnapshot, settingsSnapshot] = await Promise.all([
        userRef.get(),
        userRef.collection("settings").doc("config").get(),
      ]);
      const collectionEntries = await Promise.all(
        backupCollections
          .filter((collectionName) => collectionName !== "settings")
          .map(async (collectionName) => [collectionName, await readCollection(options.db as Firestore, userId, collectionName)] as const)
      );
      const collections = Object.fromEntries(collectionEntries);
      const counts = Object.fromEntries(collectionEntries.map(([collectionName, records]) => [collectionName, records.length]));
      const settings = settingsSnapshot.exists
        ? { ...toJsonSafe(settingsSnapshot.data()), id: "config", userId }
        : null;

      const payload = {
        format: FULL_BACKUP_FORMAT,
        version: 1,
        exportedAt: new Date().toISOString(),
        owner: {
          uid: userId,
          email: req.backupAuth.email || null,
        },
        profileSnapshot: profileSnapshot.exists ? toJsonSafe(profileSnapshot.data()) : null,
        settings,
        collections,
        counts: {
          ...counts,
          settings: settings ? 1 : 0,
        },
        excludedCollections,
        notes: [
          "Inclui documentos ativos e arquivados por soft delete nas colecoes exportadas.",
          "Restaura documentos do backup sem apagar documentos extras que existam no banco atual.",
          "Credenciais privadas fiscais nao sao exportadas por seguranca.",
        ],
      };

      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename=\"motofix-backup-geral-${downloadDate()}.json\"`);
      return res.status(200).json(payload);
    } catch (error) {
      const status = getErrorStatus(error);
      const message = error instanceof Error ? error.message : "Erro ao gerar backup geral.";
      return res.status(status).json({
        error: status >= 500 && process.env.NODE_ENV === "production" ? "Erro ao gerar backup geral." : message,
      });
    }
  });

  options.app.post("/api/backup/full/restore", auth, async (req: BackupRequest, res: Response) => {
    try {
      if (!options.db || !req.backupAuth?.uid) {
        throw httpError(503, "Restauracao indisponivel.");
      }

      const body = isRecord(req.body) ? req.body : {};
      if (body.confirmation !== RESTORE_CONFIRMATION) {
        throw httpError(400, "Confirmacao de restauracao invalida.");
      }

      const backup = isRecord(body.backup) ? body.backup : null;
      if (!backup || (backup.format !== FULL_BACKUP_FORMAT && backup.format !== LEGACY_OPERATIONAL_BACKUP_FORMAT)) {
        throw httpError(400, "Arquivo de backup geral invalido.");
      }

      const userId = req.backupAuth.uid;
      const normalizedCollections = normalizeBackupCollections(backup);
      const restoredByCollection: Record<string, number> = {};
      let restoredTotal = 0;
      let skippedDocuments = 0;
      let batch = options.db.batch();
      let batchOperations = 0;

      for (const collectionName of backupCollections) {
        const documents = normalizedCollections[collectionName] || [];
        for (const rawDocument of documents) {
          const sanitized = sanitizeRestoreData(userId, collectionName, rawDocument);
          if (!sanitized) {
            skippedDocuments += 1;
            continue;
          }

          const target = options.db
            .collection("users")
            .doc(userId)
            .collection(collectionName)
            .doc(sanitized.id);
          batch.set(target, sanitized.data);
          batchOperations += 1;
          restoredByCollection[collectionName] = (restoredByCollection[collectionName] || 0) + 1;

          if (batchOperations >= BATCH_SIZE) {
            restoredTotal += await commitRestoreBatch(batch, batchOperations);
            batch = options.db.batch();
            batchOperations = 0;
          }
        }
      }

      restoredTotal += await commitRestoreBatch(batch, batchOperations);

      return res.status(200).json({
        restoredAt: new Date().toISOString(),
        restoredByCollection,
        restoredTotal,
        skippedDocuments,
        mode: "safe-merge",
        excludedCollections,
      });
    } catch (error) {
      const status = getErrorStatus(error);
      const message = error instanceof Error ? error.message : "Erro ao restaurar backup geral.";
      return res.status(status).json({
        error: status >= 500 && process.env.NODE_ENV === "production" ? "Erro ao restaurar backup geral." : message,
      });
    }
  });
};
