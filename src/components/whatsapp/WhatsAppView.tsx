import { useEffect, useMemo, useState } from 'react';
import {
  Bot,
  CheckCircle2,
  CircleAlert,
  Link2Off,
  Loader2,
  MessageCircle,
  PhoneCall,
  Power,
  QrCode,
  RefreshCw,
  Send,
  Settings2,
  Smartphone,
  Users,
  Zap,
} from 'lucide-react';
import { cn, safeFormat } from '../../lib/utils';
import { useWhatsAppConnection } from '../../modules/whatsapp/hooks/useWhatsAppConnection';
import { formatWhatsAppPhoneForDisplay } from '../../modules/whatsapp/utils/phone';
import type { WhatsAppAutomation, WhatsAppSessionStatus } from '../../modules/whatsapp/types';

const statusMeta: Record<WhatsAppSessionStatus, { label: string; tone: string; description: string }> = {
  disconnected: {
    label: 'Desconectado',
    tone: 'border-slate-700 bg-slate-900/70 text-slate-300',
    description: 'Nenhum WhatsApp conectado nesta oficina.',
  },
  connecting: {
    label: 'Conectando',
    tone: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    description: 'Aguardando geracao do QR Code.',
  },
  qr: {
    label: 'QR disponivel',
    tone: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300',
    description: 'Leia o QR Code pelo WhatsApp do aparelho da oficina.',
  },
  connected: {
    label: 'Conectado',
    tone: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    description: 'Pronto para receber e enviar mensagens.',
  },
  reconnecting: {
    label: 'Reconectando',
    tone: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    description: 'Tentando recuperar a sessao automaticamente.',
  },
  error: {
    label: 'Erro',
    tone: 'border-red-500/30 bg-red-500/10 text-red-300',
    description: 'Revise o status e tente reconectar.',
  },
};

type ToggleRowProps = {
  checked: boolean;
  disabled?: boolean;
  icon: typeof Bot;
  label: string;
  description: string;
  onChange: (checked: boolean) => void;
};

const ToggleRow = ({ checked, disabled, icon: Icon, label, description, onChange }: ToggleRowProps) => (
  <button
    type="button"
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={cn(
      'flex w-full items-center justify-between gap-3 rounded-2xl border p-3 text-left transition-all',
      checked ? 'border-primary/40 bg-primary/10' : 'border-slate-800 bg-slate-950/30 hover:border-slate-700',
      disabled && 'cursor-not-allowed opacity-60'
    )}
  >
    <span className="flex min-w-0 items-center gap-3">
      <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl', checked ? 'bg-primary/15 text-primary' : 'bg-slate-900 text-slate-500')}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-black text-white">{label}</span>
        <span className="block text-xs text-slate-500">{description}</span>
      </span>
    </span>
    <span className={cn('relative h-7 w-12 shrink-0 rounded-full border transition-colors', checked ? 'border-primary bg-primary/30' : 'border-slate-700 bg-slate-900')}>
      <span className={cn('absolute top-1 h-5 w-5 rounded-full bg-white transition-all', checked ? 'left-6' : 'left-1')} />
    </span>
  </button>
);

const getSessionSummary = (status?: WhatsAppSessionStatus) => statusMeta[status || 'disconnected'];

const toReadableDate = (value?: string) => {
  if (!value) return '-';
  return safeFormat(value, 'dd/MM/yyyy HH:mm') || value;
};

