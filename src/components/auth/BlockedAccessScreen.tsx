import { Lock, MessageSquare, Settings as SettingsIcon } from 'lucide-react';

type BlockedAccessScreenProps = {
  userId: string;
  onSignOut: () => void;
};

export const BlockedAccessScreen = ({ userId, onSignOut }: BlockedAccessScreenProps) => (
  <div className="min-h-screen flex items-center justify-center bg-background-dark p-4">
    <div className="bg-slate-800 p-8 rounded-3xl border border-primary/20 max-w-md w-full text-center space-y-6">
      <div className="bg-primary/20 w-20 h-20 rounded-full flex items-center justify-center mx-auto">
        <Lock className="w-10 h-10 text-primary" />
      </div>
      <h1 className="text-2xl font-bold text-white">Acesso Restrito</h1>
      <p className="text-slate-400">Sua conta esta aguardando ativacao pelo administrador. Entre em contato para liberar seu acesso:</p>
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
