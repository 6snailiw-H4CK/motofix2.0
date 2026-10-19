import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { calculateProfileAccess } = require("../functions/profileAccess.js");

const usage = `
Uso:
  node scripts/set-admin-claim.mjs admin@email.com outro@email.com
  node scripts/set-admin-claim.mjs --role=master_admin master@email.com
  ADMIN_EMAILS=admin@email.com,outro@email.com node scripts/set-admin-claim.mjs

Opcional:
  --remove            remove o claim administrativo dos e-mails informados
  --role=admin        define a role admin (padrão)
  --role=master_admin define a role master_admin
  --master-admin      encurta para role master_admin
`;

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

const rawArgs = process.argv.slice(2);
const shouldRemove = rawArgs.includes("--remove");
const hasMasterAdminFlag = rawArgs.includes("--master-admin");
const roleOverride = rawArgs.find((arg) => arg.startsWith("--role="))?.split("=")[1]?.trim();
const normalizedRole = roleOverride === "master_admin" || hasMasterAdminFlag ? "master_admin" : "admin";
const cliEmails = rawArgs.filter((arg) => !["--remove", "--master-admin"].includes(arg) && !arg.startsWith("--role="));
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

const app = getApps()[0] || initializeApp({
  credential: cert(serviceAccount),
});

const auth = getAuth(app);
const db = getFirestore(app);

for (const email of emails) {
  let auditRef;
  try {
    const user = await auth.getUserByEmail(email);
    const isConfiguredOwner = !!configuredOwnerUid && user.uid === configuredOwnerUid;
    if (isConfiguredOwner && (shouldRemove || normalizedRole !== "master_admin")) {
      throw new Error("The configured owner must remain master_admin; no changes were made.");
    }
    const profilePatch = {
      uid: user.uid,
      email: user.email || email,
      displayName: user.displayName || user.email || email,
      role: shouldRemove ? "user" : normalizedRole,
      updatedAt: new Date().toISOString(),
    };

    if (!shouldRemove) {
      profilePatch.isActive = true;
    }

    const userRef = db.collection("users").doc(user.uid);
    const ownerIdentityRef = db.collection("system").doc("access_config");
    auditRef = db.collection("audit_events").doc();
    let before = {};
    let after = {};
    let ownerUid = null;
    await db.runTransaction(async (transaction) => {
      const profileSnapshot = await transaction.get(userRef);
      const ownerIdentitySnapshot = await transaction.get(ownerIdentityRef);
      const configuredOwnerUid = ownerIdentitySnapshot.exists
        ? ownerIdentitySnapshot.get("ownerUid")
        : null;
      ownerUid = typeof configuredOwnerUid === "string"
        && configuredOwnerUid.length > 0
        && configuredOwnerUid.length <= 128
        && configuredOwnerUid.trim() === configuredOwnerUid
        ? configuredOwnerUid
        : null;
      const current = profileSnapshot.exists ? profileSnapshot.data() || {} : {};
      const isConfiguredOwner = !!ownerUid && user.uid === ownerUid;
      if (isConfiguredOwner && (shouldRemove || normalizedRole !== "master_admin")) {
        throw new Error("The configured owner must remain master_admin; no changes were made.");
      }
      before = {
        role: current.role || null,
        isActive: current.isActive === true,
        subscriptionExpiresAt: current.subscriptionExpiresAt || null,
      };
      const nextProfile = { ...current, ...profilePatch };
      nextProfile.accessProjection = calculateProfileAccess(
        nextProfile,
        user.uid,
        ownerUid,
      );
      after = {
        role: nextProfile.role || null,
        isActive: nextProfile.isActive === true,
        subscriptionExpiresAt: nextProfile.subscriptionExpiresAt || null,
        ownerAccess: {
          enabled: nextProfile.ownerAccess?.enabled === true,
          permanent: nextProfile.ownerAccess?.permanent === true,
        },
        accessProjection: {
          allowed: nextProfile.accessProjection.allowed,
          source: nextProfile.accessProjection.source,
        },
      };
      transaction.set(userRef, {
        ...profilePatch,
        accessProjection: nextProfile.accessProjection,
      }, { merge: true });
      transaction.create(auditRef, {
        actor: process.env.ADMIN_CLAIM_ACTOR || "system:set-admin-claim-script",
        action: "role_changed",
        target: user.uid,
        before,
        after,
        source: "system",
        reason: process.env.ADMIN_CLAIM_REASON || "Updated by the admin claim script.",
        timestamp: FieldValue.serverTimestamp(),
        claimsSyncStatus: "pending",
        claimsSyncAttempts: 0,
        claimsSyncUpdatedAt: FieldValue.serverTimestamp(),
      });
    });

    const nextClaims = { ...(user.customClaims || {}) };
    delete nextClaims.admin;
    delete nextClaims.master_admin;
    delete nextClaims.isActive;
    delete nextClaims.motofix_owner;
    if (after.isActive === true) nextClaims.isActive = true;
    if (!shouldRemove && normalizedRole === "master_admin") {
      nextClaims.admin = true;
      nextClaims.master_admin = true;
    } else if (!shouldRemove) {
      nextClaims.admin = true;
    }
    if (ownerUid === user.uid
      && after.role === "master_admin"
      && after.isActive === true
      && after.ownerAccess?.enabled === true
      && after.ownerAccess?.permanent === true) {
      nextClaims.motofix_owner = true;
    }
    await auth.setCustomUserClaims(user.uid, nextClaims);
    await auditRef.update({
      claimsSyncStatus: "synced",
      claimsSyncAttempts: 1,
      claimsSyncUpdatedAt: FieldValue.serverTimestamp(),
      claimsSyncedAt: FieldValue.serverTimestamp(),
      claimsSyncError: FieldValue.delete(),
    });

    console.log(`${shouldRemove ? "Removida" : "Aplicada"} role ${shouldRemove ? "administrativa" : normalizedRole} para ${email} (${user.uid})`);
  } catch (error) {
    if (auditRef) {
      const message = error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500);
      await auditRef.update({
        claimsSyncStatus: "failed",
        claimsSyncAttempts: 1,
        claimsSyncUpdatedAt: FieldValue.serverTimestamp(),
        claimsSyncFailureAt: FieldValue.serverTimestamp(),
        claimsSyncError: message,
      }).catch((auditError) => {
        console.error("Falha ao registrar estado de sincronizacao de claims:", auditError instanceof Error ? auditError.message : auditError);
      });
    }
    console.error(`Falha ao processar ${email}:`, error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
