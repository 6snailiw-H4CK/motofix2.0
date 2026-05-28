import { Bike, MessageCircle } from 'lucide-react';
import { auth } from '../../firebase';

export const LoadingScreen = () => {
  const userId = auth.currentUser?.uid || 'seu-id';
  const activationMessage = `Ol\u00e1, quero ativar meu acesso no MotoFix! Meu ID \u00e9: ${userId}`;
  const whatsappUrl = `https://wa.me/556999944024?text=${encodeURIComponent(activationMessage)}`;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background-dark">
      <div className="relative">
        <div className="w-16 h-16 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        <Bike className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 text-primary" />
      </div>
      <p className="mt-4 text-slate-400 font-medium animate-pulse">Carregando MotoFix...</p>

      <div className="mt-8 flex gap-4 text-center">
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-xs text-slate-400 hover:text-primary transition-colors"
        >
          <MessageCircle className="w-4 h-4" />
          <span>WhatsApp</span>
        </a>
        <span className="text-slate-600">|</span>
        <a
          href="https://instagram.com/motofix_recorrentes"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-slate-400 hover:text-primary transition-colors"
        >
          @motofix_recorrentes
        </a>
      </div>
    </div>
  );
};
