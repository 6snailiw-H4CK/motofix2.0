import type { User } from 'firebase/auth';
import { useCallback, useState } from 'react';
import { toast as sonnerToast } from 'sonner';
import { handleFirestoreError, OperationType } from '../services/firestoreError';
import { productRepository } from '../services/productRepository';
import { parseProductsWorkbook } from '../services/productSpreadsheet';
import type { ProductCatalogFormInput } from '../types';

type UseProductActionsParams = {
  user: User | null;
  onDeleted?: () => void;
};

export const useProductActions = ({ user, onDeleted }: UseProductActionsParams) => {
  const [isImportingProducts, setIsImportingProducts] = useState(false);
  const [isSavingProduct, setIsSavingProduct] = useState(false);
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);

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

  const saveProduct = useCallback(async (input: ProductCatalogFormInput, productId?: string) => {
    if (!user) return false;

    setIsSavingProduct(true);
    try {
      await productRepository.save(user.uid, input, productId);
      sonnerToast.success(productId ? 'Mercadoria atualizada com sucesso.' : 'Mercadoria cadastrada com sucesso.');
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
  }, [user]);

  const deleteProduct = useCallback(async (productId: string) => {
    if (!user) return false;

    setDeletingProductId(productId);
    try {
      await productRepository.delete(user.uid, productId);
      sonnerToast.success('Mercadoria movida para a lixeira.', {
        action: {
          label: 'Desfazer',
          onClick: () => void productRepository.restore(user.uid, productId),
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
  }, [onDeleted, user]);

  return {
    deleteProduct,
    deletingProductId,
    importProductsWorkbook,
    isImportingProducts,
    isSavingProduct,
    saveProduct,
  };
};
