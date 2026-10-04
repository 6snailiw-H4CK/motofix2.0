import 'dotenv/config';
import admin from 'firebase-admin';
import fs from 'node:fs';
import path from 'node:path';

const serviceAccountPath = path.resolve(process.cwd(), process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './firebase-service-account.json');
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
const app = admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
console.log('admin initialized', app.name);
const db = admin.firestore();
console.log('firestore ok', typeof db.collection);
