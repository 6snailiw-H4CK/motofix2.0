import React, { useState, useEffect } from 'react';
import { ArrowLeft, RefreshCw, ChevronRight, Users } from 'lucide-react';
import { format, parseISO, addDays } from 'date-fns';
import { Client, MaintenanceRecord } from '../types';
import { cn } from '../lib/utils';
import { toast as sonnerToast } from 'sonner';

interface NewClientFormProps {
  editingClient: Client | null;
  maintenances: MaintenanceRecord[];
  isSaving: boolean;
  onBack: () => void;
  onSubmit: (clientData: Partial<Client> & {
    serviceType?: string;
    serviceValue?: number;
    statusPagamento?: string;
    valorPago?: number;
    notes?: string;
  }) => Promise<void>;
  clients: Client[];
}

export const NewClientForm: React.FC<NewClientFormProps> = ({
  editingClient,
  maintenances,
  isSaving,
  onBack,
  onSubmit,
  clients
}) => {
  // 📝 Form field states para sincronização
  const [clientNameInput, setClientNameInput] = useState('');
  const [clientSuggestions, setClientSuggestions] = useState<Client[]>([]);
  const [formServiceValue, setFormServiceValue] = useState<number>(0);
  const [formValorPago, setFormValorPago] = useState<number>(0);
  const [formStatusPagamento, setFormStatusPagamento] = useState<'Pago' | 'Pendente' | 'Parcial'>('Pago');
  const [formSaldoDevedor, setFormSaldoDevedor] = useState<number>(0);
  const [formBikeModel, setFormBikeModel] = useState('');
  const [formContact, setFormContact] = useState('');
  const [formRecurrenceDays, setFormRecurrenceDays] = useState(29);
  const [formLastMaintenanceDate, setFormLastMaintenanceDate] = useState('');
  const [formServiceType, setFormServiceType] = useState('Troca de Óleo');
  const [formNotes, setFormNotes] = useState('');
  const [formIsRecurring, setFormIsRecurring] = useState(true);

  // 🔄 Sincronizar com editingClient quando muda
  useEffect(() => {
    if (editingClient) {
      const clientMaintenance = maintenances
        .filter(m => m.clientId === editingClient.id)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

      setClientNameInput(editingClient.name || '');
      setFormBikeModel(editingClient.bikeModel || '');
      setFormContact(editingClient.contact || '');
      setFormServiceType(editingClient.lastServiceType || 'Troca de Óleo');
      setFormRecurrenceDays(editingClient.recurrenceDays || 29);
      setFormLastMaintenanceDate(
        editingClient.lastMaintenanceDate 
          ? format(parseISO(editingClient.lastMaintenanceDate), 'yyyy-MM-dd') 
          : format(new Date(), 'yyyy-MM-dd')
      );
      setFormNotes(editingClient.lastServiceNotes || '');
      setFormIsRecurring(editingClient.isRecurringRevenue ?? true);

      // Carregar valores de pagamento
      setFormServiceValue(clientMaintenance?.serviceValue || editingClient.lastServiceValue || 0);
      setFormValorPago(clientMaintenance?.valorPago || editingClient.valorPago || 0);
      setFormStatusPagamento(clientMaintenance?.statusPagamento || editingClient.statusPagamento || 'Pendente');
      setFormSaldoDevedor(
        clientMaintenance?.saldoDevedor || 
        ((clientMaintenance?.serviceValue || 0) - (clientMaintenance?.valorPago || 0)) || 0
      );
    } else {
      // Reset form
      setClientNameInput('');
      setFormServiceValue(0);
      setFormValorPago(0);
      setFormStatusPagamento('Pago');
      setFormSaldoDevedor(0);
      setFormBikeModel('');
      setFormContact('');
      setFormServiceType('Troca de Óleo');
      setFormRecurrenceDays(29);
      setFormLastMaintenanceDate(format(new Date(), 'yyyy-MM-dd'));
      setFormNotes('');
      setFormIsRecurring(true);
      setClientSuggestions([]);
    }
  }, [editingClient, maintenances]);

  const handleClientNameChange = (value: string) => {
    setClientNameInput(value);
    if (value.length > 0) {
      const normalizedInput = value.toLowerCase().trim();
      const filtered = clients.filter(c => 
        c.name.toLowerCase().includes(normalizedInput)
      );
      setClientSuggestions(filtered);
    } else {
      setClientSuggestions([]);
    }
  };

  const handleSelectClientSuggestion = (client: Client) => {
    setClientNameInput(client.name);
    setClientSuggestions([]);
    setFormBikeModel(client.bikeModel || '');
    setFormContact(client.contact || '');
    // Reset service values for new entry
    setFormServiceValue(0);
    setFormValorPago(0);
    setFormStatusPagamento('Pendente');
    setFormSaldoDevedor(0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formServiceValue || formServiceValue <= 0) {
      sonnerToast.error('❌ Valor do Serviço deve ser maior que R$ 0,00');
      return;
    }

    await onSubmit({
      name: clientNameInput || editingClient?.name || '',
      bikeModel: formBikeModel,
      contact: formContact,
      oilType: formBikeModel,
      oilPrice: 0,
      serviceType: formServiceType,
      serviceValue: formServiceValue,
      statusPagamento: formStatusPagamento,
      valorPago: formValorPago,
      isRecurringRevenue: formIsRecurring,
      recurrenceDays: formRecurrenceDays,
      lastMaintenanceDate: `${formLastMaintenanceDate}T12:00:00Z`,
      notes: formNotes
    });
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-20">
      <div className="flex items-center gap-3 mb-8">
        <button 
          onClick={onBack}
          className="p-2 rounded-full hover:bg-slate-800 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h2 className="text-2xl font-bold text-white">
            {editingClient ? '✏️ Editar Serviço' : '➕ Novo Serviço'}
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Preencha os dados abaixo para registrar o serviço de manutenção
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* SEÇÃO 1: DADOS DO CLIENTE */}
        <div className="bg-gradient-to-br from-slate-800/60 to-slate-800/40 p-6 rounded-2xl border border-slate-700/50 space-y-4 backdrop-blur">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
              <Users className="w-4 h-4 text-primary" />
            </div>
            <h3 className="font-bold text-white">Dados do Cliente</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2 relative md:col-span-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2">
                👤 Nome do Cliente
              </label>
              <input
                value={clientNameInput}
                onChange={(e) => handleClientNameChange(e.target.value)}
                required
                placeholder="Digite o nome ou use o autocomplete..."
                className="w-full bg-slate-900/70 border border-slate-700 rounded-xl p-3 text-sm focus:ring-2 focus:ring-primary outline-none transition-all"
              />
              {clientSuggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-10 max-h-48 overflow-y-auto">
                  {clientSuggestions.map(suggestion => (
                    <button
                      key={suggestion.id}
                      type="button"
                      onClick={() => handleSelectClientSuggestion(suggestion)}
                      className="w-full px-4 py-3 text-left hover:bg-primary/10 border-b border-slate-700/30 last:border-b-0 text-sm transition-colors flex items-center justify-between group"
                    >
                      <div>
                        <div className="font-semibold text-white">{suggestion.name}</div>
                        <div className="text-slate-500 text-xs">
                          {suggestion.bikeModel} • {suggestion.contact}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-primary transition-colors" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2">
                📱 WhatsApp
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
                placeholder="(69) 99999-9999"
                className="w-full bg-slate-900/70 border border-slate-700 rounded-xl p-3 text-sm focus:ring-2 focus:ring-primary outline-none transition-all"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2">
                🏍️ Modelo da Moto
              </label>
              <input
                value={formBikeModel}
                onChange={(e) => setFormBikeModel(e.target.value)}
                required
                placeholder="Ex: Honda CG 160"
                className="w-full bg-slate-900/70 border border-slate-700 rounded-xl p-3 text-sm focus:ring-2 focus:ring-primary outline-none transition-all"
              />
            </div>
          </div>
        </div>

        {/* SEÇÃO 2: DADOS DO SERVIÇO */}
        <div className="bg-gradient-to-br from-blue-900/30 to-blue-900/10 p-6 rounded-2xl border border-blue-700/30 space-y-4 backdrop-blur">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <span className="text-lg">🔧</span>
            </div>
            <h3 className="font-bold text-white">Dados do Serviço</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2">
                Tipo de Serviço
              </label>
              <select
                value={formServiceType}
                onChange={(e) => setFormServiceType(e.target.value)}
                className="w-full bg-slate-900/70 border border-slate-700 rounded-xl p-3 text-sm focus:ring-2 focus:ring-primary outline-none"
              >
                <option>Troca de Óleo</option>
                <option>Revisão</option>
                <option>Pneus</option>
                <option>Freios</option>
                <option>Outros</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2">
                💰 Valor do Serviço (R$)
              </label>
              <input
                type="number"
                step="0.01"
                value={formServiceValue}
                onChange={(e) => {
                  const val = parseFloat(e.target.value) || 0;
                  setFormServiceValue(val);
                  setFormSaldoDevedor(Math.max(0, val - formValorPago));
                }}
                required
                placeholder="0.00"
                className="w-full bg-slate-900/70 border border-slate-700 rounded-xl p-3 text-sm focus:ring-2 focus:ring-primary outline-none"
              />
            </div>
          </div>
        </div>

        {/* SEÇÃO 3: PAGAMENTO */}
        <div className="bg-gradient-to-br from-emerald-900/30 to-emerald-900/10 p-6 rounded-2xl border border-emerald-700/30 space-y-4 backdrop-blur">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <span className="text-lg">💳</span>
            </div>
            <h3 className="font-bold text-white">Pagamento</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2">
                Status do Pagamento
              </label>
              <select
                value={formStatusPagamento}
                onChange={(e) => setFormStatusPagamento(e.target.value as any)}
                className="w-full bg-slate-900/70 border border-slate-700 rounded-xl p-3 text-sm focus:ring-2 focus:ring-primary outline-none"
              >
                <option value="Pago">✅ Pago</option>
                <option value="Pendente">⏳ Pendente</option>
                <option value="Parcial">📊 Parcial</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2">
                Valor Pago (R$)
              </label>
              <input
                type="number"
                step="0.01"
                value={formValorPago}
                onChange={(e) => {
                  const val = parseFloat(e.target.value) || 0;
                  setFormValorPago(val);
                  setFormSaldoDevedor(Math.max(0, formServiceValue - val));
                }}
                placeholder="0.00"
                className="w-full bg-slate-900/70 border border-slate-700 rounded-xl p-3 text-sm focus:ring-2 focus:ring-primary outline-none"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2">
                Saldo Devedor (R$)
              </label>
              <div className="w-full bg-slate-900/70 border border-slate-700 rounded-xl p-3 text-sm font-bold text-red-400">
                R$ {formSaldoDevedor.toFixed(2)}
              </div>
            </div>
          </div>
        </div>

        {/* SEÇÃO 4: CONFIGURAÇÕES */}
        <div className="bg-gradient-to-br from-slate-800/60 to-slate-800/40 p-6 rounded-2xl border border-slate-700/50 space-y-4 backdrop-blur">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
              <span className="text-lg">⚙️</span>
            </div>
            <h3 className="font-bold text-white">Configurações</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2">
                Recorrência (Dias)
              </label>
              <input
                type="number"
                value={formRecurrenceDays}
                onChange={(e) => setFormRecurrenceDays(parseInt(e.target.value) || 29)}
                className="w-full bg-slate-900/70 border border-slate-700 rounded-xl p-3 text-sm focus:ring-2 focus:ring-primary outline-none"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2">
                Data do Serviço
              </label>
              <input
                type="date"
                value={formLastMaintenanceDate}
                onChange={(e) => setFormLastMaintenanceDate(e.target.value)}
                className="w-full bg-slate-900/70 border border-slate-700 rounded-xl p-3 text-sm focus:ring-2 focus:ring-primary outline-none"
              />
            </div>

            <div className="md:col-span-2 flex items-center gap-3 p-3 bg-slate-900/50 rounded-xl border border-slate-700/30">
              <input
                type="checkbox"
                checked={formIsRecurring}
                onChange={(e) => setFormIsRecurring(e.target.checked)}
                className="w-4 h-4 accent-primary"
              />
              <label className="text-sm font-bold text-white">
                🔄 Receita Recorrente
              </label>
            </div>

            <div className="md:col-span-2 space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2">
                Observações
              </label>
              <textarea
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder="Informações adicionais..."
                className="w-full bg-slate-900/70 border border-slate-700 rounded-xl p-3 text-sm focus:ring-2 focus:ring-primary outline-none min-h-20"
              />
            </div>
          </div>
        </div>

        {/* BOTÕES DE AÇÃO */}
        <div className="flex gap-3 sticky bottom-24 bg-slate-900/80 backdrop-blur p-4 rounded-xl border border-slate-700/50">
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
              editingClient ? '✏️ Salvar Alterações' : '➕ Registrar Serviço'
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
