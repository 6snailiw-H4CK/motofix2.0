import { addDays, format, parseISO } from 'date-fns';
import type { User } from 'firebase/auth';
import jsPDF from 'jspdf';
import { useCallback, useState } from 'react';
import { toast as sonnerToast } from 'sonner';
import { handleFirestoreError, OperationType } from '../services/firestoreError';
import { recordOperationalLog } from '../services/operationalLogRepository';
import { warrantyRepository } from '../services/warrantyRepository';
import type { Settings, Warranty } from '../types';

type UseWarrantyActionsParams = {
  user: User | null;
  settings: Settings | null;
  warranties: Warranty[];
  onOpenForm: () => void;
  onSaved: () => void;
  onDeleted: () => void;
  workshopName?: string;
};

export const useWarrantyActions = ({
  user,
  settings,
  warranties,
  onOpenForm,
  onSaved,
  onDeleted,
  workshopName,
}: UseWarrantyActionsParams) => {
  const [editingWarranty, setEditingWarranty] = useState<Warranty | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const generateWarrantyPDF = useCallback((warranty: Warranty) => {
    if (!settings) return;

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 15;

    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text(settings.businessName || 'MOTOFIX', margin, 20);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Servicos Especializados em Manutencao', margin, 26);
    doc.text(`WhatsApp: ${settings.businessPhone || 'N/A'} | Instagram: ${settings.businessInstagram || 'N/A'}`, margin, 30);
    if (settings.businessAddress) {
      doc.text(settings.businessAddress, margin, 34);
    }

    doc.setLineWidth(0.5);
    doc.line(margin, 37, pageWidth - margin, 37);

    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('CERTIFICADO DE GARANTIA', pageWidth / 2, 47, { align: 'center' });

    const boxY = 57;
    const boxHeight = 85;
    doc.setDrawColor(0);
    doc.setLineWidth(0.3);
    doc.roundedRect(margin, boxY, pageWidth - (margin * 2), boxHeight, 5, 5);

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    let currentY = boxY + 10;
    const lineSpacing = 6;

    doc.text(`No. da Garantia: ${warranty.warrantyNumber}`, margin + 5, currentY); currentY += lineSpacing;
    doc.text(`Cliente: ${warranty.clientName}`, margin + 5, currentY); currentY += lineSpacing;
    doc.text(`Telefone: ${warranty.clientPhone || 'N/A'}`, margin + 5, currentY); currentY += lineSpacing;
    doc.text(`Servico: ${warranty.serviceType}`, margin + 5, currentY); currentY += lineSpacing;

    const splitDescription = doc.splitTextToSize(`Descricao: ${warranty.serviceDescription || 'N/A'}`, pageWidth - (margin * 2) - 10);
    doc.text(splitDescription, margin + 5, currentY);
    currentY += splitDescription.length * lineSpacing;

    doc.text(`Valor: R$ ${warranty.serviceValue?.toFixed(2) || '0.00'}`, margin + 5, currentY); currentY += lineSpacing;
    doc.text(`Data do Servico: ${format(parseISO(warranty.serviceDate), 'yyyy-MM-dd')}`, margin + 5, currentY); currentY += lineSpacing;
    doc.text(`Duracao: ${warranty.durationMonths} mes(es)`, margin + 5, currentY); currentY += lineSpacing;
    doc.text(`Vencimento: ${format(parseISO(warranty.expiryDate), 'yyyy-MM-dd')}`, margin + 5, currentY);

    const termsY = boxY + boxHeight + 10;
    doc.setFont('helvetica', 'bold');
    doc.text('Termos da garantia', pageWidth - margin - 70, termsY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const terms = [
      '1) A garantia cobre exclusivamente o servico descrito neste certificado.',
      `2) Nao cobre mau uso, quedas, adaptacoes, violacao de lacres, ou pecas nao fornecidas/instaladas pela ${settings.businessName || 'empresa'}.`,
      '3) E obrigatorio apresentar este certificado (impresso ou digital) para acionamento.',
      '4) O prazo conta a partir da data do servico, ate a data de vencimento informada.',
    ];

    let termY = termsY + 6;
    terms.forEach((term) => {
      const splitTerm = doc.splitTextToSize(term, 70);
      doc.text(splitTerm, pageWidth - margin - 70, termY);
      termY += (splitTerm.length * 4) + 1;
    });

    const sigY = 240;
    doc.line(margin, sigY, margin + 80, sigY);
    doc.text('Assinatura do Cliente', margin + 40, sigY + 5, { align: 'center' });

    doc.line(pageWidth - margin - 80, sigY, pageWidth - margin, sigY);
    doc.text(`Assinatura ${settings.businessName || 'MotoFix'}`, pageWidth - margin - 40, sigY + 5, { align: 'center' });

    doc.setFontSize(7);
    const now = format(new Date(), "dd/MM/yyyy', 'HH:mm:ss");
    doc.text(`Emitido automaticamente em ${now}`, pageWidth - margin, 265, { align: 'right' });

    doc.save(`Garantia_${warranty.warrantyNumber}_${warranty.clientName}.pdf`);
  }, [settings]);

  const startNewWarranty = useCallback(() => {
    setEditingWarranty(null);
    onOpenForm();
  }, [onOpenForm]);

  const startEditWarranty = useCallback((warranty: Warranty) => {
    setEditingWarranty(warranty);
    onOpenForm();
  }, [onOpenForm]);

  const saveWarranty = useCallback(async (warrantyData: Partial<Warranty>) => {
    if (!user) return false;

    setIsSaving(true);

    const serviceDate = warrantyData.serviceDate || format(new Date(), "yyyy-MM-dd'T'HH:mm:ss'Z'");
    const duration = warrantyData.durationMonths || 3;
    const expiryDate = format(addDays(parseISO(serviceDate), duration * 30), "yyyy-MM-dd'T'HH:mm:ss'Z'");
    const nextNumber = warranties.length > 0 ? Math.max(...warranties.map(warranty => warranty.warrantyNumber)) + 1 : 1;

    const finalData = {
      ...warrantyData,
      serviceValue: Number.isNaN(warrantyData.serviceValue || 0) ? 0 : (warrantyData.serviceValue || 0),
      userId: user.uid,
      serviceDate,
      durationMonths: duration,
      expiryDate,
      warrantyNumber: warrantyData.warrantyNumber || nextNumber,
      createdAt: warrantyData.createdAt || format(new Date(), "yyyy-MM-dd'T'HH:mm:ss'Z'"),
    };

    try {
      if (editingWarranty) {
        await warrantyRepository.update(user.uid, editingWarranty.id, finalData);
        sonnerToast.success('Garantia atualizada com sucesso!');
      } else {
        const warrantyId = await warrantyRepository.create(user.uid, finalData);
        recordOperationalLog({
          userId: user.uid,
          usuario: user.email,
          oficina: workshopName || settings?.businessName,
          acao: 'garantia_criada',
          targetId: warrantyId,
          details: { clientName: finalData.clientName, warrantyNumber: finalData.warrantyNumber },
        });
        sonnerToast.success(
          typeof navigator !== 'undefined' && navigator.onLine === false
            ? 'Garantia salva neste computador. Sincronizacao pendente.'
            : 'Garantia registrada com sucesso!'
        );
        setTimeout(() => {
          generateWarrantyPDF({ ...finalData, id: warrantyId } as Warranty);
        }, 500);
      }

      setEditingWarranty(null);
      onSaved();
      return true;
    } catch (error) {
      sonnerToast.error('Erro ao salvar garantia.');
      handleFirestoreError(error, editingWarranty ? OperationType.UPDATE : OperationType.CREATE, 'warranties');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [editingWarranty, generateWarrantyPDF, onSaved, user, warranties, workshopName, settings?.businessName]);

  const deleteWarranty = useCallback(async (id: string) => {
    if (!user?.uid) return;

    try {
      await warrantyRepository.remove(user.uid, id);
      onDeleted();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'warranties');
    }
  }, [onDeleted, user]);

  return {
    deleteWarranty,
    editingWarranty,
    generateWarrantyPDF,
    isSaving,
    saveWarranty,
    startEditWarranty,
    startNewWarranty,
  };
};
