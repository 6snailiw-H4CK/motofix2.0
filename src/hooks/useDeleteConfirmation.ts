import { useCallback, useState } from 'react';

export type DeleteConfirmationType = 'client' | 'maintenance' | 'warranty' | 'appointment' | 'messageLog' | 'cashLaunch' | 'product';

type DeleteConfirmationState = {
  id: string;
  type: DeleteConfirmationType;
} | null;

type DeleteHandler = () => Promise<boolean | void> | boolean | void;

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
  ): Promise<boolean> => {
    if (!id) return Promise.resolve(false);

    if (deleteConfirm?.id !== id || deleteConfirm.type !== type) {
      setDeleteConfirm({ id, type });
      return Promise.resolve(false);
    }

    return Promise.resolve(onConfirm()).then((result) => {
      if (result === false) return false;
      setDeleteConfirm(null);
      return true;
    });
  }, [deleteConfirm]);

  return {
    clearDeleteConfirm,
    confirmOrRequestDelete,
    getDeleteConfirmId,
  };
};
