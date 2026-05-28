import { AlertCircle, CheckCircle, X } from 'lucide-react';
import { cn } from '../../lib/utils';

type ToastProps = {
  message: string;
  type: 'success' | 'error';
  onClose: () => void;
};

export const Toast = ({ message, type, onClose }: ToastProps) => (
  <div
    className={cn(
      'fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-300',
      type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
    )}
  >
    {type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
    <p className="font-bold text-sm">{message}</p>
    <button onClick={onClose} className="ml-2 hover:opacity-70">
      <X className="w-4 h-4" />
    </button>
  </div>
);
