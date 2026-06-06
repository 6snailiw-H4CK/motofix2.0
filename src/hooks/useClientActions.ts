import type { User } from 'firebase/auth';
import { useCallback, useState } from 'react';
import { toast as sonnerToast } from 'sonner';
import { saveClientWithMaintenance, type ClientSaveData } from '../services/clientSaveService';
import { clientRepository } from '../services/clientRepository';
import { downloadClientsWorkbook, parseClientsWorkbook, type ClientBackupRow } from '../services/clientSpreadsheet';
import { handleFirestoreError, OperationType } from '../services/firestoreError';
import { maintenanceRepository } from '../services/maintenanceRepository';
import type { Client, MaintenanceRecord, MaintenanceStatus } from '../types';

type UseClientActionsParams = {
  clients: Client[];
  editingClient: Client | null;
  getStatus: (nextDateStr?: string) => MaintenanceStatus;
  isCreatingService: boolean;
  maintenances: MaintenanceRecord[];
  onDeleted: () => void;
  onSaved: () => void;
  user: User | null;
};

const normalizeText = (value?: string) => (value || '').toLowerCase().trim();

const parseNumber = (value?: string) => {
  if (!value) return undefined;
  const cleaned = value.replace(/[^\d,.-]/g, '');
  const hasCommaDecimal = cleaned.includes(',') && cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.');
  const normalized = hasCommaDecimal ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned.replace(/,/g, '');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parseBoolean = (value?: string) => {
  const normalized = normalizeText(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return ['sim', 's', 'true', '1', 'yes'].includes(normalized);
};

const dateOnlyToIso = (year: number, month: number, day: number) =>
  new Date(Date.UTC(year, month - 1, day, 12, 0, 0)).toISOString();

const parseBackupDate = (value?: string, fallback?: string) => {
  const raw = (value || '').trim();
  if (!raw) return fallback;

  if (/^\d+(\.\d+)?$/.test(raw)) {
    const serial = Number(raw);
    const excelEpoch = Date.UTC(1899, 11, 30);
    return new Date(excelEpoch + serial * 86400000).toISOString();
  }

  const brDate = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (brDate) {
    const day = Number(brDate[1]);
    const month = Number(brDate[2]);
    const year = Number(brDate[3].length === 2 ? `20${brDate[3]}` : brDate[3]);
    return dateOnlyToIso(year, month, day);
  }

  const isoDate = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoDate) {
    return dateOnlyToIso(Number(isoDate[1]), Number(isoDate[2]), Number(isoDate[3]));
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
};

const addDaysIso = (baseIso: string, days: number) => {
  const date = new Date(baseIso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
};

const parseStatus = (value?: string): MaintenanceStatus | null => {
  const normalized = normalizeText(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (['ok', 'ativo', 'em dia'].includes(normalized)) return 'OK';
  if (['warning', 'alerta', 'atencao'].includes(normalized)) return 'WARNING';
  if (['overdue', 'atrasado', 'vencido'].includes(normalized)) return 'OVERDUE';
  return null;
};

const compactClientData = (data: Record<string, unknown>) => (
  Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined && value !== null))
);

const safeDocumentId = (id?: string) => {
  const value = id?.trim();
  if (!value || value.includes('/')) return null;
  return value;
};

export const useClientActions = ({
  clients,
  editingClient,
  getStatus,
  isCreatingService,
  maintenances,
  onDeleted,
  onSaved,
  user,
}: UseClientActionsParams) => {
  const [isSaving, setIsSaving] = useState(false);
  const [isImportingClients, setIsImportingClients] = useState(false);

  const quickCreateClient = useCallback(async (clientData: Pick<Client, 'name'> & Partial<Pick<Client, 'contact' | 'bikeModel'>>) => {
    if (!user) return null;

    const name = clientData.name.trim();
    if (!name) {
      sonnerToast.error('Informe o nome do cliente.');
      return null;
    }

    setIsSaving(true);

    try {
      const nowIso = new Date().toISOString();
      const recurrenceDays = 30;
      const nextMaintenanceDate = addDaysIso(nowIso, recurrenceDays);
      const data = {
        name,
        contact: clientData.contact?.trim() || '',
        bikeModel: clientData.bikeModel?.trim() || '',
        oilType: '',
        oilPrice: 0,
        lastMaintenanceDate: nowIso,
        nextMaintenanceDate,
        recurrenceDays,
        status: getStatus(nextMaintenanceDate),
        isRecurringRevenue: false,
        lastServiceType: '',
        lastServiceValue: 0,
        lastServiceNotes: '',
        statusPagamento: 'Pago' as const,
        valorPago: 0,
        saldoDevedor: 0,
        userId: user.uid,
        createdAt: nowIso,
      };

      const id = await clientRepository.create(user.uid, data);
      const createdClient = { id, ...data };

      sonnerToast.success('Cliente cadastrado rapidamente.');
      onSaved();
      return createdClient;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'clients');
      sonnerToast.error('Nao foi possivel cadastrar o cliente.');
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [getStatus, onSaved, user]);

  const saveClient = useCallback(async (clientData: ClientSaveData) => {
    if (!user) return;

    setIsSaving(true);

    try {
      const result = await saveClientWithMaintenance({
        userId: user.uid,
        clientData: {
          ...clientData,
          _createNewMaintenance: isCreatingService && Boolean(editingClient),
        },
        editingClient,
        clients,
        maintenances,
        getStatus,
      });

      sonnerToast.success(result.message);
      onSaved();
    } catch (error) {
      handleFirestoreError(error, editingClient ? OperationType.UPDATE : OperationType.CREATE, 'clients');
      sonnerToast.error('Erro ao salvar dados.');
    } finally {
      setIsSaving(false);
    }
  }, [clients, editingClient, getStatus, isCreatingService, maintenances, onSaved, user]);

  const deleteClient = useCallback(async (id: string) => {
    if (!user?.uid) return;

    try {
      await maintenanceRepository.removeByClientId(user.uid, id);
      await clientRepository.remove(user.uid, id);
      onDeleted();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'clients');
    }
  }, [onDeleted, user]);

  const exportClientsBackup = useCallback(() => {
    if (clients.length === 0) {
      sonnerToast.warning('Nenhum cliente para exportar.');
      return;
    }

    downloadClientsWorkbook(clients);
    sonnerToast.success('Backup de clientes exportado em XLSX.');
  }, [clients]);

  const importClientsBackup = useCallback(async (file: File) => {
    if (!user?.uid) return;

    setIsImportingClients(true);

    try {
      const rows = await parseClientsWorkbook(file);
      if (rows.length === 0) {
        sonnerToast.warning('Nenhum cliente encontrado na planilha.');
        return;
      }

      const clientsById = new Map(clients.map(client => [client.id, client]));
      let created = 0;
      let updated = 0;
      let ignored = 0;

      const findExistingClient = (row: ClientBackupRow) => {
        const importedId = safeDocumentId(row.id);
        if (importedId && clientsById.has(importedId)) return clientsById.get(importedId);

        const rowContact = normalizeText(row.contact);
        const rowName = normalizeText(row.name);
        const rowBike = normalizeText(row.bikeModel);

        return clients.find((client) => {
          const contactMatches = rowContact && normalizeText(client.contact) === rowContact;
          const identityMatches = rowName
            && normalizeText(client.name) === rowName
            && (!rowBike || normalizeText(client.bikeModel) === rowBike);
          return Boolean(contactMatches || identityMatches);
        });
      };

      for (const row of rows) {
        const name = row.name?.trim();
        if (!name) {
          ignored += 1;
          continue;
        }

        const existingClient = findExistingClient(row);
        const recurrenceDays = Math.max(1, Math.round(parseNumber(row.recurrenceDays) || existingClient?.recurrenceDays || 30));
        const nowIso = new Date().toISOString();
        const lastMaintenanceDate = parseBackupDate(row.lastMaintenanceDate, existingClient?.lastMaintenanceDate || nowIso) || nowIso;
        const nextMaintenanceDate = parseBackupDate(
          row.nextMaintenanceDate,
          existingClient?.nextMaintenanceDate || addDaysIso(lastMaintenanceDate, recurrenceDays)
        ) || addDaysIso(lastMaintenanceDate, recurrenceDays);
        const lastServiceValue = parseNumber(row.lastServiceValue);
        const mileageKm = parseNumber(row.mileageKm);

        const data = compactClientData({
          name,
          contact: row.contact?.trim() || existingClient?.contact || '',
          bikeModel: row.bikeModel?.trim() || existingClient?.bikeModel || '',
          email: row.email?.trim() || existingClient?.email,
          vehiclePlate: row.vehiclePlate?.trim() || existingClient?.vehiclePlate,
          mileageKm: mileageKm ?? existingClient?.mileageKm,
          oilType: row.oilType?.trim() || existingClient?.oilType || '',
          oilPrice: existingClient?.oilPrice || lastServiceValue || 0,
          recurrenceDays,
          lastMaintenanceDate,
          nextMaintenanceDate,
          status: parseStatus(row.status) || getStatus(nextMaintenanceDate),
          isRecurringRevenue: row.isRecurringRevenue === undefined ? existingClient?.isRecurringRevenue || false : parseBoolean(row.isRecurringRevenue),
          lastServiceType: row.lastServiceType?.trim() || existingClient?.lastServiceType || '',
          lastServiceValue: lastServiceValue ?? existingClient?.lastServiceValue,
          lastServiceNotes: row.lastServiceNotes?.trim() || existingClient?.lastServiceNotes || '',
          userId: user.uid,
          createdAt: parseBackupDate(row.createdAt, existingClient?.createdAt || nowIso) || nowIso,
        });

        if (existingClient) {
          await clientRepository.update(user.uid, existingClient.id, data);
          updated += 1;
          continue;
        }

        const importedId = safeDocumentId(row.id);
        if (importedId) {
          await clientRepository.setWithId(user.uid, importedId, data);
        } else {
          await clientRepository.create(user.uid, data);
        }
        created += 1;
      }

      sonnerToast.success(`Importacao concluida: ${created} novo(s), ${updated} atualizado(s), ${ignored} ignorado(s).`);
    } catch (error) {
      console.error(error);
      sonnerToast.error(error instanceof Error ? error.message : 'Nao foi possivel importar a planilha.');
    } finally {
      setIsImportingClients(false);
    }
  }, [clients, getStatus, user]);

  return {
    deleteClient,
    exportClientsBackup,
    importClientsBackup,
    isImportingClients,
    isSaving,
    quickCreateClient,
    saveClient,
  };
};
