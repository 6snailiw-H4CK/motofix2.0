import { ArrowLeft, RefreshCw } from 'lucide-react';
import { safeFormat } from '../../lib/utils';
import type { Client, MaintenanceRecord } from '../../types';

export type ClientScheduleFormValues = {
  name: string;
  bikeModel: string;
  contact: string;
  email: string;
  vehiclePlate: string;
  mileageKm?: number;
  notes: string;
  _scheduleProfile: true;
};

type ClientScheduleFormProps = {
  editingClient: Client | null;
  historyRows: MaintenanceRecord[];
  isSaving: boolean;
  onBack: () => void;
  onSave: (values: ClientScheduleFormValues) => Promise<void> | void;
  onAfterSubmit: () => void;
};

export const ClientScheduleForm = ({
  editingClient,
  historyRows,
  isSaving,
  onBack,
  onSave,
  onAfterSubmit,
}: ClientScheduleFormProps) => (
  <div className="max-w-xl mx-auto space-y-4">
    <div className="flex items-center gap-3">
      <button type="button" onClick={onBack} className="p-1.5 rounded-full hover:bg-slate-800 transition-colors">
        <ArrowLeft className="w-5 h-5" />
      </button>
      <div>
        <h2 className="text-xl font-bold">{editingClient ? 'Ficha do cliente' : 'Novo cliente'}</h2>
        <p className="text-[10px] text-slate-500 mt-0.5">
          Dados de relacionamento. Servicos e pagamentos ficam em &quot;Novo registro&quot;.
        </p>
      </div>
    </div>

    <form
      key={editingClient?.id || 'schedule-new'}
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        const kmRaw = ((formData.get('mileageKm') as string) || '').replace(/\D/g, '');
        const mileageKmParsed = kmRaw ? parseInt(kmRaw, 10) : NaN;

        void onSave({
          name: formData.get('name') as string,
          bikeModel: formData.get('bikeModel') as string,
          contact: formData.get('contact') as string,
          email: (formData.get('email') as string) || '',
          vehiclePlate: (formData.get('vehiclePlate') as string) || '',
          mileageKm: Number.isFinite(mileageKmParsed) ? mileageKmParsed : undefined,
          notes: formData.get('notes') as string,
          _scheduleProfile: true,
        });
        onAfterSubmit();
      }}
      className="bg-slate-800/40 p-5 rounded-2xl border border-slate-700/50 space-y-4"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5 sm:col-span-2">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Nome completo</label>
          <input
            name="name"
            defaultValue={editingClient?.name || ''}
            required
            placeholder="Ex: Joao Silva"
            className="w-full bg-slate-900/50 border-slate-700 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">WhatsApp</label>
          <input
            name="contact"
            defaultValue={editingClient?.contact || ''}
            required
            placeholder="(69) 99999-9999"
            className="w-full bg-slate-900/50 border-slate-700 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">E-mail</label>
          <input
            name="email"
            type="email"
            defaultValue={editingClient?.email || ''}
            placeholder="cliente@email.com"
            className="w-full bg-slate-900/50 border-slate-700 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none"
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Veiculo (modelo)</label>
          <input
            name="bikeModel"
            defaultValue={editingClient?.bikeModel || ''}
            required
            placeholder="Ex: Honda CG 160"
            className="w-full bg-slate-900/50 border-slate-700 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Placa</label>
          <input
            name="vehiclePlate"
            defaultValue={editingClient?.vehiclePlate || ''}
            placeholder="ABC1D23"
            maxLength={8}
            className="w-full bg-slate-900/50 border-slate-700 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none uppercase"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Quilometragem</label>
          <input
            name="mileageKm"
            type="number"
            min={0}
            defaultValue={editingClient?.mileageKm !== undefined ? String(editingClient.mileageKm) : ''}
            placeholder="Ex: 12500"
            className="w-full bg-slate-900/50 border-slate-700 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none"
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Observacoes</label>
          <textarea
            name="notes"
            defaultValue={editingClient?.lastServiceNotes || ''}
            placeholder="Preferencias, restricoes, historico relevante..."
            className="w-full bg-slate-900/50 border-slate-700 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none min-h-[88px]"
          />
        </div>
      </div>

      {editingClient && historyRows.length > 0 && (
        <div className="rounded-xl border border-slate-700/50 bg-slate-900/30 p-3 space-y-2">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Ultimos servicos registrados</p>
          <ul className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {historyRows.map((maintenance) => (
              <li
                key={maintenance.id}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-[11px] border-b border-slate-800/80 pb-2 last:border-0 last:pb-0"
              >
                <div>
                  <span className="font-semibold text-slate-200">{maintenance.serviceType}</span>
                  <span className="text-slate-500 ml-2">{safeFormat(maintenance.date, 'dd/MM/yyyy')}</span>
                </div>
                <div className="flex flex-wrap gap-x-3 text-slate-400">
                  <span>R$ {(Number(maintenance.serviceValue) || 0).toFixed(2)}</span>
                  <span className="text-slate-500">{maintenance.statusPagamento || '-'}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
        <button
          type="button"
          onClick={onBack}
          className="w-full sm:w-auto px-6 bg-slate-700/50 py-3 rounded-xl font-bold hover:bg-slate-700 transition-all text-sm"
        >
          Cancelar
        </button>
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
            editingClient ? 'Salvar ficha' : 'Cadastrar cliente'
          )}
        </button>
      </div>
    </form>
  </div>
);
