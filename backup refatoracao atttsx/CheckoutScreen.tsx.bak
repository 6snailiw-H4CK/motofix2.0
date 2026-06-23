import { useState } from 'react';
import { ArrowLeft, Bell, Bike, CheckCircle } from 'lucide-react';
import { User, signOut } from 'firebase/auth';
import { toast as sonnerToast } from 'sonner';
import { auth } from '../../firebase';

type CheckoutScreenProps = {
  user: User;
  onPaymentSuccess: () => void;
};

export const CheckoutScreen = ({ user, onPaymentSuccess }: CheckoutScreenProps) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [stripeLoaded, setStripeLoaded] = useState(false);

  const handleCheckout = async () => {
    try {
      setIsProcessing(true);
      setShowPaymentForm(true);
    } catch (error) {
      console.error('Erro ao iniciar checkout:', error);
      sonnerToast.error('Erro ao processar pagamento');
    } finally {
      setIsProcessing(false);
    }
  };

  void user;
  void onPaymentSuccess;
  void stripeLoaded;
  void setStripeLoaded;

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-black via-slate-900 to-black overflow-hidden">
      <div className="fixed top-0 left-0 w-96 h-96 bg-primary/5 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
      <div className="fixed bottom-0 right-0 w-96 h-96 bg-primary/5 rounded-full blur-3xl translate-x-1/2 translate-y-1/2 pointer-events-none" />

      <div className="relative z-10 border-b border-slate-800/50 px-6 py-4">
        <button onClick={() => signOut(auth)} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">Sair</span>
        </button>
      </div>

      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 py-12">
        <div className="max-w-md w-full space-y-8">
          {!showPaymentForm ? (
            <>
              <div className="space-y-6 text-center">
                <div className="inline-block">
                  <div className="bg-gradient-to-br from-primary/30 to-primary/10 backdrop-blur-xl p-4 rounded-2xl border border-primary/20">
                    <Bike className="w-12 h-12 text-primary" />
                  </div>
                </div>

                <div className="space-y-2">
                  <h2 className="text-3xl font-bold text-white">Ative sua assinatura</h2>
                  <p className="text-slate-400 text-sm">Acesse todas as features do MotoFix Manager</p>
                </div>
              </div>

              <div className="bg-gradient-to-br from-slate-800/50 to-slate-800/20 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-8 space-y-6">
                <div className="text-center space-y-2">
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="text-5xl font-bold text-white">R$ 49</span>
                    <span className="text-slate-400">,90</span>
                  </div>
                  <p className="text-slate-400 text-sm">por mÃªs</p>
                </div>

                <div className="space-y-3 border-y border-slate-700/50 py-6">
                  {[
                    'Dashboard com anÃ¡lise de receita',
                    'GestÃ£o de clientes e veÃ­culos',
                    'Alertas inteligentes via WhatsApp',
                    'Certificados e garantias automÃ¡ticas',
                    'Suporte prioritÃ¡rio'
                  ].map(item => (
                    <div key={item} className="flex items-start gap-3">
                      <CheckCircle className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-slate-300">{item}</span>
                    </div>
                  ))}
                </div>

                <button
                  onClick={handleCheckout}
                  disabled={isProcessing}
                  className="w-full px-4 py-3 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 disabled:from-slate-600 disabled:to-slate-600 text-white font-bold rounded-xl transition-all active:scale-95"
                >
                  {isProcessing ? 'Processando...' : 'Pagar agora com PIX ou CartÃ£o'}
                </button>

                <p className="text-xs text-slate-500 text-center">
                  Cancelar assinatura a qualquer momento. Sem compromisso.
                </p>
              </div>
            </>
          ) : (
            <div className="bg-gradient-to-br from-slate-800/50 to-slate-800/20 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-8 text-center space-y-4">
              <div className="bg-slate-800/50 rounded-xl p-6 space-y-3">
                <Bell className="w-8 h-8 text-primary mx-auto" />
                <h3 className="text-white font-bold">FormulÃ¡rio de pagamento</h3>
                <p className="text-sm text-slate-400">O Stripe Payment Element serÃ¡ carregado aqui</p>
                <p className="text-xs text-slate-500 bg-slate-900/50 p-3 rounded">
                  âš ï¸ Aguardando integraÃ§Ã£o do backend com Stripe para processar pagamentos
                </p>
              </div>
              <button
                onClick={() => setShowPaymentForm(false)}
                className="w-full px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition"
              >
                Voltar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
