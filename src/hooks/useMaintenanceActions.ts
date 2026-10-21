import { addDays, format, parseISO } from 'date-fns';
import type { User } from 'firebase/auth';
import { useCallback, useRef, useState } from 'react';
import { toast as sonnerToast } from 'sonner';
import { canonicalServiceType } from '../lib/serviceTypes';
import { clientRepository } from '../services/clientRepository';
import { handleFirestoreError, OperationType } from '../services/firestoreError';
import { maintenanceRepository } from '../services/maintenanceRepository';
import { getFirestoreSaveResultMessage } from '../services/firestoreSaveStatus';
import { recordOperationalLog } from '../services/operationalLogRepository';
import type { Client, MaintenanceRecord, MaintenanceStatus } from '../types';

type UseMaintenanceActionsParams = {
  clients: Client[];
  defaultServiceType: string;
  getStatus: (nextDateStr?: string) => MaintenanceStatus;
  maintenances: MaintenanceRecord[];
  onDeleted: () => void;
  user: User | null;
  workshopName?: string;
};

const maintenanceDateFormat = "yyyy-MM-dd'T'HH:mm:ss'Z'";
const quickMaintenanceNotes = 'Manutencao periodica realizada via botao rapido.';

const sortByDateDesc = (a: MaintenanceRecord, b: MaintenanceRecord) => (
  new Date(b.date).getTime() - new Date(a.date).getTime()
);

const getPaidValue = (maintenance: MaintenanceRecord) => {
  const serviceValue = Number(maintenance.serviceValue) || 0;
  const paymentStatus = String(maintenance.statusPagamento || 'Pago').trim().toLowerCase();
  if (paymentStatus === 'pago') return serviceValue;
  if (maintenance.valorPago !== undefined && maintenance.valorPago !== null) {
    const paidValue = Number(maintenance.valorPago);
    if (Number.isFinite(paidValue)) return paidValue;
  }
  return 0;
};

const getDebtValue = (maintenance: MaintenanceRecord) => {
  const paymentStatus = String(maintenance.statusPagamento || 'Pago').trim().toLowerCase();
  if (paymentStatus === 'pago') return 0;
  const storedDebt = Number(maintenance.saldoDevedor);
  if (Number.isFinite(storedDebt)) return storedDebt;
  return Math.max(0, (Number(maintenance.serviceValue) || 0) - getPaidValue(maintenance));
};

