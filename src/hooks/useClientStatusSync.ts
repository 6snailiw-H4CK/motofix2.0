import { useCallback, useEffect, useRef } from 'react';
import type { User } from 'firebase/auth';
import { clientRepository } from '../services/clientRepository';
import type { Client, MaintenanceStatus } from '../types';

type UseClientStatusSyncParams = {
  clients: Client[];
  getStatus: (nextDateStr?: string) => MaintenanceStatus;
  user: User | null;
};

const statusSyncIntervalMs = 300000;

const isPermissionDenied = (error: unknown) => {
  const code = typeof error === 'object' && error && 'code' in error
    ? String((error as { code?: unknown }).code || '')
    : '';
  const message = error instanceof Error ? error.message : String(error || '');
  return code === 'permission-denied'
    || /missing or insufficient permissions|permission-denied/i.test(message);
};

export const useClientStatusSync = ({
  clients,
  getStatus,
  user,
}: UseClientStatusSyncParams) => {
  const blockedStatusSyncs = useRef(new Map<string, MaintenanceStatus>());

  const syncStatuses = useCallback(async () => {
    if (!user?.uid) return;

    for (const client of clients) {
      if (!client.nextMaintenanceDate) continue;

      const currentStatus = getStatus(client.nextMaintenanceDate);
      if (currentStatus === client.status) {
        blockedStatusSyncs.current.delete(client.id);
        continue;
      }
      if (blockedStatusSyncs.current.get(client.id) === currentStatus) continue;

      try {
        await clientRepository.update(user.uid, client.id, { status: currentStatus });
      } catch (error) {
        if (isPermissionDenied(error)) {
          // Firestore applies and then rolls back denied local writes, which triggers
          // a new snapshot. Do not retry the same permanent failure in a render loop.
          blockedStatusSyncs.current.set(client.id, currentStatus);
        }
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
