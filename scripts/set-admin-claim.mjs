import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import admin from "firebase-admin";

const usage = `
Uso:
  node scripts/set-admin-claim.mjs admin@email.com outro@email.com
  ADMIN_EMAILS=admin@email.com,outro@email.com node scripts/set-admin-claim.mjs

Opcional:
  --remove  remove a claim admin dos e-mails informados
`;

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

const rawArgs = process.argv.slice(2);
const shouldRemove = rawArgs.includes("--remove");
const cliEmails = rawArgs.filter((arg) => arg !== "--remove");
const envEmails = String(process.env.ADMIN_EMAILS || "")
  .split(",")
  .map(normalizeEmail)
  .filter(Boolean);
const emails = [...new Set([...cliEmails.map(normalizeEmail), ...envEmails])];

if (emails.length === 0) {
  console.error(usage.trim());
  process.exit(1);
}

const serviceAccountFile = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || "./firebase-service-account.json";
const serviceAccountFilePath = path.resolve(process.cwd(), serviceAccountFile);

if (!fs.existsSync(serviceAccountFilePath)) {
  console.error(`Arquivo de service account nao encontrado: ${serviceAccountFilePath}`);
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountFilePath, "utf8"));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

for (const email of emails) {
  try {
    const user = await admin.auth().getUserByEmail(email);
    const currentClaims = user.customClaims || {};
    const nextClaims = { ...currentClaims };

    if (shouldRemove) {
      delete nextClaims.admin;
    } else {
      nextClaims.admin = true;
    }

    await admin.auth().setCustomUserClaims(user.uid, nextClaims);

    const profilePatch = {
      uid: user.uid,
      email: user.email || email,
      displayName: user.displayName || user.email || email,
      role: shouldRemove ? "user" : "admin",
      updatedAt: new Date().toISOString(),
    };

    if (!shouldRemove) {
      profilePatch.isActive = true;
    }

    await db.collection("users").doc(user.uid).set(profilePatch, { merge: true });

    console.log(`${shouldRemove ? "Removida" : "Aplicada"} claim admin para ${email} (${user.uid})`);
  } catch (error) {
    console.error(`Falha ao processar ${email}:`, error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