export const useMaintenanceActions = ({
  clients,
  defaultServiceType,
  getStatus,
  maintenances,
  onDeleted,
  user,
  workshopName,
}: UseMaintenanceActionsParams) => {
  const [processingId, setProcessingId] = useState<string | null>(null);
  const quickMaintenanceLocks = useRef(new Set<string>());
  const completedQuickMaintenances = useRef(new Map<string, string>());

  const addMaintenance = useCallback(async (
    client: Client,
    date: string = format(new Date(), maintenanceDateFormat)
  ) => {
    if (!user?.uid || !client?.id || quickMaintenanceLocks.current.has(client.id)) return;

    const previousCompletionDate = completedQuickMaintenances.current.get(client.id);
    if (previousCompletionDate !== undefined && client.lastMaintenanceDate === previousCompletionDate) {
      sonnerToast.error('Este servico ja foi enviado. Aguarde a sincronizacao para evitar um lancamento duplicado.');
      return;
    }
    if (previousCompletionDate !== undefined) completedQuickMaintenances.current.delete(client.id);

    if (client?.status === 'OK') {
      sonnerToast.error(`O servico para ${client?.name} ja foi registrado recentemente.`);
      return;
    }

    quickMaintenanceLocks.current.add(client.id);
    setProcessingId(client.id);
    const previousDate = client.lastMaintenanceDate || '';
    const nextDate = format(addDays(parseISO(date), client?.recurrenceDays || 30), maintenanceDateFormat);
    const serviceValue = client?.lastServiceValue || client?.oilPrice || 0;
    const serviceType = canonicalServiceType(client?.lastServiceType || defaultServiceType);

    try {
      const { maintenanceId } = await clientRepository.saveWithMaintenance(
        user.uid,
        {
          operation: 'update',
          id: client.id,
          data: {
            lastMaintenanceDate: date,
            nextMaintenanceDate: nextDate,
            status: getStatus(nextDate),
            notificacao_enviada: false,
            notificacaoStatus: 'pendente',
            lastServiceType: serviceType,
            lastServiceValue: serviceValue,
            serviceValue,
            statusPagamento: 'Pago',
            valorPago: serviceValue,
            saldoDevedor: 0,
            lastServiceNotes: quickMaintenanceNotes,
          },
        },
        {
          operation: 'create',
          data: {
            clientId: client.id,
            clientName: client.name,
            bikeModel: client.bikeModel,
            date,
            oilType: client.oilType,
            oilPrice: client.oilPrice || 0,
            serviceType,
            serviceValue,
            isRecurringRevenue: client.isRecurringRevenue || false,
            statusPagamento: 'Pago',
            valorPago: serviceValue,
            saldoDevedor: 0,
            userId: user.uid,
            notes: quickMaintenanceNotes,
          },
        },
      );

      completedQuickMaintenances.current.set(client.id, previousDate);
      sonnerToast.success(getFirestoreSaveResultMessage(`Serviço de ${client.name} confirmado com sucesso!`));
      recordOperationalLog({
        userId: user.uid,
        usuario: user.email,
        oficina: workshopName,
        acao: 'receita_criada',
        targetId: maintenanceId,
        details: { clientName: client.name, serviceType, value: serviceValue },
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'maintenances/clients');
      sonnerToast.error('Erro ao confirmar servico.');
    } finally {
      quickMaintenanceLocks.current.delete(client.id);
      setProcessingId(null);
    }
  }, [defaultServiceType, getStatus, user, workshopName]);

  const deleteMaintenance = useCallback(async (target: string | MaintenanceRecord) => {
    if (!user?.uid) return;

    const id = typeof target === 'string' ? target : target.id;
    const targetMaintenance = typeof target === 'string'
      ? maintenances.find((maintenance) => maintenance.id === target)
      : target;

    if (!id) return;

    try {
      setProcessingId(id);
      await maintenanceRepository.remove(user.uid, id);

      if (targetMaintenance?.clientId) {
        const client = clients.find((item) => item.id === targetMaintenance.clientId);

        if (client) {
          const remainingMaintenances = maintenances
            .filter((maintenance) => (
              maintenance.clientId === targetMaintenance.clientId
              && maintenance.id !== targetMaintenance.id
            ))
            .sort(sortByDateDesc);
          const latestMaintenance = remainingMaintenances[0];

          if (latestMaintenance) {
            const recurrenceDays = client.recurrenceDays || 30;
            const nextDate = format(addDays(parseISO(latestMaintenance.date), recurrenceDays), maintenanceDateFormat);
            const serviceValue = Number(latestMaintenance.serviceValue) || 0;
            const valorPago = getPaidValue(latestMaintenance);
            const saldoDevedor = getDebtValue(latestMaintenance);

            await clientRepository.update(user.uid, client.id, {
              lastMaintenanceDate: latestMaintenance.date,
              nextMaintenanceDate: nextDate,
              status: getStatus(nextDate),
              notificacao_enviada: false,
              notificacaoStatus: 'pendente',
              oilType: latestMaintenance.oilType || client.oilType || '',
              oilPrice: latestMaintenance.oilPrice ?? client.oilPrice ?? 0,
              isRecurringRevenue: latestMaintenance.isRecurringRevenue || false,
              lastServiceType: canonicalServiceType(latestMaintenance.serviceType || defaultServiceType),
              lastServiceValue: serviceValue,
              serviceValue,
              lastServiceNotes: latestMaintenance.notes || '',
              statusPagamento: latestMaintenance.statusPagamento || 'Pago',
              valorPago,
              saldoDevedor,
            });
          } else {
            await clientRepository.update(user.uid, client.id, {
              lastMaintenanceDate: '',
              nextMaintenanceDate: '',
              status: 'OK',
              notificacao_enviada: false,
              notificacaoStatus: 'pendente',
              lastServiceType: '',
              lastServiceValue: 0,
              serviceValue: 0,
              lastServiceNotes: '',
              statusPagamento: 'Pago',
              valorPago: 0,
              saldoDevedor: 0,
            });
          }
        }
      }

      sonnerToast.success(getFirestoreSaveResultMessage('Serviço removido. Cadastro do cliente preservado.'));
      onDeleted();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'maintenances');
      sonnerToast.error('Erro ao excluir servico.');
    } finally {
      setProcessingId(null);
    }
  }, [clients, defaultServiceType, getStatus, maintenances, onDeleted, user]);

  const deleteLegacyService = useCallback(async (client: Client) => {
    if (!user?.uid || !client.id) return;

    try {
      setProcessingId(`legacy-service:${client.id}`);
      await clientRepository.update(user.uid, client.id, {
        lastMaintenanceDate: '',
        nextMaintenanceDate: '',
        status: 'OK',
        notificacao_enviada: false,
        notificacaoStatus: 'pendente',
        lastServiceType: '',
        lastServiceValue: 0,
        lastServiceNotes: '',
        serviceValue: 0,
        statusPagamento: 'Pago',
        valorPago: 0,
        saldoDevedor: 0,
      });

      sonnerToast.success(getFirestoreSaveResultMessage('Registro antigo removido. Cadastro do cliente preservado.'));
      onDeleted();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'clients');
      sonnerToast.error('Erro ao excluir o registro antigo.');
    } finally {
      setProcessingId(null);
    }
  }, [onDeleted, user]);

  const confirmPayment = useCallback(async (
    maintenanceId: string | undefined,
    maintenance: MaintenanceRecord | undefined
  ) => {
    if (!user?.uid || !maintenanceId || !maintenance) {
      sonnerToast.error('Erro: Dados incompletos para confirmacao');
      return;
    }

    try {
      setProcessingId(maintenanceId);
      await maintenanceRepository.update(user.uid, maintenanceId, {
        statusPagamento: 'Pago',
        valorPago: maintenance.serviceValue || 0,
        saldoDevedor: 0,
      });
      sonnerToast.success(getFirestoreSaveResultMessage('Pagamento confirmado!'));
    } catch (error) {
      console.error('confirmPayment error:', error);
      handleFirestoreError(error, OperationType.UPDATE, 'maintenances');
    } finally {
      setProcessingId(null);
    }
  }, [user]);

  const settleDebt = useCallback(async (
    maintenanceId: string | undefined,
    maintenance: MaintenanceRecord | undefined
  ) => {
    if (!user?.uid || !maintenanceId || !maintenance) {
      sonnerToast.error('Erro: Dados incompletos para quitacao');
      return;
    }

    try {
      setProcessingId(maintenanceId);
      const newValorPago = Math.min(
        maintenance.serviceValue || 0,
        (maintenance.valorPago || 0) + (maintenance.saldoDevedor || 0)
      );

      await maintenanceRepository.update(user.uid, maintenanceId, {
        statusPagamento: 'Pago',
        valorPago: newValorPago,
        saldoDevedor: Math.max(0, (maintenance.serviceValue || 0) - newValorPago),
      });
      sonnerToast.success(getFirestoreSaveResultMessage('Débito quitado com sucesso!'));
    } catch (error) {
      console.error('settleDebt error:', error);
      handleFirestoreError(error, OperationType.UPDATE, 'maintenances');
    } finally {
      setProcessingId(null);
    }
  }, [user]);

  return {
    addMaintenance,
    confirmPayment,
    deleteMaintenance,
    deleteLegacyService,
    processingId,
    settleDebt,
  };
};
