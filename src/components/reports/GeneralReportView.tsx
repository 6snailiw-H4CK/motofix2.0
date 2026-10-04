import { Activity, ArrowLeft, BarChart3, CalendarDays, Download, Filter, WalletCards } from 'lucide-react';
import { endOfDay, format, isAfter, isBefore, parseISO, startOfDay, startOfMonth, subDays } from 'date-fns';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Cell,
  Line,
  LineChart as RechartsLineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { toast as sonnerToast } from 'sonner';
import { DEFAULT_SERVICE_TYPES } from '../../constants/appDefaults';
import { DateInput } from '../DateInput';
import { getServiceTypeKey, getServiceTypeLabel, normalizeServiceTypeOptions } from '../../lib/serviceTypes';
import { cn } from '../../lib/utils';
import { getCashPaidAmount, getCashPaymentStatus, getCashReceivableAmount, isCashLaunchFinancial } from '../../lib/cashPayments';
import type { AppView, Appointment, CashPaymentMethod, CashRegisterLaunch, Client, ExpenseRecord, MaintenanceRecord, Settings, Warranty } from '../../types';
import { ReportSectionTabs } from './ReportSectionTabs';
import { exportGeneralReportPdf } from './exportGeneralReportPdf';

type PaymentStatusFilter = 'all' | 'Pago' | 'Pendente' | 'Parcial';
type CashPaymentMethodFilter = 'all' | 'missing' | CashPaymentMethod;

type GeneralReportViewProps = {
  cashLaunches: CashRegisterLaunch[];
  clients: Client[];
  maintenances: MaintenanceRecord[];
  expenses: ExpenseRecord[];
  warranties: Warranty[];
  appointments: Appointment[];
  settings: Settings;
  onBack: () => void;
  onViewChange: (view: AppView) => void;
};

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const dateFormatter = new Intl.DateTimeFormat('pt-BR');

const toCurrency = (value: number) => currencyFormatter.format(Number.isFinite(value) ? value : 0);

