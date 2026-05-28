import { useCallback, useEffect } from 'react';
import type { User } from 'firebase/auth';
import { clientRepository } from '../services/clientRepository';
import type { Client, MaintenanceStatus } from '../types';

type UseClientStatusSyncParams = {
  clients: Client[];
  getStatus: (nextDateStr?: string) => MaintenanceStatus;
  user: User | null;
};

const statusSyncIntervalMs = 300000;

export const useClientStatusSync = ({
  clients,
  getStatus,
  user,
}: UseClientStatusSyncParams) => {
  const syncStatuses = useCallback(async () => {
    if (!user?.uid) return;

    for (const client of clients) {
      if (!client.nextMaintenanceDate) continue;

      const currentStatus = getStatus(client.nextMaintenanceDate);
      if (currentStatus === client.status) continue;

      try {
        await clientRepository.update(user.uid, client.id, { status: currentStatus });
      } catch (error) {
        console.error('Erro ao atualizar status do cliente', client.id, error);
      }
    }
  }, [clients, getStatus, user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;

    void syncStatuses();
    const interval = window.setInterval(() => {
      void syncStatuses();
    }, statusSyncIntervalMs);

    return () => window.clearInterval(interval);
  }, [syncStatuses, user?.uid]);
};
