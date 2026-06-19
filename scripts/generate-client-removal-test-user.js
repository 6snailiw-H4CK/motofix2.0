import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import admin from 'firebase-admin';

const env = process.env;
const serviceAccountPath = path.resolve(process.cwd(), env.FIREBASE_SERVICE_ACCOUNT_PATH || './firebase-service-account.json');
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const auth = admin.auth();
const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

const testUid = `cliente-removido-test-${Date.now()}`;
const testEmail = `${testUid}@example.com`;

const run = async () => {
  let userRecord;
  try {
    userRecord = await auth.createUser({ uid: testUid, email: testEmail, password: 'Password123!' });
    console.log('Created test user:', userRecord.uid);
  } catch (error) {
    const err = error;
    if (err.code === 'auth/uid-already-exists' || err.code === 'auth/email-already-exists') {
      console.log('Test user already exists, loading existing record.');
      try {
        userRecord = await auth.getUser(testUid);
      } catch {
        userRecord = await auth.getUserByEmail(testEmail);
      }
    } else {
      throw error;
    }
  }

  const token = await auth.createCustomToken(userRecord.uid);
  const output = {
    uid: userRecord.uid,
    email: userRecord.email,
    customToken: token,
  };
  fs.writeFileSync(path.resolve(process.cwd(), 'scripts', 'cliente-removido-test-token.json'), JSON.stringify(output, null, 2), 'utf8');
  console.log('Wrote test token to scripts/cliente-removido-test-token.json');

  await db.doc(`users/${userRecord.uid}`).set({
    uid: userRecord.uid,
    email: userRecord.email,
    displayName: 'Cliente Removido Teste',
    role: 'user',
    isActive: true,
    subscription: null,
    subscriptionExpiresAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }, { merge: true });

  const clientId = `client-removal-${Date.now()}`;
  const maintenanceId = `maintenance-removal-${Date.now()}`;
  await db.doc(`users/${userRecord.uid}/clients/${clientId}`).set({
    userId: userRecord.uid,
    name: 'Cliente Remocao Teste',
    bikeModel: 'CB 500',
    contact: '999999999',
    lastMaintenanceDate: new Date().toISOString(),
    nextMaintenanceDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    recurrenceDays: 30,
    status: 'OK',
    createdAt: new Date().toISOString(),
  });

  await db.doc(`users/${userRecord.uid}/maintenances/${maintenanceId}`).set({
    userId: userRecord.uid,
    clientId,
    clientName: 'Cliente Remocao Teste',
    bikeModel: 'CB 500',
    date: new Date().toISOString(),
    serviceType: 'Troca de Oleo',
    serviceValue: 100,
    isRecurringRevenue: false,
    notes: 'Teste de remocao de cliente',
    statusPagamento: 'Pago',
    valorPago: 100,
    saldoDevedor: 0,
    createdAt: new Date().toISOString(),
  });

  console.log('Seeded test user profile, client, and maintenance.');
  console.log('Client ID:', clientId);
  console.log('Maintenance ID:', maintenanceId);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});