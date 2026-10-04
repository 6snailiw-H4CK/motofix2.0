import 'dotenv/config';
import { adminAuth, adminDb, firebaseAdminInitialized } from '../server/firebaseAdmin';

type ClientDocument = Record<string, unknown>;

const argumentsList = process.argv.slice(2);
const optionValue = (name: string) => {
  const position = argumentsList.indexOf(name);
  return position >= 0 ? argumentsList[position + 1]?.trim() || null : null;
};

const email = optionValue('--email');
const apply = argumentsList.includes('--apply');

const usage = () => {
  console.log('Uso: npx tsx scripts/normalize-legacy-clients.ts --email usuario@exemplo.com [--apply]');
  console.log('Sem --apply, o script apenas mostra as alteracoes propostas (dry-run).');
};

const asText = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback;

const asNumberInRange = (value: unknown, fallback: number, minimum: number, maximum: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
};

const statusFromDate = (nextMaintenanceDate: string) => {
  if (!nextMaintenanceDate) return 'OK' as const;
  const date = new Date(nextMaintenanceDate);
  if (!Number.isFinite(date.getTime())) return 'OK' as const;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  const daysUntil = Math.round((date.getTime() - today.getTime()) / 86_400_000);
  if (daysUntil < 0) return 'OVERDUE' as const;
  return daysUntil <= 3 ? 'WARNING' as const : 'OK' as const;
};

const normalizeClient = (userId: string, data: ClientDocument) => {
  const nextMaintenanceDate = asText(data.nextMaintenanceDate);
  const currentStatus = asText(data.status);
  const allowedStatus = ['OK', 'WARNING', 'OVERDUE'].includes(currentStatus);
  const now = new Date().toISOString();

  const patch: ClientDocument = {};
  if (data.userId !== userId) patch.userId = userId;
  if (typeof data.name !== 'string') patch.name = asText(data.clientName || data.fullName);
  if (typeof data.bikeModel !== 'string') patch.bikeModel = asText(data.bike || data.motorcycleModel);
  if (typeof data.contact !== 'string') patch.contact = asText(data.phone || data.telefone);
  if (typeof data.lastMaintenanceDate !== 'string') patch.lastMaintenanceDate = asText(data.lastServiceDate);
  if (typeof data.nextMaintenanceDate !== 'string') patch.nextMaintenanceDate = '';
  if (!Number.isFinite(Number(data.recurrenceDays)) || Number(data.recurrenceDays) < 0 || Number(data.recurrenceDays) > 3650) {
    patch.recurrenceDays = 30;
  }
  if (!allowedStatus) patch.status = statusFromDate(nextMaintenanceDate);
  if (typeof data.createdAt !== 'string' || !data.createdAt) patch.createdAt = asText(data.updatedAt, now);

  return patch;
};

const run = async () => {
  if (!email) {
    usage();
    process.exitCode = 1;
    return;
  }
  if (!firebaseAdminInitialized || !adminAuth || !adminDb) {
    throw new Error('Firebase Admin nao foi inicializado. Configure FIREBASE_SERVICE_ACCOUNT_PATH ou Application Default Credentials.');
  }

  const user = await adminAuth.getUserByEmail(email);
  const clientsSnapshot = await adminDb.collection('users').doc(user.uid).collection('clients').get();
  const candidates = clientsSnapshot.docs.map((clientDocument) => ({
    id: clientDocument.id,
    patch: normalizeClient(user.uid, clientDocument.data()),
  })).filter(({ patch }) => Object.keys(patch).length > 0);

  console.log(`${apply ? 'Aplicando' : 'Simulando'} normalizacao para ${email}: ${candidates.length} de ${clientsSnapshot.size} cliente(s) precisam de ajuste.`);
  candidates.forEach(({ id, patch }) => console.log(`- ${id}: ${Object.keys(patch).join(', ')}`));

  if (!apply || candidates.length === 0) return;

  const batchSize = 400;
  for (let offset = 0; offset < candidates.length; offset += batchSize) {
    const batch = adminDb.batch();
    candidates.slice(offset, offset + batchSize).forEach(({ id, patch }) => {
      batch.set(adminDb.collection('users').doc(user.uid).collection('clients').doc(id), patch, { merge: true });
    });
    await batch.commit();
  }

  console.log(`Normalizacao concluida: ${candidates.length} cliente(s) atualizados.`);
};

void run().catch((error) => {
  console.error('Falha na normalizacao de clientes legados:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
