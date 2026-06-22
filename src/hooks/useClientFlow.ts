import { useCallback } from 'react';
import type { AppView } from '../types';
import type { useClientFormState } from './useClientFormState';

type UseClientFlowParams = {
  clientForm: ReturnType<typeof useClientFormState>;
  setIsNewService: (value: boolean) => void;
  setView: (view: AppView) => void;
  view: AppView;
};

export const useClientFlow = ({
  clientForm,
  setIsNewService,
  setView,
  view,
}: UseClientFlowParams) => {
  const handleClientSaved = useCallback(() => {
    clientForm.resetAfterSave();
    setIsNewService(false);
    setView(view === 'clients-schedule-add' ? 'clients-schedule' : 'clients');
  }, [clientForm.resetAfterSave, setIsNewService, setView, view]);

  return {
    handleClientSaved,
  };
};
