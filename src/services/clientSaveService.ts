import { addDays, format, parseISO } from 'date-fns';
import { DEFAULT_SERVICE_TYPES } from '../constants/appDefaults';
import type { Client, MaintenanceRecord, MaintenanceStatus } from '../types';
import { canonicalServiceType } from '../lib/serviceTypes';
import { clientRepository } from './clientRepository';
import { maintenanceRepository } from './maintenanceRepository';

type PaymentStatus = NonNullable<Client['statusPagamento']>;

export type ClientSaveData = Partial<Client> & {
  serviceType?: string;
  serviceValue?: number;
  statusPagamento?: string;
  valorPago?: number;
  notes?: string;
  _createNewMaintenance?: boolean;
  _scheduleProfile?: boolean;
};

type SaveClientParams = {
  userId: string;
  clientData: ClientSaveData;
  editingClient: Client | null;
  clients: Client[];
  maintenances: MaintenanceRecord[];
  getStatus: (nextDateStr?: string) => MaintenanceStatus;
};

type SaveClientResult = {
  message: string;
};

const normalizeClientName = (name: string): string => name.toLowerCase().trim();

const defaultIsoDate = () => format(new Date(), "yyyy-MM-dd'T'HH:mm:ss'Z'");

const defaultServiceType = canonicalServiceType(DEFAULT_SERVICE_TYPES[0]) || 'Troca de \u00d3leo';

const defaultServiceNotes = 'Serviço registrado via formulário.';

