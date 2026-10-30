import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { toast as sonnerToast } from 'sonner';
import { DEFAULT_SETTINGS } from '../constants/appDefaults';
import { handleFirestoreError, OperationType } from '../services/firestoreError';
import { operationalDataResetApi } from '../services/operationalDataResetApi';
import { settingsRepository } from '../services/settingsRepository';
import { getFirestoreSaveResultMessage } from '../services/firestoreSaveStatus';
import { recordOperationalLog } from '../services/operationalLogRepository';
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
  settingsLoaded: boolean;
  setSettings: Dispatch<SetStateAction<Settings>>;
};

const companySettingFields: Array<keyof Settings> = [
  'businessName',
  'businessPhone',
  'businessEmail',
  'businessInstagram',
  'businessAddress',
  'isProfileComplete',
];

const changedSettingFields = (before: Settings | null, after: Settings) => {
  if (!before) return [] as string[];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  keys.delete('userId');
  return Array.from(keys).filter((key) => (
    JSON.stringify((before as unknown as Record<string, unknown>)[key])
    !== JSON.stringify((after as unknown as Record<string, unknown>)[key])
  ));
};

export const useSettingsActions = ({ user, settings, settingsLoaded, setSettings }: UseSettingsActionsParams) => {
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isResettingOperationalData, setIsResettingOperationalData] = useState(false);
  const lastPersistedSettings = useRef<{ userId: string; value: Settings } | null>(null);

  useEffect(() => {
    if (!user?.uid) {
      lastPersistedSettings.current = null;
      return;
    }
    if (settingsLoaded && lastPersistedSettings.current?.userId !== user.uid) {
      lastPersistedSettings.current = { userId: user.uid, value: { ...settings } };
    }
  }, [settingsLoaded, user?.uid]);

  const recordSettingsChange = useCallback((updatedSettings: Settings, section: string, fields?: string[]) => {
    if (!user?.uid) return;
    const previous = lastPersistedSettings.current?.userId === user.uid
      ? lastPersistedSettings.current.value
      : null;
    const changedFields = fields || changedSettingFields(previous, updatedSettings);
    if (changedFields.length > 0) {
      recordOperationalLog({
        userId: user.uid,
        usuario: user.email,
        oficina: updatedSettings.businessName || settings.businessName,
        acao: 'configuracoes_atualizadas',
        details: { section, fields: changedFields },
      });
    }
    lastPersistedSettings.current = { userId: user.uid, value: { ...updatedSettings } };
  }, [settings.businessName, user]);

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
    const previous = lastPersistedSettings.current?.userId === user.uid
      ? lastPersistedSettings.current.value
      : null;
    const changedCompanyFields = changedSettingFields(previous, updatedSettings)
      .filter((field) => companySettingFields.includes(field as keyof Settings));
    recordSettingsChange(updatedSettings, 'dados_empresa', changedCompanyFields);
  }, [recordSettingsChange, settings, setSettings, user]);

  const saveCompanyProfile = useCallback(async () => {
    if (!user || !settings) return;

    const updatedSettings = { ...settings, isProfileComplete: !!settings.businessName };
    await settingsRepository.saveConfig(user.uid, updatedSettings);
    setSettings(updatedSettings);
    recordSettingsChange(updatedSettings, 'perfil_oficina');
    showSaveMessage(getFirestoreSaveResultMessage('Perfil atualizado com sucesso!'));
  }, [recordSettingsChange, settings, setSettings, showSaveMessage, user]);

  const saveSettings = useCallback(async () => {
    if (!user || !settings) return;

    try {
      const updatedSettings = {
        ...settings,
        whatsappTemplate: settings.whatsappTemplate || DEFAULT_SETTINGS.whatsappTemplate,
      };
      await settingsRepository.saveConfig(user.uid, updatedSettings);
      recordSettingsChange(updatedSettings, 'preferencias');
      showSaveMessage(getFirestoreSaveResultMessage('Configurações salvas com sucesso!'));
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'settings');
    }
  }, [recordSettingsChange, settings, showSaveMessage, user]);

  const saveSettingsPatch = useCallback(async (patch: Partial<Settings>) => {
    if (!user || !settings) return;

    const updatedSettings = { ...settings, ...patch };
    try {
      await settingsRepository.saveConfig(user.uid, updatedSettings);
      setSettings(updatedSettings);
      recordSettingsChange(updatedSettings, 'preferencias');
      showSaveMessage(getFirestoreSaveResultMessage('Configurações salvas com sucesso!'));
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'settings');
    }
  }, [recordSettingsChange, settings, setSettings, showSaveMessage, user]);

  const resetOperationalData = useCallback(async () => {
    if (!user || isResettingOperationalData) return false;

    setIsResettingOperationalData(true);
    try {
      const result = await operationalDataResetApi.resetOperationalData();
      sonnerToast.success(
        `Zeragem concluida: ${result.archivedTotal} registro(s) arquivado(s) e ${result.resetClients} cliente(s) preservado(s).`
      );
      return true;
    } catch (error) {
      console.error('Erro ao zerar dados operacionais:', error);
      sonnerToast.error(error instanceof Error ? error.message : 'Nao foi possivel zerar os dados.');
      return false;
    } finally {
      setIsResettingOperationalData(false);
    }
  }, [isResettingOperationalData, user]);

  return {
    completeProfileSetup,
    isResettingOperationalData,
    resetOperationalData,
    saveCompanyProfile,
    saveMessage,
    saveSettings,
    saveSettingsPatch,
  };
};
