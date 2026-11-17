import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { Timestamp, getFirestore } from 'firebase-admin/firestore';

const projectId = process.env.GCLOUD_PROJECT || 'motofix-backup-hosting-test';
const hostingBase = process.env.MOTOFIX_HOSTING_EMULATOR_URL || 'http://127.0.0.1:5000';
const authBase = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
const app = initializeApp({ projectId }, `backup-hosting-route-${Date.now()}`);
const auth = getAuth(app);
const db = getFirestore(app);

const signUp = async (email) => {
  const response = await fetch(`${authBase}/accounts:signUp?key=fake-api-key`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'hosting-backup-test-password', returnSecureToken: true }),
  });
  const body = await response.json();
  assert.equal(response.ok, true, JSON.stringify(body));
  return body;
};

const tokenFor = async (uid, claims) => {
  await auth.setCustomUserClaims(uid, claims);
  const customToken = await auth.createCustomToken(uid);
  const response = await fetch(`${authBase}/accounts:signInWithCustomToken?key=fake-api-key`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  });
  const body = await response.json();
  assert.equal(response.ok, true, JSON.stringify(body));
  return body.idToken;
};

const request = (token) => fetch(`${hostingBase}/api/backup/full?meta=1`, {
  headers: token ? { Authorization: `Bearer ${token}` } : {},
  cache: 'no-store',
});

try {
  const unauthenticated = await request(null);
  assert.equal(unauthenticated.status, 401, 'Hosting rewrite must reach the authenticated Function endpoint.');
  assert.match(unauthenticated.headers.get('content-type') || '', /application\/json/i);

  const email = `hosting-admin-${Date.now()}@example.invalid`;
  const created = await signUp(email);
  const uid = created.localId;
  const expiresAt = Timestamp.fromMillis(Date.now() + 86_400_000);
  await db.collection('users').doc(uid).set({
    uid, email, role: 'admin', isActive: true,
    manualAccess: { enabled: true, expiresAt },
    accessProjection: { allowed: true, source: 'manual', validUntil: expiresAt },
  });
  const idToken = await tokenFor(uid, { admin: true });
  const response = await request(idToken);
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(body.format, 'motofix-full-backup');
  assert.equal(body.sourceProjectId, projectId, 'The endpoint must identify the emulator project that actually served the request.');
  assert.ok(Array.isArray(body.collections));

  const common = await signUp(`hosting-common-${Date.now()}@example.invalid`);
  const commonExpiresAt = Timestamp.fromMillis(Date.now() + 86_400_000);
  await db.collection('users').doc(common.localId).set({
    uid: common.localId, role: 'employee', isActive: true,
    manualAccess: { enabled: true, expiresAt: commonExpiresAt },
    accessProjection: { allowed: true, source: 'manual', validUntil: commonExpiresAt },
  });
  const commonToken = await tokenFor(common.localId, {});
  assert.equal((await request(commonToken)).status, 403, 'A valid ordinary user is denied full export through Hosting.');

  console.log(`PASS Hosting Emulator rewrite: HTTP -> /api/backup/** -> backupApi Function -> Firestore Emulator (${projectId}); auth, admin authorization, and source project identity verified.`);
} finally {
  await deleteApp(app).catch(() => {});
}
