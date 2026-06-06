import { ArrowLeft, CalendarClock, MessageSquare, Plus, RefreshCw, UserPlus } from 'lucide-react';
import { cn, safeFormat } from '../../lib/utils';
import type { Client } from '../../types';

type ReturnsViewProps = {
  clients: Client[];
  dailyPendingAlerts: Client[];
  processingId?: string | null;
  onBack: () => void;
  onEditClient: (client: Client) => void;
  onNewClient: () => void;
  onNewReturn: () => void;
  onRegisterReturn: (client: Client) => Promise<void> | void;
  onSendWhatsApp: (client: Client) => void;
};

type ReturnStatusMeta = {
  label: string;
  order: number;
  badge: string;
  border: string;
};

const statusMeta: Record<Client['status'], ReturnStatusMeta> = {
  OK: {
    label: 'Em dia',
    order: 3,
    badge: 'bg-emerald-500/10 text-emerald-300',
    border: 'border-emerald-500/15',
  },
  WARNING: {
    label: 'Proximo do vencimento',
    order: 2,
    badge: 'bg-amber-500/10 text-amber-300',
    border: 'border-amber-500/20',
  },
  OVERDUE: {
    label: 'Atrasado',
    order: 1,
    badge: 'bg-primary/10 text-primary',
    border: 'border-primary/30',
  },
};

const parseDateTime = (value?: string) => {
  if (!value) return Number.POSITIVE_INFINITY;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
};

const serviceLabel = (client: Client) => (
  client.lastServiceType || client.oilType || 'Retorno'
);

export const ReturnsView = ({
  clients,
  dailyPendingAlerts,
  processingId,
  onBack,
  onEditClient,
  onNewClient,
  onNewReturn,
  onRegisterReturn,
  onSendWhatsApp,
}: ReturnsViewProps) => {
  const contactTodayIds = new Set(dailyPendingAlerts.map((client) => client.id));
  const sortedClients = [...clients].sort((a, b) => {
    const statusDiff = statusMeta[a.status].order - statusMeta[b.status].order;
    if (statusDiff !== 0) return statusDiff;
    return parseDateTime(a.nextMaintenanceDate) - parseDateTime(b.nextMaintenanceDate);
  });

  const overdueCount = clients.filter((client) => client.status === 'OVERDUE').length;
  const warningCount = clients.filter((client) => client.status === 'WARNING').length;
  const activeCount = clients.length - overdueCount - warningCount;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={onBack}
            className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-700/70 bg-slate-900/70 text-slate-300 transition hover:border-primary/40 hover:text-white"
            aria-label="Voltar"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-primary">CRM de recorrencia</p>
            <h2 className="text-xl font-black text-white">Retornos</h2>
            <p className="text-xs text-slate-400">Clientes que precisam voltar para manutencao, cobranca de contato e acompanhamento.</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:flex">
          <button
            type="button"
            onClick={onNewClient}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-800 px-3 py-2 text-xs font-bold text-slate-100 transition hover:bg-slate-700"
          >
            <UserPlus className="h-4 w-4" />
            Novo cliente
          </button>
          <button
            type="button"
            onClick={onNewReturn}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-white shadow-lg shadow-primary/20 transition hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Novo retorno
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
          <p className="text-[9px] font-bold uppercase tracking-widest text-primary">Contatar hoje</p>
          <p className="mt-1 text-2xl font-black text-white">{dailyPendingAlerts.length}</p>
        </div>
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
          <p className="text-[9px] font-bold uppercase tracking-widest text-amber-300">Proximos</p>
          <p className="mt-1 text-2xl font-black text-white">{warningCount}</p>
        </div>
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
          <p className="text-[9px] font-bold uppercase tracking-widest text-emerald-300">Em dia</p>
          <p className="mt-1 text-2xl font-black text-white">{activeCount}</p>
        </div>
      </div>

      {dailyPendingAlerts.length > 0 && (
        <section className="rounded-2xl border border-primary/20 bg-primary/5 p-3">
          <div className="mb-2 flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-black text-white">Prioridade de contato ao abrir o app</h3>
          </div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {dailyPendingAlerts.slice(0, 6).map((client) => (
              <button
                key={client.id}
                type="button"
                onClick={() => onSendWhatsApp(client)}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-800/70 bg-slate-950/40 p-3 text-left transition hover:border-primary/40"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-white">{client.name}</p>
                  <p className="truncate text-[10px] text-slate-400">{client.bikeModel} - {serviceLabel(client)}</p>
                </div>
                <MessageSquare className="h-4 w-4 shrink-0 text-primary" />
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black text-white">Fila de retornos</h3>
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{clients.length} cliente(s)</span>
        </div>

        {sortedClients.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 text-center text-sm text-slate-400">
            Nenhum cliente cadastrado para recorrencia ainda.
          </div>
        ) : (
          <div className="grid gap-2 xl:grid-cols-2">
            {sortedClients.map((client) => {
              const meta = statusMeta[client.status];
              const isProcessing = processingId === client.id;
              const canRegisterReturn = client.status !== 'OK';

              return (
                <article
                  key={client.id}
                  className={cn('rounded-2xl border bg-slate-900/55 p-3 shadow-lg shadow-black/10', meta.border)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <button type="button" onClick={() => onEditClient(client)} className="min-w-0 text-left">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-primary" />
                        <h4 className="truncate text-base font-black text-white">{client.name}</h4>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-slate-400">{client.bikeModel || 'Moto nao informada'}</p>
                    </button>
                    <span className={cn('shrink-0 rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-widest', meta.badge)}>
                      {meta.label}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-xl bg-slate-950/40 p-2">
                      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Servico</p>
                      <p className="mt-1 truncate font-bold text-white">{serviceLabel(client)}</p>
                    </div>
                    <div className="rounded-xl bg-slate-950/40 p-2">
                      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Data do servico</p>
                      <p className="mt-1 font-bold text-white">{safeFormat(client.lastMaintenanceDate) || '-'}</p>
                    </div>
                    <div className="rounded-xl bg-slate-950/40 p-2">
                      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Retorno previsto</p>
                      <p className="mt-1 font-bold text-white">{safeFormat(client.nextMaintenanceDate) || '-'}</p>
                    </div>
                    <div className="rounded-xl bg-slate-950/40 p-2">
                      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Observacao</p>
                      <p className="mt-1 line-clamp-1 font-bold text-white">{client.lastServiceNotes || '-'}</p>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
                    <button
                      type="button"
                      onClick={() => onSendWhatsApp(client)}
                      className={cn(
                        'inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition',
                        contactTodayIds.has(client.id)
                          ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                          : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                      )}
                    >
                      <MessageSquare className="h-4 w-4" />
                      Avisar
                    </button>
                    <button
                      type="button"
                      onClick={() => void onRegisterReturn(client)}
                      disabled={!canRegisterReturn || isProcessing}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
                    >
                      <RefreshCw className="h-4 w-4" />
                      {isProcessing ? 'Salvando...' : 'Registrar'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
