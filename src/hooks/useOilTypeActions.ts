import type { Dispatch, SetStateAction } from 'react';
import { useCallback } from 'react';
import type { User } from 'firebase/auth';
import { toast as sonnerToast } from 'sonner';
import { settingsRepository } from '../services/settingsRepository';
import type { Settings } from '../types';

type UseOilTypeActionsParams = {
  settings: Settings;
  setSettings: Dispatch<SetStateAction<Settings>>;
  user: User | null;
};

export const useOilTypeActions = ({
  settings,
  setSettings,
  user,
}: UseOilTypeActionsParams) => {
  const addCustomOilType = useCallback(async (oilType: string): Promise<string | null> => {
    const name = oilType.trim();
    if (!name || !user) return null;

    const currentOilTypes = settings.oilTypes || [];
    const existingOilType = currentOilTypes.find(
      (type) => type.trim().toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR')
    );
    try {
      if (existingOilType) {
        sonnerToast.success('Esse tipo de oleo ja esta cadastrado.');
        return existingOilType;
      }

      const nextOilTypes = [...currentOilTypes, name];
      await settingsRepository.saveConfig(user.uid, { oilTypes: nextOilTypes });
      setSettings((current) => ({ ...current, oilTypes: nextOilTypes }));
      sonnerToast.success('Tipo de oleo adicionado.');
      return name;
    } catch (error) {
      console.error(error);
      sonnerToast.error('Nao foi possivel salvar o tipo de oleo.');
      return null;
    }
  }, [setSettings, settings.oilTypes, user]);

  return {
    addCustomOilType,
  };
};
