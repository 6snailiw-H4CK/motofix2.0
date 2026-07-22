import path from "node:path";
import { mkdir, readdir, stat, unlink, writeFile } from "node:fs/promises";
import type { Auth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";

type AutomaticBackupOptions = {
  db: Firestore | null;
  auth?: Auth | null;
  firebaseInitialized?: boolean;
  enabled?: boolean;
  snapshotDir?: string;
  retentionCount?: number;
  intervalMs?: number;
};

type AutomaticBackupResult = {
  filePath: string;
  filename: string;
  userCount: number;
};

const AUTOMATIC_BACKUP_FORMAT = "motofix-automatic-backup";
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

const excludedCollections = ["fiscal_private"] as const;

const toJsonSafe = (value: unknown): Record<string, unknown> => (
  JSON.parse(JSON.stringify(value || {})) as Record<string, unknown>
);

const readCollection = async (db: Firestore, userId: string, collectionName: typeof backupCollections[number]) => {
  const snapshot = await db.collection("users").doc(userId).collection(collectionName).get();
  return snapshot.docs.map((documentSnapshot) => ({
    ...toJsonSafe(documentSnapshot.data()),
    id: documentSnapshot.id,
  }));
};

const getSnapshotTimestamp = () => {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, "-");
};

export const buildAutomaticBackupPayload = async (db: Firestore) => {
  const usersSnapshot = await db.collection("users").get();
  const users = await Promise.all(usersSnapshot.docs.map(async (userDoc) => {
    const uid = userDoc.id;
    const userRef = db.collection("users").doc(uid);
    const [profileSnapshot, settingsSnapshot] = await Promise.all([
      userRef.get(),
      userRef.collection("settings").doc("config").get(),
    ]);

    const collectionEntries = await Promise.all(
      backupCollections
        .filter((collectionName) => collectionName !== "settings")
        .map(async (collectionName) => [collectionName, await readCollection(db, uid, collectionName)] as const)
    );

    const collections = Object.fromEntries(collectionEntries);
    const counts = Object.fromEntries(collectionEntries.map(([collectionName, records]) => [collectionName, records.length]));
    const settings = settingsSnapshot.exists
      ? { ...toJsonSafe(settingsSnapshot.data()), id: "config", userId: uid }
      : null;

    return {
      uid,
      email: (userDoc.get("email") || userDoc.get("emailAddress") || null) as string | null,
      profileSnapshot: profileSnapshot.exists ? toJsonSafe(profileSnapshot.data()) : null,
      settings,
      collections,
      counts: {
        ...counts,
        settings: settings ? 1 : 0,
      },
      excludedCollections,
      notes: [
        "Snapshot automatico diario gerado pelo servidor.",
        "Inclui documentos ativos e arquivados por soft delete nas colecoes exportadas.",
        "Credenciais privadas fiscais nao sao exportadas por seguranca.",
      ],
    };
  }));

  return {
    format: AUTOMATIC_BACKUP_FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    backupType: "automatic-daily" as const,
    owner: {
      scope: "all-users",
      generatedBy: "server",
    },
    users,
    counts: {
      users: users.length,
    },
    excludedCollections,
  };
};

export const applyBackupRetention = async (snapshotDir: string, retentionCount: number) => {
  const entries = await readdir(snapshotDir);
  const files = await Promise.all(entries
    .filter((entry) => entry.startsWith("motofix-backup-") && entry.endsWith(".json"))
    .map(async (entry) => {
      const filePath = path.join(snapshotDir, entry);
      const fileStats = await stat(filePath);
      return { entry, filePath, mtimeMs: fileStats.mtimeMs };
    }));

  const sortedFiles = files.sort((left, right) => right.mtimeMs - left.mtimeMs || left.entry.localeCompare(right.entry));
  const removableFiles = sortedFiles.slice(Math.max(retentionCount, 0));

  await Promise.all(removableFiles.map(({ filePath }) => unlink(filePath)));
  return removableFiles.map(({ filePath }) => filePath);
};

export const writeAutomaticBackupSnapshot = async (db: Firestore, options: Pick<AutomaticBackupOptions, "snapshotDir" | "retentionCount"> = {}) => {
  const snapshotDir = options.snapshotDir || path.resolve(process.cwd(), "backups", "automatic");
  const retentionCount = Math.max(Number(options.retentionCount ?? 30), 1);

  await mkdir(snapshotDir, { recursive: true });
  const payload = await buildAutomaticBackupPayload(db);
  const filename = `motofix-backup-${getSnapshotTimestamp()}.json`;
  const filePath = path.join(snapshotDir, filename);
  await writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
  const removedFiles = await applyBackupRetention(snapshotDir, retentionCount);

  return {
    filePath,
    filename,
    userCount: payload.users.length,
    removedFiles,
  } satisfies AutomaticBackupResult & { removedFiles: string[] };
};

export const startAutomaticBackupScheduler = (options: AutomaticBackupOptions) => {
  const enabled = options.enabled ?? process.env.AUTOMATIC_BACKUP_ENABLED !== "false";
  if (!enabled || process.env.NODE_ENV === "test") {
    return undefined;
  }

  if (!options.firebaseInitialized || !options.db) {
    console.warn("⚠️ Backup automatico desativado: Firebase Admin nao inicializado.");
    return undefined;
  }

  const snapshotDir = options.snapshotDir || process.env.BACKUP_SNAPSHOT_DIR || path.resolve(process.cwd(), "backups", "automatic");
  const retentionCount = Math.max(Number(process.env.BACKUP_RETENTION_COUNT || 30), 1);
  const intervalMs = Number(process.env.AUTOMATIC_BACKUP_INTERVAL_MS || 24 * 60 * 60 * 1000);

  const runBackup = async () => {
    try {
      const result = await writeAutomaticBackupSnapshot(options.db as Firestore, { snapshotDir, retentionCount });
      console.log(`[automatic-backup] snapshot criado em ${result.filename} para ${result.userCount} perfil(is) de usuario(s) na coleção users do Firestore.`);
    } catch (error) {
      console.error("Erro ao gerar backup automatico diario:", error);
    }
  };

  void runBackup();
  const timer = setInterval(() => {
    void runBackup();
  }, intervalMs);

  return () => clearInterval(timer);
};
