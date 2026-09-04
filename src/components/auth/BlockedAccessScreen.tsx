import { Lock, MessageSquare, Settings as SettingsIcon } from 'lucide-react';

type BlockedAccessScreenProps = {
  userId: string;
  onSignOut: () => void;
  onSubscribe: () => void;
  subscriptionDiagnostic?: {
    authenticated: boolean;
    profileLoaded: boolean;
    profileUid: string | null;
    billingLoaded: boolean;
    billingStatus: string | null;
    cancelAtPeriodEnd: boolean;
    currentPeriodEnd: string | null;
    formattedCurrentPeriodEnd: string;
    now: string;
    periodFuture: boolean;
    subscriptionResolved: boolean;
    subscriptionActive: boolean;
    isExpired: boolean;
    shouldBlock: boolean;
    reason: string;
  };
};

export const BlockedAccessScreen = ({ userId, onSignOut, onSubscribe, subscriptionDiagnostic }: BlockedAccessScreenProps) => (
  <div className="min-h-screen flex items-center justify-center bg-background-dark p-4">
    <div className="bg-slate-800 p-8 rounded-3xl border border-primary/20 max-w-md w-full text-center space-y-6">
      <div className="bg-primary/20 w-20 h-20 rounded-full flex items-center justify-center mx-auto">
        <Lock className="w-10 h-10 text-primary" />
      </div>
      <h1 className="text-2xl font-bold text-white">Acesso Restrito</h1>
      <p className="text-slate-400">Sua assinatura nao esta ativa. Assine para liberar o acesso automaticamente.</p>
      <button onClick={onSubscribe} className="w-full py-3 bg-primary text-white font-bold rounded-xl hover:bg-primary/90 transition-all">Assinar MotoFix</button>
      {import.meta.env.DEV && subscriptionDiagnostic && (
        <div className="rounded-xl border border-amber-400/40 bg-slate-950 p-4 text-left text-xs text-amber-100">
          <p className="mb-3 font-bold uppercase tracking-widest text-amber-300">Diagnóstico de assinatura</p>
          <div className="grid gap-1">
            <p>Firebase UID: {userId}</p>
            <p>Auth: {String(subscriptionDiagnostic.authenticated)}</p>
            <p>Profile: {subscriptionDiagnostic.profileLoaded ? 'loaded' : 'null'}</p>
            <p>Profile UID: {subscriptionDiagnostic.profileUid || 'null'}</p>
            <p>Billing: {subscriptionDiagnostic.billingLoaded ? 'loaded' : 'null'}</p>
            <p>billing.status: {subscriptionDiagnostic.billingStatus || 'null'}</p>
            <p>billing.cancelAtPeriodEnd: {String(subscriptionDiagnostic.cancelAtPeriodEnd)}</p>
            <p>billing.currentPeriodEnd: {subscriptionDiagnostic.currentPeriodEnd || 'null'}</p>
            <p>currentPeriodEnd formatado: {subscriptionDiagnostic.formattedCurrentPeriodEnd}</p>
            <p>Agora: {subscriptionDiagnostic.now}</p>
            <p>Período futuro: {String(subscriptionDiagnostic.periodFuture)}</p>
            <p>subscriptionResolved: {String(subscriptionDiagnostic.subscriptionResolved)}</p>
            <p>subscriptionActive: {String(subscriptionDiagnostic.subscriptionActive)}</p>
            <p>isExpired: {String(subscriptionDiagnostic.isExpired)}</p>
            <p>shouldBlock: {String(subscriptionDiagnostic.shouldBlock)}</p>
            <p>Gate reason: {subscriptionDiagnostic.reason}</p>
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
