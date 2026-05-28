import { useCallback, useState } from 'react';

export type DeleteConfirmationType = 'client' | 'maintenance' | 'warranty' | 'appointment' | 'messageLog';

type DeleteConfirmationState = {
  id: string;
  type: DeleteConfirmationType;
} | null;

type DeleteHandler = () => Promise<void> | void;

export const useDeleteConfirmation = () => {
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmationState>(null);

  const clearDeleteConfirm = useCallback(() => {
    setDeleteConfirm(null);
  }, []);

  const getDeleteConfirmId = useCallback((type: DeleteConfirmationType) => {
    return deleteConfirm?.type === type ? deleteConfirm.id : null;
  }, [deleteConfirm]);

  const confirmOrRequestDelete = useCallback((
    type: DeleteConfirmationType,
    id: string | null | undefined,
    onConfirm: DeleteHandler
  ) => {
    if (!id) return;

    if (deleteConfirm?.id === id && deleteConfirm.type === type) {
      void onConfirm();
      return;
    }

    setDeleteConfirm({ id, type });
  }, [deleteConfirm]);

  return {
    clearDeleteConfirm,
    confirmOrRequestDelete,
    getDeleteConfirmId,
  };
};
