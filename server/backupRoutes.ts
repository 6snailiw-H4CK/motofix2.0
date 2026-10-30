import type { Express, NextFunction, Request, Response } from "express";
import type { Auth } from "firebase-admin/auth";
import { FieldPath, GeoPoint, Timestamp, type Firestore } from "firebase-admin/firestore";
import { hasApplicationAccess } from "./userAccess";

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
const RESTORE_CONFIRMATION = "RESTAURAR";
const BACKUP_PAGE_SIZE = 20;
const RESTORE_CHUNK_SIZE = 150;

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

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === "object" && !Array.isArray(value)
);

const toJsonSafeValue = (value: unknown): unknown => {
  if (value === null || value === undefined || typeof value !== "object") return value;
  if (value instanceof Date) return { __motofixType: "date", value: value.toISOString() };
  if (Buffer.isBuffer(value)) return { __motofixType: "bytes", base64: value.toString("base64") };
  if (value instanceof Timestamp) return { __motofixType: "timestamp", seconds: value.seconds, nanoseconds: value.nanoseconds };
  if (value instanceof GeoPoint) return { __motofixType: "geopoint", latitude: value.latitude, longitude: value.longitude };
  if (value && "path" in value && "id" in value && typeof (value as { path?: unknown }).path === "string") {
    return { __motofixType: "document-reference", path: (value as { path: string }).path };
  }
  if (Array.isArray(value)) return value.map(toJsonSafeValue);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toJsonSafeValue(item)]));
};

const toJsonSafe = (value: unknown): Record<string, unknown> => (
  toJsonSafeValue(value || {}) as Record<string, unknown>
);

const fromPortableValue = (value: unknown, db: Firestore): unknown => {
  if (Array.isArray(value)) return value.map((item) => fromPortableValue(item, db));
  if (!isRecord(value)) return value;
  if (value.__motofixType === "timestamp" && Number.isInteger(value.seconds) && Number.isInteger(value.nanoseconds)) {
    return new Timestamp(Number(value.seconds), Number(value.nanoseconds));
  }
  if (value.__motofixType === "date" && typeof value.value === "string") {
    const parsed = new Date(value.value);
    if (Number.isFinite(parsed.getTime())) return parsed;
  }
  if (value.__motofixType === "bytes" && typeof value.base64 === "string") return Buffer.from(value.base64, "base64");
  if (value.__motofixType === "geopoint" && typeof value.latitude === "number" && typeof value.longitude === "number") {
    return new GeoPoint(value.latitude, value.longitude);
  }
  if (value.__motofixType === "document-reference" && typeof value.path === "string") {
    const segments = value.path.split("/").filter(Boolean);
    if (segments.length % 2 === 0) return db.doc(value.path);
    throw httpError(400, "Referência inválida no backup.");
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, fromPortableValue(item, db)]));
};

const safeProfileSnapshot = (profile: Record<string, unknown> | undefined, userId: string) => {
  if (!profile) return null;
  const subscription = isRecord(profile.subscription) ? profile.subscription : {};
  return {
    uid: userId,
    email: typeof profile.email === "string" ? profile.email : null,
    displayName: typeof profile.displayName === "string" ? profile.displayName : null,
    role: typeof profile.role === "string" ? profile.role : null,
    isActive: profile.isActive === true,
    createdAt: toJsonSafeValue(profile.createdAt),
    subscription: {
      plan: typeof subscription.plan === "string" ? subscription.plan : null,
      status: typeof subscription.status === "string" ? subscription.status : null,
      currentPeriodEnd: toJsonSafeValue(subscription.currentPeriodEnd),
      expiresAt: toJsonSafeValue(subscription.expiresAt),
      autoRenew: typeof subscription.autoRenew === "boolean" ? subscription.autoRenew : null,
    },
  };
};

const normalizeDocId = (value: unknown) => {
  const id = String(value || "").trim();
  if (!id || id.includes("/") || id === "." || id === ".." || id.length > 1500) return null;
  return id;
};

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
    if (!(await hasApplicationAccess(options.db, decoded))) {
      return res.status(403).json({ error: "Usuario sem permissao ativa para acessar o backup." });
    }

    req.backupAuth = {
      uid: decoded.uid,
      email: decoded.email,
    };
    return next();
  } catch {
    return res.status(401).json({ error: "Token Firebase invalido." });
  }
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

