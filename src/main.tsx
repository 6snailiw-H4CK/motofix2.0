import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerMotoFixServiceWorker } from './services/serviceWorkerRegistration';
import { registerBackupPeerProbeResponder } from './services/backupLocalStateLock';

registerBackupPeerProbeResponder();
registerMotoFixServiceWorker();

const enableStrictMode = import.meta.env.VITE_ENABLE_STRICT_MODE !== 'false';

createRoot(document.getElementById('root')!).render(
  enableStrictMode ? (
    <StrictMode>
      <App />
    </StrictMode>
  ) : (
    <App />
  ),
);
