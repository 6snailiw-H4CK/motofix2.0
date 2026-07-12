import { addDays, format, parseISO } from 'date-fns';
import { DEFAULT_SERVICE_TYPES } from '../constants/appDefaults';
import type { Client, MaintenanceRecord, MaintenanceStatus } from '../types';
import { canonicalServiceType } from '../lib/serviceTypes';
import { clientRepository } from './clientRepository';

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
  clientId: string;
  operation: 'created' | 'updated';
};

type MaintenanceInput = {
  clientName?: string;
  bikeModel?: string;
  oilType?: string;
  oilPrice?: number;
  isRecurringRevenue?: boolean;
  notes?: string;
  statusPagamento?: string;
};

const normalizeClientName = (name: string): string => name.toLowerCase().trim();

const defaultIsoDate = () => format(new Date(), "yyyy-MM-dd'T'HH:mm:ss'Z'");

const defaultServiceType = canonicalServiceType(DEFAULT_SERVICE_TYPES[0]) || 'Troca de Óleo';

const defaultServiceNotes = 'Servico registrado via formulario.';

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
  const createdAt = editingClient
    ? (editingClient.createdAt || clientData.createdAt || defaultIsoDate())
    : (clientData.createdAt || defaultIsoDate());

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
    createdAt,
  };

  if (Number.isFinite(mileageKm)) {
    finalClientData.mileageKm = mileageKm;
  }

  const clientWrite = editingClient
    ? { operation: 'update' as const, id: editingClient.id, data: finalClientData }
    : { operation: 'create' as const, data: finalClientData };

  const buildMaintenanceData = (clientId: string, data: MaintenanceInput) => ({
    clientId,
    clientName: data.clientName || '',
    bikeModel: data.bikeModel || '',
    date: lastDate,
    oilType: data.oilType || 'N/A',
    oilPrice: data.oilPrice || 0,
    serviceType,
    serviceValue,
    isRecurringRevenue: data.isRecurringRevenue || false,
    notes: data.notes || defaultServiceNotes,
    statusPagamento: data.statusPagamento || 'Pago',
    valorPago,
    saldoDevedor,
    userId,
  });

  if (clientData.serviceType && !editingClient) {
    const result = await clientRepository.saveWithMaintenance(userId, clientWrite, {
      operation: 'create',
      data: (clientId) => buildMaintenanceData(clientId, {
        clientName: clientData.name,
        bikeModel: clientData.bikeModel,
        oilType: clientData.oilType,
        oilPrice: clientData.oilPrice,
        isRecurringRevenue: clientData.isRecurringRevenue,
        notes: clientData.notes,
        statusPagamento: clientData.statusPagamento,
      }),
    });
    return { message: 'Servico registrado com sucesso!', clientId: result.clientId, operation: 'created' };
  }

  if (shouldCreateNewMaintenance) {
    const result = await clientRepository.saveWithMaintenance(userId, clientWrite, {
      operation: 'create',
      data: (clientId) => buildMaintenanceData(clientId, {
        clientName: clientData.name || editingClient?.name || '',
        bikeModel: clientData.bikeModel || editingClient?.bikeModel || '',
        oilType: clientData.oilType || editingClient?.oilType,
        oilPrice: clientData.oilPrice,
        isRecurringRevenue: clientData.isRecurringRevenue,
        notes: clientData.notes,
        statusPagamento: clientData.statusPagamento,
      }),
    });
    return { message: 'Servico registrado com sucesso!', clientId: result.clientId, operation: 'updated' };
  }

  if (editingClient && clientData.serviceType) {
    const clientId = editingClient.id;
    const clientMaintenances = maintenances
      .filter(m => m.clientId === clientId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    if (clientMaintenances.length > 0) {
      const latestMaintenance = clientMaintenances[0];
      await clientRepository.saveWithMaintenance(userId, clientWrite, {
        operation: 'update',
        id: latestMaintenance.id,
        data: {
          statusPagamento: clientData.statusPagamento || latestMaintenance.statusPagamento || 'Pago',
          valorPago,
          saldoDevedor,
          serviceValue,
          serviceType: serviceType || canonicalServiceType(latestMaintenance.serviceType),
          notes: clientData.notes !== undefined && clientData.notes !== null
            ? clientData.notes
            : latestMaintenance.notes,
          oilType: clientData.oilType || latestMaintenance.oilType,
        },
      });
    } else {
      await clientRepository.saveWithMaintenance(userId, clientWrite, {
        operation: 'create',
        data: (clientId) => buildMaintenanceData(clientId, {
          clientName: clientData.name || editingClient.name || '',
          bikeModel: clientData.bikeModel || editingClient.bikeModel || '',
          oilType: clientData.oilType || editingClient.oilType,
          oilPrice: clientData.oilPrice,
          isRecurringRevenue: clientData.isRecurringRevenue || editingClient.isRecurringRevenue,
          notes: clientData.notes,
          statusPagamento: clientData.statusPagamento,
        }),
      });
    }
    return { message: 'Cliente e pagamento atualizados com sucesso!', clientId, operation: 'updated' };
  }

  if (editingClient) {
    await clientRepository.update(userId, editingClient.id, finalClientData);
    return { message: 'Cliente atualizado com sucesso!', clientId: editingClient.id, operation: 'updated' };
  }

  const clientId = await clientRepository.create(userId, finalClientData);
  return { message: 'Cliente atualizado com sucesso!', clientId, operation: 'created' };
};
