import * as admin from 'firebase-admin';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { getFirestore } from 'firebase-admin/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serviceAccountPath = path.resolve(__dirname, '..', 'firebase-service-account.json');

const serviceAccountRaw = fs.readFileSync(serviceAccountPath, 'utf8');
const serviceAccount = JSON.parse(serviceAccountRaw);
try {
  admin.initializeApp({
    credential: (admin as any).cert(serviceAccount as any),
  });
} catch (err) {
  console.error('[local-run] aviso inicializacao Firebase:', err);
}

const db = getFirestore();

const userId = process.argv[2];
const limit = Number(process.argv[3] || 50);

if (!userId) {
  console.error('Usage: node scripts/run-whatsapp-for-user.ts <userId> [limit]');
  process.exit(2);
}

(async () => {
  try {
    console.log(`[local-run] executando lembretes para user=${userId} limit=${limit}`);
    const mod = await import('../server/whatsappRemindersService');
    if (!mod || typeof mod.sendDueRemindersForUser !== 'function') {
      console.error('[local-run] função sendDueRemindersForUser não encontrada no módulo');
      process.exit(3);
    }

    const result = await mod.sendDueRemindersForUser(db, userId, limit);
    console.log('[local-run] resultado:');
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (err) {
    console.error('[local-run] erro ao executar lembretes:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
})();