const toNumber = (value?: number | string | null) => {
  if (value === undefined || value === null) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number.parseFloat(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseDate = (value?: string | null) => {
  if (!value) return null;
  const parsed = parseISO(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDate = (value?: string | null) => {
  const parsed = parseDate(value);
  return parsed ? dateFormatter.format(parsed) : '-';
};

const isDateInRange = (value: string | undefined, startDate: string, endDate: string) => {
  const parsed = parseDate(value);
  const start = startOfDay(parseISO(startDate));
  const end = endOfDay(parseISO(endDate));

  if (!parsed || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
  return !isBefore(parsed, start) && !isAfter(parsed, end);
};

const getPaymentStatus = (maintenance: MaintenanceRecord): 'Pago' | 'Pendente' | 'Parcial' =>
  maintenance.statusPagamento || 'Pago';

const getPaidAmount = (maintenance: MaintenanceRecord) => {
  const total = toNumber(maintenance.serviceValue);
  const status = getPaymentStatus(maintenance);

  if (status === 'Pago') return total;
  if (status === 'Parcial') return Math.min(total, toNumber(maintenance.valorPago));
  return 0;
};

const getReceivableAmount = (maintenance: MaintenanceRecord) => {
  const total = toNumber(maintenance.serviceValue);
  const paid = getPaidAmount(maintenance);
  const explicitBalance = toNumber(maintenance.saldoDevedor);

  if (getPaymentStatus(maintenance) === 'Pago') return 0;
  return explicitBalance > 0 ? explicitBalance : Math.max(0, total - paid);
};

const getCashLaunchDate = (launch: CashRegisterLaunch) => launch.openingDate || launch.createdAt;
const getCashLaunchPaymentDate = (launch: CashRegisterLaunch) => launch.paidAt || getCashLaunchDate(launch);

const cashPaymentMethodOptions: CashPaymentMethod[] = ['Pix', 'Dinheiro', 'Debito', 'Credito'];

const getCashPaymentMethodLabel = (launch: CashRegisterLaunch) => launch.paymentMethod || 'Nao informado';

const getClientSearchText = (client?: Client) => `${client?.name || ''} ${client?.bikeModel || ''} ${client?.contact || ''}`.toLowerCase();

const reportControlClass =
  'w-full min-w-0 rounded-xl border-slate-700 bg-slate-900/70 p-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:ring-1 focus:ring-primary';

export const GeneralReportView = ({
  cashLaunches,
  clients,
  maintenances,
  expenses,
  warranties,
  appointments,
  settings,
  onBack,
  onViewChange,
}: GeneralReportViewProps) => {
  const [startDate, setStartDate] = useState(() => format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [clientQuery, setClientQuery] = useState('');
  const [serviceTypeFilter, setServiceTypeFilter] = useState('all');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatusFilter>('all');
  const [cashPaymentMethodFilter, setCashPaymentMethodFilter] = useState<CashPaymentMethodFilter>('all');
  const [isAbcOpen, setIsAbcOpen] = useState(false);
  const [activeReportSection, setActiveReportSection] = useState('report-overview');

  const clientsById = useMemo(() => new Map(clients.map(client => [client.id, client])), [clients]);
  const normalizedClientQuery = clientQuery.trim().toLowerCase();

  const serviceTypeOptions = useMemo(() => {
    const disabledDefaultKeys = new Set((settings.disabledDefaultServiceTypes || []).map(getServiceTypeKey));
    const activeDefaults = DEFAULT_SERVICE_TYPES.filter(type => !disabledDefaultKeys.has(getServiceTypeKey(type)));
    return normalizeServiceTypeOptions([
      ...activeDefaults,
      ...(settings.serviceTypes || []),
      ...maintenances.map(maintenance => maintenance.serviceType),
    ]);
  }, [maintenances, settings.disabledDefaultServiceTypes, settings.serviceTypes]);

  const filteredMaintenances = useMemo(() => {
    return maintenances.filter((maintenance) => {
      if (!isDateInRange(maintenance.date, startDate, endDate)) return false;
      if (paymentStatus !== 'all' && getPaymentStatus(maintenance) !== paymentStatus) return false;

      const serviceLabel = getServiceTypeLabel(maintenance.serviceType);
      if (serviceTypeFilter !== 'all' && serviceLabel !== getServiceTypeLabel(serviceTypeFilter)) return false;

      if (normalizedClientQuery) {
        const client = clientsById.get(maintenance.clientId);
        const text = `${maintenance.clientName || ''} ${maintenance.bikeModel || ''} ${getClientSearchText(client)}`.toLowerCase();
        if (!text.includes(normalizedClientQuery)) return false;
      }

      return true;
    });
  }, [clientsById, endDate, maintenances, normalizedClientQuery, paymentStatus, serviceTypeFilter, startDate]);

  const filteredExpenses = useMemo(() => {
    return expenses.filter((expense) => {
      if (!isDateInRange(expense.date, startDate, endDate)) return false;
      if (!normalizedClientQuery) return true;
      return `${expense.description} ${expense.supplier || ''} ${expense.note || ''} ${expense.paymentMethod}`.toLowerCase().includes(normalizedClientQuery);
    });
  }, [endDate, expenses, normalizedClientQuery, startDate]);

  const filteredWarranties = useMemo(() => {
    return warranties.filter((warranty) => {
      const inServiceDate = isDateInRange(warranty.serviceDate, startDate, endDate);
      const inExpiryDate = isDateInRange(warranty.expiryDate, startDate, endDate);
      const matchesClient = !normalizedClientQuery || `${warranty.clientName} ${warranty.clientPhone} ${warranty.serviceType}`.toLowerCase().includes(normalizedClientQuery);
      return matchesClient && (inServiceDate || inExpiryDate);
    });
  }, [endDate, normalizedClientQuery, startDate, warranties]);

  const filteredAppointments = useMemo(() => {
    return appointments.filter((appointment) => {
      if (!isDateInRange(appointment.scheduledDate, startDate, endDate)) return false;
      if (!normalizedClientQuery) return true;
      return `${appointment.clientName} ${appointment.bikeModel} ${appointment.serviceRequested}`.toLowerCase().includes(normalizedClientQuery);
    });
  }, [appointments, endDate, normalizedClientQuery, startDate]);

  const matchingCashLaunches = useMemo(() => {
    return cashLaunches.filter((launch) => {
      if (launch.status === 'Cancelado') return false;
      if (!isCashLaunchFinancial(launch)) return false;
      if (serviceTypeFilter !== 'all') return false;
      if (paymentStatus !== 'all' && getCashPaymentStatus(launch) !== paymentStatus) return false;
      if (cashPaymentMethodFilter !== 'all') {
        if (getCashPaidAmount(launch) <= 0) return false;
        const matchesPaymentMethod = cashPaymentMethodFilter === 'missing'
          ? !launch.paymentMethod
          : launch.paymentMethod === cashPaymentMethodFilter;
        if (!matchesPaymentMethod) return false;
      }

      if (!normalizedClientQuery) return true;
      return `${launch.orderNumber} ${launch.clientName} ${launch.bikeModel || ''} ${launch.status} ${getCashPaymentStatus(launch)} ${getCashPaidAmount(launch) > 0 ? launch.paymentMethod || '' : ''}`.toLowerCase().includes(normalizedClientQuery);
    });
  }, [cashLaunches, cashPaymentMethodFilter, normalizedClientQuery, paymentStatus, serviceTypeFilter]);

  const filteredCashLaunches = useMemo(() => (
    matchingCashLaunches.filter((launch) => isDateInRange(getCashLaunchDate(launch), startDate, endDate))
  ), [endDate, matchingCashLaunches, startDate]);

  const receivedCashLaunches = useMemo(() => (
    matchingCashLaunches.filter((launch) => (
      getCashPaidAmount(launch) > 0
      && isDateInRange(getCashLaunchPaymentDate(launch), startDate, endDate)
    ))
  ), [endDate, matchingCashLaunches, startDate]);

  const summary = useMemo(() => {
    const serviceGrossRevenue = filteredMaintenances.reduce((sum, maintenance) => sum + toNumber(maintenance.serviceValue), 0);
    const serviceReceived = filteredMaintenances.reduce((sum, maintenance) => sum + getPaidAmount(maintenance), 0);
    const serviceReceivable = maintenances.reduce((sum, maintenance) => sum + getReceivableAmount(maintenance), 0);
    const cashGrossRevenue = filteredCashLaunches.reduce((sum, launch) => sum + toNumber(launch.total), 0);
    const cashReceived = receivedCashLaunches.reduce((sum, launch) => sum + getCashPaidAmount(launch), 0);
    const cashReceivable = cashLaunches.reduce((sum, launch) => sum + getCashReceivableAmount(launch), 0);
    const grossRevenue = serviceGrossRevenue + cashGrossRevenue;
    const received = serviceReceived + cashReceived;
    const receivable = serviceReceivable + cashReceivable;
    const recurringRevenue = filteredMaintenances
      .filter(maintenance => maintenance.isRecurringRevenue)
      .reduce((sum, maintenance) => sum + toNumber(maintenance.serviceValue), 0);
    const expenseTotal = filteredExpenses.reduce((sum, expense) => sum + toNumber(expense.amount), 0);
    const appointmentValue = filteredAppointments.reduce((sum, appointment) => sum + toNumber(appointment.value), 0);
    const activeWarrantyCount = filteredWarranties.filter((warranty) => {
      const expiryDate = parseDate(warranty.expiryDate);
      return expiryDate ? isAfter(expiryDate, new Date()) : false;
    }).length;

    return {
      cashGrossRevenue,
      cashReceived,
      cashReceivable,
      grossRevenue,
      received,
      receivable,
      recurringRevenue,
      expenseTotal,
      netResult: received - expenseTotal,
      projectedResult: grossRevenue - expenseTotal,
      serviceGrossRevenue,
      serviceReceived,
      serviceReceivable,
      servicesCount: filteredMaintenances.length,
      cashLaunchesCount: filteredCashLaunches.length,
      operationsCount: filteredMaintenances.length + filteredCashLaunches.length,
      averageTicket: (filteredMaintenances.length + filteredCashLaunches.length)
        ? grossRevenue / (filteredMaintenances.length + filteredCashLaunches.length)
        : 0,
      appointmentValue,
      activeWarrantyCount,
    };
  }, [cashLaunches, filteredAppointments, filteredCashLaunches, filteredExpenses, filteredMaintenances, filteredWarranties, maintenances, receivedCashLaunches]);

  const receivableRows = useMemo(() => {
    return maintenances
      .map(maintenance => ({
        maintenance,
        paid: getPaidAmount(maintenance),
        receivable: getReceivableAmount(maintenance),
      }))
      .filter(row => row.receivable > 0)
      .sort((a, b) => b.receivable - a.receivable);
  }, [maintenances]);

  const cashReceivableRows = useMemo(() => {
    return cashLaunches
      .map(launch => ({
        launch,
        receivable: getCashReceivableAmount(launch),
      }))
      .filter(row => row.receivable > 0)
      .sort((a, b) => b.receivable - a.receivable);
  }, [cashLaunches]);

  const serviceBreakdown = useMemo(() => {
    const map = new Map<string, { count: number; gross: number; received: number; receivable: number }>();

    filteredMaintenances.forEach((maintenance) => {
      const label = getServiceTypeLabel(maintenance.serviceType);
      const current = map.get(label) || { count: 0, gross: 0, received: 0, receivable: 0 };
      current.count += 1;
      current.gross += toNumber(maintenance.serviceValue);
      current.received += getPaidAmount(maintenance);
      current.receivable += getReceivableAmount(maintenance);
      map.set(label, current);
    });

    return Array.from(map.entries())
      .map(([label, values]) => ({ label, ...values }))
      .sort((a, b) => b.gross - a.gross);
  }, [filteredMaintenances]);

  const clientBreakdown = useMemo(() => {
    const map = new Map<string, { count: number; gross: number; received: number; receivable: number; bikeModel: string }>();

    const addClientMovement = (
      key: string,
      values: {
        bikeModel?: string;
        gross: number;
        received: number;
        receivable: number;
      },
    ) => {
      const current = map.get(key) || {
        count: 0,
        gross: 0,
        received: 0,
        receivable: 0,
        bikeModel: values.bikeModel || '-',
      };
      current.count += 1;
      current.gross += values.gross;
      current.received += values.received;
      current.receivable += values.receivable;
      if (current.bikeModel === '-' && values.bikeModel) current.bikeModel = values.bikeModel;
      map.set(key, current);
    };

    filteredMaintenances.forEach((maintenance) => {
      const key = maintenance.clientId || maintenance.clientName || 'Sem cliente';
      addClientMovement(key, {
        bikeModel: maintenance.bikeModel || '-',
        gross: toNumber(maintenance.serviceValue),
        received: getPaidAmount(maintenance),
        receivable: getReceivableAmount(maintenance),
      });
    });

    filteredCashLaunches.forEach((launch) => {
      const key = launch.clientId || launch.clientName || 'Consumidor final';
      addClientMovement(key, {
        bikeModel: launch.bikeModel || '-',
        gross: toNumber(launch.total),
        received: 0,
        receivable: getCashReceivableAmount(launch),
      });
    });

    receivedCashLaunches.forEach((launch) => {
      const key = launch.clientId || launch.clientName || 'Consumidor final';
      const current = map.get(key) || {
        count: 0,
        gross: 0,
        received: 0,
        receivable: 0,
        bikeModel: launch.bikeModel || '-',
      };
      current.received += getCashPaidAmount(launch);
      map.set(key, current);
    });

    return Array.from(map.entries())
      .map(([clientKey, values]) => ({
        name: clientsById.get(clientKey)?.name || filteredMaintenances.find(item => item.clientId === clientKey)?.clientName || clientKey,
        ...values,
      }))
      .sort((a, b) => b.gross - a.gross)
      .slice(0, 12);
  }, [clientsById, filteredCashLaunches, filteredMaintenances, receivedCashLaunches]);

  const supplierBreakdown = useMemo(() => {
    const map = new Map<string, { supplier: string; count: number; total: number }>();

    filteredExpenses.forEach((expense) => {
      const supplier = (expense.supplier || '').trim() || 'Sem fornecedor';
      const key = supplier
        .replace(/\s+/g, ' ')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('pt-BR');
      const current = map.get(key) || { supplier, count: 0, total: 0 };
      current.count += 1;
      current.total += toNumber(expense.amount);
      map.set(key, current);
    });

    return Array.from(map.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [filteredExpenses]);

  const abcBreakdown = useMemo(() => {
    const map = new Map<string, { label: string; source: string; count: number; total: number }>();

    const addEntry = (label: string, source: string, amount: number) => {
      const normalizedLabel = label.trim() || 'Sem descricao';
      const key = `${source}:${normalizedLabel.toLowerCase()}`;
      const current = map.get(key) || { label: normalizedLabel, source, count: 0, total: 0 };
      current.count += 1;
      current.total += Math.max(0, amount);
      map.set(key, current);
    };

    filteredMaintenances.forEach((maintenance) => {
      addEntry(getServiceTypeLabel(maintenance.serviceType), 'Servicos/Oleo', toNumber(maintenance.serviceValue));
    });

    filteredCashLaunches.forEach((launch) => {
      if (launch.items?.length) {
        launch.items.forEach((item) => {
          addEntry(item.description || launch.orderNumber || 'Lancamento caixa', 'Lancamentos Caixa', toNumber(item.total));
        });
        return;
      }

      addEntry(launch.orderNumber || 'Lancamento caixa', 'Lancamentos Caixa', toNumber(launch.total));
    });

    const rows = Array.from(map.values())
      .filter(row => row.total > 0)
      .sort((a, b) => b.total - a.total);
    const total = rows.reduce((sum, row) => sum + row.total, 0);
    let accumulated = 0;

    return rows.map((row, index) => {
      const percentage = total ? (row.total / total) * 100 : 0;
      const curve = accumulated < 80 ? 'A' : accumulated < 95 ? 'B' : 'C';
      accumulated += percentage;

      return {
        ...row,
        position: index + 1,
        percentage,
        accumulated,
        curve,
      };
    }).slice(0, 20);
  }, [filteredCashLaunches, filteredMaintenances]);

  const abcSummary = useMemo(() => {
    return abcBreakdown.reduce(
      (summary, row) => {
        const curve = row.curve as 'A' | 'B' | 'C';
        summary.total += row.total;
        summary.counts[curve] += 1;
        summary.totals[curve] += row.total;
        return summary;
      },
      {
        total: 0,
        counts: { A: 0, B: 0, C: 0 },
        totals: { A: 0, B: 0, C: 0 },
      },
    );
  }, [abcBreakdown]);

  const cashPaymentMethodBreakdown = useMemo(() => {
    const rows = new Map<CashPaymentMethod | 'missing', { count: number; total: number }>();
    cashPaymentMethodOptions.forEach((option) => rows.set(option, { count: 0, total: 0 }));
    rows.set('missing', { count: 0, total: 0 });

    receivedCashLaunches
      .forEach((launch) => {
        if (getCashPaidAmount(launch) <= 0) return;
        const method = launch.paymentMethod || 'missing';
        const current = rows.get(method) || { count: 0, total: 0 };
        current.count += 1;
        current.total += getCashPaidAmount(launch);
        rows.set(method, current);
      });

    return Array.from(rows.entries())
      .filter(([method, values]) => method !== 'missing' || values.count > 0)
      .map(([method, values]) => ({
        method,
        label: method === 'missing' ? 'Nao informado' : method,
        ...values,
      }));
  }, [receivedCashLaunches]);

  const financialTrend = useMemo(() => {
    const rows = new Map<string, { date: string; sold: number; received: number; expenses: number }>();
    const getRow = (value?: string | null) => {
      const parsed = parseDate(value);
      if (!parsed) return null;
      const key = format(parsed, 'yyyy-MM-dd');
      const row = rows.get(key) || { date: key, sold: 0, received: 0, expenses: 0 };
      rows.set(key, row);
      return row;
    };

    filteredMaintenances.forEach((maintenance) => {
      const row = getRow(maintenance.date);
      if (!row) return;
      row.sold += toNumber(maintenance.serviceValue);
      row.received += getPaidAmount(maintenance);
    });
    filteredCashLaunches.forEach((launch) => {
      const row = getRow(getCashLaunchDate(launch));
      if (row) row.sold += toNumber(launch.total);
    });
    receivedCashLaunches.forEach((launch) => {
      const row = getRow(getCashLaunchPaymentDate(launch));
      if (row) row.received += getCashPaidAmount(launch);
    });
    filteredExpenses.forEach((expense) => {
      const row = getRow(expense.date);
      if (row) row.expenses += toNumber(expense.amount);
    });

    return Array.from(rows.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(row => ({ ...row, label: format(parseISO(row.date), 'dd/MM') }));
  }, [filteredCashLaunches, filteredExpenses, filteredMaintenances, receivedCashLaunches]);

  const orderStatusBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    filteredMaintenances.forEach((maintenance) => {
      const status = getPaymentStatus(maintenance);
      counts.set(status, (counts.get(status) || 0) + 1);
    });
    return Array.from(counts, ([name, value]) => ({ name, value }));
  }, [filteredMaintenances]);

  const recentMovements = useMemo(() => [
    ...filteredMaintenances.map(maintenance => ({
      id: `service-${maintenance.id}`,
      date: maintenance.date,
      type: 'Serviço',
      description: `${getServiceTypeLabel(maintenance.serviceType)} · ${maintenance.clientName || 'Cliente não informado'}`,
      status: getPaymentStatus(maintenance),
      amount: toNumber(maintenance.serviceValue),
      isExpense: false,
      section: 'report-services-detail',
    })),
    ...filteredCashLaunches.map(launch => ({
      id: `cash-${launch.id}`,
      date: getCashLaunchDate(launch),
      type: 'Caixa',
      description: `${launch.orderNumber || 'Lançamento'} · ${launch.clientName || 'Consumidor final'}`,
      status: getCashPaymentStatus(launch),
      amount: toNumber(launch.total),
      isExpense: false,
      section: 'report-cash-detail',
    })),
    ...filteredExpenses.map(expense => ({
      id: `expense-${expense.id}`,
      date: expense.date,
      type: 'Gasto',
      description: expense.description,
      status: expense.paymentMethod,
      amount: toNumber(expense.amount),
      isExpense: true,
      section: 'report-expenses',
    })),
  ].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 8), [
    filteredCashLaunches,
    filteredExpenses,
    filteredMaintenances,
  ]);

  const setCurrentMonth = () => {
    setStartDate(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
    setEndDate(format(new Date(), 'yyyy-MM-dd'));
  };

  const setLastThirtyDays = () => {
    setStartDate(format(subDays(new Date(), 29), 'yyyy-MM-dd'));
    setEndDate(format(new Date(), 'yyyy-MM-dd'));
  };

  const clearFilters = () => {
    setCurrentMonth();
    setClientQuery('');
    setServiceTypeFilter('all');
    setPaymentStatus('all');
    setCashPaymentMethodFilter('all');
  };

  const scrollToSection = (sectionId: string) => {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const openAbcCurve = () => {
    setIsAbcOpen(true);
    window.setTimeout(() => {
      document.getElementById('report-abc-curve-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  };

  const handleExportPdf = () => {
    try {
      const receivables = [
        ...receivableRows.map(({ maintenance, paid, receivable }) => [
          maintenance.clientName || '-',
          getServiceTypeLabel(maintenance.serviceType),
          formatDate(maintenance.date),
          getPaymentStatus(maintenance),
          toCurrency(toNumber(maintenance.serviceValue)),
          toCurrency(paid),
          toCurrency(receivable),
        ]),
        ...cashReceivableRows.map(({ launch, receivable }) => [
          launch.clientName || 'Consumidor final',
          launch.orderNumber || 'Lancamento caixa',
          formatDate(getCashLaunchDate(launch)),
          launch.status,
          toCurrency(toNumber(launch.total)),
          toCurrency(0),
          toCurrency(receivable),
        ]),
      ];

      exportGeneralReportPdf({
        businessName: settings.businessName || 'MotoFix',
        startDate: formatDate(startDate),
        endDate: formatDate(endDate),
        metrics: [
          { label: 'Total vendido', value: toCurrency(summary.grossRevenue) },
          { label: 'Total recebido', value: toCurrency(summary.received) },
          { label: 'A receber', value: toCurrency(summary.receivable) },
          { label: 'Gastos', value: toCurrency(summary.expenseTotal) },
        ],
        sections: [
          {
            title: 'Evolução financeira',
            headers: ['Data', 'Vendido', 'Recebido', 'Gastos'],
            rows: financialTrend.map(row => [formatDate(row.date), toCurrency(row.sold), toCurrency(row.received), toCurrency(row.expenses)]),
          },
          {
            title: 'Resultado do período',
            headers: ['Indicador', 'Valor'],
            rows: [
              ['Resultado de caixa (recebido - gastos)', toCurrency(summary.netResult)],
              ['Resultado previsto (vendido - gastos)', toCurrency(summary.projectedResult)],
              ['Ticket médio', toCurrency(summary.averageTicket)],
              ['Atendimentos e lançamentos', String(summary.operationsCount)],
              ['Receita recorrente', toCurrency(summary.recurringRevenue)],
              ['Valor previsto em agenda', toCurrency(summary.appointmentValue)],
              ['Garantias ativas', String(summary.activeWarrantyCount)],
            ],
          },
          {
            title: 'Recebimentos por forma de pagamento',
            headers: ['Forma', 'Lançamentos', 'Total recebido'],
            rows: cashPaymentMethodBreakdown.map(row => [row.label, String(row.count), toCurrency(row.total)]),
          },
          {
            title: 'Status dos serviços',
            headers: ['Status', 'Quantidade'],
            rows: orderStatusBreakdown.map(row => [row.name, String(row.value)]),
          },
          {
            title: 'Serviços mais realizados',
            headers: ['Serviço', 'Quantidade', 'Total vendido', 'Recebido', 'A receber'],
            rows: serviceBreakdown.map(row => [row.label, String(row.count), toCurrency(row.gross), toCurrency(row.received), toCurrency(row.receivable)]),
          },
          {
            title: 'Clientes com maior movimento',
            headers: ['Cliente', 'Motocicleta', 'Atendimentos', 'Recebido', 'Saldo'],
            rows: clientBreakdown.map(row => [row.name, row.bikeModel, String(row.count), toCurrency(row.received), toCurrency(row.receivable)]),
          },
          {
            title: 'Fornecedores mais comprados',
            headers: ['Fornecedor', 'Lançamentos', 'Total'],
            rows: supplierBreakdown.map(row => [row.supplier, String(row.count), toCurrency(row.total)]),
          },
          {
            title: 'Contas a receber',
            headers: ['Cliente', 'Serviço / origem', 'Data', 'Status', 'Total', 'Pago', 'Saldo'],
            rows: receivables,
          },
          {
            title: 'Gastos no período',
            headers: ['Descrição', 'Fornecedor', 'Data', 'Forma de pagamento', 'Valor'],
            rows: filteredExpenses.map(expense => [
              expense.description,
              expense.supplier || '-',
              formatDate(expense.date),
              expense.paymentMethod,
              toCurrency(toNumber(expense.amount)),
            ]),
          },
          {
            title: 'Serviços detalhados',
            headers: ['Data', 'Cliente', 'Motocicleta', 'Serviço', 'Status', 'Total', 'Recebido', 'Saldo'],
            rows: filteredMaintenances.map(maintenance => [
              formatDate(maintenance.date),
              maintenance.clientName || '-',
              maintenance.bikeModel || '-',
              getServiceTypeLabel(maintenance.serviceType),
              getPaymentStatus(maintenance),
              toCurrency(toNumber(maintenance.serviceValue)),
              toCurrency(getPaidAmount(maintenance)),
              toCurrency(getReceivableAmount(maintenance)),
            ]),
          },
          {
            title: 'Lançamentos de caixa',
            headers: ['Data', 'Ordem', 'Cliente', 'Status', 'Pagamento', 'Total', 'Recebido', 'Saldo'],
            rows: filteredCashLaunches.map(launch => [
              formatDate(getCashLaunchDate(launch)),
              launch.orderNumber || '-',
              launch.clientName || 'Consumidor final',
              getCashPaymentStatus(launch),
              getCashPaidAmount(launch) > 0 ? getCashPaymentMethodLabel(launch) : '-',
              toCurrency(toNumber(launch.total)),
              toCurrency(getCashPaidAmount(launch)),
              toCurrency(getCashReceivableAmount(launch)),
            ]),
          },
          {
            title: 'Garantias no período',
            headers: ['Cliente', 'Serviço', 'Emissão', 'Vencimento', 'Status'],
            rows: filteredWarranties.map(warranty => {
              const expiryDate = parseDate(warranty.expiryDate);
              return [
                warranty.clientName,
                warranty.serviceType,
                formatDate(warranty.serviceDate),
                formatDate(warranty.expiryDate),
                expiryDate && isAfter(expiryDate, new Date()) ? 'Ativa' : 'Vencida',
              ];
            }),
          },
          {
            title: 'Agenda no período',
            headers: ['Cliente', 'Data', 'Serviço', 'Status', 'Valor previsto'],
            rows: filteredAppointments.map(appointment => [
              appointment.clientName,
              formatDate(appointment.scheduledDate),
              appointment.serviceRequested,
              appointment.completed ? 'Concluído' : 'Pendente',
              toCurrency(toNumber(appointment.value)),
            ]),
          },
          {
            title: 'Curva ABC',
            headers: ['Posição', 'Item', 'Origem', 'Quantidade', 'Total', 'Participação', 'Acumulado', 'Classe'],
            rows: abcBreakdown.map(row => [
              String(row.position),
              row.label,
              row.source,
              String(row.count),
              toCurrency(row.total),
              `${row.percentage.toFixed(1)}%`,
              `${Math.min(100, row.accumulated).toFixed(1)}%`,
              row.curve,
            ]),
          },
        ],
      });
      sonnerToast.success('Relatório PDF gerado com sucesso.');
    } catch (error) {
      console.error('Falha ao exportar o relatório em PDF.', error);
      sonnerToast.error(error instanceof Error ? error.message : 'Não foi possível gerar o relatório PDF.');
    }
  };

  return (
    <div className="w-full max-w-none space-y-5 overflow-hidden">
      <ReportSectionTabs active="general-report" onViewChange={onViewChange} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onBack} aria-label="Voltar" className="rounded-xl border border-slate-700 bg-slate-900/70 p-2.5 text-slate-300 transition hover:border-primary/50 hover:text-white">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Visão financeira</p>
            <h2 className="text-2xl font-black text-white">Relatórios</h2>
            <p className="text-sm text-slate-400">{settings.businessName || 'MotoFix'} · {formatDate(startDate)} a {formatDate(endDate)}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onViewChange('expenses')}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-2.5 text-sm font-bold text-slate-200 transition hover:border-primary/50 hover:bg-slate-800"
          >
            <WalletCards className="h-4 w-4" />
            Abrir gastos
          </button>
          <button
            type="button"
            onClick={handleExportPdf}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-primary/20 transition hover:brightness-110"
          >
            <Download className="h-4 w-4" />
            Exportar PDF
          </button>
        </div>
      </div>

      <nav aria-label="Ir para relatório" className="flex min-w-0 gap-2 overflow-x-auto rounded-2xl border border-slate-700/70 bg-slate-900/55 p-2">
        {[
          ['Visão geral', 'report-overview'],
          ['Vendas', 'report-services-detail'],
          ['Recebimentos', 'report-receivables'],
          ['Gastos', 'report-expenses'],
          ['Serviços', 'report-service-ranking'],
          ['Clientes', 'report-clients'],
          ['Curva ABC', 'report-abc-curve'],
          ['Caixa', 'report-cash-detail'],
          ['Agenda', 'report-appointments'],
        ].map(([label, sectionId]) => (
          <button
            key={sectionId}
            type="button"
            aria-controls={sectionId}
            aria-current={activeReportSection === sectionId ? 'location' : undefined}
            onClick={() => {
              setActiveReportSection(sectionId);
              if (sectionId === 'report-abc-curve') {
                openAbcCurve();
                return;
              }
              scrollToSection(sectionId);
            }}
            className={cn(
              'shrink-0 rounded-xl px-4 py-2 text-xs font-bold transition',
              activeReportSection === sectionId
                ? 'bg-primary text-white shadow-lg shadow-primary/20'
                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            )}
          >
            {label}
          </button>
        ))}
      </nav>

      <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-800/40 p-4">
        <div className="mb-3 flex items-center gap-2">
          <Filter className="h-4 w-4 text-primary" />
          <div>
            <h3 className="text-sm font-bold text-white">Filtros do relatório</h3>
            <p className="text-xs text-slate-500">Os indicadores e gráficos acompanham os filtros selecionados.</p>
          </div>
        </div>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <label className="space-y-1">
            <span className="px-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">Início</span>
            <DateInput value={startDate} onChange={setStartDate} className={reportControlClass} />
          </label>
          <label className="space-y-1">
            <span className="px-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">Fim</span>
            <DateInput value={endDate} onChange={setEndDate} className={reportControlClass} />
          </label>
          <label className="space-y-1">
            <span className="px-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">Cliente</span>
            <input value={clientQuery} onChange={event => setClientQuery(event.target.value)} placeholder="Nome, moto ou telefone" className={reportControlClass} />
          </label>
          <label className="space-y-1">
            <span className="px-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">Serviço</span>
            <select value={serviceTypeFilter} onChange={event => setServiceTypeFilter(event.target.value)} className={reportControlClass}>
              <option value="all">Todos</option>
              {serviceTypeOptions.map(option => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="px-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">Pagamento</span>
            <select value={paymentStatus} onChange={event => setPaymentStatus(event.target.value as PaymentStatusFilter)} className={reportControlClass}>
              <option value="all">Todos</option>
              <option value="Pago">Pago</option>
              <option value="Pendente">Pendente</option>
              <option value="Parcial">Parcial</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="px-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">Forma caixa</span>
            <select value={cashPaymentMethodFilter} onChange={event => setCashPaymentMethodFilter(event.target.value as CashPaymentMethodFilter)} className={reportControlClass}>
              <option value="all">Todas</option>
              {cashPaymentMethodOptions.map(option => <option key={option} value={option}>{option}</option>)}
              <option value="missing">Não informado</option>
            </select>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={setCurrentMonth} className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-bold text-slate-200 transition hover:bg-slate-600">Mês atual</button>
          <button type="button" onClick={setLastThirtyDays} className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-bold text-slate-200 transition hover:bg-slate-600">Últimos 30 dias</button>
          <button type="button" onClick={clearFilters} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-bold text-slate-300 transition hover:bg-slate-800">Limpar filtros</button>
        </div>
      </section>

      <section id="report-overview" className="scroll-mt-24 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Resumo financeiro</p>
            <h3 className="text-lg font-black text-white">Visão geral do período</h3>
          </div>
          <p className="text-xs text-slate-500">{formatDate(startDate)} — {formatDate(endDate)}</p>
        </div>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <OperationCard
            label="Total vendido"
            value={toCurrency(summary.grossRevenue)}
            detail={`${summary.operationsCount} serviços e lançamentos`}
            explanation={`Serviços: ${toCurrency(summary.serviceGrossRevenue)} · Caixa: ${toCurrency(summary.cashGrossRevenue)}`}
            tone="sky"
            onClick={() => scrollToSection('report-services-detail')}
          />
          <OperationCard
            label="Total recebido"
            value={toCurrency(summary.received)}
            detail="Valores recebidos no período"
            explanation="Considera serviços pagos e lançamentos de caixa."
            onClick={() => scrollToSection('report-cash-detail')}
            tone="green"
          />
          <OperationCard
            label="A receber"
            value={toCurrency(summary.receivable)}
            detail={`${receivableRows.length + cashReceivableRows.length} pendência(s) em aberto`}
            explanation="Saldo pendente de clientes e ordens."
            tone="amber"
            onClick={() => scrollToSection('report-receivables')}
          />
          <OperationCard
            label="Gastos"
            value={toCurrency(summary.expenseTotal)}
            detail={`${filteredExpenses.length} lançamentos no período`}
            explanation="Saídas registradas no filtro atual."
            tone="red"
            onClick={() => scrollToSection('report-expenses')}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => scrollToSection('report-raw-result')}
            className={`rounded-2xl border p-3 text-left transition hover:border-emerald-500/40 ${summary.netResult >= 0 ? 'border-emerald-500/20 bg-emerald-500/[0.06]' : 'border-red-500/20 bg-red-500/[0.06]'}`}
          >
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Resultado do caixa</p>
            <p className={`mt-1 text-xl font-black ${summary.netResult >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{toCurrency(summary.netResult)}</p>
            <p className="text-[11px] text-slate-500">Recebido menos gastos</p>
          </button>
          <button
            type="button"
            onClick={() => scrollToSection('report-raw-result')}
            className={`rounded-2xl border p-3 text-left transition hover:border-primary/40 ${summary.projectedResult >= 0 ? 'border-slate-700 bg-slate-900/45' : 'border-red-500/20 bg-red-500/[0.06]'}`}
          >
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Resultado previsto</p>
            <p className={`mt-1 text-xl font-black ${summary.projectedResult >= 0 ? 'text-white' : 'text-red-300'}`}>{toCurrency(summary.projectedResult)}</p>
            <p className="text-[11px] text-slate-500">Vendido menos gastos</p>
          </button>
        </div>
      </section>

      <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.8fr)]">
        <Panel title="Evolução financeira" icon={Activity}>
          <p className="mb-3 text-xs text-slate-500">Valores vendidos, recebidos e gastos por dia no período selecionado.</p>
          <div className="h-72 w-full">
            {financialTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <RechartsLineChart data={financialTrend} margin={{ top: 8, right: 10, left: 6, bottom: 0 }}>
                  <CartesianGrid stroke="#334155" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis
                    stroke="#64748b"
                    tick={{ fill: '#94a3b8', fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={value => `R$${Number(value).toLocaleString('pt-BR')}`}
                    width={72}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: 12, color: '#f8fafc' }}
                    labelStyle={{ color: '#cbd5e1' }}
                    formatter={(value, name) => [toCurrency(Number(value)), name]}
                  />
                  <Line type="monotone" dataKey="sold" name="Vendido" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 2 }} activeDot={{ r: 5 }} />
                  <Line type="monotone" dataKey="received" name="Recebido" stroke="#10b981" strokeWidth={2.5} dot={{ r: 2 }} activeDot={{ r: 5 }} />
                  <Line type="monotone" dataKey="expenses" name="Gastos" stroke="#f97316" strokeWidth={2.5} dot={{ r: 2 }} activeDot={{ r: 5 }} />
                </RechartsLineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">Sem movimentações no período selecionado.</div>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-400">
            <ChartLegend color="bg-blue-400" label="Vendido" />
            <ChartLegend color="bg-emerald-400" label="Recebido" />
            <ChartLegend color="bg-orange-400" label="Gastos" />
          </div>
        </Panel>

        <Panel title="Status das ordens de serviço" icon={BarChart3}>
          <p className="mb-2 text-xs text-slate-500">Situação de pagamento dos serviços no filtro.</p>
          {orderStatusBreakdown.length ? (
            <>
              <div className="h-52 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={orderStatusBreakdown} dataKey="value" nameKey="name" innerRadius={55} outerRadius={78} paddingAngle={4} stroke="none">
                      {orderStatusBreakdown.map((row, index) => (
                        <Cell key={row.name} fill={['#10b981', '#f59e0b', '#3b82f6'][index % 3]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: 12, color: '#f8fafc' }}
                      formatter={(value, name) => [`${value} O.S.`, name]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2">
                {orderStatusBreakdown.map((row, index) => (
                  <div key={row.name} className="flex items-center justify-between text-xs">
                    <ChartLegend color={['bg-emerald-400', 'bg-amber-400', 'bg-blue-400'][index % 3]} label={row.name} />
                    <span className="font-bold text-slate-200">{row.value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex h-52 items-center justify-center text-sm text-slate-500">Sem ordens no período selecionado.</div>
          )}
        </Panel>
      </section>

      <section className="grid min-w-0 gap-4 lg:grid-cols-2">
        <Panel id="report-service-ranking" title="Serviços mais realizados" icon={BarChart3}>
          <div className="space-y-4">
            {serviceBreakdown.slice(0, 5).map((service, index) => {
              const percentage = summary.grossRevenue ? (service.gross / summary.grossRevenue) * 100 : 0;
              return (
                <div key={service.label} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="flex min-w-0 items-center gap-2 font-semibold text-slate-200">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-slate-700/70 text-[10px] text-slate-400">{index + 1}</span>
                      <span className="truncate">{service.label}</span>
                    </span>
                    <span className="shrink-0 text-slate-500">{service.count} serviço(s)</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-700">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, percentage)}%` }} />
                    </div>
                    <span className="w-24 text-right text-xs font-bold text-white">{toCurrency(service.gross)}</span>
                  </div>
                </div>
              );
            })}
            {!serviceBreakdown.length && <p className="py-8 text-center text-sm text-slate-500">Sem serviços no filtro atual.</p>}
          </div>
        </Panel>

        <Panel title="Recebimentos por forma de pagamento" icon={WalletCards}>
          {cashPaymentMethodBreakdown.length ? (
            <div className="grid items-center gap-2 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <div className="h-52 min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={cashPaymentMethodBreakdown} dataKey="total" nameKey="label" innerRadius={48} outerRadius={76} paddingAngle={4} stroke="none">
                      {cashPaymentMethodBreakdown.map((row, index) => (
                        <Cell key={row.method} fill={['#22c55e', '#38bdf8', '#a78bfa', '#f59e0b', '#64748b'][index % 5]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: 12, color: '#f8fafc' }}
                      formatter={value => toCurrency(Number(value))}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-3">
                {cashPaymentMethodBreakdown.map((row, index) => (
                  <button
                    key={row.method}
                    type="button"
                    onClick={() => setCashPaymentMethodFilter(cashPaymentMethodFilter === row.method ? 'all' : row.method)}
                    className={cn(
                      'flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left transition',
                      cashPaymentMethodFilter === row.method ? 'border-primary/50 bg-primary/10' : 'border-transparent hover:bg-slate-900/60'
                    )}
                  >
                    <span className="flex items-center gap-2 text-xs text-slate-300">
                      <span className={`h-2.5 w-2.5 rounded-full ${['bg-green-400', 'bg-sky-400', 'bg-violet-400', 'bg-amber-400', 'bg-slate-400'][index % 5]}`} />
                      {row.label}
                    </span>
                    <span className="text-right">
                      <span className="block text-xs font-bold text-white">{toCurrency(row.total)}</span>
                      <span className="text-[10px] text-slate-500">{row.count} lançamento(s)</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex h-52 items-center justify-center text-sm text-slate-500">Sem recebimentos de caixa no período.</div>
          )}
        </Panel>
      </section>

      <Panel title="Movimentações recentes" icon={Activity}>
        <div className="max-w-full overflow-x-auto">
          <table className="w-full min-w-[600px] text-left text-xs">
            <thead className="text-[10px] uppercase tracking-widest text-slate-500">
              <tr>
                <th className="py-2">Tipo</th>
                <th>Descrição</th>
                <th>Data</th>
                <th>Status</th>
                <th className="text-right">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {recentMovements.map(movement => (
                <tr
                  key={movement.id}
                  tabIndex={0}
                  onClick={() => scrollToSection(movement.section)}
                  onKeyDown={event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      scrollToSection(movement.section);
                    }
                  }}
                  className="cursor-pointer text-slate-300 transition hover:bg-slate-900/60"
                >
                  <td className="py-3">
                    <span className={`rounded-lg px-2 py-1 text-[10px] font-bold ${movement.isExpense ? 'bg-orange-500/10 text-orange-300' : 'bg-primary/10 text-primary'}`}>{movement.type}</span>
                  </td>
                  <td className="max-w-[360px] truncate font-medium text-white" title={movement.description}>{movement.description}</td>
                  <td>{formatDate(movement.date)}</td>
                  <td className="text-slate-400">{movement.status}</td>
                  <td className={`text-right font-bold ${movement.isExpense ? 'text-orange-300' : 'text-emerald-300'}`}>
                    {movement.isExpense ? '− ' : ''}{toCurrency(movement.amount)}
                  </td>
                </tr>
              ))}
              {!recentMovements.length && (
                <tr><td colSpan={5} className="py-8 text-center text-slate-500">Nenhuma movimentação no período selecionado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-800/40 p-4">
        <div className="mb-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-primary">Complementos</p>
          <h3 className="text-sm font-black text-white">Dados de apoio para entender o movimento</h3>
        </div>
        <div className="grid min-w-0 gap-3 md:grid-cols-4">
          <Metric title="Ticket medio" value={toCurrency(summary.averageTicket)} tone="text-white" compact onClick={() => scrollToSection('report-clients')} />
          <Metric title="Atendimentos" value={String(summary.operationsCount)} tone="text-white" compact onClick={() => scrollToSection('report-services-detail')} />
          <Metric title="Receita recorrente" value={toCurrency(summary.recurringRevenue)} tone="text-sky-400" compact onClick={() => scrollToSection('report-services-summary')} />
          <Metric title="Agenda / garantias" value={`${filteredAppointments.length} / ${filteredWarranties.length}`} tone="text-white" compact onClick={() => scrollToSection('report-appointments')} />
        </div>
        <div className="mt-3">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">Recebido por forma de pagamento</p>
          <div className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {cashPaymentMethodBreakdown.map((row) => {
              const selected = cashPaymentMethodFilter === row.method;
              return (
                <button
                  key={row.method}
                  type="button"
                  onClick={() => setCashPaymentMethodFilter(row.method)}
                  className={cn(
                    'rounded-xl border p-3 text-left transition hover:border-primary/50 hover:bg-slate-900/70 focus:outline-none focus:ring-2 focus:ring-primary/40',
                    selected ? 'border-primary/60 bg-primary/10' : 'border-slate-700/70 bg-slate-900/45'
                  )}
                >
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{row.label}</p>
                  <p className="mt-1 text-lg font-black text-emerald-300">{toCurrency(row.total)}</p>
                  <p className="text-xs text-slate-500">{row.count} lancamento(s)</p>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section id="report-abc-curve" className="min-w-0 overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-800/40 p-4">
        <button
          type="button"
          onClick={openAbcCurve}
          className="flex w-full flex-col gap-4 rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4 text-left transition hover:border-primary/50 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/40 lg:flex-row lg:items-center lg:justify-between"
        >
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <BarChart3 className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-primary">Analise de vendas</p>
              <h3 className="text-base font-black text-white">Curva ABC</h3>
              <p className="mt-1 max-w-2xl text-xs text-slate-400">
                Abra uma tela limpa para ver quais servicos e mercadorias concentram o faturamento no filtro atual.
              </p>
            </div>
          </div>
          <div className="grid w-full gap-2 text-xs sm:grid-cols-3 lg:w-auto lg:min-w-[420px]">
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3">
              <p className="font-black uppercase tracking-widest text-emerald-300">Classe A</p>
              <p className="mt-1 text-lg font-black text-white">{toCurrency(abcSummary.totals.A)}</p>
              <p className="text-slate-400">{abcSummary.counts.A} item(ns)</p>
            </div>
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3">
              <p className="font-black uppercase tracking-widest text-amber-300">Classe B</p>
              <p className="mt-1 text-lg font-black text-white">{toCurrency(abcSummary.totals.B)}</p>
              <p className="text-slate-400">{abcSummary.counts.B} item(ns)</p>
            </div>
            <div className="rounded-xl border border-slate-600/60 bg-slate-800/70 p-3">
              <p className="font-black uppercase tracking-widest text-slate-300">Classe C</p>
              <p className="mt-1 text-lg font-black text-white">{toCurrency(abcSummary.totals.C)}</p>
              <p className="text-slate-400">{abcSummary.counts.C} item(ns)</p>
            </div>
          </div>
        </button>

        {isAbcOpen && (
          <div id="report-abc-curve-detail" className="mt-4 scroll-mt-24 rounded-2xl border border-primary/30 bg-slate-950/70 p-4">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-primary">Curva ABC detalhada</p>
                <h3 className="text-xl font-black text-white">Itens que mais movem o faturamento</h3>
                <p className="mt-1 text-xs text-slate-400">
                  Total analisado: <span className="font-bold text-white">{toCurrency(abcSummary.total)}</span>. Classe A concentra o
                  maior impacto, B e C ajudam a entender o restante da cauda.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAbcOpen(false)}
                className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-bold text-slate-200 hover:bg-slate-800"
              >
                Fechar Curva ABC
              </button>
            </div>
            <div className="mb-4 grid gap-3 sm:grid-cols-3">
              <ResultLine label="Classe A" value={abcSummary.totals.A} tone="text-emerald-300" />
              <ResultLine label="Classe B" value={abcSummary.totals.B} tone="text-amber-300" />
              <ResultLine label="Classe C" value={abcSummary.totals.C} tone="text-slate-200" />
            </div>
            <div className="mb-3 rounded-xl border border-slate-700/60 bg-slate-900/50 p-3 text-xs text-slate-400">
              <p>
                Ranking do faturamento bruto filtrado. Use esta tela para decidir o que manter em estoque, destacar em atendimento
                e acompanhar no caixa.
              </p>
            </div>
            <div className="max-w-full overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-xs">
                <thead className="text-[10px] uppercase tracking-widest text-slate-500">
                  <tr>
                    <th className="py-2">#</th>
                    <th>Item / servico</th>
                    <th>Origem</th>
                    <th className="text-right">Qtd</th>
                    <th className="text-right">Total</th>
                    <th className="text-right">%</th>
                    <th>Participacao</th>
                    <th className="text-center">ABC</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {abcBreakdown.map((row) => (
                    <tr key={`${row.source}-${row.label}`} className="text-slate-300">
                      <td className="py-2 font-bold text-primary">{row.position}</td>
                      <td className="max-w-xs truncate py-2 font-semibold text-white" title={row.label}>{row.label}</td>
                      <td>{row.source}</td>
                      <td className="text-right">{row.count}</td>
                      <td className="text-right font-bold text-emerald-400">{toCurrency(row.total)}</td>
                      <td className="text-right">{row.percentage.toFixed(1)}%</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-900">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, row.percentage)}%` }} />
                          </div>
                          <span className="w-12 text-right text-[11px] text-slate-400">{Math.min(100, row.accumulated).toFixed(1)}%</span>
                        </div>
                      </td>
                      <td className="text-center">
                        <span className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-xs font-black ${
                          row.curve === 'A'
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : row.curve === 'B'
                              ? 'bg-amber-500/15 text-amber-300'
                              : 'bg-slate-700/70 text-slate-300'
                        }`}>
                          {row.curve}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {abcBreakdown.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-6 text-center text-slate-500">Sem vendas no filtro atual para montar a Curva ABC.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <section className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <Panel id="report-receivables" title="Contas a receber" icon={WalletCards}>
          <div className="max-w-full overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-xs">
              <thead className="text-[10px] uppercase tracking-widest text-slate-500">
                <tr>
                  <th className="py-2">Cliente</th>
                  <th>Servico</th>
                  <th>Data</th>
                  <th>Status</th>
                  <th className="text-right">Total</th>
                  <th className="text-right">Pago</th>
                  <th className="text-right">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {receivableRows.map(({ maintenance, paid, receivable }) => (
                  <tr key={maintenance.id} className="text-slate-300">
                    <td className="py-2 font-semibold text-white">{maintenance.clientName || '-'}</td>
                    <td>{getServiceTypeLabel(maintenance.serviceType)}</td>
                    <td>{formatDate(maintenance.date)}</td>
                    <td>{getPaymentStatus(maintenance)}</td>
                    <td className="text-right">{toCurrency(toNumber(maintenance.serviceValue))}</td>
                    <td className="text-right">{toCurrency(paid)}</td>
                    <td className="text-right font-bold text-amber-400">{toCurrency(receivable)}</td>
                  </tr>
                ))}
                {cashReceivableRows.map(({ launch, receivable }) => (
                  <tr key={launch.id} className="text-slate-300">
                    <td className="py-2 font-semibold text-white">{launch.clientName || 'Consumidor final'}</td>
                    <td>{launch.orderNumber || 'Lancamento caixa'}</td>
                    <td>{formatDate(getCashLaunchDate(launch))}</td>
                    <td>{launch.status}</td>
                    <td className="text-right">{toCurrency(toNumber(launch.total))}</td>
                    <td className="text-right">{toCurrency(0)}</td>
                    <td className="text-right font-bold text-amber-400">{toCurrency(receivable)}</td>
                  </tr>
                ))}
                {receivableRows.length === 0 && cashReceivableRows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-slate-500">Nenhuma conta a receber no filtro atual.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel id="report-services-summary" title="Resumo por servico" icon={BarChart3}>
          <div className="space-y-3">
            {serviceBreakdown.map((service) => {
              const percentage = summary.grossRevenue ? (service.gross / summary.grossRevenue) * 100 : 0;
              return (
                <div key={service.label} className="space-y-1">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="font-bold text-slate-200">{service.label}</span>
                    <span className="text-slate-400">{service.count} serv.</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-900">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, percentage)}%` }} />
                    </div>
                    <span className="w-24 text-right text-xs font-bold text-emerald-400">{toCurrency(service.gross)}</span>
                  </div>
                </div>
              );
            })}
            {serviceBreakdown.length === 0 && <p className="py-6 text-center text-sm text-slate-500">Sem servicos no filtro atual.</p>}
          </div>
        </Panel>
      </section>

      <section className="grid min-w-0 gap-4 xl:grid-cols-3">
        <Panel id="report-clients" title="Clientes com maior movimento" icon={BarChart3}>
          <CompactTable
            headers={['Cliente', 'Moto', 'Servicos', 'Recebido', 'Saldo']}
            rows={clientBreakdown.map(client => [
              client.name,
              client.bikeModel,
              String(client.count),
              toCurrency(client.received),
              toCurrency(client.receivable),
            ])}
          />
        </Panel>

        <Panel id="report-suppliers" title="Fornecedores mais comprados" icon={WalletCards}>
          <div className="space-y-3">
            {supplierBreakdown.map((supplier) => {
              const percentage = summary.expenseTotal ? (supplier.total / summary.expenseTotal) * 100 : 0;
              return (
                <div key={supplier.supplier} className="space-y-1">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="font-bold text-slate-200">{supplier.supplier}</span>
                    <span className="text-slate-400">{supplier.count} gasto(s)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-900">
                      <div className="h-full rounded-full bg-red-500" style={{ width: `${Math.min(100, percentage)}%` }} />
                    </div>
                    <span className="w-24 text-right text-xs font-bold text-red-300">{toCurrency(supplier.total)}</span>
                  </div>
                </div>
              );
            })}
            {supplierBreakdown.length === 0 && <p className="py-6 text-center text-sm text-slate-500">Sem fornecedores no filtro atual.</p>}
          </div>
        </Panel>

        <Panel id="report-expenses" title="Gastos no periodo" icon={WalletCards}>
          <CompactTable
            headers={['Descricao', 'Fornecedor', 'Data', 'Forma', 'Valor']}
            rows={filteredExpenses.map(expense => [
              expense.description,
              expense.supplier || '-',
              formatDate(expense.date),
              expense.paymentMethod,
              toCurrency(toNumber(expense.amount)),
            ])}
            emptyMessage="Sem gastos no filtro atual."
          />
        </Panel>
      </section>

      <section className="grid min-w-0 gap-4 xl:grid-cols-2">
        <Panel id="report-warranties" title="Garantias no periodo" icon={CalendarDays}>
          <CompactTable
            headers={['Cliente', 'Servico', 'Emissao', 'Vencimento', 'Status']}
            rows={filteredWarranties.map((warranty) => {
              const expiryDate = parseDate(warranty.expiryDate);
              const active = expiryDate ? isAfter(expiryDate, new Date()) : false;
              return [
                warranty.clientName,
                warranty.serviceType,
                formatDate(warranty.serviceDate),
                formatDate(warranty.expiryDate),
                active ? 'Ativa' : 'Vencida',
              ];
            })}
            emptyMessage="Sem garantias no filtro atual."
          />
        </Panel>

        <Panel id="report-appointments" title="Agenda no periodo" icon={CalendarDays}>
          <div className="mb-3 grid grid-cols-2 gap-2">
            <Metric title="Valor previsto" value={toCurrency(summary.appointmentValue)} tone="text-sky-400" compact />
            <Metric title="Garantias ativas" value={String(summary.activeWarrantyCount)} tone="text-emerald-400" compact />
          </div>
          <CompactTable
            headers={['Cliente', 'Data', 'Servico', 'Status']}
            rows={filteredAppointments.map(appointment => [
              appointment.clientName,
              formatDate(appointment.scheduledDate),
              appointment.serviceRequested,
              appointment.completed ? 'Concluido' : 'Pendente',
            ])}
            emptyMessage="Sem agendamentos no filtro atual."
          />
        </Panel>
      </section>

      <Panel id="report-services-detail" title="Servicos detalhados" icon={BarChart3}>
        <div className="max-w-full overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-xs">
            <thead className="text-[10px] uppercase tracking-widest text-slate-500">
              <tr>
                <th className="py-2">Data</th>
                <th>Cliente</th>
                <th>Moto</th>
                <th>Servico</th>
                <th>Status</th>
                <th className="text-right">Total</th>
                <th className="text-right">Recebido</th>
                <th className="text-right">Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredMaintenances.map((maintenance) => (
                <tr key={maintenance.id} className="text-slate-300">
                  <td className="py-2">{formatDate(maintenance.date)}</td>
                  <td className="font-semibold text-white">{maintenance.clientName || '-'}</td>
                  <td>{maintenance.bikeModel || '-'}</td>
                  <td>{getServiceTypeLabel(maintenance.serviceType)}</td>
                  <td>{getPaymentStatus(maintenance)}</td>
                  <td className="text-right">{toCurrency(toNumber(maintenance.serviceValue))}</td>
                  <td className="text-right text-emerald-400">{toCurrency(getPaidAmount(maintenance))}</td>
                  <td className="text-right text-amber-400">{toCurrency(getReceivableAmount(maintenance))}</td>
                </tr>
              ))}
              {filteredMaintenances.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-slate-500">Nenhum servico encontrado no filtro atual.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel id="report-cash-detail" title="Lancamentos caixa detalhados" icon={WalletCards}>
        <div className="max-w-full overflow-x-auto">
          <table className="w-full min-w-[780px] text-left text-xs">
            <thead className="text-[10px] uppercase tracking-widest text-slate-500">
              <tr>
                <th className="py-2">O.S.</th>
                <th>Cliente</th>
                <th>Moto</th>
                <th>Abertura</th>
                <th>Status</th>
                <th>Pagamento</th>
                <th>Forma</th>
                <th className="text-right">Total</th>
                <th className="text-right">Recebido</th>
                <th className="text-right">Aberto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredCashLaunches.map((launch) => {
                const total = toNumber(launch.total);
                const received = getCashPaidAmount(launch);
                const receivable = getCashReceivableAmount(launch);

                return (
                  <tr key={launch.id} className="text-slate-300">
                    <td className="py-2 font-semibold text-primary">{launch.orderNumber || '-'}</td>
                    <td className="font-semibold text-white">{launch.clientName || 'Consumidor final'}</td>
                    <td>{launch.bikeModel || '-'}</td>
                    <td>{formatDate(getCashLaunchDate(launch))}</td>
                    <td>{launch.status}</td>
                    <td>{getCashPaymentStatus(launch)}</td>
                    <td>{received > 0 ? getCashPaymentMethodLabel(launch) : '-'}</td>
                    <td className="text-right">{toCurrency(total)}</td>
                    <td className="text-right text-emerald-400">{toCurrency(received)}</td>
                    <td className="text-right text-amber-400">{toCurrency(receivable)}</td>
                  </tr>
                );
              })}
              {filteredCashLaunches.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-6 text-center text-slate-500">Nenhum lancamento caixa no filtro atual.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel id="report-raw-result" title="Demonstrativo bruto da operacao" icon={WalletCards}>
        <div className="grid gap-3 md:grid-cols-2">
          <ResultLine label="Servicos / oleo lancados" value={summary.serviceGrossRevenue} tone="text-slate-100" />
          <ResultLine label="Lancamentos caixa lancados" value={summary.cashGrossRevenue} tone="text-slate-100" />
          <ResultLine label="Faturamento bruto" value={summary.grossRevenue} tone="text-white" strong />
          <ResultLine label="Total recebido" value={summary.received} tone="text-emerald-400" strong />
          <ResultLine label="A receber" value={summary.receivable} tone="text-amber-400" />
          <ResultLine label="Gastos / custos registrados" value={summary.expenseTotal} tone="text-red-400" />
          <ResultLine label="Resultado de caixa" value={summary.netResult} tone={summary.netResult >= 0 ? 'text-emerald-400' : 'text-red-400'} strong />
          <ResultLine label="Resultado projetado" value={summary.projectedResult} tone={summary.projectedResult >= 0 ? 'text-emerald-400' : 'text-red-400'} strong />
        </div>
        <p className="mt-4 rounded-xl border border-slate-700/60 bg-slate-900/50 p-3 text-xs text-slate-400">
          Base simples do periodo filtrado: resultado de caixa = recebido menos gastos. Resultado projetado = faturamento bruto menos gastos.
          Impostos, taxas de cartao e custos de mercadoria sem cadastro de custo ainda nao entram nesta conta.
        </p>
      </Panel>
    </div>
  );
};

type MetricProps = {
  title: string;
  value: string;
  tone: string;
  compact?: boolean;
  onClick?: () => void;
};

type OperationCardProps = {
  label: string;
  value: string;
  detail: string;
  explanation?: string;
  tone: 'primary' | 'sky' | 'amber' | 'red' | 'violet' | 'slate' | 'green';
  onClick: () => void;
};

const operationToneClasses: Record<OperationCardProps['tone'], string> = {
  primary: 'border-primary/30 bg-primary/10 text-primary',
  sky: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
  amber: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  red: 'border-red-500/30 bg-red-500/10 text-red-300',
  violet: 'border-violet-500/30 bg-violet-500/10 text-violet-300',
  slate: 'border-slate-600 bg-slate-900/60 text-slate-200',
  green: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
};

const OperationCard = ({ label, value, detail, explanation, tone, onClick }: OperationCardProps) => (
  <button
    type="button"
    onClick={onClick}
    className={`min-w-0 rounded-2xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/40 ${operationToneClasses[tone]}`}
  >
    <p className="text-[10px] font-black uppercase tracking-widest opacity-90">{label}</p>
    <p className="mt-2 break-words text-2xl font-black text-white">{value}</p>
    <p className="mt-1 text-xs font-semibold text-slate-300">{detail}</p>
    {explanation && <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{explanation}</p>}
    <p className="mt-3 text-[10px] font-bold uppercase tracking-widest">Abrir origem</p>
  </button>
);

const Metric = ({ title, value, tone, compact = false, onClick }: MetricProps) => {
  const content = (
    <>
      <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">{title}</p>
      <p className={`${compact ? 'text-lg' : 'text-2xl'} font-black ${tone}`}>{value}</p>
      {onClick && <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-primary">Ver detalhes</p>}
    </>
  );
  const className = `min-w-0 rounded-2xl border border-slate-700/60 bg-slate-800/40 ${compact ? 'p-3' : 'p-4'}`;

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${className} w-full text-left transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/40`}
      >
        {content}
      </button>
    );
  }

  return <div className={className}>{content}</div>;
};

const ChartLegend = ({ color, label }: { color: string; label: string }) => (
  <span className="inline-flex items-center gap-2">
    <span className={`h-2 w-2 rounded-full ${color}`} />
    {label}
  </span>
);

type ResultLineProps = {
  label: string;
  value: number;
  tone: string;
  strong?: boolean;
};

const ResultLine = ({ label, value, tone, strong = false }: ResultLineProps) => (
  <div className={`rounded-xl border border-slate-700/60 bg-slate-900/50 p-3 ${strong ? 'ring-1 ring-slate-600/70' : ''}`}>
    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{label}</p>
    <p className={`mt-1 text-xl font-black ${tone}`}>{toCurrency(value)}</p>
  </div>
);

type PanelProps = {
  id?: string;
  title: string;
  icon: typeof BarChart3;
  children: ReactNode;
};

const Panel = ({ id, title, icon: Icon, children }: PanelProps) => (
  <section id={id} className="min-w-0 overflow-hidden scroll-mt-24 rounded-2xl border border-slate-700/60 bg-slate-800/40 p-4">
    <div className="mb-4 flex items-center gap-2">
      <Icon className="h-4 w-4 text-primary" />
      <h3 className="text-sm font-bold">{title}</h3>
    </div>
    {children}
  </section>
);

type CompactTableProps = {
  headers: string[];
  rows: string[][];
  emptyMessage?: string;
};

const CompactTable = ({ headers, rows, emptyMessage = 'Sem dados no filtro atual.' }: CompactTableProps) => (
  <div className="max-w-full overflow-x-auto">
    <table className="w-full min-w-[480px] text-left text-xs">
      <thead className="text-[10px] uppercase tracking-widest text-slate-500">
        <tr>
          {headers.map(header => <th key={header} className="py-2">{header}</th>)}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-800">
        {rows.map((row, rowIndex) => (
          <tr key={`${row[0]}-${rowIndex}`} className="text-slate-300">
            {row.map((cell, cellIndex) => (
              <td key={`${cell}-${cellIndex}`} className={cellIndex === 0 ? 'py-2 font-semibold text-white' : 'py-2'}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
        {rows.length === 0 && (
          <tr>
            <td colSpan={headers.length} className="py-6 text-center text-slate-500">{emptyMessage}</td>
          </tr>
        )}
      </tbody>
    </table>
  </div>
);
