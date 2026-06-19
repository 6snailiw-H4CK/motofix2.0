import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, query, where, getFirestore } from 'firebase/firestore';

const fakeWindow: any = {
  localStorage: {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
    key: () => null,
    length: 0,
  },
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
};

Object.defineProperty(globalThis, 'window', { configurable: true, value: fakeWindow });
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { randomUUID: () => `uuid-${Date.now()}-${Math.random().toString(16).slice(2)}` } });

const env = process.env as Record<string, string | undefined>;
const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || '',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: env.VITE_FIREBASE_APP_ID || '',
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID || '',
};

const tokenFilePath = path.resolve(process.cwd(), 'scripts', 'cliente-removido-test-token.json');
if (!fs.existsSync(tokenFilePath)) {
  throw new Error(`Token file does not exist: ${tokenFilePath}. Please run generate-client-removal-test-user.js first.`);
}

const tokenData = JSON.parse(fs.readFileSync(tokenFilePath, 'utf8')) as { uid: string; email: string; customToken: string };

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const credential = await signInWithCustomToken(auth, tokenData.customToken);
console.log('Signed in as', credential.user.uid, credential.user.email);

const userId = credential.user.uid;

const firestore = getFirestore(app);

const clientSnapshot = await getDocs(query(collection(firestore, 'users', userId, 'clients'), where('name', '==', 'Cliente Remocao Teste')));
if (clientSnapshot.empty) {
  throw new Error('Seeded client not found before deletion');
}
const clientDoc = clientSnapshot.docs[0];
const clientId = clientDoc.id;
console.log('Found seeded client', clientId);

const maintSnapshot = await getDocs(query(collection(firestore, 'users', userId, 'maintenances'), where('clientId', '==', clientId)));
console.log('Found maintenance docs count before delete:', maintSnapshot.size);
if (maintSnapshot.size === 0) {
  throw new Error('Seeded maintenance not found before deletion');
}

const { clientRepository } = await import('../src/services/clientRepository.ts');
const { recordOperationalLog } = await import('../src/services/operationalLogRepository.ts');

await clientRepository.removeWithMaintenances(userId, clientId);
console.log('Removed client with maintenances:', clientId);

recordOperationalLog({
  userId,
  usuario: tokenData.email,
  oficina: 'Teste Oficina',
  acao: 'cliente_removido',
  targetId: clientId,
});
console.log('Recorded operational log cliente_removido');

await new Promise((resolve) => setTimeout(resolve, 1500));

const clientAfterDoc = await getDoc(doc(firestore, 'users', userId, 'clients', clientId));
const maintAfterSnapshot = await getDocs(query(collection(firestore, 'users', userId, 'maintenances'), where('clientId', '==', clientId)));
const logsSnapshot = await getDocs(query(collection(firestore, 'users', userId, 'operational_logs'), where('acao', '==', 'cliente_removido')));

console.log('After delete: client exists =', clientAfterDoc.exists());
console.log('After delete: maintenance count =', maintAfterSnapshot.size);
console.log('After delete: operational log entries =', logsSnapshot.size);

if (clientAfterDoc.exists()) {
  throw new Error('Client document still exists after delete');
}
if (maintAfterSnapshot.size > 0) {
  throw new Error('Maintenance documents still exist after delete');
}
if (logsSnapshot.size === 0) {
  throw new Error('No cliente_removido operational log found');
}

console.log('cliente_removido end-to-end validation PASSED');
