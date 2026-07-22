import type { Firestore } from 'firebase-admin/firestore';
import { whatsappStore } from './whatsapp/whatsappStore';
import { whatsAppAiService } from './whatsapp/WhatsAppAiService';
import { whatsAppSessionService } from './whatsapp/WhatsAppSessionService';
import type { WhatsAppStoreContext } from './whatsapp/types';

const DEFAULT_WHATSAPP_TEMPLATE = "Ola {client}, sua {bike} esta agendada para manutencao em {date}. Nos vemos la!";

const dateOnly = (date = new Date()) => date.toISOString().slice(0, 10);
const parseReminderDate = (value?: string | null) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const parsed = new Date(raw.length <= 10 ? `${raw}T00:00:00.000Z` : raw);
  if (!Number.isFinite(parsed.getTime())) return null;
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
};
const isSameReminderDay = (value: string | undefined, day: string) => {
  const parsed = parseReminderDate(value);
  return parsed ? dateOnly(parsed) === day : false;
};

const formatReminderDate = (value?: string) => {
  const parsed = parseReminderDate(value);
  if (!parsed) return 'em breve';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(parsed);
};

const buildReminderMessage = (template: string, client: any) => (
  template
    .replace(/{client}/g, client.name || 'cliente')
    .replace(/{bike}/g, client.bikeModel || 'moto')
    .replace(/{date}/g, formatReminderDate(client.nextMaintenanceDate))
);

const getReminderPhone = (client: any) => (client.contact || client.phone || client.whatsapp || '');
const getLastReminderDate = (client: any) => (client.automation?.lastAlertDate || client.lastAlertDate);

const isReminderEligible = (client: any, today: string) => {
  if (client.deletedAt) return false;
  if (client.notificacaoStatus === 'concluido' && isSameReminderDay(getLastReminderDate(client), today)) return false;
  if (client.status !== 'WARNING' && client.status !== 'OVERDUE') return false;
  if (isSameReminderDay(getLastReminderDate(client), today)) return false;
  const nextEligibleAt = parseReminderDate(client.automation?.nextSendEligibleAt);
  if (nextEligibleAt && dateOnly(nextEligibleAt) > today) return false;
  return true;
};

const loadReminderTemplate = async (context: WhatsAppStoreContext, userId: string) => {
  const snapshot = await context.db.collection('users').doc(userId).collection('settings').doc('config').get();
  const template = snapshot.data()?.whatsappTemplate;
  return typeof template === 'string' && template.trim() ? template.trim() : DEFAULT_WHATSAPP_TEMPLATE;
};

const loadReminderClients = async (context: WhatsAppStoreContext, userId: string) => {
  const snapshot = await context.db.collection('users').doc(userId).collection('clients').get();
  return snapshot.docs.map((d): Record<string, any> => ({ id: d.id, ...d.data() }));
};

const saveReminderLog = async (context: WhatsAppStoreContext, userId: string, client: any, message: string, status: 'sent' | 'failed', error?: string) => {
  const now = new Date().toISOString();
  const payload = {
    clientId: client.id,
    clientName: client.name || 'Cliente sem nome',
    bikeModel: client.bikeModel,
    phone: getReminderPhone(client),
    channel: 'whatsapp',
    status,
    trigger: 'scheduled',
    message,
    createdAt: now,
    sentAt: status === 'sent' ? now : undefined,
    error: error || null,
    userId,
  } as any;
  await context.db.collection('users').doc(userId).collection('message_logs').doc().set(payload);
};

const updateReminderSuccess = async (context: WhatsAppStoreContext, userId: string, client: any, sentAt: string) => {
  const sentDate = dateOnly(new Date(sentAt));
  const sendAttempts = Number(client.automation?.sendAttempts || 0) + 1;
  const payload = {
    lastAlertDate: sentDate,
    notificacao_enviada: true,
    notificacaoStatus: 'concluido',
    automation: {
      ...client.automation,
      lastAlertDate: sentDate,
      lastSendAt: sentAt,
      lastSendStatus: 'sent',
      lastSendChannel: 'whatsapp',
      sendAttempts,
      lastError: null,
    },
  };
  await context.db.collection('users').doc(userId).collection('clients').doc(client.id).update(payload);
};