export const saveClientWithMaintenance = async ({
  userId,
  clientData,
  editingClient,
  clients,
  maintenances,
  getStatus,
}: SaveClientParams): Promise<SaveClientResult> => {
  const scheduleProfile = Boolean(clientData._scheduleProfile);
  const shouldCreateNewMaintenance = Boolean(clientData._createNewMaintenance && editingClient && clientData.serviceType && !scheduleProfile);
  const serviceType = canonicalServiceType(clientData.serviceType || defaultServiceType) || defaultServiceType;

  if (!editingClient && clientData.name) {
    const normalizedNewName = normalizeClientName(clientData.name);
    const potentialDuplicate = clients.find(c => normalizeClientName(c.name) === normalizedNewName);
    if (potentialDuplicate) {
      console.warn(`Possivel cliente duplicado encontrado: "${potentialDuplicate.name}". Prosseguindo com nova entrada...`);
    }
  }

  const lastDate = scheduleProfile && editingClient?.lastMaintenanceDate
    ? editingClient.lastMaintenanceDate
    : (clientData.lastMaintenanceDate || defaultIsoDate());
  const recurrence = scheduleProfile && editingClient
    ? (editingClient.recurrenceDays ?? 29)
    : (clientData.recurrenceDays || 29);
  const nextDate = format(addDays(parseISO(lastDate), recurrence), "yyyy-MM-dd'T'HH:mm:ss'Z'");

  let serviceValue = clientData.serviceValue || clientData.oilPrice || 0;
  let statusPg = (clientData.statusPagamento || 'Pago') as PaymentStatus;
  let valorPago = Number(clientData.valorPago);
  if (Number.isNaN(valorPago)) valorPago = 0;

  if (scheduleProfile && editingClient) {
    serviceValue = editingClient.lastServiceValue ?? editingClient.serviceValue ?? editingClient.oilPrice ?? 0;
    statusPg = (editingClient.statusPagamento || 'Pago') as PaymentStatus;
    valorPago = Number(editingClient.valorPago);
    if (Number.isNaN(valorPago)) valorPago = 0;
  } else if (scheduleProfile && !editingClient) {
    serviceValue = 0;
    statusPg = 'Pago';
    valorPago = 0;
  }

  if (statusPg === 'Pago' && valorPago === 0 && serviceValue > 0) {
    valorPago = serviceValue;
  }
  const saldoDevedor = Math.max(0, serviceValue - valorPago);

  const plateRaw = (clientData.vehiclePlate ?? editingClient?.vehiclePlate ?? '').trim();
  const kmFromPayload = clientData.mileageKm !== undefined && clientData.mileageKm !== null
    ? Number(clientData.mileageKm)
    : NaN;
  const mileageKm = Number.isFinite(kmFromPayload) ? kmFromPayload : editingClient?.mileageKm;

  const finalClientData: Record<string, unknown> = {
    name: clientData.name,
    bikeModel: clientData.bikeModel,
    contact: clientData.contact,
    email: (clientData.email ?? editingClient?.email ?? '').trim(),
    vehiclePlate: plateRaw ? plateRaw.toUpperCase() : '',
    oilType: scheduleProfile && editingClient
      ? (editingClient.oilType || '')
      : scheduleProfile && !editingClient
        ? '10W30'
        : (clientData.oilType || ''),
    oilPrice: scheduleProfile && editingClient
      ? (editingClient.oilPrice ?? 0)
      : scheduleProfile && !editingClient
        ? 0
        : (clientData.oilPrice || 0),
    userId,
    lastMaintenanceDate: lastDate,
    nextMaintenanceDate: nextDate,
    recurrenceDays: recurrence,
    isRecurringRevenue: scheduleProfile && editingClient
      ? (editingClient.isRecurringRevenue ?? true)
      : scheduleProfile && !editingClient
        ? true
        : (clientData.isRecurringRevenue || false),
    status: getStatus(nextDate),
    notificacao_enviada: clientData.notificacao_enviada || false,
    notificacaoStatus: clientData.notificacaoStatus || 'pendente',
    lastServiceType: scheduleProfile && editingClient
      ? (canonicalServiceType(editingClient.lastServiceType || defaultServiceType) || defaultServiceType)
      : scheduleProfile && !editingClient
        ? defaultServiceType
        : serviceType,
    lastServiceValue: serviceValue,
    serviceValue,
    lastServiceNotes: clientData.notes !== undefined && clientData.notes !== null
      ? clientData.notes
      : (scheduleProfile && editingClient ? (editingClient.lastServiceNotes || '') : defaultServiceNotes),
    lastAlertDate: clientData.lastAlertDate || '',
    statusPagamento: scheduleProfile && editingClient
      ? (editingClient.statusPagamento || 'Pago')
      : scheduleProfile && !editingClient
        ? 'Pago'
        : (clientData.statusPagamento || 'Pago'),
    valorPago,
    saldoDevedor,
    createdAt: clientData.createdAt || defaultIsoDate(),
  };

  if (Number.isFinite(mileageKm)) {
    finalClientData.mileageKm = mileageKm;
  }

  let clientId: string;
  if (editingClient) {
    await clientRepository.update(userId, editingClient.id, finalClientData);
    clientId = editingClient.id;
  } else {
    clientId = await clientRepository.create(userId, finalClientData);
  }

  if (clientData.serviceType && !editingClient) {
    await maintenanceRepository.create(userId, {
      clientId,
      clientName: clientData.name,
      bikeModel: clientData.bikeModel,
      date: lastDate,
      oilType: clientData.oilType || 'N/A',
      oilPrice: clientData.oilPrice || 0,
      serviceType,
      serviceValue,
      isRecurringRevenue: clientData.isRecurringRevenue || false,
      notes: clientData.notes || defaultServiceNotes,
      statusPagamento: clientData.statusPagamento || 'Pago',
      valorPago,
      saldoDevedor,
      userId,
    });
    return { message: 'Serviço registrado com sucesso!' };
  }

  if (shouldCreateNewMaintenance) {
    await maintenanceRepository.create(userId, {
      clientId,
      clientName: clientData.name || editingClient?.name || '',
      bikeModel: clientData.bikeModel || editingClient?.bikeModel || '',
      date: lastDate,
      oilType: clientData.oilType || editingClient?.oilType || 'N/A',
      oilPrice: clientData.oilPrice || 0,
      serviceType,
      serviceValue,
      isRecurringRevenue: clientData.isRecurringRevenue || false,
      notes: clientData.notes || defaultServiceNotes,
      statusPagamento: clientData.statusPagamento || 'Pago',
      valorPago,
      saldoDevedor,
      userId,
    });
    return { message: 'Servico registrado com sucesso!' };
  }

  if (editingClient && clientData.serviceType) {
    const clientMaintenances = maintenances
      .filter(m => m.clientId === clientId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    if (clientMaintenances.length > 0) {
      const latestMaintenance = clientMaintenances[0];
      await maintenanceRepository.update(userId, latestMaintenance.id, {
        statusPagamento: clientData.statusPagamento || latestMaintenance.statusPagamento || 'Pago',
        valorPago,
        saldoDevedor,
        serviceValue,
        serviceType: serviceType || canonicalServiceType(latestMaintenance.serviceType),
        notes: clientData.notes !== undefined && clientData.notes !== null
          ? clientData.notes
          : latestMaintenance.notes,
        oilType: clientData.oilType || latestMaintenance.oilType,
      });
    } else {
      await maintenanceRepository.create(userId, {
        clientId,
        clientName: clientData.name || editingClient?.name || '',
        bikeModel: clientData.bikeModel || editingClient?.bikeModel || '',
        date: lastDate,
        oilType: clientData.oilType || editingClient?.oilType || 'N/A',
        oilPrice: clientData.oilPrice || 0,
        serviceType,
        serviceValue,
        isRecurringRevenue: clientData.isRecurringRevenue || editingClient?.isRecurringRevenue || false,
        notes: clientData.notes || defaultServiceNotes,
        statusPagamento: clientData.statusPagamento || 'Pago',
        valorPago,
        saldoDevedor,
        userId,
      });
    }
    return { message: 'Cliente e pagamento atualizados com sucesso!' };
  }

  return { message: 'Cliente atualizado com sucesso!' };
};
