import { format, isBefore, parseISO } from 'date-fns';
import { CheckCircle, ChevronRight, Download, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { Warranty } from '../../types';

type WarrantiesViewProps = {
  warranties: Warranty[];
  deleteConfirmId?: string | null;
  onNewWarranty: () => void;
  onEditWarranty: (warranty: Warranty) => void;
  onGeneratePDF: (warranty: Warranty) => void;
  onDeleteWarrantyClick: (warranty: Warranty) => void;
};

export const WarrantiesView = ({
  warranties,
  deleteConfirmId,
  onNewWarranty,
  onEditWarranty,
  onGeneratePDF,
  onDeleteWarrantyClick,
}: WarrantiesViewProps) => (
  <div className="space-y-3">
    <div className="flex flex-col md:flex-row gap-2 items-center justify-between">
      <h2 className="text-lg font-bold">Garantias</h2>
      <button
        type="button"
        onClick={onNewWarranty}
        className="w-full md:w-auto bg-primary px-4 py-2 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-primary/90 transition-all text-xs"
      >
        <Plus className="w-3.5 h-3.5" /> Registrar Garantia
      </button>
    </div>

    {warranties.length === 0 ? (
      <div className="bg-slate-800/30 p-6 rounded-xl border border-slate-700/40 text-center">
        <ShieldCheck className="w-6 h-6 text-slate-500 mx-auto mb-2" />
        <p className="text-sm font-bold text-slate-300">Nenhuma garantia salva.</p>
        <p className="text-xs text-slate-500 mt-1">As garantias registradas vao aparecer aqui com o nome do cliente.</p>
      </div>
    ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        {warranties.map((warranty) => {
        const isConfirmingDelete = deleteConfirmId === warranty.id;
        const isExpired = isBefore(parseISO(warranty.expiryDate), new Date());

        return (
          <div key={warranty.id} className="bg-slate-800/30 p-3.5 rounded-xl border border-slate-700/40 space-y-2.5">
            <div className="flex justify-between items-start">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                  <h3 className="font-bold text-sm leading-tight">{warranty.clientName}</h3>
                </div>
                <p className="text-[10px] text-slate-500 uppercase font-bold tracking-tighter">{warranty.serviceType}</p>
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => onGeneratePDF(warranty)}
                  className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onEditWarranty(warranty)}
                  className="p-1.5 rounded-lg bg-slate-700/50 text-slate-300 hover:bg-slate-700 transition-colors"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteWarrantyClick(warranty)}
                  className={cn(
                    'p-1.5 rounded-lg transition-colors',
                    isConfirmingDelete
                      ? 'bg-red-500 text-white animate-pulse'
                      : 'bg-red-500/10 text-red-500 hover:bg-red-500/20'
                  )}
                >
                  {isConfirmingDelete ? <CheckCircle className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-700/20">
              <div>
                <p className="text-[8px] uppercase font-bold text-slate-500 tracking-widest">No.</p>
                <p className="text-[10px] font-medium">{warranty.warrantyNumber}</p>
              </div>
              <div className="rounded-2xl bg-white p-3 border border-slate-200">
                <p className="text-[8px] uppercase font-bold text-slate-950 tracking-widest">Vencimento</p>
                <p className={cn('text-[10px] font-bold text-slate-950', isExpired ? 'text-red-500' : 'text-slate-950')}>
                  {format(parseISO(warranty.expiryDate), 'dd/MM/yyyy')}
                </p>
              </div>
            </div>

            {warranty.serviceDescription && (
              <div className="pt-2 border-t border-slate-700/10">
                <p className="text-[10px] text-slate-400 leading-tight line-clamp-1 italic">
                  &quot;{warranty.serviceDescription}&quot;
                </p>
              </div>
            )}
          </div>
        );
        })}
      </div>
    )}
  </div>
);
