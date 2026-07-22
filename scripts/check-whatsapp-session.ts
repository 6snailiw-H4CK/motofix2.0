import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serviceAccountPath = path.resolve(__dirname, '..', 'firebase-service-account.json');
const serviceAccountRaw = fs.readFileSync(serviceAccountPath, 'utf8');
const serviceAccount = JSON.parse(serviceAccountRaw);
try {
  (admin as any).initializeApp({ credential: (admin as any).cert(serviceAccount) });
} catch (e) {
  // ignore
}

const db = getFirestore();

const userId = process.argv[2];
if (!userId) {
  console.error('Usage: node --import tsx scripts/check-whatsapp-session.ts <userId>');
  process.exit(2);
}

(async () => {
  try {
    const doc = await db.collection('users').doc(userId).collection('whatsapp_sessions').doc('primary').get();
    if (!doc.exists) {
      console.log('no session doc for', userId);
    } else {
      console.log('session doc:', JSON.stringify(doc.data(), null, 2));
    }
  } catch (err) {
    console.error('error checking session:', err instanceof Error ? err.message : err);
  } finally {
    process.exit(0);
  }
})();
