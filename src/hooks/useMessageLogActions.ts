import type { User } from 'firebase/auth';
import { useCallback } from 'react';
import { toast as sonnerToast } from 'sonner';
import { handleFirestoreError, OperationType } from '../services/firestoreError';
import { messageLogRepository } from '../services/messageLogRepository';

type UseMessageLogActionsParams = {
  onDeleted: () => void;
  user: User | null;
};

export const useMessageLogActions = ({ onDeleted, user }: UseMessageLogActionsParams) => {
  const deleteMessageLog = useCallback(async (messageLogId: string | undefined) => {
    if (!user?.uid || !messageLogId) return;

    try {
      await messageLogRepository.remove(user.uid, messageLogId);
      sonnerToast.success('Log de aviso movido para a lixeira.', {
        action: {
          label: 'Desfazer',
          onClick: () => void messageLogRepository.restore(user.uid, messageLogId),
        },
      });
      onDeleted();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'message_logs');
      sonnerToast.error('Nao foi possivel excluir o log.');
    }
  }, [onDeleted, user]);

  return {
    deleteMessageLog,
  };
};
