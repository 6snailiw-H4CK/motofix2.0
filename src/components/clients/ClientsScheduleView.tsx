import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  CheckCircle,
  CheckCircle2,
  Pencil,
  Phone,
  Plus,
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
  onAddClient: () => void;
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
  onAddClient,
  onEditClient,
  onDeleteClientClick,
}: ClientsScheduleViewProps) => (
  <div className="space-y-3.5">
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={onBack} className="rounded-full p-1.5 transition-colors hover:bg-slate-800">
        <ArrowLeft className="h-4 w-4" />
      </button>
      <h2 className="text-lg font-bold">Agenda de Clientes</h2>
      <div className="ml-auto rounded-full bg-primary/20 px-2 py-1">
        <span className="text-[11px] font-bold text-primary">{clients.length}</span>
      </div>
      <button
        type="button"
        onClick={onAddClient}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-white shadow-lg shadow-primary/10 transition-all hover:bg-primary/90 sm:w-auto"
      >
        <Plus className="h-3.5 w-3.5" />
        Cadastrar cliente
      </button>
    </div>

    {clients.length === 0 ? (
      <div className="rounded-xl border border-dashed border-slate-700/50 bg-slate-800/40 py-10 text-center">
        <Users className="mx-auto mb-3 h-7 w-7 text-slate-600" />
        <p className="text-sm font-bold text-slate-400">Nenhum cliente cadastrado</p>
        <p className="mt-1 text-xs text-slate-600">Cadastre clientes por aqui ou registre um novo servico.</p>
      </div>
    ) : (
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {clients.map((client) => {
          const statusConfig = getStatusConfig(client.status);
          const StatusIcon = statusConfig.icon;
          const balance = clientBalanceMap.get(client.id) || 0;
          const isConfirmingDelete = deleteConfirmId === client.id;

          return (
            <div
              key={client.id}
              className="group cursor-pointer space-y-2 rounded-xl border border-slate-700/50 bg-slate-800/40 p-3 transition-all hover:border-primary/50"
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
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-bold transition-colors group-hover:text-primary">{client.name}</h3>
                  <p className="truncate text-[10px] text-slate-500">{client.bikeModel}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-[9px] text-slate-600">
                    <Phone className="h-3 w-3 shrink-0" />
                    <span className="truncate">{client.contact}</span>
                  </p>
                </div>
                <div
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                    statusConfig.className
                  )}
                  title={statusConfig.label}
                >
                  <StatusIcon className="h-3.5 w-3.5" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-1.5 border-t border-slate-700/30 pt-2 text-[9px] text-slate-600">
                <p className="flex items-center gap-1 rounded-lg bg-slate-950/20 px-2 py-1">
                  <RefreshCw className="h-3 w-3 shrink-0" />
                  <span>Recorrencia: {client.recurrenceDays}d</span>
                </p>
                {client.lastMaintenanceDate && (
                  <p className="flex items-center gap-1 rounded-lg bg-slate-950/20 px-2 py-1">
                    <CalendarDays className="h-3 w-3 shrink-0" />
                    <span>Ultimo: {safeFormat(client.lastMaintenanceDate, 'dd/MM/yyyy')}</span>
                  </p>
                )}
                {balance > 0 && (
                  <p className="col-span-2 rounded-lg bg-red-500/10 px-2 py-1 font-bold text-red-500">Debito: R$ {balance.toFixed(2)}</p>
                )}
              </div>

              <div className="flex gap-2 border-t border-slate-700/30 pt-2 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onEditClient(client);
                  }}
                  className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-slate-700/50 px-2 py-1.5 text-[9px] font-bold text-slate-300 transition-colors hover:bg-primary/20 hover:text-primary"
                >
                  <Pencil className="h-3 w-3" />
                  Editar
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDeleteClientClick(client);
                  }}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[9px] font-bold transition-colors',
                    isConfirmingDelete ? 'bg-red-500 text-white' : 'bg-red-500/10 text-red-500 hover:bg-red-500/20'
                  )}
                >
                  {isConfirmingDelete ? <CheckCircle className="h-3 w-3" /> : <Trash2 className="h-3 w-3" />}
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
