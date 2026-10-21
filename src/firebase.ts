import { initializeApp } from 'firebase/app';
import { browserLocalPersistence, connectAuthEmulator, getAuth, GoogleAuthProvider, setPersistence, signInWithPopup, signOut } from 'firebase/auth';
import {
  CACHE_SIZE_UNLIMITED,
  addDoc,
  collection,
  connectFirestoreEmulator,
  deleteDoc,
  disableNetwork,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  initializeFirestore,
  onSnapshot,
  persistentLocalCache,
  persistentMultipleTabManager,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  waitForPendingWrites,
  where
} from 'firebase/firestore';

const nodeEnv = (globalThis as typeof globalThis & {
  process?: { env?: Record<string, string | undefined> };
}).process?.env || {};
const viteEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env || nodeEnv;
const firebaseConfig = {
  apiKey: viteEnv.VITE_FIREBASE_API_KEY,
  authDomain: viteEnv.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: viteEnv.VITE_FIREBASE_PROJECT_ID,
  storageBucket: viteEnv.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: viteEnv.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: viteEnv.VITE_FIREBASE_APP_ID,
  measurementId: viteEnv.VITE_FIREBASE_MEASUREMENT_ID,
};

const canUseWindow = () => typeof window !== 'undefined' && typeof window.document !== 'undefined';

// Inicializa o Firebase
const app = initializeApp(firebaseConfig);

const initializeOfflineFirestore = () => {
  if (!canUseWindow()) {
    return getFirestore(app);
  }

  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({
        cacheSizeBytes: CACHE_SIZE_UNLIMITED,
        tabManager: persistentMultipleTabManager(),
      }),
    });
  } catch (error) {
    console.warn('Falha ao ativar cache persistente do Firestore. Usando cache em memoria:', error);
    return getFirestore(app);
  }
};

export const db = initializeOfflineFirestore();
const firestoreEmulator = viteEnv.VITE_FIRESTORE_EMULATOR_HOST?.trim();
if (firestoreEmulator) {
  const [host, rawPort] = firestoreEmulator.split(':');
  const port = Number(rawPort || 8080);
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('VITE_FIRESTORE_EMULATOR_HOST deve usar o formato host:porta.');
  }
  connectFirestoreEmulator(db, host, port);
}
// Firestore's persistent cache is the normal operating mode. Network access is
// opened only for an explicit or scheduled synchronization session.
export const firestoreOfflineReady = disableNetwork(db);
export const auth = getAuth(app);
const authEmulatorUrl = viteEnv.VITE_FIREBASE_AUTH_EMULATOR_URL?.trim();
if (authEmulatorUrl) {
  if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(authEmulatorUrl)) {
    throw new Error('VITE_FIREBASE_AUTH_EMULATOR_URL deve apontar para localhost ou 127.0.0.1.');
  }
  connectAuthEmulator(auth, authEmulatorUrl, { disableWarnings: true });
}
export const googleProvider = new GoogleAuthProvider();

export const authPersistenceReady = canUseWindow()
  ? setPersistence(auth, browserLocalPersistence).catch((error) => {
    console.warn('Falha ao configurar persistencia local do Firebase Auth:', error);
  })
  : Promise.resolve();

export const logAuthDiagnostic = (
  area: string,
  event: string,
  detail: Record<string, unknown> = {},
) => {
  console.debug('[MotoFix auth]', {
    area,
    event,
    ...detail,
    timestamp: new Date().toISOString(),
  });
};

// Configura o Google Provider para sempre pedir a conta (ajuda no teste)
googleProvider.setCustomParameters({ prompt: 'select_account' });

export {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  disableNetwork,
  serverTimestamp,
  waitForPendingWrites,
  signInWithPopup,
  signOut
};
