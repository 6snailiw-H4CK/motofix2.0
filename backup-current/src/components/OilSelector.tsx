import React from 'react';
import { Droplets } from 'lucide-react';

interface OilSelectorProps {
  value: string;
  onChange: (value: string) => void;
  oilOptions: string[];
  label?: string;
  required?: boolean;
  className?: string;
}

export const OilSelector: React.FC<OilSelectorProps> = ({
  value,
  onChange,
  oilOptions,
  label = 'Tipo de Óleo',
  required = false,
  className = ''
}) => {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex justify-between items-center px-1">
        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
          <Droplets className="w-3 h-3" />
          {label}
        </label>
        {required && <span className="text-red-500 text-xs font-bold">*</span>}
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="w-full bg-slate-900/50 border border-slate-700 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none hover:border-slate-600 transition-colors"
      >
        <option value="">Selecione um óleo</option>
        {oilOptions.map((oil) => (
          <option key={oil} value={oil}>
            {oil}
          </option>
        ))}
      </select>
    </div>
  );
};
