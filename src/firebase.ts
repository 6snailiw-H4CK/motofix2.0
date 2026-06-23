import { initializeApp } from 'firebase/app';
import { browserLocalPersistence, getAuth, GoogleAuthProvider, setPersistence, signInWithPopup, signOut } from 'firebase/auth';
import {
  CACHE_SIZE_UNLIMITED,
  addDoc,
  collection,
  deleteDoc,
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

// Pega as configurações do arquivo .env ou do ambiente de build
const env = import.meta.env as Record<string, string | undefined>;

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID,
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
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

if (canUseWindow()) {
  setPersistence(auth, browserLocalPersistence).catch((error) => {
    console.warn('Falha ao configurar persistencia local do Firebase Auth:', error);
  });
}

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
  serverTimestamp,
  waitForPendingWrites,
  signInWithPopup,
  signOut
};
