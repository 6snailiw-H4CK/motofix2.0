import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { cert, getApps, initializeApp, type ServiceAccount } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const serviceAccountPath = path.resolve(process.cwd(), process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './firebase-service-account.json');
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8')) as ServiceAccount;
const app = getApps()[0] || initializeApp({ credential: cert(serviceAccount) });
console.log('admin initialized', app.name);
const db = getFirestore(app);
console.log('firestore ok', typeof db.collection);