const updateReminderFailure = async (context: WhatsAppStoreContext, userId: string, client: any, failedAt: string, error: string) => {
  const sendAttempts = Number(client.automation?.sendAttempts || 0) + 1;
  const payload = {
    notificacao_enviada: false,
    notificacaoStatus: 'pendente',
    automation: {
      ...client.automation,
      lastSendAt: failedAt,
      lastSendStatus: 'failed',
      lastSendChannel: 'whatsapp',
      sendAttempts,
      lastError: error,
    },
  } as any;
  await context.db.collection('users').doc(userId).collection('clients').doc(client.id).update(payload);
};

export const sendDueRemindersForUser = async (db: Firestore, userId: string, limit = 50) => {
  const context = { db } as unknown as WhatsAppStoreContext;
  const automation = await whatsappStore.getAutomation(context, userId);
  if (!automation.enabled || !automation.appointmentEnabled) {
    return { checked: 0, eligible: 0, sent: 0, failed: 0, skipped: 0, failures: [], runAt: new Date().toISOString() };
  }

  const runAt = new Date().toISOString();
  const today = dateOnly(new Date(runAt));
  const template = await loadReminderTemplate(context, userId);
  const clients = await loadReminderClients(context, userId);
  const eligibleClients = clients.filter((client) => isReminderEligible(client, today)).sort((a, b) => String(a.nextMaintenanceDate || '').localeCompare(String(b.nextMaintenanceDate || '')));
  const limitedClients = eligibleClients.slice(0, limit);
  const failures: any[] = [];
  let sent = 0;

  for (const client of limitedClients) {
    const clientName = client.name || 'Cliente sem nome';
    const phone = getReminderPhone(client);
    const message = buildReminderMessage(template, client);

    if (!phone.trim()) {
      const error = 'Telefone nao informado.';
      failures.push({ clientId: client.id, clientName, error });
      await saveReminderLog(context, userId, client, message, 'failed', error);
      await updateReminderFailure(context, userId, client, runAt, error);
      continue;
    }

    try {
      await whatsAppSessionService.sendMessage(context, userId, { to: phone, text: message });
      await saveReminderLog(context, userId, client, message, 'sent');
      await updateReminderSuccess(context, userId, client, runAt);
      sent += 1;
    } catch (error) {
      const messageText = error instanceof Error ? error.message : 'Falha ao enviar lembrete.';
      failures.push({ clientId: client.id, clientName, error: messageText });
      await saveReminderLog(context, userId, client, message, 'failed', messageText);
      await updateReminderFailure(context, userId, client, runAt, messageText);
    }
  }

  const failed = failures.length;
  return {
    checked: clients.length,
    eligible: eligibleClients.length,
    sent,
    failed,
    skipped: Math.max(0, clients.length - sent - failed),
    failures,
    runAt,
  };
};

export const startWhatsAppScheduler = (options: { db: Firestore | null; enabled?: boolean; intervalMs?: number; batchLimit?: number }) => {
  const enabled = options.enabled ?? process.env.WHATSAPP_SCHEDULER_ENABLED !== 'false';
  if (!enabled || process.env.NODE_ENV === 'test') return undefined;
  if (!options.db) {
    console.warn('⚠️ Scheduler WhatsApp desativado: Firestore nao fornecido.');
    return undefined;
  }

  const intervalMs = Number(process.env.WHATSAPP_SCHEDULER_INTERVAL_MS || options.intervalMs || 24 * 60 * 60 * 1000);
  const batchLimit = Number(process.env.WHATSAPP_REMINDERS_BATCH_LIMIT || options.batchLimit || 50);

  const runOnce = async () => {
    try {
      const usersSnapshot = await options.db!.collection('users').get();
      for (const doc of usersSnapshot.docs) {
        const userId = doc.id;
        const session = await whatsappStore.getSession({ db: options.db! } as any, userId);
        const automation = await whatsappStore.getAutomation({ db: options.db! } as any, userId);
        if (!automation.enabled || !automation.appointmentEnabled) continue;
        if (!session || !session.connected) continue;
        try {
          const result = await sendDueRemindersForUser(options.db!, userId, batchLimit);
          console.log(`[whatsapp-scheduler] reminders for ${userId}: sent=${result.sent} eligible=${result.eligible}`);
        } catch (error) {
          console.error('[whatsapp-scheduler] erro ao processar lembretes para', userId, error instanceof Error ? error.message : error);
        }
      }
    } catch (error) {
      console.error('[whatsapp-scheduler] erro geral:', error instanceof Error ? error.message : error);
    }
  };

  void runOnce();
  const timer = setInterval(() => { void runOnce(); }, intervalMs);
  return () => clearInterval(timer);
};
