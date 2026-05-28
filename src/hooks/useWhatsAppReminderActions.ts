import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { User } from 'firebase/auth';
import { db } from '../firebase';
import { DEFAULT_SETTINGS } from '../constants/appDefaults';
import { AlertService } from '../services/alertService';
import type { Client, Settings } from '../types';

type AppToast = {
  message: string;
  type: 'success' | 'error';
} | null;

type UseWhatsAppReminderActionsParams = {
  settings?: Settings | null;
  setToast: Dispatch<SetStateAction<AppToast>>;
  user: User | null;
};

export const useWhatsAppReminderActions = ({
  settings,
  setToast,
  user,
}: UseWhatsAppReminderActionsParams) => {
  const sendWhatsApp = useCallback((client: Client) => {
    if (!user) return;

    try {
      const template = settings?.whatsappTemplate || DEFAULT_SETTINGS.whatsappTemplate;
      const message = AlertService.buildReminderMessage(template, client);
      const url = AlertService.createWhatsAppUrl(client, message);

      window.open(url, '_blank');

      AlertService.registerManualReminderAttempt(db, user.uid, client, message)
        .then((result) => {
          if (result.success) {
            setToast({ message: 'WhatsApp aberto e status atualizado.', type: 'success' });
          }
        })
        .catch((error) => console.error('Erro ao registrar log:', error));
    } catch (error) {
      console.error('Erro ao preparar WhatsApp:', error);
      setToast({
        message: error instanceof Error ? error.message : 'Erro ao abrir WhatsApp. Verifique o cadastro do cliente.',
        type: 'error',
      });
    }
  }, [settings?.whatsappTemplate, setToast, user]);

  return {
    sendWhatsApp,
  };
};
