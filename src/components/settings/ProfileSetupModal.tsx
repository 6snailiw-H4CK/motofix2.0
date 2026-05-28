import { useState, type FormEvent } from 'react';
import { Bike } from 'lucide-react';

export type ProfileSetupValues = {
  businessName: string;
  businessPhone: string;
  businessInstagram: string;
  businessAddress: string;
};

type ProfileSetupModalProps = {
  onComplete: (values: ProfileSetupValues) => Promise<void> | void;
};

export const ProfileSetupModal = ({ onComplete }: ProfileSetupModalProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const businessName = String(formData.get('businessName') || '').trim();
    if (!businessName) return;

    setIsSubmitting(true);
    try {
      await onComplete({
        businessName,
        businessPhone: String(formData.get('businessPhone') || '').trim(),
        businessInstagram: String(formData.get('businessInstagram') || '').trim(),
        businessAddress: String(formData.get('businessAddress') || '').trim(),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-slate-800 w-full max-w-md rounded-3xl border border-primary/30 p-8 shadow-2xl animate-in fade-in zoom-in duration-300">
        <div className="bg-primary/20 w-16 h-16 rounded-2xl flex items-center justify-center mb-6">
          <Bike className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Bem-vindo ao MotoFix!</h2>
        <p className="text-slate-400 mb-8">
          Para comecar, precisamos de alguns dados da sua empresa para os certificados de garantia.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">
              Nome da Empresa
            </label>
            <input
              name="businessName"
              required
              placeholder="Ex: MotoFix Centro Automotivo"
              className="w-full bg-slate-900 border-slate-700 rounded-xl p-3 focus:ring-primary"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">
              WhatsApp
            </label>
            <input
              name="businessPhone"
              placeholder="Ex: (69) 99999-9999"
              className="w-full bg-slate-900 border-slate-700 rounded-xl p-3 focus:ring-primary"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">
              Instagram (@)
            </label>
            <input
              name="businessInstagram"
              placeholder="Ex: @motofix_oficial"
              className="w-full bg-slate-900 border-slate-700 rounded-xl p-3 focus:ring-primary"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">
              Endereco
            </label>
            <input
              name="businessAddress"
              placeholder="Rua Exemplo, 123 - Centro"
              className="w-full bg-slate-900 border-slate-700 rounded-xl p-3 focus:ring-primary"
            />
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-primary py-4 rounded-2xl font-bold text-white mt-4 hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Salvando...' : 'Concluir Cadastro'}
          </button>
        </form>
      </div>
    </div>
  );
};
