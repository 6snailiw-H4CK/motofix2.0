import { deleteApp, initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  inMemoryPersistence,
  initializeAuth,
  signInWithPopup,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth';
import { createFirebaseFunctionDestinationAdapter, type BackupDestinationAdapter } from './backupDestinationAdapter';

export type FirebaseBackupDestinationConfig = {
  projectId: string;
  apiKey: string;
  authDomain: string;
  appId: string;
};

export type FirebaseBackupDestinationSession = {
  projectId: string;
  user: User;
  adapter: BackupDestinationAdapter;
  close: () => Promise<void>;
};

const validateConfig = (config: FirebaseBackupDestinationConfig) => {
  const projectId = config.projectId.trim();
  const apiKey = config.apiKey.trim();
  const authDomain = config.authDomain.trim();
  const appId = config.appId.trim();
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId)) throw new Error('ID do projeto de destino inválido.');
  if (!/^[A-Za-z0-9_-]{20,}$/.test(apiKey)) throw new Error('Chave de API web inválida.');
  if (!/^[A-Za-z0-9.-]+$/.test(authDomain)) throw new Error('Domínio de autenticação inválido.');
  if (!/^\d+:\d+:(?:web|ios|android):[A-Za-z0-9_-]+$/.test(appId)) throw new Error('ID do aplicativo web Firebase inválido.');
  return { projectId, apiKey, authDomain, appId };
};

export const signInToFirebaseBackupDestination = async (
  config: FirebaseBackupDestinationConfig,
): Promise<FirebaseBackupDestinationSession> => {
  const validated = validateConfig(config);
  const appName = `motofix-backup-destination-${crypto.randomUUID()}`;
  const app = initializeApp({
    apiKey: validated.apiKey,
    authDomain: validated.authDomain,
    projectId: validated.projectId,
    appId: validated.appId,
  }, appName);
  let auth: Auth;
  try {
    auth = initializeAuth(app, { persistence: inMemoryPersistence });
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const credential = await signInWithPopup(auth, provider);
    const user = credential.user;
    const adapter = createFirebaseFunctionDestinationAdapter({
      projectId: validated.projectId,
      uid: user.uid,
      getIdToken: () => user.getIdToken(),
    });
    return {
      projectId: validated.projectId,
      user,
      adapter,
      close: async () => {
        await signOut(auth).catch(() => {});
        await deleteApp(app).catch(() => {});
      },
    };
  } catch (error) {
    await deleteApp(app).catch(() => {});
    throw error;
  }
};
