import type { Dispatch, SetStateAction } from 'react';
import { useCallback } from 'react';
import type { User } from 'firebase/auth';
import { toast as sonnerToast } from 'sonner';
import { DEFAULT_SERVICE_TYPES } from '../constants/appDefaults';
import { canonicalServiceType, getServiceTypeKey, normalizeServiceTypeOptions } from '../lib/serviceTypes';
import { settingsRepository } from '../services/settingsRepository';
import type { Settings } from '../types';

type UseServiceTypeActionsParams = {
  onSelectServiceType: (serviceType: string) => void;
  settings: Settings;
  setSettings: Dispatch<SetStateAction<Settings>>;
  user: User | null;
};

export const useServiceTypeActions = ({
  onSelectServiceType,
  settings,
  setSettings,
  user,
}: UseServiceTypeActionsParams) => {
  const addCustomServiceType = useCallback(async () => {
    const name = canonicalServiceType(window.prompt('Nome da nova categoria de servico:')?.trim());
    if (!name || !user) return;

    const currentServiceTypes = settings.serviceTypes || [];
    const availableServiceTypes = normalizeServiceTypeOptions([...DEFAULT_SERVICE_TYPES, ...currentServiceTypes]);
    const alreadyExists = availableServiceTypes.some((type) => getServiceTypeKey(type) === getServiceTypeKey(name));

    try {
      if (!alreadyExists) {
        const nextServiceTypes = normalizeServiceTypeOptions([...currentServiceTypes, name]);
        await settingsRepository.saveConfig(user.uid, { serviceTypes: nextServiceTypes });
        setSettings((current) => ({ ...current, serviceTypes: nextServiceTypes }));
      }

      onSelectServiceType(name);
      sonnerToast.success(alreadyExists ? 'Categoria ja existe e foi selecionada.' : 'Categoria adicionada.');
    } catch (error) {
      console.error(error);
      sonnerToast.error('Nao foi possivel salvar a categoria.');
    }
  }, [onSelectServiceType, setSettings, settings.serviceTypes, user]);

  return {
    addCustomServiceType,
  };
};
