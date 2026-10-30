import type { User } from 'firebase/auth';
import { useCallback } from 'react';
import { toast as sonnerToast } from 'sonner';
import { handleFirestoreError, OperationType } from '../services/firestoreError';
import { messageLogRepository } from '../services/messageLogRepository';
import { getFirestoreSaveResultMessage } from '../services/firestoreSaveStatus';
import { recordOperationalLog } from '../services/operationalLogRepository';

type UseMessageLogActionsParams = {
  onDeleted: () => void;
  user: User | null;
  workshopName?: string;
};

export const useMessageLogActions = ({ onDeleted, user, workshopName }: UseMessageLogActionsParams) => {
  const deleteMessageLog = useCallback(async (messageLogId: string | undefined) => {
    if (!user?.uid || !messageLogId) return;

    try {
      await messageLogRepository.remove(user.uid, messageLogId);
      recordOperationalLog({
        userId: user.uid,
        usuario: user.email,
        oficina: workshopName,
        acao: 'aviso_removido',
        targetId: messageLogId,
        details: { module: 'Histórico de avisos' },
      });
      sonnerToast.success(getFirestoreSaveResultMessage('Log de aviso movido para a lixeira.'), {
        action: {
          label: 'Desfazer',
          onClick: () => void messageLogRepository.restore(user.uid, messageLogId).then(() => recordOperationalLog({
            userId: user.uid,
            usuario: user.email,
            oficina: workshopName,
            acao: 'aviso_restaurado',
            targetId: messageLogId,
            details: { module: 'Histórico de avisos' },
          })),
        },
      });
      onDeleted();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'message_logs');
      sonnerToast.error('Nao foi possivel excluir o log.');
    }
  }, [onDeleted, user, workshopName]);

  return {
    deleteMessageLog,
  };
};
