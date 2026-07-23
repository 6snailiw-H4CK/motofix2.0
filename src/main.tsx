import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerMotoFixServiceWorker } from './services/serviceWorkerRegistration';

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
