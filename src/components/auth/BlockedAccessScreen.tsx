import { LoaderCircle, Lock, MessageSquare, RefreshCw, Settings as SettingsIcon } from 'lucide-react';

type BlockedAccessScreenProps = {
  userId: string;
  onSignOut: () => void;
  onSubscribe: () => void;
  onRetryAccess: () => void;
  accessLoading: boolean;
  subscriptionDiagnostic?: {
    authenticated: boolean;
    profileLoaded: boolean;
    profileUid: string | null;
    manualAccessEnabled: boolean;
    manualAccessExpiresAt: string | null;
    now: string;
    subscriptionResolved: boolean;
    subscriptionActive: boolean;
    isExpired: boolean;
    shouldBlock: boolean;
    reason: string;
    accessError?: string | null;
  };
};

export const BlockedAccessScreen = ({ userId, onSignOut, onSubscribe, onRetryAccess, accessLoading, subscriptionDiagnostic }: BlockedAccessScreenProps) => (
  <div className="min-h-screen flex items-center justify-center bg-background-dark p-4">
    <div className="bg-slate-800 p-8 rounded-3xl border border-primary/20 max-w-md w-full text-center space-y-6">
      <div className="bg-primary/20 w-20 h-20 rounded-full flex items-center justify-center mx-auto">
        <Lock className="w-10 h-10 text-primary" />
      </div>
      <h1 className="text-2xl font-bold text-white">Acesso Restrito</h1>
      <p className="text-slate-400">
        {subscriptionDiagnostic?.accessError
          ? 'Não foi possível consultar um serviço auxiliar. Isso não determina se a conta está paga ou vencida; confira o estado manual da conta com o Master Admin.'
          : 'O acesso manual desta conta não está vigente. A ativação ou renovação depende da confirmação de um Master Admin.'}
      </p>
      {subscriptionDiagnostic?.accessError && (
        <>
          <p role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
            {subscriptionDiagnostic.accessError}
          </p>
          <button
            type="button"
            onClick={onRetryAccess}
            disabled={accessLoading}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-amber-400/30 py-3 text-sm font-bold text-amber-200 transition hover:bg-amber-400/10 disabled:cursor-wait disabled:opacity-60"
          >
            {accessLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Tentar validar novamente
          </button>
        </>
      )}
      {!subscriptionDiagnostic?.accessError && (
        <button onClick={onSubscribe} className="w-full py-3 bg-primary text-white font-bold rounded-xl hover:bg-primary/90 transition-all">Consultar ativação manual</button>
      )}
      {import.meta.env.DEV && subscriptionDiagnostic && (
        <div className="rounded-xl border border-amber-400/40 bg-slate-950 p-4 text-left text-xs text-amber-100">
          <p className="mb-3 font-bold uppercase tracking-widest text-amber-300">Diagnóstico de assinatura</p>
          <div className="grid gap-1">
            <p>Firebase UID: {userId}</p>
            <p>Auth: {String(subscriptionDiagnostic.authenticated)}</p>
            <p>Profile: {subscriptionDiagnostic.profileLoaded ? 'loaded' : 'null'}</p>
            <p>Profile UID: {subscriptionDiagnostic.profileUid || 'null'}</p>
            <p>Acesso manual ativado: {String(subscriptionDiagnostic.manualAccessEnabled)}</p>
            <p>Vigente até: {subscriptionDiagnostic.manualAccessExpiresAt || 'ausente'}</p>
            <p>Agora: {subscriptionDiagnostic.now}</p>
            <p>subscriptionResolved: {String(subscriptionDiagnostic.subscriptionResolved)}</p>
            <p>subscriptionActive: {String(subscriptionDiagnostic.subscriptionActive)}</p>
            <p>isExpired: {String(subscriptionDiagnostic.isExpired)}</p>
            <p>shouldBlock: {String(subscriptionDiagnostic.shouldBlock)}</p>
            <p>Gate reason: {subscriptionDiagnostic.reason}</p>
            {subscriptionDiagnostic.accessError && <p>Erro do access gate: {subscriptionDiagnostic.accessError}</p>}
          </div>
        </div>
      )}
      <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-700 text-left space-y-3">
        <a
          href="https://wa.me/556999944024"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm flex items-center gap-2 text-slate-300 hover:text-primary transition-colors"
        >
          <MessageSquare className="w-4 h-4 text-primary" />
          <span className="font-bold">WhatsApp:</span> +55 69 99994-4024
        </a>
        <a
          href="https://instagram.com/motofix_recorrentes"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm flex items-center gap-2 text-slate-300 hover:text-primary transition-colors"
        >
          <SettingsIcon className="w-4 h-4 text-primary" />
          <span className="font-bold">Instagram:</span> @motofix_recorrentes
        </a>
      </div>
      <div className="pt-4">
        <p className="text-xs text-slate-500 uppercase font-bold tracking-widest mb-2">Seu ID de Usuario:</p>
        <code className="bg-slate-900 px-3 py-1 rounded-lg text-primary text-xs">{userId}</code>
      </div>
      <button
        onClick={onSignOut}
        className="w-full py-3 bg-slate-700 text-white font-bold rounded-xl hover:bg-slate-600 transition-all"
      >
        Sair da Conta
      </button>
    </div>
  </div>
);