export const WhatsAppView = () => {
  const {
    automation,
    connect,
    contacts,
    disconnect,
    error,
    loading,
    messages,
    qrCode,
    reconnect,
    refreshContacts,
    refreshMessages,
    refreshQrCode,
    refreshStatus,
    sendMessage,
    session,
    updateAutomation,
  } = useWhatsAppConnection({ autoLoad: true });
  const [testPhone, setTestPhone] = useState('');
  const [testMessage, setTestMessage] = useState('Ola! Esta e uma mensagem de teste do MotoFix.');
  const [feedback, setFeedback] = useState<string | null>(null);

  const meta = getSessionSummary(session?.status);
  const isConnected = session?.connected && session.status === 'connected';
  const shouldPollQr = session?.status === 'connecting' || session?.status === 'qr' || session?.status === 'reconnecting';
  const visibleError = error || (session?.status === 'error' ? session.error : null);

  const sortedMessages = useMemo(() => [...messages].slice(-20).reverse(), [messages]);

  useEffect(() => {
    void refreshMessages(30).catch(() => null);
    void refreshContacts(30).catch(() => null);
  }, [refreshContacts, refreshMessages]);

  useEffect(() => {
    if (!shouldPollQr) return;
    const interval = window.setInterval(() => {
      void refreshStatus().catch(() => null);
      void refreshQrCode().catch(() => null);
    }, 3000);
    return () => window.clearInterval(interval);
  }, [refreshQrCode, refreshStatus, shouldPollQr]);

  const handleConnect = async () => {
    setFeedback(null);
    try {
      await connect();
      await refreshQrCode().catch(() => null);
      setFeedback('Sessao iniciada. Leia o QR Code quando aparecer.');
    } catch {
      setFeedback(null);
    }
  };

  const handleReconnect = async () => {
    setFeedback(null);
    try {
      await reconnect();
      await refreshQrCode().catch(() => null);
      setFeedback('Reconexao solicitada.');
    } catch {
      setFeedback(null);
    }
  };

  const handleDisconnect = async () => {
    setFeedback(null);
    try {
      await disconnect(false);
      setFeedback('WhatsApp desconectado desta oficina.');
    } catch {
      setFeedback(null);
    }
  };

  const handleAutomationChange = async (patch: Partial<Pick<WhatsAppAutomation, 'enabled' | 'aiEnabled' | 'autoReplyEnabled' | 'appointmentEnabled'>>) => {
    try {
      const next = await updateAutomation(patch);
      setFeedback(next.enabled ? 'Automacao atualizada.' : 'Automacao pausada.');
    } catch {
      setFeedback(null);
    }
  };

  const handleSendTest = async () => {
    setFeedback(null);
    try {
      await sendMessage({ to: testPhone, text: testMessage });
      setFeedback('Mensagem de teste enviada.');
      setTestMessage('Ola! Esta e uma mensagem de teste do MotoFix.');
      await refreshMessages(30).catch(() => null);
      await refreshContacts(30).catch(() => null);
    } catch {
      setFeedback(null);
      await refreshMessages(30, { clearError: false }).catch(() => null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-primary">Atendimento conectado</p>
          <h2 className="mt-1 text-2xl font-black text-white">WhatsApp IA</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            Conecte o WhatsApp da oficina, acompanhe mensagens e prepare respostas automaticas com IA.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <button
            type="button"
            onClick={() => void refreshStatus().catch(() => undefined)}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-xs font-black text-slate-200 transition hover:border-primary/40"
          >
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </button>
          {isConnected ? (
            <button
              type="button"
              onClick={() => void handleDisconnect()}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs font-black text-red-300 transition hover:bg-red-500/15 disabled:opacity-60"
            >
              <Link2Off className="h-4 w-4" />
              Desconectar
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleConnect()}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-xs font-black text-white shadow-lg shadow-primary/20 transition hover:bg-primary/90 disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
              Conectar
            </button>
          )}
        </div>
      </div>

      {(feedback || visibleError) && (
        <div className={cn(
          'flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold',
          visibleError ? 'border-red-500/30 bg-red-500/10 text-red-200' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
        )}>
          {visibleError ? <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>{visibleError || feedback}</span>
        </div>
      )}

      <section className="grid gap-4 xl:grid-cols-[1fr_22rem]">
        <div className="rounded-3xl border border-slate-800 bg-slate-950/40 p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className={cn('grid h-12 w-12 shrink-0 place-items-center rounded-2xl border', meta.tone)}>
                <Smartphone className="h-6 w-6" />
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">Status da sessao</p>
                <h3 className="mt-1 text-xl font-black text-white">{meta.label}</h3>
                <p className="mt-1 text-sm text-slate-400">{meta.description}</p>
                {session?.status === 'error' && session.error ? (
                  <p className="mt-2 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-200">
                    {session.error}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-3 lg:w-[32rem]">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Telefone</p>
                <p className="mt-1 truncate text-sm font-black text-white">
                  {session?.phoneNumber ? formatWhatsAppPhoneForDisplay(session.phoneNumber) : '-'}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Ultimo sinal</p>
                <p className="mt-1 truncate text-sm font-black text-white">{toReadableDate(session?.lastSeen)}</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Sessao</p>
                <p className="mt-1 truncate text-sm font-black text-white">{session?.sessionId || '-'}</p>
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[20rem_1fr]">
            <div className="rounded-3xl border border-slate-800 bg-slate-900/40 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-primary">Conexao</p>
                  <h4 className="text-base font-black text-white">QR Code</h4>
                </div>
                <QrCode className="h-5 w-5 text-slate-500" />
              </div>
              <div className="mt-4 grid min-h-72 place-items-center rounded-2xl border border-dashed border-slate-700 bg-slate-950/60 p-4">
                {qrCode?.qrCode ? (
                  <img
                    src={qrCode.qrCode}
                    alt="QR Code para conectar WhatsApp"
                    className="h-60 w-60 rounded-2xl bg-white p-3"
                  />
                ) : (
                  <div className="max-w-xs text-center">
                    <QrCode className="mx-auto h-10 w-10 text-slate-600" />
                    <p className="mt-3 text-sm font-bold text-slate-300">QR ainda nao disponivel</p>
                    <p className="mt-1 text-xs text-slate-500">Clique em conectar para iniciar a sessao da oficina.</p>
                  </div>
                )}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => void refreshQrCode().catch(() => undefined)}
                  className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-black text-slate-200 transition hover:border-primary/40"
                >
                  Buscar QR
                </button>
                <button
                  type="button"
                  onClick={() => void handleReconnect()}
                  disabled={loading}
                  className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-black text-slate-200 transition hover:border-primary/40 disabled:opacity-60"
                >
                  Reconectar
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-3xl border border-slate-800 bg-slate-900/40 p-4">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Settings2 className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-primary">Automacoes</p>
                    <h4 className="text-base font-black text-white">Controle por oficina</h4>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <ToggleRow
                    checked={automation?.enabled === true}
                    icon={Zap}
                    label="Modulo ativo"
                    description="Permite automacoes nesta oficina."
                    onChange={(enabled) => void handleAutomationChange({ enabled })}
                  />
                  <ToggleRow
                    checked={automation?.autoReplyEnabled === true}
                    disabled={!automation?.enabled}
                    icon={MessageCircle}
                    label="Resposta automatica"
                    description="Responde mensagens recebidas."
                    onChange={(autoReplyEnabled) => void handleAutomationChange({ autoReplyEnabled })}
                  />
                  <ToggleRow
                    checked={automation?.aiEnabled === true}
                    disabled={!automation?.enabled}
                    icon={Bot}
                    label="IA"
                    description="Usa IA quando houver chave configurada."
                    onChange={(aiEnabled) => void handleAutomationChange({ aiEnabled })}
                  />
                  <ToggleRow
                    checked={automation?.appointmentEnabled === true}
                    disabled={!automation?.enabled}
                    icon={PhoneCall}
                    label="Agenda e retornos"
                    description="Reservado para lembretes automaticos."
                    onChange={(appointmentEnabled) => void handleAutomationChange({ appointmentEnabled })}
                  />
                </div>
              </div>

              <div className="rounded-3xl border border-slate-800 bg-slate-900/40 p-4">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500/10 text-emerald-300">
                    <Send className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-300">Teste de envio</p>
                    <h4 className="text-base font-black text-white">Enviar mensagem manual</h4>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 lg:grid-cols-[16rem_1fr_auto]">
                  <input
                    value={testPhone}
                    onChange={(event) => setTestPhone(event.target.value)}
                    placeholder="WhatsApp do cliente"
                    className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-3 text-sm font-bold text-white outline-none transition focus:border-primary/50"
                  />
                  <input
                    value={testMessage}
                    onChange={(event) => setTestMessage(event.target.value)}
                    placeholder="Mensagem"
                    className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-3 text-sm font-bold text-white outline-none transition focus:border-primary/50"
                  />
                  <button
                    type="button"
                    onClick={() => void handleSendTest()}
                    disabled={!isConnected || loading || !testPhone.trim() || !testMessage.trim()}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-xs font-black text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Send className="h-4 w-4" />
                    Enviar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-3xl border border-slate-800 bg-slate-950/40 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">Contatos</p>
                <h3 className="text-lg font-black text-white">{contacts.length}</h3>
              </div>
              <Users className="h-5 w-5 text-slate-500" />
            </div>
            <div className="mt-4 max-h-80 space-y-2 overflow-y-auto pr-1">
              {contacts.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-slate-800 p-4 text-sm text-slate-500">Nenhum contato recebido ainda.</p>
              ) : contacts.slice(0, 12).map((contact) => (
                <div key={contact.id || contact.phone} className="rounded-2xl border border-slate-800 bg-slate-900/40 p-3">
                  <p className="truncate text-sm font-black text-white">{contact.name || formatWhatsAppPhoneForDisplay(contact.phone)}</p>
                  <p className="mt-1 truncate text-xs text-slate-500">{formatWhatsAppPhoneForDisplay(contact.phone)}</p>
                  <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-slate-600">{toReadableDate(contact.lastInteraction)}</p>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </section>

      <section className="rounded-3xl border border-slate-800 bg-slate-950/40 p-4 sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">Mensagens</p>
            <h3 className="text-lg font-black text-white">Ultimas conversas</h3>
          </div>
          <button
            type="button"
            onClick={() => void refreshMessages(50).catch(() => undefined)}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-2 text-xs font-black text-slate-200 transition hover:border-primary/40"
          >
            <RefreshCw className="h-4 w-4" />
            Recarregar
          </button>
        </div>
        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-800">
          {sortedMessages.length === 0 ? (
            <div className="grid min-h-36 place-items-center bg-slate-900/30 p-6 text-center text-sm text-slate-500">
              Nenhuma mensagem sincronizada ainda.
            </div>
          ) : (
            <div className="divide-y divide-slate-800">
              {sortedMessages.map((message) => {
                const failed = message.status === 'failed';
                const badgeLabel = failed ? 'Falhou' : message.direction === 'inbound' ? 'Recebida' : 'Enviada';
                return (
                  <div key={message.id || message.messageId} className="grid gap-3 bg-slate-900/30 p-4 lg:grid-cols-[8rem_1fr_9rem] lg:items-center">
                    <div>
                      <span className={cn(
                        'rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-widest',
                        failed ? 'bg-red-500/10 text-red-300' : message.direction === 'inbound' ? 'bg-cyan-500/10 text-cyan-300' : 'bg-emerald-500/10 text-emerald-300'
                      )}>
                        {badgeLabel}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-slate-500">
                        {message.contactName || formatWhatsAppPhoneForDisplay(message.direction === 'inbound' ? message.from : message.to)}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-200">{message.text || '-'}</p>
                      {failed && message.error ? (
                        <p className="mt-1 text-xs font-semibold text-red-300">{message.error}</p>
                      ) : null}
                    </div>
                    <div className="text-left lg:text-right">
                      <p className="text-xs font-bold text-slate-400">{toReadableDate(message.timestamp)}</p>
                      <p className={cn('mt-1 text-[10px] font-black uppercase tracking-widest', failed ? 'text-red-300' : 'text-slate-600')}>{message.status}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default WhatsAppView;
