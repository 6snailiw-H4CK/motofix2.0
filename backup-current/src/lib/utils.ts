import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, parseISO } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formata uma data de forma segura
 * Converte strings ISO para Date antes de formatar
 * @param dateInput - Data como string ISO ou Date object
 * @param formatStr - Padrão de formatação (date-fns)
 * @returns String formatada ou string vazia se entrada inválida
 */
export function safeFormat(dateInput: string | Date | undefined, formatStr: string = 'dd/MM/yyyy'): string {
  if (!dateInput) return '';
  
  try {
    let dateObj: Date;
    
    if (typeof dateInput === 'string') {
      // Remove o Z se existir (problema do RangeError)
      const cleanedInput = dateInput.replace('Z', '');
      dateObj = parseISO(cleanedInput);
    } else {
      dateObj = dateInput;
    }
    
    // Verifica se a data é válida
    if (isNaN(dateObj.getTime())) {
      return '';
    }
    
    return format(dateObj, formatStr);
  } catch (error) {
    console.warn(`⚠️ safeFormat error for "${dateInput}":`, error);
    return '';
  }
}
