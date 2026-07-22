import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { sendDueRemindersForUser } from '../server/whatsappRemindersService';
import { whatsAppSessionService } from '../server/whatsapp/WhatsAppSessionService';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SERVICE_ACCOUNT_PATH = path.resolve(__dirname, '..', 'firebase-service-account.json');

async function initFirestore() {
  const raw = fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf-8');
  const serviceAccount = JSON.parse(raw);
  try {
    (admin as any).initializeApp({ credential: (admin as any).cert(serviceAccount) });
  } catch (e) {
    // ignore if already initialized
  }
  const db = getFirestore();
  try { (db as any).settings({ ignoreUndefinedProperties: true }); } catch (e) { /* ignore */ }
  return db;
}

function dateOnlyUTC(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

async function run(userId: string, limit = 50) {
  const db = await initFirestore();

  // Prepare test automation config (enable reminders)
  const automationRef = db.collection('users').doc(userId).collection('whatsapp_automations').doc('config');
  await automationRef.set({ enabled: true, appointmentEnabled: true }, { merge: true });

  // Create a test client with nextMaintenanceDate = today (UTC date-only)
  const clientId = `test-client-today-${Date.now().toString(36)}`;
  const clientRef = db.collection('users').doc(userId).collection('clients').doc(clientId);
  const today = dateOnlyUTC(new Date());
  const clientPayload = {
    name: 'Cliente Teste Hoje',
    phone: '+5511999999999',
    status: 'WARNING',
    nextMaintenanceDate: today,
    automation: {},
  } as any;
  const safeClientPayload = JSON.parse(JSON.stringify(clientPayload));
  await clientRef.set(safeClientPayload);

  // Mock sendMessage to avoid real WhatsApp dependency
  const calls: Array<any> = [];
  const originalSend = whatsAppSessionService.sendMessage;
  (whatsAppSessionService as any).sendMessage = async (_context: any, _userId: string, input: { to: string; text: string }) => {
    calls.push({ to: input.to, text: input.text });
    return Promise.resolve({ id: `mock-${Date.now()}` });
  };

  try {
    const result = await sendDueRemindersForUser(db as any, userId, limit);
    console.log('[test] resultado:', JSON.stringify(result, null, 2));
    console.log('[test] sendMessage.calls:', JSON.stringify(calls, null, 2));

    // Determine whether system would send: if result.sent > 0 or calls length > 0
    const willSend = (result.sent || calls.length) > 0;
    console.log(`[test] sistema vai enviar mensagens via WhatsApp? ${willSend ? 'SIM' : 'NAO'}`);
    return { result, calls, willSend };
  } finally {
    // restore
    (whatsAppSessionService as any).sendMessage = originalSend;
    // cleanup test data
    try { await clientRef.delete(); } catch (e) { /* ignore */ }
    try { await automationRef.delete(); } catch (e) { /* ignore */ }
  }
}

if (process.argv.length < 3) {
  console.error('Usage: node --import tsx scripts/test-whatsapp-reminder-today.ts <userId> [limit]');
  process.exit(2);
}

const userId = process.argv[2];
const limit = process.argv[3] ? Number(process.argv[3]) : 50;

void run(userId, limit).then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
