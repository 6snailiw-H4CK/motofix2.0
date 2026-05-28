import { differenceInDays, parseISO, startOfDay } from 'date-fns';
import type { MaintenanceStatus } from '../types';

export const getMaintenanceStatus = (nextDateStr?: string): MaintenanceStatus => {
  if (!nextDateStr) return 'OK';
  try {
    const nextDate = parseISO(nextDateStr);
    const today = startOfDay(new Date());
    const daysUntil = differenceInDays(nextDate, today);

    if (daysUntil < 0) return 'OVERDUE';
    if (daysUntil <= 3) return 'WARNING';
    return 'OK';
  } catch {
    return 'OK';
  }
};
