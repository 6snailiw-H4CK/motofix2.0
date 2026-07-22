import * as admin from 'firebase-admin';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serviceAccountPath = path.resolve(__dirname, '..', 'firebase-service-account.json');

// initialize firebase admin
const serviceAccountRaw = fs.readFileSync(serviceAccountPath, 'utf8');
const serviceAccount = JSON.parse(serviceAccountRaw);
try {
  console.log('[local-run] serviceAccountPath=', serviceAccountPath);
  console.log('[local-run] serviceAccount keys=', Object.keys(serviceAccount));
  console.log('[local-run] firebase-admin keys=', Object.keys(admin));
  admin.initializeApp({
    credential: (admin as any).cert(serviceAccount as any),
  });
} catch (err) {
  console.error('[local-run] erro ao inicializar Firebase:', err);
  // ignore if already initialized
}

import { getFirestore } from 'firebase-admin/firestore';
const db = getFirestore();

// dynamic import the scheduler
(async () => {
  try {
    const mod = await import('../server/whatsappRemindersService');
    if (mod && typeof mod.startWhatsAppScheduler === 'function') {
      console.log('[local-run] iniciando agendador (execução única)...');
      const stop = mod.startWhatsAppScheduler({ db, enabled: true, intervalMs: 24 * 60 * 60 * 1000, batchLimit: 20 });
      // aguarda 25s para que a execução inicial termine
      await new Promise((resolve) => setTimeout(resolve, 25000));
      if (stop) stop();
      console.log('[local-run] execução concluída, saindo.');
      process.exit(0);
    }
    console.error('[local-run] não foi possível importar startWhatsAppScheduler');
    process.exit(2);
  } catch (err) {
    console.error('[local-run] erro ao rodar agendador:', err);
    process.exit(1);
  }
})();