export const registerBackupRoutes = (options: RegisterBackupRoutesOptions) => {
  const auth = requireBackupAuth(options);

  options.app.get("/api/backup/full", auth, async (req: BackupRequest, res: Response, next: NextFunction) => {
    if (!options.db || !req.backupAuth?.uid) return next();
    try {
      const userId = req.backupAuth.uid;
      const userRef = options.db.collection("users").doc(userId);
      if (req.query.meta === "1") {
        const [profileSnapshot, settingsSnapshot] = await Promise.all([
          userRef.get(),
          userRef.collection("settings").doc("config").get(),
        ]);
        return res.status(200).json({
          format: FULL_BACKUP_FORMAT,
          version: 2,
          exportedAt: new Date().toISOString(),
          owner: { uid: userId },
          profileSnapshot: safeProfileSnapshot(profileSnapshot.data() as Record<string, unknown> | undefined, userId),
          settings: settingsSnapshot.exists
            ? { ...toJsonSafe(settingsSnapshot.data()), id: "config" }
            : null,
          collections: backupCollections.filter((name) => name !== "settings"),
          excludedCollections,
          notes: [
            "O arquivo exporta documentos ativos, cancelados, arquivados e marcados como excluídos logicamente.",
            "Credenciais privadas fiscais são excluídas por segurança e precisam ser configuradas novamente.",
            "Os anexos encontrados no aplicativo estão embutidos nos documentos exportados; não foi encontrada integração de Firebase Storage no código.",
            "Contas de Firebase Authentication, senhas, claims e configurações globais de cobrança/administração não são restauradas pelo backup da oficina.",
          ],
        });
      }

      if (typeof req.query.collection === "string") {
        const collectionName = collectionAliases[req.query.collection];
        if (!collectionName || collectionName === "settings") return res.status(400).json({ error: "Coleção inválida para exportação." });
        const cursor = typeof req.query.cursor === "string" ? normalizeDocId(req.query.cursor) : null;
        let query = userRef.collection(collectionName).orderBy(FieldPath.documentId()).limit(BACKUP_PAGE_SIZE);
        if (cursor) query = query.startAfter(cursor);
        const snapshot = await query.get();
        return res.status(200).json({
          collection: collectionName,
          documents: snapshot.docs.map((documentSnapshot) => ({
            ...toJsonSafe(documentSnapshot.data()),
            id: documentSnapshot.id,
          })),
          nextCursor: snapshot.size === BACKUP_PAGE_SIZE ? snapshot.docs[snapshot.docs.length - 1].id : null,
        });
      }
      return res.status(410).json({ error: "Use o arquivo .motofix criptografado pela interface do MotoFix." });
    } catch (error) {
      return next(error);
    }
  });

  options.app.post("/api/backup/full/preflight", auth, async (req: BackupRequest, res: Response, next: NextFunction) => {
    if (!options.db || !req.backupAuth?.uid) return next();
    try {
      const idsByCollection = isRecord(req.body?.ids) ? req.body.ids : null;
      if (req.body?.sourceWorkshopId !== req.backupAuth.uid) throw httpError(409, "O backup pertence a outra oficina/conta; migração entre oficinas não está habilitada.");
      if (!idsByCollection) throw httpError(400, "Resumo da restauração inválido.");
      const userRef = options.db.collection("users").doc(req.backupAuth.uid);
      const currentCounts: Record<string, number> = {};
      const conflictCounts: Record<string, number> = {};
      for (const collectionName of backupCollections) {
        const rawIds = idsByCollection[collectionName];
        const ids = rawIds === undefined ? [] : rawIds;
        if (!Array.isArray(ids) || ids.length > 100_000 || ids.some((id) => typeof id !== "string" || !normalizeDocId(id))) {
          throw httpError(400, `Lista de identificadores inválida em ${collectionName}.`);
        }
        const collectionRef = userRef.collection(collectionName);
        const countSnapshot = await collectionRef.count().get();
        currentCounts[collectionName] = countSnapshot.data().count;
        let conflicts = 0;
        for (let offset = 0; offset < ids.length; offset += 300) {
          const references = ids.slice(offset, offset + 300).map((id) => collectionRef.doc(String(id)));
          const snapshots = references.length ? await options.db.getAll(...references) : [];
          conflicts += snapshots.filter((snapshot) => snapshot.exists).length;
        }
        conflictCounts[collectionName] = conflicts;
      }
      const totalExisting = Object.values(currentCounts).reduce((sum, value) => sum + value, 0);
      return res.status(200).json({
        target: totalExisting === 0 ? "empty" : "existing",
        currentCounts,
        conflictCounts,
        totalExisting,
        mode: "safe-merge",
        deletesNothing: true,
        warning: "IDs já existentes no destino serão substituídos; documentos extras serão preservados.",
      });
    } catch (error) {
      return next(error);
    }
  });

  options.app.post("/api/backup/full/restore-chunk", auth, async (req: BackupRequest, res: Response, next: NextFunction) => {
    if (!options.db || !req.backupAuth?.uid) return next();
    try {
      const body = isRecord(req.body) ? req.body : {};
      const collectionName = typeof body.collection === "string" ? collectionAliases[body.collection] : null;
      const documents = Array.isArray(body.documents) ? body.documents : null;
      if (body.confirmation !== RESTORE_CONFIRMATION) throw httpError(400, "Confirmação de restauração inválida.");
      if (body.sourceWorkshopId !== req.backupAuth.uid) throw httpError(409, "O backup pertence a outra oficina/conta; migração entre oficinas não está habilitada.");
      if (!collectionName || !documents || documents.length > RESTORE_CHUNK_SIZE) throw httpError(400, "Lote de restauração inválido.");
      const batch = options.db.batch();
      const seen = new Set<string>();
      for (const raw of documents) {
        if (!isRecord(raw)) throw httpError(400, "Documento inválido no lote de restauração.");
        const id = normalizeDocId(raw.id);
        if (!id) throw httpError(400, "Identificador inválido no lote de restauração.");
        if (seen.has(id)) throw httpError(400, "O lote contém IDs duplicados.");
        seen.add(id);
        if (collectionName === "settings" && id !== "config") throw httpError(400, "A configuração precisa manter o ID config.");
        const sanitized = sanitizeRestoreData(req.backupAuth.uid, collectionName, raw);
        if (!sanitized) throw httpError(400, "Documento não pode ser restaurado.");
        const reference = options.db.collection("users").doc(req.backupAuth.uid).collection(collectionName).doc(id);
        batch.set(reference, fromPortableValue(sanitized.data, options.db));
      }
      await batch.commit();
      return res.status(200).json({ restored: documents.length, collection: collectionName });
    } catch (error) {
      return next(error);
    }
  });

  options.app.get("/api/backup/full", auth, (_req, res) => (
    res.status(410).json({ error: "Use o arquivo .motofix criptografado pela interface do MotoFix." })
  ));

  options.app.post("/api/backup/full/restore", auth, (_req, res) => (
    res.status(410).json({ error: "Restauração de JSON simples foi desativada. Use um arquivo .motofix validado." })
  ));
};
