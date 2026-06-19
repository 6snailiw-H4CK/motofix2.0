import { format } from 'date-fns';
import type { User } from 'firebase/auth';
import { useCallback, useState } from 'react';
import { toast as sonnerToast } from 'sonner';
import { cashRegisterRepository } from '../services/cashRegisterRepository';
import { parseProductsWorkbook } from '../services/productSpreadsheet';
import { productRepository } from '../services/productRepository';
import type { CashRegisterLaunch } from '../types';
import { handleFirestoreError, OperationType } from '../services/firestoreError';
import { recordOperationalLog } from '../services/operationalLogRepository';

type UseCashRegisterActionsParams = {
  user: User | null;
  workshopName?: string;
};

export type CashRegisterDraft = Omit<CashRegisterLaunch, 'id' | 'orderNumber' | 'userId' | 'createdAt' | 'updatedAt'>;

export const useCashRegisterActions = ({ user, workshopName }: UseCashRegisterActionsParams) => {
  const [isImportingProducts, setIsImportingProducts] = useState(false);
  const [isSavingLaunch, setIsSavingLaunch] = useState(false);
  const [deletingLaunchId, setDeletingLaunchId] = useState<string | null>(null);

  const importProductsWorkbook = useCallback(async (file: File) => {
    if (!user) return 0;

    setIsImportingProducts(true);
    try {
      const products = await parseProductsWorkbook(file);
      if (products.length === 0) {
        sonnerToast.error('Nenhuma mercadoria encontrada. Confira se a planilha tem Descricao, NCM e Venda R$.');
        return 0;
      }

      const imported = await productRepository.upsertMany(user.uid, products);
      sonnerToast.success(`${imported} mercadoria(s) importada(s) para o catalogo.`);
      return imported;
    } catch (error) {
      console.error('Erro ao importar mercadorias:', error);
      sonnerToast.error('Nao foi possivel importar a planilha de mercadorias.');
      return 0;
    } finally {
      setIsImportingProducts(false);
    }
  }, [user]);

  const saveLaunch = useCallback(async (draft: CashRegisterDraft, launchId?: string) => {
    if (!user) return false;
    if (draft.items.length === 0) {
      sonnerToast.error('Inclua ao menos uma mercadoria antes de salvar.');
      return false;
    }

    setIsSavingLaunch(true);
    try {
      const now = new Date().toISOString();

      if (launchId) {
        await cashRegisterRepository.update(user.uid, launchId, {
          ...draft,
          updatedAt: now,
        });
      } else {
        const orderNumber = `LC-${format(new Date(), 'yyyyMMdd-HHmmss')}`;

        const cashLaunchId = await cashRegisterRepository.create(user.uid, {
          ...draft,
          orderNumber,
          userId: user.uid,
          createdAt: now,
          updatedAt: now,
        });
        recordOperationalLog({
          userId: user.uid,
          usuario: user.email,
          oficina: workshopName,
          acao: 'os_criada',
          targetId: cashLaunchId,
          details: { orderNumber, clientName: draft.clientName, total: draft.total },
        });
        if (Number(draft.total) > 0) {
          recordOperationalLog({
            userId: user.uid,
            usuario: user.email,
            oficina: workshopName,
            acao: 'receita_criada',
            targetId: cashLaunchId,
            details: { source: 'cash_launch', orderNumber, total: draft.total },
          });
        }
      }

      const savedOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
      sonnerToast.success(savedOffline
        ? 'O.S. salva neste computador. Sincronizacao pendente.'
        : launchId ? 'Lancamento Caixa atualizado com sucesso.' : 'Lancamento Caixa salvo com sucesso.');
      return true;
    } catch (error) {
      sonnerToast.error('Nao foi possivel salvar o Lancamento Caixa.');
      handleFirestoreError(error, OperationType.CREATE, 'cash_launches');
      return false;
    } finally {
      setIsSavingLaunch(false);
    }
  }, [user, workshopName]);

  const deleteLaunch = useCallback(async (launchId: string) => {
    if (!user) return false;

    setDeletingLaunchId(launchId);
    try {
      await cashRegisterRepository.delete(user.uid, launchId);
      sonnerToast.success('O.S. excluida com sucesso.');
      return true;
    } catch (error) {
      sonnerToast.error('Nao foi possivel excluir a O.S.');
      handleFirestoreError(error, OperationType.DELETE, 'cash_launches');
      return false;
    } finally {
      setDeletingLaunchId(null);
    }
  }, [user]);

  return {
    deleteLaunch,
    deletingLaunchId,
    importProductsWorkbook,
    isImportingProducts,
    isSavingLaunch,
    saveLaunch,
  };
};
