import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  CheckCircle,
  CheckCircle2,
  Pencil,
  Phone,
  RefreshCw,
  Trash2,
  Users,
} from 'lucide-react';
import { cn, safeFormat } from '../../lib/utils';
import type { Client } from '../../types';

type ClientsScheduleViewProps = {
  clients: Client[];
  clientBalanceMap: Map<string, number>;
  deleteConfirmId?: string | null;
  onBack: () => void;
  onEditClient: (client: Client) => void;
  onDeleteClientClick: (client: Client) => void;
};

const getStatusConfig = (status: Client['status']) => {
  if (status === 'OK') {
    return {
      icon: CheckCircle2,
      className: 'bg-emerald-500/20 text-emerald-500',
      label: 'OK',
    };
  }

  if (status === 'WARNING') {
    return {
      icon: AlertTriangle,
      className: 'bg-yellow-500/20 text-yellow-500',
      label: 'Alerta',
    };
  }

  return {
    icon: AlertTriangle,
    className: 'bg-red-500/20 text-red-500',
    label: 'Atrasado',
  };
};

export const ClientsScheduleView = ({
  clients,
  clientBalanceMap,
  deleteConfirmId,
  onBack,
  onEditClient,
  onDeleteClientClick,
}: ClientsScheduleViewProps) => (
  <div className="space-y-4">
    <div className="flex items-center gap-3">
      <button type="button" onClick={onBack} className="p-1.5 rounded-full hover:bg-slate-800 transition-colors">
        <ArrowLeft className="w-5 h-5" />
      </button>
      <h2 className="text-xl font-bold">Agenda de Clientes</h2>
      <div className="ml-auto bg-primary/20 px-2 py-1 rounded-full">
        <span className="text-xs font-bold text-primary">{clients.length}</span>
      </div>
    </div>

    {clients.length === 0 ? (
      <div className="text-center py-12 bg-slate-800/40 rounded-xl border border-dashed border-slate-700/50">
        <Users className="w-8 h-8 text-slate-600 mx-auto mb-3" />
        <p className="text-slate-400 text-sm font-bold">Nenhum cliente cadastrado</p>
        <p className="text-slate-600 text-xs mt-1">Registre servicos em Servicos Rapidos para adicionar clientes</p>
      </div>
    ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {clients.map((client) => {
          const statusConfig = getStatusConfig(client.status);
          const StatusIcon = statusConfig.icon;
          const balance = clientBalanceMap.get(client.id) || 0;
          const isConfirmingDelete = deleteConfirmId === client.id;

          return (
            <div
              key={client.id}
              className="bg-slate-800/40 p-4 rounded-xl border border-slate-700/50 space-y-3 hover:border-primary/50 transition-all cursor-pointer group"
              onClick={() => onEditClient(client)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onEditClient(client);
                }
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-sm group-hover:text-primary transition-colors truncate">{client.name}</h3>
                  <p className="text-[10px] text-slate-500 truncate">{client.bikeModel}</p>
                  <p className="text-[9px] text-slate-600 mt-1 flex items-center gap-1">
                    <Phone className="w-3 h-3 shrink-0" />
                    <span className="truncate">{client.contact}</span>
                  </p>
                </div>
                <div
                  className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
                    statusConfig.className
                  )}
                  title={statusConfig.label}
                >
                  <StatusIcon className="w-4 h-4" />
                </div>
              </div>

              <div className="text-[9px] text-slate-600 pt-2 border-t border-slate-700/30 space-y-1">
                <p className="flex items-center gap-1">
                  <RefreshCw className="w-3 h-3" />
                  <span>Recorrencia: {client.recurrenceDays}d</span>
                </p>
                {client.lastMaintenanceDate && (
                  <p className="flex items-center gap-1">
                    <CalendarDays className="w-3 h-3" />
                    <span>Ultimo: {safeFormat(client.lastMaintenanceDate, 'dd/MM/yyyy')}</span>
                  </p>
                )}
                {balance > 0 && (
                  <p className="mt-1 text-red-500 font-bold">Debito: R$ {balance.toFixed(2)}</p>
                )}
              </div>

              <div className="flex gap-2 pt-2 border-t border-slate-700/30 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onEditClient(client);
                  }}
                  className="flex-1 px-2 py-1.5 rounded-lg bg-slate-700/50 text-slate-300 hover:bg-primary/20 hover:text-primary transition-colors text-[9px] font-bold flex items-center justify-center gap-1"
                >
                  <Pencil className="w-3 h-3" />
                  Editar
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDeleteClientClick(client);
                  }}
                  className={cn(
                    'flex-1 px-2 py-1.5 rounded-lg transition-colors text-[9px] font-bold flex items-center justify-center gap-1',
                    isConfirmingDelete ? 'bg-red-500 text-white' : 'bg-red-500/10 text-red-500 hover:bg-red-500/20'
                  )}
                >
                  {isConfirmingDelete ? <CheckCircle className="w-3 h-3" /> : <Trash2 className="w-3 h-3" />}
                  {isConfirmingDelete ? 'Confirmar' : 'Deletar'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    )}
  </div>
);
