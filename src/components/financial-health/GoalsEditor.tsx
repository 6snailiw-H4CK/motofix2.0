/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Save, X } from 'lucide-react';
import { useState } from 'react';
import type { FinancialGoals } from '../../types';

interface GoalsEditorProps {
  goals: FinancialGoals | undefined;
  onSave: (goals: FinancialGoals) => Promise<void> | void;
  isSaving?: boolean;
}

const defaultGoals: FinancialGoals = {
  desiredMonthlyProfit: 12000,
  estimatedMonthlyCosts: 9000,
  targetMotosPerMonth: 40,
};

export function GoalsEditor({ goals, onSave, isSaving = false }: GoalsEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<FinancialGoals>(goals || defaultGoals);
  const currentGoals = goals || defaultGoals;

  const handleReset = () => {
    setFormData(currentGoals);
    setIsEditing(false);
  };

  const handleSave = async () => {
    await onSave(formData);
    setIsEditing(false);
  };

  const handleInputChange = (field: keyof FinancialGoals, value: string) => {
    const numValue = parseFloat(value) || 0;
    setFormData(prev => ({
      ...prev,
      [field]: numValue,
    }));
  };

  const currency = (value: number) =>
    value.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2,
    });

  const requiredRevenue = formData.estimatedMonthlyCosts + formData.desiredMonthlyProfit;
  const revenuePerMoto = formData.targetMotosPerMonth > 0 ? requiredRevenue / formData.targetMotosPerMonth : 0;

  if (!isEditing) {
    return (
      <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-4">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold text-slate-100">Suas Metas Financeiras</h3>
          <button
            onClick={() => setIsEditing(true)}
            className="rounded bg-primary/20 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/30"
          >
            Editar
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-slate-800/50 p-3">
            <p className="text-xs text-slate-400">Lucro Desejado/Mês</p>
            <p className="text-lg font-semibold text-green-400">{currency(currentGoals.desiredMonthlyProfit)}</p>
          </div>
          <div className="rounded-lg bg-slate-800/50 p-3">
            <p className="text-xs text-slate-400">Custos/Mês</p>
            <p className="text-lg font-semibold text-amber-400">{currency(currentGoals.estimatedMonthlyCosts)}</p>
          </div>
          <div className="rounded-lg bg-slate-800/50 p-3">
            <p className="text-xs text-slate-400">Meta de Motos</p>
            <p className="text-lg font-semibold text-blue-400">{currentGoals.targetMotosPerMonth}</p>
          </div>
        </div>

        <div className="mt-3 rounded-lg border border-slate-600 bg-slate-800/30 p-3">
          <p className="text-sm text-slate-300">
            Faturamento Necessário: <span className="font-bold text-purple-400">{currency(requiredRevenue)}</span>
            {' '} ({currency(revenuePerMoto)}/moto)
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-purple-600/50 bg-purple-950/20 p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold text-slate-100">Editar Metas Financeiras</h3>
      </div>

      <div className="space-y-4">
        {/* Lucro Desejado */}
        <div>
          <label className="block text-sm font-medium text-slate-300">
            Lucro Desejado por Mês (R$)
          </label>
          <input
            type="number"
            value={formData.desiredMonthlyProfit}
            onChange={e => handleInputChange('desiredMonthlyProfit', e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-slate-100 placeholder-slate-500 focus:border-primary focus:outline-none"
            step="100"
            min="0"
          />
          <p className="mt-1 text-xs text-slate-500">Quanto você quer ganhar por mês?</p>
        </div>

        {/* Custos Estimados */}
        <div>
          <label className="block text-sm font-medium text-slate-300">
            Custos Mensais Estimados (R$)
          </label>
          <input
            type="number"
            value={formData.estimatedMonthlyCosts}
            onChange={e => handleInputChange('estimatedMonthlyCosts', e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-slate-100 placeholder-slate-500 focus:border-primary focus:outline-none"
            step="100"
            min="0"
          />
          <p className="mt-1 text-xs text-slate-500">Aluguel, funcionário, peças, energia, etc.</p>
        </div>

        {/* Meta de Motos */}
        <div>
          <label className="block text-sm font-medium text-slate-300">
            Meta de Motos/Mês
          </label>
          <input
            type="number"
            value={formData.targetMotosPerMonth}
            onChange={e => handleInputChange('targetMotosPerMonth', e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-slate-100 placeholder-slate-500 focus:border-primary focus:outline-none"
            step="1"
            min="1"
          />
          <p className="mt-1 text-xs text-slate-500">Quantas motos você quer atender?</p>
        </div>

        {/* Resumo */}
        <div className="rounded-lg bg-slate-800/50 p-3">
          <p className="text-sm font-medium text-slate-100">Resumo do Cálculo</p>
          <div className="mt-2 space-y-1 text-xs text-slate-400">
            <p>
              Faturamento Necessário: <span className="text-slate-100 font-semibold">{currency(requiredRevenue)}</span>
              <span className="text-slate-500"> = </span>
              <span className="text-slate-100">{currency(formData.estimatedMonthlyCosts)}</span>
              <span className="text-slate-500"> + </span>
              <span className="text-slate-100">{currency(formData.desiredMonthlyProfit)}</span>
            </p>
            <p>
              Por Moto: <span className="text-slate-100 font-semibold">{currency(revenuePerMoto)}</span>
              <span className="text-slate-500"> = </span>
              <span className="text-slate-100">{currency(requiredRevenue)}</span>
              <span className="text-slate-500"> ÷ </span>
              <span className="text-slate-100">{formData.targetMotosPerMonth}</span>
            </p>
          </div>
        </div>

        {/* Botões */}
        <div className="flex gap-2 pt-2">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {isSaving ? 'Salvando...' : 'Salvar'}
          </button>
          <button
            onClick={handleReset}
            disabled={isSaving}
            className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-50"
          >
            <X className="h-4 w-4" />
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
