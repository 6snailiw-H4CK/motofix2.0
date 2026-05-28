import { isBefore, parseISO, startOfDay } from 'date-fns';
import { useMemo } from 'react';
import { DEFAULT_SERVICE_TYPES } from '../constants/appDefaults';
import { normalizeServiceTypeOptions } from '../lib/serviceTypes';
import type { Appointment, Client, MaintenanceRecord, Settings } from '../types';

type UseAppDerivedDataParams = {
  appointments: Appointment[];
  clients: Client[];
  editingClient: Client | null;
  maintenances: MaintenanceRecord[];
  settings: Settings;
};

export const useAppDerivedData = ({
  appointments,
  clients,
  editingClient,
  maintenances,
  settings,
}: UseAppDerivedDataParams) => {
  const nextAppointment = useMemo(() => {
    const today = startOfDay(new Date());
    return appointments
      .filter(app => !app.completed)
      .sort((a, b) => parseISO(a.scheduledDate).getTime() - parseISO(b.scheduledDate).getTime())
      .find(app => !isBefore(parseISO(app.scheduledDate), today));
  }, [appointments]);

  const chartData = useMemo(() => {
    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const last6Months: Array<{ month: string; monthIndex: number; year: number; count: number }> = [];
    const now = new Date();

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      last6Months.push({
        month: months[d.getMonth()],
        monthIndex: d.getMonth(),
        year: d.getFullYear(),
        count: 0,
      });
    }

    clients.forEach((client) => {
      if (!client.lastMaintenanceDate) return;
      const maintenanceDate = parseISO(client.lastMaintenanceDate);
      const dataPoint = last6Months.find(point => (
        point.monthIndex === maintenanceDate.getMonth()
        && point.year === maintenanceDate.getFullYear()
      ));
      if (dataPoint) dataPoint.count++;
    });

    return last6Months;
  }, [clients]);

  const serviceTypeOptions = useMemo(() => {
    const extra = settings?.serviceTypes || [];
    const fromEditing = editingClient?.lastServiceType ? [editingClient.lastServiceType] : [];
    return normalizeServiceTypeOptions([...DEFAULT_SERVICE_TYPES, ...extra, ...fromEditing]);
  }, [editingClient?.lastServiceType, settings?.serviceTypes]);

  const historyServiceTypeOptions = useMemo(() => {
    const fromRecords = maintenances.map(maintenance => maintenance.serviceType);
    const extra = settings?.serviceTypes || [];
    return normalizeServiceTypeOptions([...DEFAULT_SERVICE_TYPES, ...extra, ...fromRecords]);
  }, [maintenances, settings?.serviceTypes]);

  const scheduleClientHistoryRows = useMemo(() => {
    if (!editingClient) return [];
    return maintenances
      .filter(maintenance => maintenance.clientId === editingClient.id)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 12);
  }, [editingClient, maintenances]);

  return {
    chartData,
    historyServiceTypeOptions,
    nextAppointment,
    scheduleClientHistoryRows,
    serviceTypeOptions,
  };
};
