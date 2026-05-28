import React, { useState, useEffect } from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Warranty, Settings } from '../../types';
import { toast as sonnerToast } from 'sonner';

interface WarrantyFormProps {
  editingWarranty: Warranty | null;
  settings: Settings | null;
  isSaving: boolean;
  onBack: () => void;
  onManageCategories?: () => void;
  onSubmit: (warrantyData: Partial<Warranty>) => Promise<void>;
}

export const WarrantyForm: React.FC<WarrantyFormProps> = ({
  editingWarranty,
  settings,
  isSaving,
  onBack,
  onManageCategories,
  onSubmit
}) => {
  // 📝 Form field states
  const [formClientName, setFormClientName] = useState('');
  const [formServiceType, setFormServiceType] = useState('');
  const [formServiceDescription, setFormServiceDescription] = useState('');
  const [formServiceValue, setFormServiceValue] = useState<number>(0);
  const [formServiceDate, setFormServiceDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [formDurationMonths, setFormDurationMonths] = useState(3);
  const [formClientPhone, setFormClientPhone] = useState('');

  // 🔄 Sincronizar com editingWarranty
  useEffect(() => {
    if (editingWarranty) {
      setFormClientName(editingWarranty.clientName || '');
      setFormServiceType(editingWarranty.serviceType || '');
      setFormServiceDescription(editingWarranty.serviceDescription || '');
      setFormServiceValue(editingWarranty.serviceValue || 0);
      setFormServiceDate(format(parseISO(editingWarranty.serviceDate), 'yyyy-MM-dd'));
      setFormDurationMonths(editingWarranty.durationMonths || 3);
      setFormClientPhone(editingWarranty.clientPhone || '');
    } else {
      // Reset
      setFormClientName('');
      setFormServiceType('');
      setFormServiceDescription('');
      setFormServiceValue(0);
      setFormServiceDate(format(new Date(), 'yyyy-MM-dd'));
      setFormDurationMonths(3);
      setFormClientPhone('');
    }
  }, [editingWarranty]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formServiceValue || formServiceValue <= 0) {
      sonnerToast.error('❌ Valor do Serviço deve ser maior que R$ 0,00');
      return;
    }

    await onSubmit({
      clientName: formClientName,
      serviceType: formServiceType,
      serviceDescription: formServiceDescription,
      serviceValue: formServiceValue,
      serviceDate: `${formServiceDate}T12:00:00Z`,
      durationMonths: formDurationMonths,
      clientPhone: formClientPhone
    });
  };

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <button 
          onClick={onBack}
          className="p-1.5 rounded-full hover:bg-slate-800 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-xl font-bold">
          {editingWarranty ? 'Editar Garantia' : 'Registrar Garantia'}
        </h2>
      </div>

      <form
        onSubmit={handleSubmit}
        className="bg-slate-800/40 p-5 rounded-2xl border border-slate-700/50 space-y-5"
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">
              Nome do Cliente
            </label>
            <input
              value={formClientName}
              onChange={(e) => setFormClientName(e.target.value)}
              required
              placeholder="Ex: João Silva"
              className="w-full bg-slate-900/50 border-slate-700 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between items-center px-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                Tipo de Serviço
              </label>
              {onManageCategories ? (
                <button
                  type="button"
                  onClick={onManageCategories}
                  className="text-[9px] text-primary hover:underline font-bold uppercase tracking-tighter"
                >
                  Gerenciar Lista
                </button>
              ) : null}
            </div>
            <select
              value={formServiceType}
              onChange={(e) => setFormServiceType(e.target.value)}
              required
              className="w-full bg-slate-900/50 border-slate-700 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none"
            >
              <option value="">Selecione um serviço</option>
              {editingWarranty?.serviceType && !settings?.warrantyCategories?.includes(editingWarranty.serviceType) && (
                <option value={editingWarranty.serviceType}>{editingWarranty.serviceType}</option>
              )}
              {settings?.warrantyCategories?.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">
              Descrição do Serviço
            </label>
            <textarea
              value={formServiceDescription}
              onChange={(e) => setFormServiceDescription(e.target.value)}
              placeholder="Detalhes adicionais do serviço"
              className="w-full bg-slate-900/50 border-slate-700 rounded-xl p-2.5 text-sm min-h-[80px] focus:ring-1 focus:ring-primary outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">
                Valor (R$)
              </label>
              <input
                type="number"
                step="0.01"
                value={formServiceValue}
                onChange={(e) => setFormServiceValue(parseFloat(e.target.value) || 0)}
                className="w-full bg-slate-900/50 border-slate-700 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">
                Data
              </label>
              <input
                type="date"
                value={formServiceDate}
                onChange={(e) => setFormServiceDate(e.target.value)}
                required
                className="w-full bg-slate-900/50 border-slate-700 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">
                Duração (meses)
              </label>
              <select
                value={formDurationMonths}
                onChange={(e) => setFormDurationMonths(parseInt(e.target.value))}
                className="w-full bg-slate-900/50 border-slate-700 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none"
              >
                <option value={1}>1 mês</option>
                <option value={3}>3 meses</option>
                <option value={6}>6 meses</option>
                <option value={12}>12 meses</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">
                Telefone
              </label>
              <input
                value={formClientPhone}
                onChange={(e) => setFormClientPhone(e.target.value)}
                placeholder="(11) 98765-4321"
                className="w-full bg-slate-900/50 border-slate-700 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none"
              />
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={isSaving}
            className="flex-1 bg-primary py-3 rounded-xl font-bold hover:bg-primary/90 transition-all text-sm shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSaving ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Salvando...
              </>
            ) : (
              editingWarranty ? 'Salvar Alterações' : 'Registrar Garantia'
            )}
          </button>
          <button
            type="button"
            onClick={onBack}
            className="px-6 bg-slate-700/50 py-3 rounded-xl font-bold hover:bg-slate-700 transition-all text-sm"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
};
