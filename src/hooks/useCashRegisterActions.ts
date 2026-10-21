import { format } from 'date-fns';
import type { User } from 'firebase/auth';
import { useCallback, useState } from 'react';
import { toast as sonnerToast } from 'sonner';
import {
  cashRegisterRepository,
  InsufficientCashLaunchStockError,
} from '../services/cashRegisterRepository';
import { getCashPaidAmount } from '../lib/cashPayments';
import { parseProductsWorkbook } from '../services/productSpreadsheet';
import { productRepository } from '../services/productRepository';
import type { CashRegisterLaunch } from '../types';
import { handleFirestoreError, OperationType } from '../services/firestoreError';
import { recordOperationalLog } from '../services/operationalLogRepository';
import { getFirestoreSaveResultMessage } from '../services/firestoreSaveStatus';
import { isQuotaError } from '../lib/firebaseRetry';
import { clearLocalDraft, loadLocalDraft } from '../services/localDrafts';

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
      sonnerToast.success(getFirestoreSaveResultMessage(`${imported} mercadoria(s) importada(s) para o catálogo.`));
      return imported;
    } catch (error) {
      console.error('Erro ao importar mercadorias:', error);
      sonnerToast.error('Nao foi possivel importar a planilha de mercadorias.');
      return 0;
    } finally {
      setIsImportingProducts(false);
    }
  }, [user]);

  const saveLaunch = useCallback(async (draft: CashRegisterDraft, launchId?: string, previousLaunch?: CashRegisterLaunch) => {
    if (!user) return { savedOffline: false, error: 'Sua sessao expirou. Entre novamente antes de finalizar a O.S.' };
    if (draft.status !== 'Cancelado' && draft.items.length === 0) {
      const message = 'Inclua ao menos uma mercadoria antes de salvar.';
      sonnerToast.error(message);
      return { savedOffline: false, error: message };
    }

    setIsSavingLaunch(true);
    try {
      const now = new Date().toISOString();
      const paidAmount = getCashPaidAmount(draft);
      const previousPaidAmount = previousLaunch ? getCashPaidAmount(previousLaunch) : 0;
      const paidAt = paidAmount > previousPaidAmount
        ? now
        : paidAmount === 0 && previousPaidAmount > 0
          ? null
          : previousLaunch?.paidAt || null;
      const launchData = { ...draft, paidAt };

      const result = launchId
        ? await cashRegisterRepository.update(user.uid, launchId, {
            ...launchData,
            updatedAt: now,
          }, previousLaunch)
        : await cashRegisterRepository.create(user.uid, {
            ...launchData,
            orderNumber: `LC-${format(new Date(), 'yyyyMMdd-HHmmss')}`,
            userId: user.uid,
            createdAt: now,
            updatedAt: now,
          });

      if (!launchId && result.id && !result.savedOffline) {
        recordOperationalLog({
          userId: user.uid,
          usuario: user.email,
          oficina: workshopName,
          acao: 'os_criada',
          targetId: result.id,
          details: { orderNumber: result.id, clientName: draft.clientName, total: draft.total },
        });
        if (Number(draft.total) > 0) {
          recordOperationalLog({
            userId: user.uid,
            usuario: user.email,
            oficina: workshopName,
            acao: 'receita_criada',
            targetId: result.id,
            details: { source: 'cash_launch', orderNumber: result.id, total: draft.total },
          });
        }
      }

      const savedOffline = result.savedOffline === true;
      const shortages = result.stockShortageItems || [];
      if (!savedOffline && shortages.length > 0) {
        const itemNames = shortages.map((item) => item.variation
          ? `${item.productDescription} (${item.variation})`
          : item.productDescription);
        sonnerToast.warning('O.S. finalizada; itens sem saldo ficaram sem baixa de estoque.', {
          description: itemNames.join(', '),
          duration: 12000,
        });
      } else {
        sonnerToast.success(getFirestoreSaveResultMessage(savedOffline
          ? 'O.S. salva neste computador.'
          : launchId ? 'Lançamento Caixa atualizado com sucesso.' : 'Lançamento Caixa salvo com sucesso.'));
      }
      return result;
    } catch (error) {
      if (error instanceof InsufficientCashLaunchStockError) {
        const { shortage } = error;
        const quantityLabel = `${shortage.quantityToAdd} ${shortage.quantityToAdd === 1 ? 'unidade' : 'unidades'}`;
        sonnerToast.error(error.message, {
          duration: 15000,
          action: {
            label: `Adicionar ${quantityLabel} ao estoque`,
            onClick: () => {
              if (!user) {
                sonnerToast.error('Entre novamente para ajustar o estoque.');
                return;
              }

              void cashRegisterRepository.addStockForInsufficientLaunch(
                user.uid,
                shortage,
                launchId || shortage.cashLaunchId,
              )
                .then((addedQuantity) => {
                  sonnerToast.success(getFirestoreSaveResultMessage(addedQuantity > 0
                    ? `${addedQuantity} ${addedQuantity === 1 ? 'unidade adicionada' : 'unidades adicionadas'} ao estoque. Clique em Finalizar O.S. novamente para dar baixa.`
                    : 'O estoque ja foi atualizado por outra operacao. Clique em Finalizar O.S. novamente.'));
                })
                .catch((restockError) => {
                  sonnerToast.error(restockError instanceof Error
                    ? restockError.message
                    : 'Nao foi possivel adicionar a mercadoria ao estoque.');
                  handleFirestoreError(restockError, OperationType.UPDATE, 'products/stock_movements');
                });
            },
          },
        });
        return { savedOffline: false, error: error.message };
      }

      const message = isQuotaError(error)
        ? 'O Firestore limitou as requisicoes. A O.S. nao foi faturada; tente novamente quando a sincronizacao normalizar.'
        : error instanceof Error ? error.message : 'Nao foi possivel salvar o Lancamento Caixa.';
      sonnerToast.error(message, { duration: 15000 });
      const usesStockTransaction = draft.status === 'Finalizado'
        || previousLaunch?.stockDeducted === true
        || previousLaunch?.status === 'Finalizado';
      handleFirestoreError(error, launchId ? OperationType.UPDATE : OperationType.CREATE, launchId
        ? `cash_launches/${launchId}${usesStockTransaction ? ' + estoque' : ''}`
        : `cash_launches${usesStockTransaction ? ' + estoque' : ''}`);
      return { savedOffline: false, error: message };
    } finally {
      setIsSavingLaunch(false);
    }
  }, [user, workshopName]);

  const deleteLaunch = useCallback(async (launchOrId: CashRegisterLaunch | string) => {
    if (!user) return false;

    const launchId = typeof launchOrId === 'string' ? launchOrId : launchOrId.id;
    const previousLaunch = typeof launchOrId === 'string' ? undefined : launchOrId;
    setDeletingLaunchId(launchId);
    try {
      await cashRegisterRepository.delete(user.uid, launchId, undefined, previousLaunch);
      const cashRegisterDraftKey = `${user.uid}:cash-register`;
      const cashRegisterDraft = loadLocalDraft<{ editingLaunchId?: string | null }>(cashRegisterDraftKey);
      if (cashRegisterDraft?.data.editingLaunchId === launchId) {
        clearLocalDraft(cashRegisterDraftKey);
      }
      sonnerToast.success(getFirestoreSaveResultMessage('O.S. movida para a lixeira.'), {
        action: {
          label: 'Desfazer',
          onClick: () => {
            void cashRegisterRepository.restore(user.uid, launchId)
              .then(() => sonnerToast.success(getFirestoreSaveResultMessage('O.S. restaurada.')))
              .catch((error) => sonnerToast.error(error instanceof Error ? error.message : 'Nao foi possivel restaurar a O.S.'));
          },
        },
      });
      return true;
    } catch (error) {
      const permissionDenied = error instanceof Error && error.message.toLowerCase().includes('permission');
      sonnerToast.error(permissionDenied
        ? 'Sem permissão para excluir este lançamento de caixa. Entre em contato com o administrador.'
        : 'Nao foi possivel excluir a O.S.');
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
