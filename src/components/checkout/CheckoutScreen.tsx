import { type FormEvent, useCallback, useMemo, useState } from 'react';
import { ArrowLeft, Bell, Bike, CheckCircle } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { toast as sonnerToast } from 'sonner';
import { auth } from '../../firebase';
import { createCheckoutSession, getStripePublishableKey } from '../../services/stripeService';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe, type Stripe, type StripeElementsOptions } from '@stripe/stripe-js';

type CheckoutScreenProps = {
  userId: string;
  userEmail: string;
  onPaymentSuccess: () => void;
};

type CheckoutFormProps = {
  onPaymentSuccess: () => void;
  isConfirming: boolean;
  setIsConfirming: (value: boolean) => void;
  setErrorMessage: (value: string | null) => void;
};

const CheckoutForm = ({ onPaymentSuccess, isConfirming, setIsConfirming, setErrorMessage }: CheckoutFormProps) => {
  const stripe = useStripe();
  const elements = useElements();

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!stripe || !elements) {
        setErrorMessage('Stripe ainda não está pronto. Aguarde alguns segundos.');
        return;
      }

      setIsConfirming(true);
      setErrorMessage(null);

      const result = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: window.location.href,
        },
        redirect: 'if_required',
      });

      if (result.error) {
        setErrorMessage(result.error.message ?? 'Erro ao confirmar pagamento.');
      } else if (result.paymentIntent?.status === 'succeeded') {
        onPaymentSuccess();
      }

      setIsConfirming(false);
    },
    [elements, onPaymentSuccess, setErrorMessage, setIsConfirming, stripe]
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4 rounded-3xl border border-slate-700/50 bg-slate-900/60 p-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <Bell className="w-10 h-10 text-primary" />
          <h3 className="text-xl font-bold text-white">Pagamento seguro</h3>
          <p className="text-sm text-slate-400">Insira seus dados para ativar a assinatura.</p>
        </div>

        <div className="rounded-3xl bg-slate-950/80 p-4">
          <PaymentElement />
        </div>
      </div>

      <button
        type="submit"
        disabled={!stripe || !elements || isConfirming}
        className="w-full px-4 py-3 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 disabled:from-slate-600 disabled:to-slate-600 text-white font-bold rounded-xl transition-all active:scale-95"
      >
        {isConfirming ? 'Confirmando...' : 'Confirmar pagamento'}
      </button>
    </form>
  );
};

export const CheckoutScreen = ({ userId, userEmail, onPaymentSuccess }: CheckoutScreenProps) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  const handleCheckout = useCallback(async () => {
    try {
      setIsProcessing(true);
      setErrorMessage(null);

      if (!userEmail) {
        throw new Error('É necessário possuir um e-mail cadastrado para processar o pagamento.');
      }

      const [publishableKey, session] = await Promise.all([
        getStripePublishableKey(),
        createCheckoutSession({
          userId,
          userEmail,
          priceId: import.meta.env.VITE_STRIPE_PRICE_ID || 'price_monthly_49_90',
        }),
      ]);

      setStripePromise(loadStripe(publishableKey));
      setClientSecret(session.clientSecret);
      setShowPaymentForm(true);
    } catch (error) {
      console.error('Erro ao iniciar checkout:', error);
      sonnerToast.error('Erro ao processar pagamento. Verifique se o servidor Stripe está ativo.');
      setErrorMessage('Não foi possível iniciar a sessão de pagamento.');
    } finally {
      setIsProcessing(false);
    }
  }, [userEmail, userId]);

  const stripeOptions = useMemo<StripeElementsOptions | null>(() => {
    if (!clientSecret) return null;
    return {
      clientSecret,
      appearance: {
        theme: 'night',
        variables: {
          colorPrimary: '#8b5cf6',
          colorBackground: '#020617',
          colorText: '#f8fafc',
          colorDanger: '#ef4444',
        },
      },
    };
  }, [clientSecret]);

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
        <div className="max-w-xl w-full space-y-8">
          {errorMessage ? (
            <div className="rounded-3xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
              {errorMessage}
            </div>
          ) : null}

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
