import { ArrowLeft, Bike, MessageSquare } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '../../firebase';

export const CheckoutScreen = () => (
  <div className="min-h-screen flex flex-col bg-gradient-to-b from-black via-slate-900 to-black">
    <div className="border-b border-slate-800/50 px-6 py-4">
      <button onClick={() => signOut(auth)} className="flex items-center gap-2 text-slate-400 hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Sair
      </button>
    </div>
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <section className="max-w-xl space-y-6 rounded-2xl border border-slate-700/50 bg-slate-800/30 p-8 text-center">
        <Bike className="mx-auto h-12 w-12 text-primary" />
        <h1 className="text-3xl font-bold text-white">Ativação manual</h1>
        <p className="text-sm leading-6 text-slate-300">
          A contratação e o pagamento são combinados diretamente. O acesso só é liberado ou renovado por um Master Admin
          depois de verificar o recebimento. Não envie comprovantes como confirmação automática: eles não ativam a conta.
        </p>
        <a href="https://wa.me/556999944024" target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 font-bold text-white">
          <MessageSquare className="h-4 w-4" /> Consultar plano e instruções de pagamento
        </a>
      </section>
    </main>
  </div>
);
