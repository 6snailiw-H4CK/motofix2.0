import type { User } from 'firebase/auth';
import { useCallback, useState } from 'react';
import { toast as sonnerToast } from 'sonner';
import { saveClientWithMaintenance, type ClientSaveData } from '../services/clientSaveService';
import { clientRepository } from '../services/clientRepository';
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

  return {
    deleteClient,
    isSaving,
    saveClient,
  };
};
