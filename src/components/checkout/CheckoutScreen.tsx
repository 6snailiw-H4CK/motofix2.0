import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Bike, CheckCircle, Loader2 } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { toast } from 'sonner';
import { auth } from '../../firebase';
import { createCheckoutSession, getSubscriptionStatus } from '../../services/stripeService';

type CheckoutScreenProps = { userId: string; userEmail: string; onPaymentSuccess: () => void };

export const CheckoutScreen = ({ onPaymentSuccess }: CheckoutScreenProps) => {
  const [processing, setProcessing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const refresh = useCallback(async () => {
    const status = await getSubscriptionStatus();
    if (status.hasActiveSubscription) onPaymentSuccess();
    return status;
  }, [onPaymentSuccess]);

  useEffect(() => { void refresh().catch(() => undefined); }, [refresh]);
  const startCheckout = useCallback(async () => {
    try { setProcessing(true); window.location.assign((await createCheckoutSession('monthly')).url); }
    catch (error) { console.error('Stripe Checkout failed', error); toast.error('Nao foi possivel iniciar o checkout seguro.'); }
    finally { setProcessing(false); }
  }, []);
  const confirm = useCallback(async () => {
    try { setConfirming(true); const status = await refresh(); if (!status.hasActiveSubscription) toast.message('Pagamento recebido. Estamos confirmando sua assinatura...'); }
    catch { toast.error('Nao foi possivel consultar a assinatura. Tente novamente em instantes.'); }
    finally { setConfirming(false); }
  }, [refresh]);

  return <div className="min-h-screen flex flex-col bg-gradient-to-b from-black via-slate-900 to-black">
    <div className="border-b border-slate-800/50 px-6 py-4"><button onClick={() => signOut(auth)} className="flex items-center gap-2 text-slate-400 hover:text-white"><ArrowLeft className="h-4 w-4" />Sair</button></div>
    <main className="flex flex-1 items-center justify-center px-4 py-12"><div className="max-w-xl w-full space-y-8 text-center">
      <div><div className="inline-block rounded-2xl border border-primary/20 bg-primary/10 p-4"><Bike className="h-12 w-12 text-primary" /></div><h2 className="mt-5 text-3xl font-bold text-white">Ative sua assinatura</h2><p className="mt-2 text-sm text-slate-400">O pagamento e a ativacao sao confirmados pelo Stripe.</p></div>
      <section className="space-y-6 rounded-2xl border border-slate-700/50 bg-slate-800/30 p-8"><div><span className="text-5xl font-bold text-white">R$ 49</span><span className="text-slate-400">,90/mês</span></div>
        <div className="space-y-3 border-y border-slate-700/50 py-6 text-left">{['Dashboard financeiro', 'Gestao de clientes e veiculos', 'Alertas via WhatsApp', 'Certificados e garantias', 'Suporte prioritario'].map(item => <div key={item} className="flex gap-3 text-sm text-slate-300"><CheckCircle className="h-5 w-5 shrink-0 text-primary" />{item}</div>)}</div>
        <button onClick={startCheckout} disabled={processing} className="w-full rounded-xl bg-primary px-4 py-3 font-bold text-white disabled:bg-slate-600">{processing ? 'Redirecionando...' : 'Assinar com Stripe'}</button>
        <button onClick={confirm} disabled={confirming} className="text-sm text-slate-400 hover:text-white">{confirming ? <Loader2 className="inline h-4 w-4 animate-spin" /> : 'Ja paguei — confirmar assinatura'}</button>
      </section><p className="text-xs text-slate-500">Pagamento recebido? Estamos confirmando sua assinatura. O acesso so e liberado apos a confirmacao do webhook.</p>
    </div></main>
  </div>;
};
