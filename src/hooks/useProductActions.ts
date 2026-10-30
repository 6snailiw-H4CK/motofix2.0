import type { User } from 'firebase/auth';
import { useCallback, useState } from 'react';
import { toast as sonnerToast } from 'sonner';
import { handleFirestoreError, OperationType } from '../services/firestoreError';
import { getFirestoreSaveResultMessage } from '../services/firestoreSaveStatus';
import { ProductStockResetError, productRepository } from '../services/productRepository';
import { getOperationalChangedFields, recordOperationalLog } from '../services/operationalLogRepository';
import { parseProductsWorkbook } from '../services/productSpreadsheet';
import type { ProductCatalogFormInput, ProductCatalogItem } from '../types';

type UseProductActionsParams = {
  products?: ProductCatalogItem[];
  user: User | null;
  workshopName?: string;
  onDeleted?: () => void;
};

export const useProductActions = ({ products = [], user, workshopName, onDeleted }: UseProductActionsParams) => {
  const [isImportingProducts, setIsImportingProducts] = useState(false);
  const [isSavingProduct, setIsSavingProduct] = useState(false);
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);
  const [isDeletingProducts, setIsDeletingProducts] = useState(false);
  const [isZeroingStock, setIsZeroingStock] = useState(false);

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
      recordOperationalLog({
        userId: user.uid,
        usuario: user.email,
        oficina: workshopName,
        acao: 'importacao_concluida',
        details: { module: 'Mercadorias', imported },
      });
      sonnerToast.success(getFirestoreSaveResultMessage(`${imported} mercadoria(s) importada(s) para o catálogo.`));
      return imported;
    } catch (error) {
      console.error('Erro ao importar mercadorias:', error);
      sonnerToast.error(error instanceof Error ? error.message : 'Nao foi possivel importar a planilha de mercadorias.');
      return 0;
    } finally {
      setIsImportingProducts(false);
    }
  }, [user, workshopName]);

  const saveProduct = useCallback(async (input: ProductCatalogFormInput, productId?: string) => {
    if (!user) return false;

    setIsSavingProduct(true);
    try {
      const savedProductId = await productRepository.save(user.uid, input, productId);
      const previous = productId ? products.find((product) => product.id === productId) : undefined;
      const fields = getOperationalChangedFields(
        previous as unknown as Record<string, unknown> | undefined,
        input as unknown as Record<string, unknown>,
      );
      recordOperationalLog({
        userId: user.uid,
        usuario: user.email,
        oficina: workshopName,
        acao: productId ? 'mercadoria_atualizada' : 'mercadoria_criada',
        targetId: savedProductId,
        details: { module: 'Mercadorias', fields },
      });
      if (fields.includes('stockQuantity') || fields.includes('variations') || (!productId && Number(input.stockQuantity || 0) > 0)) {
        recordOperationalLog({
          userId: user.uid,
          usuario: user.email,
          oficina: workshopName,
          acao: 'estoque_alterado',
          targetId: savedProductId,
          details: { module: 'Mercadorias', fields: ['estoque'] },
        });
      }
      sonnerToast.success(getFirestoreSaveResultMessage(productId ? 'Mercadoria atualizada com sucesso.' : 'Mercadoria cadastrada com sucesso.'));
      return true;
    } catch (error) {
      sonnerToast.error(error instanceof Error ? error.message : 'Nao foi possivel salvar a mercadoria.');
      try {
        handleFirestoreError(error, productId ? OperationType.UPDATE : OperationType.CREATE, 'products');
      } catch {
        // O helper tambem registra o erro; mantemos o fluxo da tela sem quebrar.
      }
      return false;
    } finally {
      setIsSavingProduct(false);
    }
  }, [products, user, workshopName]);

  const deleteProduct = useCallback(async (productId: string) => {
    if (!user) return false;

    setDeletingProductId(productId);
    try {
      await productRepository.delete(user.uid, productId);
      recordOperationalLog({
        userId: user.uid,
        usuario: user.email,
        oficina: workshopName,
        acao: 'mercadoria_removida',
        targetId: productId,
        details: { module: 'Mercadorias' },
      });
      sonnerToast.success(getFirestoreSaveResultMessage('Mercadoria movida para a lixeira.'), {
        action: {
          label: 'Desfazer',
          onClick: () => void productRepository.restore(user.uid, productId).then(() => recordOperationalLog({
            userId: user.uid,
            usuario: user.email,
            oficina: workshopName,
            acao: 'mercadoria_restaurada',
            targetId: productId,
            details: { module: 'Mercadorias' },
          })),
        },
      });
      onDeleted?.();
      return true;
    } catch (error) {
      sonnerToast.error('Nao foi possivel excluir a mercadoria.');
      try {
        handleFirestoreError(error, OperationType.DELETE, 'products');
      } catch {
        // O helper tambem registra o erro; mantemos o fluxo da tela sem quebrar.
      }
      return false;
    } finally {
      setDeletingProductId(null);
    }
  }, [onDeleted, user, workshopName]);

  const deleteProducts = useCallback(async (productIds: string[]) => {
    if (!user) return false;

    const uniqueProductIds = Array.from(new Set(productIds.filter(Boolean)));
    if (uniqueProductIds.length === 0) {
      sonnerToast.error('Nenhuma mercadoria para apagar.');
      return false;
    }

    setIsDeletingProducts(true);
    try {
      const deleted = await productRepository.deleteMany(
        user.uid,
        uniqueProductIds,
        'Limpeza de mercadorias importadas solicitada pelo usuario'
      );
      recordOperationalLog({
        userId: user.uid,
        usuario: user.email,
        oficina: workshopName,
        acao: 'mercadoria_removida',
        details: { module: 'Mercadorias', count: deleted, bulk: true },
      });

      sonnerToast.success(getFirestoreSaveResultMessage(`${deleted} mercadoria(s) movida(s) para a lixeira.`), {
        action: {
          label: 'Desfazer',
          onClick: () => void productRepository.restoreMany(user.uid, uniqueProductIds),
        },
      });
      onDeleted?.();
      return true;
    } catch (error) {
      sonnerToast.error('Nao foi possivel apagar as mercadorias.');
      try {
        handleFirestoreError(error, OperationType.DELETE, 'products');
      } catch {
        // O helper tambem registra o erro; mantemos o fluxo da tela sem quebrar.
      }
      return false;
    } finally {
      setIsDeletingProducts(false);
    }
  }, [onDeleted, user, workshopName]);

  const zeroStock = useCallback(async (products: Array<Pick<ProductCatalogItem, 'id' | 'variations'>>) => {
    if (!user) return false;

    const uniqueProducts = Array.from(new Map(products.filter((product) => product.id).map((product) => [product.id, product])).values());
    if (uniqueProducts.length === 0) {
      sonnerToast.error('Nenhuma mercadoria ativa para zerar o estoque.');
      return false;
    }

    setIsZeroingStock(true);
    try {
      const updated = await productRepository.zeroStockMany(user.uid, uniqueProducts);
      recordOperationalLog({
        userId: user.uid,
        usuario: user.email,
        oficina: workshopName,
        acao: 'estoque_alterado',
        details: { module: 'Mercadorias', fields: ['estoque zerado'], count: updated },
      });
      sonnerToast.success(getFirestoreSaveResultMessage(`Estoque zerado para ${updated} mercadoria(s). Os preços de venda foram mantidos.`));
      return true;
    } catch (error) {
      console.error('Erro ao zerar estoque das mercadorias:', error);
      if (error instanceof ProductStockResetError && error.completedCount > 0) {
        sonnerToast.error(`${error.message} Confira a lista antes de tentar novamente.`);
      } else {
        sonnerToast.error('Nao foi possivel zerar o estoque das mercadorias.');
      }
      const firestoreError = error instanceof ProductStockResetError ? error.originalError : error;
      try {
        handleFirestoreError(firestoreError, OperationType.UPDATE, 'products');
      } catch {
        // O helper tambem registra o erro; mantemos o fluxo da tela sem quebrar.
      }
      return false;
    } finally {
      setIsZeroingStock(false);
    }
  }, [user, workshopName]);

  return {
    deleteProduct,
    deleteProducts,
    deletingProductId,
    importProductsWorkbook,
    isImportingProducts,
    isDeletingProducts,
    isSavingProduct,
    isZeroingStock,
    saveProduct,
    zeroStock,
  };
};
