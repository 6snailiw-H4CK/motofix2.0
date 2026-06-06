import { useCallback, useState } from 'react';
import { toast as sonnerToast } from 'sonner';
import { fileToBase64, fiscalApi } from '../services/fiscalApi';
import type {
  CashRegisterLaunch,
  FiscalCompany,
  FiscalCompanyFormInput,
  FiscalCustomer,
  FiscalInvoice,
  FiscalServiceInput,
} from '../types';

type UseFiscalActionsParams = {
  fiscalCompanies: FiscalCompany[];
};

const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

export const useFiscalActions = ({ fiscalCompanies }: UseFiscalActionsParams) => {
  const [isSavingCompany, setIsSavingCompany] = useState(false);
  const [isIssuingInvoice, setIsIssuingInvoice] = useState(false);
  const [processingInvoiceId, setProcessingInvoiceId] = useState<string | null>(null);

  const saveCompany = useCallback(async (input: FiscalCompanyFormInput, certificateFile?: File | null) => {
    setIsSavingCompany(true);
    try {
      const payload: FiscalCompanyFormInput = { ...input };
      if (certificateFile) {
        payload.certificateBase64 = await fileToBase64(certificateFile);
      }

      await fiscalApi.saveCompany(payload);
      sonnerToast.success('Configuracao fiscal salva com sucesso.');
      return true;
    } catch (error) {
      sonnerToast.error(error instanceof Error ? error.message : 'Nao foi possivel salvar a configuracao fiscal.');
      return false;
    } finally {
      setIsSavingCompany(false);
    }
  }, []);

  const issueManualNfse = useCallback(async (payload: {
    companyId: string;
    customer: FiscalCustomer;
    service: FiscalServiceInput;
    focusOverrides?: Record<string, unknown>;
  }) => {
    setIsIssuingInvoice(true);
    try {
      const result = await fiscalApi.issueManualNfse(payload);
      sonnerToast.success(`NFS-e enviada para emissao: ${result.invoice.reference}`);
      return result.invoice;
    } catch (error) {
      sonnerToast.error(error instanceof Error ? error.message : 'Falha ao emitir NFS-e.');
      return null;
    } finally {
      setIsIssuingInvoice(false);
    }
  }, []);

  const issueFromCashLaunch = useCallback(async (cashLaunch: CashRegisterLaunch, preferredCompanyId?: string) => {
    const company = preferredCompanyId
      ? fiscalCompanies.find((item) => item.id === preferredCompanyId)
      : fiscalCompanies.find((item) => item.autoIssueFromCashLaunch && item.nfseEnabled) || fiscalCompanies.find((item) => item.nfseEnabled);

    if (!company) {
      sonnerToast.error('Cadastre uma empresa fiscal com NFS-e ativa antes de emitir por O.S.');
      return null;
    }

    if (cashLaunch.status !== 'Finalizado') {
      sonnerToast.error('Finalize a O.S. antes de emitir NFS-e.');
      return null;
    }

    setIsIssuingInvoice(true);
    try {
      const result = await fiscalApi.issueFromCashLaunch({
        companyId: company.id,
        cashLaunchId: cashLaunch.id,
      });
      sonnerToast.success(`NFS-e enviada para a O.S.: ${result.invoice.reference}`);
      return result.invoice;
    } catch (error) {
      sonnerToast.error(error instanceof Error ? error.message : 'Falha ao emitir NFS-e por O.S.');
      return null;
    } finally {
      setIsIssuingInvoice(false);
    }
  }, [fiscalCompanies]);

  const syncInvoice = useCallback(async (invoice: FiscalInvoice) => {
    setProcessingInvoiceId(invoice.id);
    try {
      await fiscalApi.syncNfse(invoice.id);
      sonnerToast.success('Status fiscal atualizado.');
    } catch (error) {
      sonnerToast.error(error instanceof Error ? error.message : 'Nao foi possivel consultar a NFS-e.');
    } finally {
      setProcessingInvoiceId(null);
    }
  }, []);

  const cancelInvoice = useCallback(async (invoice: FiscalInvoice, reason = 'Cancelamento solicitado pelo usuario.') => {
    setProcessingInvoiceId(invoice.id);
    try {
      await fiscalApi.cancelNfse(invoice.id, reason);
      sonnerToast.success('Cancelamento enviado para a Focus NFe.');
    } catch (error) {
      sonnerToast.error(error instanceof Error ? error.message : 'Nao foi possivel cancelar a NFS-e.');
    } finally {
      setProcessingInvoiceId(null);
    }
  }, []);

  const downloadDocument = useCallback(async (invoice: FiscalInvoice, kind: 'xml' | 'pdf') => {
    setProcessingInvoiceId(invoice.id);
    try {
      const blob = await fiscalApi.downloadFiscalDocument(invoice.id, kind);
      downloadBlob(blob, `${invoice.reference}.${kind}`);
    } catch (error) {
      sonnerToast.error(error instanceof Error ? error.message : `Nao foi possivel baixar ${kind.toUpperCase()}.`);
    } finally {
      setProcessingInvoiceId(null);
    }
  }, []);

  return {
    cancelInvoice,
    downloadDocument,
    isIssuingInvoice,
    isSavingCompany,
    issueFromCashLaunch,
    issueManualNfse,
    processingInvoiceId,
    saveCompany,
    syncInvoice,
  };
};

