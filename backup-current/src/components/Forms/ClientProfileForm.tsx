import React, { useState, useEffect } from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { Client, Settings } from '../../types';
import { toast as sonnerToast } from 'sonner';

interface ClientProfileFormProps {
  editingClient: Client | null;
  settings: Settings | null;
  isSaving: boolean;
  onBack: () => void;
  onSubmit: (clientData: Partial<Client>) => Promise<void>;
}

export const ClientProfileForm: React.FC<ClientProfileFormProps> = ({
  editingClient,
  settings,
  isSaving,
  onBack,
  onSubmit
}) => {
  const [formName, setFormName] = useState('');
  const [formBikeModel, setFormBikeModel] = useState('');
  const [formContact, setFormContact] = useState('');
  const [formOilType, setFormOilType] = useState('10W30');
  const [formOilPrice, setFormOilPrice] = useState(0);
  const [formRecurrenceDays, setFormRecurrenceDays] = useState(29);
  const [formNotes, setFormNotes] = useState('');

  // 🔄 Sincronizar com editingClient
  useEffect(() => {
    if (editingClient) {
      setFormName(editingClient.name || '');
      setFormBikeModel(editingClient.bikeModel || '');
      setFormContact(editingClient.contact || '');
      setFormOilType(editingClient.oilType || '10W30');
      setFormOilPrice(editingClient.oilPrice || 0);
      setFormRecurrenceDays(editingClient.recurrenceDays || 29);
      setFormNotes(editingClient.lastServiceNotes || '');
    } else {
      setFormName('');
      setFormBikeModel('');
      setFormContact('');
      setFormOilType('10W30');
      setFormOilPrice(0);
      setFormRecurrenceDays(29);
      setFormNotes('');
    }
  }, [editingClient]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formName.trim()) {
      sonnerToast.error('❌ Nome do cliente é obrigatório');
      return;
    }

    await onSubmit({
      name: formName,
      bikeModel: formBikeModel,
      contact: formContact,
      oilType: formOilType,
      oilPrice: formOilPrice,
      recurrenceDays: formRecurrenceDays,
      lastServiceNotes: formNotes
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
          {editingClient ? 'Editar Cliente' : 'Adicionar Cliente'}
        </h2>
      </div>

      <form
        onSubmit={handleSubmit}
        className="bg-slate-800/40 p-5 rounded-2xl border border-slate-700/50 space-y-4"
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">
              Nome do Cliente
            </label>
            <input
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              required
              placeholder="Ex: João Silva"
              className="w-full bg-slate-900/50 border-slate-700 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">
              Modelo da Moto
            </label>
            <input
              value={formBikeModel}
              onChange={(e) => setFormBikeModel(e.target.value)}
              required
              placeholder="Ex: Honda CG 160"
              className="w-full bg-slate-900/50 border-slate-700 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">
              WhatsApp
            </label>
            <input
              value={formContact}
              onChange={(e) => {
                const val = e.target.value;
                const numeric = val.replace(/\D/g, '');
                let formatted = numeric;
                if (numeric.length > 2) {
                  formatted = `(${numeric.slice(0, 2)}) ${numeric.slice(2)}`;
                }
                if (numeric.length > 7) {
                  formatted = `(${numeric.slice(0, 2)}) ${numeric.slice(2, 7)}-${numeric.slice(7, 11)}`;
                }
                setFormContact(formatted);
              }}
              required
              placeholder="Ex: (69) 99999-9999"
              className="w-full bg-slate-900/50 border-slate-700 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">
              Tipo de Óleo
            </label>
            <select
              value={formOilType}
              onChange={(e) => setFormOilType(e.target.value)}
              className="w-full bg-slate-900/50 border-slate-700 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none"
            >
              {settings?.oilTypes?.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">
              Preço Padrão (R$)
            </label>
            <input
              type="number"
              step="0.01"
              value={formOilPrice}
              onChange={(e) => setFormOilPrice(parseFloat(e.target.value) || 0)}
              className="w-full bg-slate-900/50 border-slate-700 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">
              Recorrência (Dias)
            </label>
            <input
              type="number"
              value={formRecurrenceDays}
              onChange={(e) => setFormRecurrenceDays(parseInt(e.target.value) || 29)}
              required
              className="w-full bg-slate-900/50 border-slate-700 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">
              Observações
            </label>
            <textarea
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              placeholder="Informações adicionais..."
              className="w-full bg-slate-900/50 border-slate-700 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none h-16"
            />
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={isSaving}
            className="flex-1 bg-primary py-3 rounded-xl font-bold hover:bg-primary/90 transition-all text-sm shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isSaving ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Salvando...
              </>
            ) : (
              editingClient ? 'Salvar Alterações' : 'Adicionar Cliente'
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
