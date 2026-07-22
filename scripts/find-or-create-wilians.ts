import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serviceAccountPath = path.resolve(__dirname, '..', 'firebase-service-account.json');
const raw = fs.readFileSync(serviceAccountPath, 'utf8');
const serviceAccount = JSON.parse(raw);
try { (admin as any).initializeApp({ credential: (admin as any).cert(serviceAccount) }); } catch (e) { /* ignore */ }
const db = getFirestore();

const userId = process.argv[2];
if (!userId) {
  console.error('Usage: node --import tsx scripts/find-or-create-wilians.ts <userId> [phone]');
  process.exit(2);
}

const phoneArg = process.argv[3] || '+5511999999999';

async function run() {
  const clientsRef = db.collection('users').doc(userId).collection('clients');
  const snapshot = await clientsRef.get();
  const q = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as any));
  const found = q.find(c => typeof c.name === 'string' && c.name.toLowerCase().includes('wilians'));
  if (found) {
    console.log('Cliente encontrado:', JSON.stringify(found, null, 2));
    return;
  }

  const clientId = `wilians-test-${Date.now().toString(36)}`;
  const today = new Date().toISOString().slice(0,10);
  const payload = {
    name: 'WILIANS BARBOSA',
    phone: phoneArg,
    status: 'WARNING',
    nextMaintenanceDate: today,
    automation: {},
    createdAt: new Date().toISOString(),
  } as any;

  await clientsRef.doc(clientId).set(JSON.parse(JSON.stringify(payload)));
  const created = await clientsRef.doc(clientId).get();
  console.log('Cliente criado:', JSON.stringify({ id: created.id, ...created.data() }, null, 2));
}

void run().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
