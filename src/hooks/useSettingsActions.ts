import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useState } from 'react';
import type { User } from 'firebase/auth';
import { DEFAULT_SETTINGS } from '../constants/appDefaults';
import { handleFirestoreError, OperationType } from '../services/firestoreError';
import { settingsRepository } from '../services/settingsRepository';
import type { Settings } from '../types';

export type ProfileSetupData = {
  businessName: string;
  businessPhone?: string;
  businessInstagram?: string;
  businessAddress?: string;
};

type UseSettingsActionsParams = {
  user: User | null;
  settings: Settings;
  setSettings: Dispatch<SetStateAction<Settings>>;
};

export const useSettingsActions = ({ user, settings, setSettings }: UseSettingsActionsParams) => {
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const showSaveMessage = useCallback((message: string) => {
    setSaveMessage(message);
    setTimeout(() => setSaveMessage(null), 3000);
  }, []);

  const completeProfileSetup = useCallback(async (values: ProfileSetupData) => {
    if (!user) return;

    const updatedSettings = {
      ...settings,
      ...values,
      isProfileComplete: true,
    };

    await settingsRepository.saveConfig(user.uid, updatedSettings);
    setSettings(updatedSettings);
  }, [settings, setSettings, user]);

  const saveCompanyProfile = useCallback(async () => {
    if (!user || !settings) return;

    const updatedSettings = { ...settings, isProfileComplete: !!settings.businessName };
    await settingsRepository.saveConfig(user.uid, updatedSettings);
    setSettings(updatedSettings);
    showSaveMessage('Perfil atualizado com sucesso!');
  }, [settings, setSettings, showSaveMessage, user]);

  const saveSettings = useCallback(async () => {
    if (!user || !settings) return;

    try {
      await settingsRepository.saveConfig(user.uid, {
        ...settings,
        whatsappTemplate: settings.whatsappTemplate || DEFAULT_SETTINGS.whatsappTemplate,
      });
      showSaveMessage('Configuracoes salvas com sucesso!');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'settings');
    }
  }, [settings, showSaveMessage, user]);

  const saveSettingsPatch = useCallback(async (patch: Partial<Settings>) => {
    if (!user || !settings) return;

    const updatedSettings = { ...settings, ...patch };
    try {
      await settingsRepository.saveConfig(user.uid, updatedSettings);
      setSettings(updatedSettings);
      showSaveMessage('Configuracoes salvas com sucesso!');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'settings');
    }
  }, [settings, setSettings, showSaveMessage, user]);

  return {
    completeProfileSetup,
    saveCompanyProfile,
    saveMessage,
    saveSettings,
    saveSettingsPatch,
  };
};
