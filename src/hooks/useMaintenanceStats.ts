import { isAfter, parseISO } from 'date-fns';
import { useCallback, useMemo } from 'react';
import type { Client, MaintenanceRecord, Warranty } from '../types';
import { getServiceTypeLabel, isOilChangeService } from '../lib/serviceTypes';

export type ServiceListFilter = 'all' | 'recorrentes' | 'eventuais';

type UseMaintenanceStatsParams = {
  clients: Client[];
  maintenances: MaintenanceRecord[];
  warranties: Warranty[];
  searchQuery: string;
  serviceListFilter: ServiceListFilter;
};

const parseMonetaryValue = (value?: string | number | null) => {
  if (value === undefined || value === null) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const normalized = String(value).trim().replace(/\0/g, '').replace(',', '.');
  const parsed = parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizePaymentStatus = (status?: string) => String(status || 'Pago').trim();
const isPaidMaintenance = (status?: string) => normalizePaymentStatus(status).toLowerCase() === 'pago';

const parseDateTime = (date?: string) => {
  if (!date) return Number.POSITIVE_INFINITY;
  const value = parseISO(date).getTime();
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
};

const getClientPriority = (client: Client, balance: number) => {
  let priority = 0;
  if (client.status === 'WARNING') priority += 10;
  if (client.status === 'OVERDUE') priority += 20;
  if (balance > 0) priority += 20;
  return priority;
};

export const useMaintenanceStats = ({
  clients,
  maintenances,
  warranties,
  searchQuery,
  serviceListFilter,
}: UseMaintenanceStatsParams) => {
  const activeClientIds = useMemo(() => new Set(clients.map(client => client.id)), [clients]);

  const dashboardMaintenances = useMemo(() => {
    return maintenances.filter(maintenance => !maintenance.clientId || activeClientIds.has(maintenance.clientId));
  }, [activeClientIds, maintenances]);

  const dashboardStats = useMemo(() => {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    let revenue = 0;
    let recurringRevenue = 0;
    let servicesCount = 0;

    dashboardMaintenances.forEach((maintenance) => {
      if (!maintenance.date) return;
      const maintenanceDate = parseISO(maintenance.date);
      if (maintenanceDate.getMonth() === currentMonth && maintenanceDate.getFullYear() === currentYear) {
        const value = Number(maintenance.serviceValue) || 0;
        revenue += value;
        if (maintenance.isRecurringRevenue) {
          recurringRevenue += value;
        }
        servicesCount++;
      }
    });

    return { revenue, recurringRevenue, servicesCount };
  }, [dashboardMaintenances]);

  const clientStats = useMemo(() => {
    return clients.map((client) => ({
      name: client.name,
      totalSpent: client.lastServiceValue || client.serviceValue || client.oilPrice || 0,
      isRecurring: !!client.isRecurringRevenue,
    }));
  }, [clients]);

  const activeWarrantiesCount = useMemo(() => {
    return warranties.filter(warranty => isAfter(parseISO(warranty.expiryDate), new Date())).length;
  }, [warranties]);

  const cashFlowStats = useMemo(() => {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    let totalRecebidoMes = 0;
    let aReceber = 0;
    let parcialAReceber = 0;
    let faturamentoBrutoMes = 0;

    dashboardMaintenances.forEach((maintenance) => {
      const maintenanceDate = parseISO(maintenance.date);
      const isCurrentMonth = maintenanceDate.getMonth() === currentMonth && maintenanceDate.getFullYear() === currentYear;
      const status = normalizePaymentStatus(maintenance.statusPagamento).toLowerCase();

      if (status === 'pendente') {
        aReceber += maintenance.saldoDevedor || 0;
      }

      if (status === 'parcial') {
        parcialAReceber += maintenance.saldoDevedor || 0;
      }

      if (isCurrentMonth) {
        const serviceValue = Number(maintenance.serviceValue) || 0;
        faturamentoBrutoMes += serviceValue;
        if (status === 'pago') {
          totalRecebidoMes += serviceValue;
        } else if (status === 'parcial') {
          totalRecebidoMes += Number(maintenance.valorPago) || 0;
        }
      }
    });

    return {
      totalRecebidoMes: Math.round(totalRecebidoMes * 100) / 100,
      aReceber: Math.round(aReceber * 100) / 100,
      parcialAReceber: Math.round(parcialAReceber * 100) / 100,
      faturamentoBrutoMes: Math.round(faturamentoBrutoMes * 100) / 100,
      aReceberMes: dashboardMaintenances
        .filter((maintenance) => {
          const maintenanceDate = parseISO(maintenance.date);
          const inMonth = maintenanceDate.getMonth() === currentMonth && maintenanceDate.getFullYear() === currentYear;
          return inMonth && normalizePaymentStatus(maintenance.statusPagamento).toLowerCase() === 'pendente';
        })
        .reduce((sum, maintenance) => sum + (maintenance.saldoDevedor || 0), 0),
    };
  }, [dashboardMaintenances]);

  const overdueClients = useMemo(() => clients.filter(client => client.status === 'OVERDUE'), [clients]);

  const topServicesData = useMemo(() => {
    const servicesByRevenue = dashboardMaintenances.reduce((acc: Record<string, number>, maintenance) => {
      if (!isPaidMaintenance(maintenance.statusPagamento)) return acc;
      const serviceLabel = getServiceTypeLabel(maintenance.serviceType);
      const amount = parseMonetaryValue(maintenance.serviceValue) || parseMonetaryValue(maintenance.valorPago);
      if (amount <= 0) return acc;
      acc[serviceLabel] = (acc[serviceLabel] || 0) + amount;
      return acc;
    }, {});

    return Object.entries(servicesByRevenue)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([service, revenue], index) => ({
        service,
        revenue,
        position: index + 1,
      }));
  }, [dashboardMaintenances]);

  const getTopServiceSubRows = useCallback((serviceType: string) => {
    const paid = dashboardMaintenances.filter(maintenance => (
      getServiceTypeLabel(maintenance.serviceType) === getServiceTypeLabel(serviceType)
      && isPaidMaintenance(maintenance.statusPagamento)
    ));
    const isOil = isOilChangeService(serviceType);

    if (isOil) {
      const map = new Map<string, { count: number; revenue: number }>();
      paid.forEach((maintenance) => {
        const label = maintenance.oilType && maintenance.oilType !== 'N/A' ? maintenance.oilType : 'Não informado';
        const previous = map.get(label) || { count: 0, revenue: 0 };
        previous.count += 1;
        previous.revenue += parseMonetaryValue(maintenance.serviceValue) || parseMonetaryValue(maintenance.valorPago);
        map.set(label, previous);
      });

      return Array.from(map.entries())
        .map(([label, value]) => ({ label, ...value }))
        .sort((a, b) => b.revenue - a.revenue);
    }

    const revenue = paid.reduce(
      (sum, maintenance) => sum + (parseMonetaryValue(maintenance.serviceValue) || parseMonetaryValue(maintenance.valorPago)),
      0
    );
    return paid.length ? [{ label: 'Todos os registros deste tipo', count: paid.length, revenue }] : [];
  }, [dashboardMaintenances]);

  const clientBalanceMap = useMemo(() => {
    const map = new Map<string, number>();
    maintenances.forEach((maintenance) => {
      if (maintenance.clientId) {
        const status = normalizePaymentStatus(maintenance.statusPagamento).toLowerCase();
        const shouldCountDebt = status === 'pendente' || status === 'parcial';
        const currentBalance = map.get(maintenance.clientId) || 0;
        map.set(maintenance.clientId, currentBalance + (shouldCountDebt ? maintenance.saldoDevedor || 0 : 0));
      }
    });
    return map;
  }, [maintenances]);

  const clientsSortedByBalance = useMemo(() => {
    return [...clients].sort((a, b) => {
      const balanceA = clientBalanceMap.get(a.id) || 0;
      const balanceB = clientBalanceMap.get(b.id) || 0;
      const priorityA = getClientPriority(a, balanceA);
      const priorityB = getClientPriority(b, balanceB);
      if (priorityB !== priorityA) return priorityB - priorityA;

      if (a.status === 'OVERDUE' && b.status === 'OVERDUE') {
        const dueDiff = parseDateTime(a.nextMaintenanceDate) - parseDateTime(b.nextMaintenanceDate);
        if (dueDiff !== 0) return dueDiff;
      }

      if (balanceB !== balanceA) return balanceB - balanceA;

      const nextDateDiff = parseDateTime(a.nextMaintenanceDate) - parseDateTime(b.nextMaintenanceDate);
      if (nextDateDiff !== 0) return nextDateDiff;

      return (a.name || '').localeCompare(b.name || '', 'pt-BR');
    });
  }, [clientBalanceMap, clients]);

  const maintenancesByClientId = useMemo(() => {
    const map = new Map<string, MaintenanceRecord[]>();
    dashboardMaintenances.forEach((maintenance) => {
      if (!maintenance.clientId) return;
      const list = map.get(maintenance.clientId) || [];
      list.push(maintenance);
      map.set(maintenance.clientId, list);
    });
    return map;
  }, [dashboardMaintenances]);

  const filteredClients = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return clientsSortedByBalance;
    return clientsSortedByBalance.filter(client => (
      (client.name || '').toLowerCase().includes(query)
      || (client.bikeModel || '').toLowerCase().includes(query)
      || (maintenancesByClientId.get(client.id) || []).some(maintenance => (
        (maintenance.serviceType || '').toLowerCase().includes(query)
        || (maintenance.notes || '').toLowerCase().includes(query)
      ))
    ));
  }, [clientsSortedByBalance, maintenancesByClientId, searchQuery]);

  const filteredServiceClients = useMemo(() => {
    const clientsWithServiceRecords = filteredClients.filter((client) => (
      (maintenancesByClientId.get(client.id) || []).length > 0
    ));

    if (serviceListFilter === 'all') return clientsWithServiceRecords;
    return clientsWithServiceRecords.filter((client) => {
      const clientMaintenances = maintenancesByClientId.get(client.id) || [];
      return clientMaintenances.some((maintenance) => (
        serviceListFilter === 'recorrentes'
          ? maintenance.isRecurringRevenue
          : !maintenance.isRecurringRevenue
      ));
    });
  }, [filteredClients, maintenancesByClientId, serviceListFilter]);

  return {
    activeWarrantiesCount,
    cashFlowStats,
    clientBalanceMap,
    clientStats,
    clientsSortedByBalance,
    dashboardMaintenances,
    dashboardStats,
    filteredServiceClients,
    getTopServiceSubRows,
    overdueClients,
    topServicesData,
  };
};
