import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { FieldPath, getFirestore } from 'firebase-admin/firestore';
import { cert, getApps, initializeApp } from 'firebase-admin/app';

const PAGE_SIZE = 400;
const COLLECTIONS = [
  'clients',
  'maintenances',
  'warranties',
  'appointments',
  'expenses',
  'products',
  'cash_launches',
  'message_logs',
];

const uid = process.argv.find((arg) => arg.startsWith('--uid='))?.slice('--uid='.length)?.trim();
const applyChanges = process.argv.includes('--apply');
const requestedCollections = process.argv.find((arg) => arg.startsWith('--collections='))
  ?.slice('--collections='.length)
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const collections = requestedCollections || COLLECTIONS;

if (!uid) {
  console.error('Uso: node scripts/backfill-firestore-sync-metadata.mjs --uid=<UID> [--collections=clients,maintenances] [--apply]');
  console.error('Sem --apply, o script apenas mostra quantos documentos precisam do campo updatedAt.');
  process.exit(1);
}

const invalidCollections = collections.filter((name) => !COLLECTIONS.includes(name));
if (invalidCollections.length) {
  console.error(`Colecoes nao suportadas: ${invalidCollections.join(', ')}`);
  process.exit(1);
}

const serviceAccountFile = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './firebase-service-account.json';
const serviceAccountPath = path.resolve(process.cwd(), serviceAccountFile);
if (!fs.existsSync(serviceAccountPath)) {
  console.error(`Arquivo de service account nao encontrado: ${serviceAccountPath}`);
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
const app = getApps()[0] || initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore(app);

const asIsoString = (value) => {
  if (value && typeof value.toDate === 'function') return value.toDate().toISOString();
  if (typeof value === 'string' && Number.isFinite(Date.parse(value))) return new Date(value).toISOString();
  return null;
};

const legacyTimestamp = (data) => (
  asIsoString(data.createdAt)
  || asIsoString(data.importedAt)
  || asIsoString(data.date)
  || asIsoString(data.serviceDate)
  || asIsoString(data.scheduledDate)
  || asIsoString(data.openingDate)
  || asIsoString(data.timestamp)
  || new Date().toISOString()
);

let totalMissing = 0;
let totalUpdated = 0;

for (const collectionName of collections) {
  const collectionRef = db.collection('users').doc(uid).collection(collectionName);
  let lastDocument = null;
  let missingCount = 0;
  let updatedCount = 0;

  while (true) {
    let pageQuery = collectionRef.orderBy(FieldPath.documentId()).limit(PAGE_SIZE);
    if (lastDocument) pageQuery = pageQuery.startAfter(lastDocument);
    const page = await pageQuery.get();
    if (page.empty) break;

    const missing = page.docs.filter((snapshot) => {
      const updatedAt = snapshot.get('updatedAt');
      return typeof updatedAt !== 'string' || !Number.isFinite(Date.parse(updatedAt));
    });
    missingCount += missing.length;
    totalMissing += missing.length;

    if (applyChanges && missing.length) {
      const batch = db.batch();
      missing.forEach((snapshot) => {
        batch.update(snapshot.ref, { updatedAt: legacyTimestamp(snapshot.data()) });
      });
      await batch.commit();
      updatedCount += missing.length;
      totalUpdated += missing.length;
    }

    lastDocument = page.docs[page.docs.length - 1];
    if (page.size < PAGE_SIZE) break;
  }

  console.log(`${collectionName}: ${missingCount} registro(s) sem updatedAt${applyChanges ? `; ${updatedCount} atualizado(s)` : ''}.`);
}

console.log(applyChanges
  ? `Backfill concluido: ${totalUpdated} documento(s) atualizados para o usuario informado.`
  : `Simulacao concluida: ${totalMissing} documento(s) precisam do campo updatedAt. Rode novamente com --apply para gravar.`);
