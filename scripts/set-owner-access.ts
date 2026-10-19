import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { setOwnerAccess } from "../server/ownerAccess";

const usage = `Usage:
  MOTOFIX_FIREBASE_PROJECT_ID=<project-id> node --import tsx scripts/set-owner-access.ts grant <actor-uid> <owner-uid> "<reason>"
  MOTOFIX_FIREBASE_PROJECT_ID=<project-id> node --import tsx scripts/set-owner-access.ts revoke <actor-uid> <owner-uid> "<reason>"`;

const [action, actorUid, targetUid, ...reasonParts] = process.argv.slice(2);
const reason = reasonParts.join(" ").trim();
if (!["grant", "revoke"].includes(action ?? "") || !actorUid || !targetUid || !reason) {
  console.error(usage);
  process.exit(1);
}

const expectedProjectId = process.env.MOTOFIX_FIREBASE_PROJECT_ID?.trim();
if (!expectedProjectId) {
  throw new Error("MOTOFIX_FIREBASE_PROJECT_ID is required; no Firebase writes were made.");
}
const serviceAccountPath = path.resolve(
  process.cwd(),
  process.env.FIREBASE_SERVICE_ACCOUNT_PATH || "./firebase-service-account.json",
);
if (!fs.existsSync(serviceAccountPath)) {
  throw new Error(`Firebase service account not found at ${serviceAccountPath}; no Firebase writes were made.`);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8")) as { project_id?: string };
if (serviceAccount.project_id !== expectedProjectId) {
  throw new Error(
    `Project mismatch: expected ${expectedProjectId}, credential targets ${serviceAccount.project_id ?? "unknown"}; no Firebase writes were made.`,
  );
}

const app = getApps()[0] || initializeApp({
  credential: cert(serviceAccountPath),
  projectId: expectedProjectId,
});
const result = await setOwnerAccess({
  auth: getAuth(app),
  db: getFirestore(app),
  actorUid,
  targetUid,
  enabled: action === "grant",
  reason,
});

console.log(JSON.stringify({
  projectId: expectedProjectId,
  action: action === "grant" ? "owner_access_granted" : "owner_access_revoked",
  actorUid,
  targetUid,
  allowed: result.projection?.allowed ?? false,
  source: result.projection?.source ?? "none",
  validUntil: result.projection?.validUntil?.toDate().toISOString() ?? null,
  auditEventId: result.auditEventId,
}, null, 2));
