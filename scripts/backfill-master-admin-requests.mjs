import fs from "node:fs";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const apply = process.argv.includes("--apply");
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || "./firebase-service-account.json";
if (!fs.existsSync(serviceAccountPath)) {
  throw new Error(`Service account not found: ${serviceAccountPath}`);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
if (serviceAccount.project_id !== "appmotofix") {
  throw new Error("Service account project must be appmotofix.");
}

const app = getApps()[0] || initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore(app);

try {
  const profiles = await db.collection("users").get();
  const candidates = [];

  for (const profileSnapshot of profiles.docs) {
    const profile = profileSnapshot.data();
    if (profile.role !== "user") continue;

    const requestRef = db.collection("access_requests").doc(profileSnapshot.id);
    const requestSnapshot = await requestRef.get();
    if (requestSnapshot.exists) continue;

    const email = typeof profile.email === "string" ? profile.email.slice(0, 320) : "";
    const displayName = typeof profile.displayName === "string" && profile.displayName.trim()
      ? profile.displayName.trim().slice(0, 120)
      : "Usuário";
    const request = {
      uid: profileSnapshot.id,
      email,
      displayName,
      status: "pending",
      createdAt: profile.createdAt ?? FieldValue.serverTimestamp(),
      manualAccessExpiresAt: profile.manualAccess?.expiresAt ?? null,
      source: "legacy_profile_backfill",
    };
    candidates.push({ ref: requestRef, request });
  }

  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", legacyProfilesToAdd: candidates.length }));
  if (!apply || candidates.length === 0) process.exitCode = 0;
  else {
    for (let offset = 0; offset < candidates.length; offset += 400) {
      const batch = db.batch();
      for (const candidate of candidates.slice(offset, offset + 400)) {
        batch.create(candidate.ref, candidate.request);
      }
      await batch.commit();
    }
    console.log(JSON.stringify({ created: candidates.length }));
  }
} finally {
  await app.delete();
}
